/**
 * Phase 4 transaction backend tests (PRD sections 34/41/43/57).
 * Runs the real Express app over HTTP against mongodb-memory-server,
 * following the same pattern as tests/auth.test.js.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const Transaction = require('../src/models/Transaction');
const Category = require('../src/models/Category');

let mongod;
let server;
let baseUrl;

const USER = { name: 'Anim', email: 'txn-anim@example.com', password: 'supersecret1' };
const OTHER = { name: 'Other', email: 'txn-other@example.com', password: 'supersecret1' };

let cookie; // auth cookie for USER
let token; // bearer token for USER
let otherToken; // bearer token for OTHER
let incomeCatId;
let expenseCatId;
let otherUserCatId;

function req(method, path, { body, cookie: useCookie, auth } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers = { 'Content-Type': 'application/json' };
    if (useCookie) headers.Cookie = useCookie;
    if (auth) headers.Authorization = `Bearer ${auth}`;

    const request = http.request(
      url,
      { method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            /* non-JSON body */
          }
          resolve({ status: res.statusCode, headers: res.headers, json, raw: data });
        });
      }
    );
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

function loginCookie(res) {
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie, 'expected Set-Cookie header');
  return setCookie[0].split(';')[0];
}

async function makeTxn(overrides = {}) {
  const body = {
    type: 'expense',
    amount: 100,
    categoryId: expenseCatId,
    date: '2026-10-05',
    ...overrides,
  };
  const res = await req('POST', '/api/transactions', { body, auth: token });
  assert.equal(res.status, 201, `setup txn failed: ${res.raw}`);
  return res.json.transaction;
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('transactions_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Register two users (registration seeds default categories).
  const reg = await req('POST', '/api/auth/register', { body: USER });
  assert.equal(reg.status, 201);
  cookie = loginCookie(reg);
  token = cookie.slice('token='.length);

  const regOther = await req('POST', '/api/auth/register', { body: OTHER });
  assert.equal(regOther.status, 201);
  otherToken = loginCookie(regOther).slice('token='.length);

  const user = await mongoose.connection
    .collection('users')
    .findOne({ email: USER.email });
  const other = await mongoose.connection
    .collection('users')
    .findOne({ email: OTHER.email });

  const cats = await Category.find({ userId: user._id }).lean();
  incomeCatId = cats.find((c) => c.type === 'income' && c.name === 'Salary')._id.toString();
  expenseCatId = cats.find((c) => c.type === 'expense' && c.name === 'Food')._id.toString();

  const otherCats = await Category.find({ userId: other._id }).lean();
  otherUserCatId = otherCats.find((c) => c.type === 'expense')._id.toString();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('Authentication guard (PRD section 43)', () => {
  it('rejects all transaction endpoints without credentials with 401', async () => {
    assert.equal((await req('POST', '/api/transactions', { body: {} })).status, 401);
    assert.equal((await req('GET', '/api/transactions')).status, 401);
    assert.equal((await req('GET', `/api/transactions/${new mongoose.Types.ObjectId()}`)).status, 401);
    assert.equal((await req('PUT', `/api/transactions/${new mongoose.Types.ObjectId()}`, { body: {} })).status, 401);
    assert.equal((await req('DELETE', `/api/transactions/${new mongoose.Types.ObjectId()}`)).status, 401);
  });

  it('accepts the httpOnly cookie and the Bearer token', async () => {
    const byCookie = await req('GET', '/api/transactions', { cookie });
    assert.equal(byCookie.status, 200);
    const byToken = await req('GET', '/api/transactions', { auth: token });
    assert.equal(byToken.status, 200);
  });
});

describe('POST /api/transactions (PRD sections 41/57)', () => {
  it('creates an income transaction and stores amount as positive', async () => {
    const res = await req('POST', '/api/transactions', {
      body: {
        type: 'income',
        amount: 45000,
        categoryId: incomeCatId,
        date: '2026-10-01',
        source: 'A&M Tech Solutions',
        note: 'October salary',
      },
      auth: token,
    });

    assert.equal(res.status, 201);
    const t = res.json.transaction;
    assert.equal(t.type, 'income');
    assert.equal(t.amount, 45000);
    assert.equal(t.categoryId, incomeCatId);
    assert.equal(t.categoryName, 'Salary');
    assert.equal(t.source, 'A&M Tech Solutions');

    const stored = await Transaction.findById(t.id);
    assert.equal(stored.amount, 45000); // positive, never -45000
    assert.ok(stored.userId);
  });

  it('creates an expense transaction (PRD section 57)', async () => {
    const t = await makeTxn({ amount: 500, note: 'Groceries' });
    assert.equal(t.type, 'expense');
    assert.equal(t.amount, 500);
    assert.equal(t.categoryName, 'Food');
  });

  it('accepts a numeric-string amount', async () => {
    const t = await makeTxn({ amount: '250' });
    assert.equal(t.amount, 250);
  });

  it('rejects invalid amounts: 0, negative, NaN, empty (PRD sections 41/57)', async () => {
    for (const amount of [0, -500, -0.01, 'abc', '', null]) {
      const res = await req('POST', '/api/transactions', {
        body: { type: 'expense', amount, categoryId: expenseCatId, date: '2026-10-05' },
        auth: token,
      });
      assert.equal(res.status, 400, `amount=${JSON.stringify(amount)}`);
      assert.ok(res.json.error, 'expected an error message');
    }
  });

  it('rejects invalid type with 400', async () => {
    const res = await req('POST', '/api/transactions', {
      body: { type: 'transfer', amount: 100, categoryId: expenseCatId, date: '2026-10-05' },
      auth: token,
    });
    assert.equal(res.status, 400);
  });

  it('rejects invalid dates with 400', async () => {
    for (const date of ['not-a-date', '', '2026-13-45']) {
      const res = await req('POST', '/api/transactions', {
        body: { type: 'expense', amount: 100, categoryId: expenseCatId, date },
        auth: token,
      });
      assert.equal(res.status, 400, `date=${JSON.stringify(date)}`);
    }
  });

  it('rejects a category that belongs to another user with 400 (PRD section 43)', async () => {
    const res = await req('POST', '/api/transactions', {
      body: { type: 'expense', amount: 100, categoryId: otherUserCatId, date: '2026-10-05' },
      auth: token,
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /category/i);
  });

  it('rejects a nonexistent category id and a malformed id with 400', async () => {
    const ghost = await req('POST', '/api/transactions', {
      body: { type: 'expense', amount: 100, categoryId: new mongoose.Types.ObjectId().toString(), date: '2026-10-05' },
      auth: token,
    });
    assert.equal(ghost.status, 400);

    const malformed = await req('POST', '/api/transactions', {
      body: { type: 'expense', amount: 100, categoryId: 'not-an-object-id', date: '2026-10-05' },
      auth: token,
    });
    assert.equal(malformed.status, 400);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await req('POST', '/api/transactions', { body: {}, auth: token });
    assert.equal(res.status, 400);
  });
});

describe('GET /api/transactions (PRD sections 34/24)', () => {
  before(async () => {
    // Known data set for filtering tests (only for USER, using USER categories).
    await makeTxn({ type: 'income', amount: 60000, categoryId: incomeCatId, date: '2026-09-30', note: 'salary Sep' });
    await makeTxn({ type: 'expense', amount: 1200, categoryId: expenseCatId, date: '2026-10-02', note: 'market' });
    await makeTxn({ type: 'income', amount: 5000, categoryId: incomeCatId, date: '2026-10-03', note: 'bonus' });
    await makeTxn({ type: 'expense', amount: 300, categoryId: expenseCatId, date: '2026-10-03', note: 'lunch' });
  });

  it('lists transactions newest first with pagination metadata', async () => {
    const res = await req('GET', '/api/transactions', { auth: token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json.transactions));
    assert.ok(res.json.total >= 4);
    assert.equal(res.json.page, 1);
    assert.ok(res.json.totalPages >= 1);

    const dates = res.json.transactions.map((t) => t.date);
    const sorted = [...dates].sort().reverse();
    assert.deepEqual(dates, sorted);
  });

  it('filters by type=income and type=expense', async () => {
    const inc = await req('GET', '/api/transactions?type=income', { auth: token });
    assert.equal(inc.status, 200);
    assert.ok(inc.json.transactions.length > 0);
    assert.ok(inc.json.transactions.every((t) => t.type === 'income'));

    const exp = await req('GET', '/api/transactions?type=expense', { auth: token });
    assert.ok(exp.json.transactions.every((t) => t.type === 'expense'));
  });

  it('filters by category', async () => {
    const res = await req('GET', `/api/transactions?category=${incomeCatId}`, { auth: token });
    assert.ok(res.json.transactions.length > 0);
    assert.ok(res.json.transactions.every((t) => t.categoryId === incomeCatId));
  });

  it('filters by date range (PRD section 24)', async () => {
    const res = await req('GET', '/api/transactions?startDate=2026-10-01&endDate=2026-10-31', {
      auth: token,
    });
    assert.ok(res.json.transactions.length > 0);
    for (const t of res.json.transactions) {
      const d = t.date.slice(0, 10);
      assert.ok(d >= '2026-10-01' && d <= '2026-10-31', `unexpected date ${d}`);
    }
    // The Sep salary must be excluded.
    assert.ok(res.json.transactions.every((t) => !/Sep/.test(t.note || '')));
  });

  it('searches note and source text', async () => {
    const res = await req('GET', '/api/transactions?search=bonus', { auth: token });
    assert.ok(res.json.transactions.length >= 1);
    assert.ok(res.json.transactions.some((t) => /bonus/i.test(t.note || '')));
  });

  it('paginates with page and limit', async () => {
    const page1 = await req('GET', '/api/transactions?page=1&limit=2', { auth: token });
    const page2 = await req('GET', '/api/transactions?page=2&limit=2', { auth: token });
    assert.equal(page1.json.transactions.length, 2);
    assert.ok(page2.json.transactions.length >= 1);

    const ids1 = page1.json.transactions.map((t) => t.id);
    const ids2 = page2.json.transactions.map((t) => t.id);
    assert.ok(ids1.every((id) => !ids2.includes(id)), 'pages must not overlap');
  });

  it('sorts by amount when requested', async () => {
    const res = await req('GET', '/api/transactions?sort=amount&order=desc&limit=100', { auth: token });
    const amounts = res.json.transactions.map((t) => t.amount);
    const sorted = [...amounts].sort((a, b) => b - a);
    assert.deepEqual(amounts, sorted);
  });

  it('returns 400 for invalid date filters and ignores invalid type', async () => {
    const badStart = await req('GET', '/api/transactions?startDate=nope', { auth: token });
    assert.equal(badStart.status, 400);

    const badEnd = await req('GET', '/api/transactions?endDate=nope', { auth: token });
    assert.equal(badEnd.status, 400);

    const weird = await req('GET', '/api/transactions?type=sandwich', { auth: token });
    assert.equal(weird.status, 200); // ignored, returns all
  });

  it('only ever returns the requesting user transactions (PRD section 43)', async () => {
    const res = await req('GET', '/api/transactions', { auth: token });
    assert.ok(res.json.transactions.length > 0);
    for (const t of res.json.transactions) {
      const doc = await Transaction.findById(t.id);
      assert.equal(doc.userId.toString(), (await mongoose.connection.collection('users').findOne({ email: USER.email }))._id.toString());
    }
  });
});

describe('GET /api/transactions/:id (PRD sections 34/43)', () => {
  it('returns a single transaction', async () => {
    const t = await makeTxn({ note: 'fetch me' });
    const res = await req('GET', `/api/transactions/${t.id}`, { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.transaction.id, t.id);
    assert.equal(res.json.transaction.note, 'fetch me');
  });

  it('returns 404 for unknown, malformed, and deleted ids', async () => {
    assert.equal((await req('GET', `/api/transactions/${new mongoose.Types.ObjectId()}`, { auth: token })).status, 404);
    assert.equal((await req('GET', '/api/transactions/not-an-id', { auth: token })).status, 404);
  });

  it('NEVER leaks another user transaction by changing the id (PRD section 43)', async () => {
    const t = await makeTxn({ note: 'mine' });

    // Another authenticated user requests USER's transaction id.
    const res = await req('GET', `/api/transactions/${t.id}`, { auth: otherToken });
    assert.equal(res.status, 404);
  });
});

describe('PUT /api/transactions/:id (PRD sections 34/57)', () => {
  it('edits an income transaction (amount, date, note)', async () => {
    const t = await makeTxn({ type: 'income', amount: 1000, categoryId: incomeCatId, note: 'before' });

    const res = await req('PUT', `/api/transactions/${t.id}`, {
      body: { amount: 1500, date: '2026-09-15', note: 'after' },
      auth: token,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.transaction.amount, 1500);
    assert.equal(res.json.transaction.note, 'after');
    assert.equal(res.json.transaction.date.startsWith('2026-09-15'), true);

    const stored = await Transaction.findById(t.id);
    assert.equal(stored.amount, 1500);
  });

  it('edits an expense transaction including type change', async () => {
    const t = await makeTxn({ type: 'expense', amount: 200, categoryId: expenseCatId });

    const res = await req('PUT', `/api/transactions/${t.id}`, {
      body: { type: 'income', categoryId: incomeCatId, amount: 700 },
      auth: token,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.transaction.type, 'income');
    assert.equal(res.json.transaction.amount, 700);
    assert.equal(res.json.transaction.categoryId, incomeCatId);
  });

  it('rejects invalid amount on update with 400 (PRD section 57)', async () => {
    const t = await makeTxn();
    for (const amount of [0, -100, 'junk']) {
      const res = await req('PUT', `/api/transactions/${t.id}`, { body: { amount }, auth: token });
      assert.equal(res.status, 400, `amount=${JSON.stringify(amount)}`);
    }
  });

  it('rejects reassigning to another user category with 400', async () => {
    const t = await makeTxn();
    const res = await req('PUT', `/api/transactions/${t.id}`, {
      body: { categoryId: otherUserCatId },
      auth: token,
    });
    assert.equal(res.status, 400);
  });

  it('rejects empty update body with 400', async () => {
    const t = await makeTxn();
    const res = await req('PUT', `/api/transactions/${t.id}`, { body: {}, auth: token });
    assert.equal(res.status, 400);
  });

  it('returns 404 when updating another user transaction', async () => {
    const t = await makeTxn();
    const res = await req('PUT', `/api/transactions/${t.id}`, {
      body: { amount: 1 },
      auth: otherToken,
    });
    assert.equal(res.status, 404);
  });
});

describe('DELETE /api/transactions/:id (PRD sections 34/57)', () => {
  it('deletes a transaction and it disappears from the list and db', async () => {
    const t = await makeTxn({ note: 'delete me' });

    const res = await req('DELETE', `/api/transactions/${t.id}`, { auth: token });
    assert.equal(res.status, 200);

    assert.equal((await req('GET', `/api/transactions/${t.id}`, { auth: token })).status, 404);
    assert.equal(await Transaction.countDocuments({ _id: t.id }), 0);
  });

  it('returns 404 for unknown id and never deletes another user transaction', async () => {
    assert.equal((await req('DELETE', `/api/transactions/${new mongoose.Types.ObjectId()}`, { auth: token })).status, 404);

    const t = await makeTxn();
    const res = await req('DELETE', `/api/transactions/${t.id}`, { auth: otherToken });
    assert.equal(res.status, 404);
    assert.ok(await Transaction.findById(t.id)); // still there
  });
});
