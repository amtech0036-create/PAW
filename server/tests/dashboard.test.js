/**
 * Phase 6 dashboard backend tests (PRD sections 19/35/43).
 * GET /api/dashboard must return the five balance fields from the
 * Phase 5 balance service plus recentTransactions (newest first,
 * with category names), scoped strictly to the requesting user.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Settings = require('../src/models/Settings');
const Category = require('../src/models/Category');
const Transaction = require('../src/models/Transaction');

let mongod;
let server;
let baseUrl;

function req(method, path, { body, auth } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${auth}`;

    const request = http.request(url, { method, headers }, (res) => {
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
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

/** Registers a user via the real flow and returns ids + a bearer token. */
async function makeUser(name) {
  const email = `${name.toLowerCase()}@dash.test`;
  const reg = await req('POST', '/api/auth/register', {
    body: { name, email, password: 'supersecret1' },
  });
  assert.equal(reg.status, 201, `registration failed: ${reg.raw}`);

  const cookie = reg.headers['set-cookie'][0].split(';')[0];
  const user = await User.findOne({ email });
  const cats = await Category.find({ userId: user._id }).lean();

  return {
    userId: user._id,
    token: cookie.slice('token='.length),
    incomeCatId: cats.find((c) => c.name === 'Salary')._id,
    expenseCatId: cats.find((c) => c.name === 'Food')._id,
  };
}

function createTxn(userId, categoryId, type, amount, date) {
  return Transaction.create({ userId, categoryId, type, amount, date });
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('dashboard_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('GET /api/dashboard (PRD section 35)', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await req('GET', '/api/dashboard');
    assert.equal(res.status, 401);
  });

  it('returns all six PRD fields with exact numbers', async () => {
    const u = await makeUser('Numbers');
    await Settings.updateOne({ userId: u.userId }, { $set: { openingBalance: 30000 } });
    // 45,000 income - 18,500 expense = 26,500 net cash flow (PRD example values).
    await createTxn(u.userId, u.incomeCatId, 'income', 45000, '2026-10-02');
    await createTxn(u.userId, u.expenseCatId, 'expense', 18500, '2026-10-03');

    const res = await req('GET', '/api/dashboard', { auth: u.token });
    assert.equal(res.status, 200);

    assert.deepEqual(
      Object.keys(res.json).sort(),
      ['currentBalance', 'netCashFlow', 'openingBalance', 'recentTransactions', 'totalExpense', 'totalIncome']
    );
    assert.equal(res.json.openingBalance, 30000);
    assert.equal(res.json.totalIncome, 45000);
    assert.equal(res.json.totalExpense, 18500);
    assert.equal(res.json.currentBalance, 56500); // 30000 + 45000 - 18500
    assert.equal(res.json.netCashFlow, 26500); // 45000 - 18500
    assert.ok(Array.isArray(res.json.recentTransactions));
    assert.equal(res.json.recentTransactions.length, 2);
  });

  it('returns zeros and an empty list for a brand-new user', async () => {
    const u = await makeUser('Fresh');
    const res = await req('GET', '/api/dashboard', { auth: u.token });

    assert.equal(res.status, 200);
    assert.equal(res.json.openingBalance, 0);
    assert.equal(res.json.totalIncome, 0);
    assert.equal(res.json.totalExpense, 0);
    assert.equal(res.json.currentBalance, 0);
    assert.equal(res.json.netCashFlow, 0);
    assert.deepEqual(res.json.recentTransactions, []);
  });

  it('lists recent transactions newest first with category names', async () => {
    const u = await makeUser('Recency');
    await createTxn(u.userId, u.incomeCatId, 'income', 1000, '2026-10-01');
    await createTxn(u.userId, u.expenseCatId, 'expense', 100, '2026-10-03');
    await createTxn(u.userId, u.expenseCatId, 'expense', 200, '2026-10-02');

    const res = await req('GET', '/api/dashboard', { auth: u.token });
    const dates = res.json.recentTransactions.map((t) => t.date.slice(0, 10));
    assert.deepEqual(dates, ['2026-10-03', '2026-10-02', '2026-10-01']);

    const expense = res.json.recentTransactions[0];
    assert.equal(expense.amount, 100);
    assert.equal(expense.type, 'expense');
    assert.equal(expense.categoryName, 'Food');
    assert.equal(expense.categoryId, u.expenseCatId.toString());

    const income = res.json.recentTransactions[2];
    assert.equal(income.categoryName, 'Salary');
  });

  it('returns at most 5 recent transactions by default and honors ?limit', async () => {
    const u = await makeUser('ManyTxns');
    for (let i = 1; i <= 9; i++) {
      await createTxn(u.userId, u.expenseCatId, 'expense', i, `2026-09-0${i}`);
    }

    const def = await req('GET', '/api/dashboard', { auth: u.token });
    assert.equal(def.json.recentTransactions.length, 5);
    // The 5 newest are Sep 05..Sep 01 -> first is the latest date.
    assert.equal(def.json.recentTransactions[0].date.slice(0, 10), '2026-09-05');
    assert.equal(def.json.recentTransactions[4].date.slice(0, 10), '2026-09-01');

    const limited = await req('GET', '/api/dashboard?limit=2', { auth: u.token });
    assert.equal(limited.json.recentTransactions.length, 2);
    assert.equal(limited.json.recentTransactions[0].date.slice(0, 10), '2026-09-05');

    // Balance totals still cover ALL transactions, not just the recent page.
    assert.equal(limited.json.totalExpense, 45); // 1+2+...+9
    assert.equal(limited.json.currentBalance, 45);

    // Out-of-range limits clamp instead of erroring.
    const big = await req('GET', '/api/dashboard?limit=999', { auth: u.token });
    assert.equal(big.status, 200);
    assert.equal(big.json.recentTransactions.length, 9);

    const tiny = await req('GET', '/api/dashboard?limit=0', { auth: u.token });
    assert.equal(tiny.status, 200);
    assert.equal(tiny.json.recentTransactions.length, 1);
  });

  it('never includes another user transactions (PRD section 43)', async () => {
    const a = await makeUser('DashIsoA');
    const b = await makeUser('DashIsoB');

    await createTxn(a.userId, a.incomeCatId, 'income', 500, '2026-10-01');
    await createTxn(b.userId, b.expenseCatId, 'expense', 999, '2026-10-02');

    const resA = await req('GET', '/api/dashboard', { auth: a.token });
    assert.equal(resA.json.recentTransactions.length, 1);
    assert.equal(resA.json.recentTransactions[0].amount, 500);
    assert.equal(resA.json.totalExpense, 0);
    assert.equal(resA.json.totalIncome, 500);
    assert.equal(resA.json.currentBalance, 500);

    const resB = await req('GET', '/api/dashboard', { auth: b.token });
    assert.equal(resB.json.recentTransactions.length, 1);
    assert.equal(resB.json.recentTransactions[0].amount, 999);
    assert.equal(resB.json.totalIncome, 0);
    assert.equal(resB.json.currentBalance, -999);
  });

  it('reflects opening balance even with no transactions', async () => {
    const u = await makeUser('OpeningDash');
    await Settings.updateOne({ userId: u.userId }, { $set: { openingBalance: 7777 } });

    const res = await req('GET', '/api/dashboard', { auth: u.token });
    assert.equal(res.json.openingBalance, 7777);
    assert.equal(res.json.currentBalance, 7777);
    assert.deepEqual(res.json.recentTransactions, []);
  });
});
