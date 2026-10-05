/**
 * Phase 13 report API tests (PRD sections 25-28/36/51-52).
 *
 * Financially critical: exact sums. Also covers PRD section 52 - reports
 * must respect the user's local date (Asia/Dhaka, UTC+6), so a transaction
 * entered 04 October local never appears in September.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Transaction = require('../src/models/Transaction');
const { monthWindow, currentMonthKey, offsetMsFor } = require('../src/controllers/reportController');

let mongod;
let server;
let baseUrl;
let token;
let userId;
let incomeCatId; // Salary
let expenseCatId; // Food

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
        resolve({ status: res.statusCode, json, raw: data, headers: res.headers });
      });
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

function cookieToken(res) {
  const setCookie = res.headers['set-cookie'] || [];
  const cookie = setCookie.find((c) => c.startsWith('token='));
  assert.ok(cookie, 'register must set the auth cookie');
  return cookie.split(';')[0].slice('token='.length);
}

/** Creates a transaction with an explicit UTC instant. */
function createTxn(type, amount, utcDate, categoryId) {
  return Transaction.create({ userId, type, amount, categoryId, date: new Date(utcDate) });
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('reports_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const reg = await req('POST', '/api/auth/register', {
    body: { name: 'Report User', email: 'reports@report.test', password: 'supersecret1' },
  });
  assert.equal(reg.status, 201);
  token = cookieToken(reg);

  const user = await User.findOne({ email: 'reports@report.test' });
  userId = user._id;
  const cats = await Category.find({ userId: user._id }).lean();
  incomeCatId = cats.find((c) => c.name === 'Salary')._id.toString();
  expenseCatId = cats.find((c) => c.name === 'Food')._id.toString();

  // September 2026 (Dhaka): income 40,000, expense 21,000 → net +19,000.
  await createTxn('income', 40000, '2026-09-10T04:00:00Z', incomeCatId); // 10:00 Sep 10 Dhaka
  await createTxn('expense', 21000, '2026-09-20T04:00:00Z', expenseCatId);

  // October 2026 (Dhaka): income 45,000, expenses 18,500 → net +26,500.
  await createTxn('income', 45000, '2026-10-01T04:00:00Z', incomeCatId);
  await createTxn('expense', 10000, '2026-10-02T10:00:00Z', expenseCatId);
  await createTxn('expense', 5000, '2026-10-03T10:00:00Z', expenseCatId);
  await createTxn('expense', 3500, '2026-10-04T10:00:00Z', expenseCatId);

  // PRD section 52 edge: 2026-10-01T00:30 local Dhaka = 2026-09-30T18:30Z →
  // this is OCTOBER in Dhaka even though its UTC date is Sep 30.
  await createTxn('expense', 500, '2026-09-30T18:30:00Z', expenseCatId);

  // And the reverse: 2026-09-30T17:00Z = 23:00 Sep 30 Dhaka → September.
  await createTxn('expense', 700, '2026-09-30T17:00:00Z', expenseCatId);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('month window helper (PRD section 52)', () => {
  it('shifts local month boundaries by the Dhaka offset', () => {
    const tz = 'Asia/Dhaka';
    const { start, end } = monthWindow('2026-10-01'.slice(0, 7), tz);
    // October in Dhaka starts 2026-09-30T18:00Z and ends 2026-10-31T18:00Z.
    assert.equal(start.toISOString(), '2026-09-30T18:00:00.000Z');
    assert.equal(end.toISOString(), '2026-10-31T18:00:00.000Z');
  });

  it('exposes the PRD default offset of +6h for Asia/Dhaka', () => {
    assert.equal(offsetMsFor('Asia/Dhaka'), 6 * 3600 * 1000);
  });
});

describe('GET /api/reports/monthly', () => {
  it('requires authentication', async () => {
    const res = await req('GET', '/api/reports/monthly');
    assert.equal(res.status, 401);
  });

  it('sums October exactly (PRD section 25 example)', async () => {
    const res = await req('GET', '/api/reports/monthly?month=2026-10', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.month, '2026-10');
    assert.equal(res.json.label, 'October 2026');
    assert.equal(res.json.income, 45000);
    assert.equal(res.json.expense, 18500 + 500); // includes the Dhaka-Oct edge txn
    assert.equal(res.json.net, 45000 - 19000);
    assert.equal(res.json.timezone, 'Asia/Dhaka');
  });

  it('sums September exactly, including the 23:00 local txn', async () => {
    const res = await req('GET', '/api/reports/monthly?month=2026-09', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.income, 40000);
    assert.equal(res.json.expense, 21000 + 700);
    assert.equal(res.json.net, 40000 - 21700);
  });

  it('returns zeros for a month with no activity', async () => {
    const res = await req('GET', '/api/reports/monthly?month=2025-01', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.income, 0);
    assert.equal(res.json.expense, 0);
    assert.equal(res.json.net, 0);
  });

  it('rejects a malformed month with 400', async () => {
    const res = await req('GET', '/api/reports/monthly?month=october', { auth: token });
    assert.equal(res.status, 400);
  });

  it('defaults to the current Dhaka month', async () => {
    const res = await req('GET', '/api/reports/monthly', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.month, currentMonthKey('Asia/Dhaka'));
  });
});

describe('GET /api/reports/categories', () => {
  it('breaks October expenses down by category with percentages', async () => {
    const res = await req('GET', '/api/reports/categories?month=2026-10', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.type, 'expense');
    assert.equal(res.json.total, 19000); // 18500 + 500
    const food = res.json.categories.find((c) => c.name === 'Food');
    assert.ok(food);
    assert.equal(food.amount, 19000);
    assert.equal(food.percent, 100);
  });

  it('only counts expenses of the requesting user', async () => {
    // Another user's expense must not leak in.
    const other = await req('POST', '/api/auth/register', {
      body: { name: 'Other', email: 'other-reports@report.test', password: 'supersecret1' },
    });
    const otherToken = cookieToken(other);
    const otherUser = await User.findOne({ email: 'other-reports@report.test' });
    const otherCats = await Category.find({ userId: otherUser._id }).lean();
    await Transaction.create({
      userId: otherUser._id,
      type: 'expense',
      amount: 99999,
      categoryId: otherCats.find((c) => c.name === 'Rent')._id,
      date: new Date('2026-10-05T04:00:00Z'),
    });

    const res = await req('GET', '/api/reports/categories?month=2026-10', { auth: token });
    assert.equal(res.json.total, 19000);
    const resOther = await req('GET', '/api/reports/categories?month=2026-10', { auth: otherToken });
    assert.equal(resOther.json.total, 99999);
  });

  it('supports a custom date range', async () => {
    const res = await req('GET', '/api/reports/categories?startDate=2026-10-02&endDate=2026-10-03', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.total, 15000); // 10000 + 5000; the 500 edge txn is Oct 1 local
  });

  it('rejects reversed ranges with 400', async () => {
    const res = await req('GET', '/api/reports/categories?startDate=2026-10-10&endDate=2026-10-01', { auth: token });
    assert.equal(res.status, 400);
  });
});

describe('GET /api/reports/income-expense', () => {
  it('returns ascending months with zeros filled (PRD sections 26/28)', async () => {
    const res = await req('GET', '/api/reports/income-expense?months=3', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.months.length, 3);

    const aug = res.json.months[0];
    assert.equal(aug.income, 0);
    assert.equal(aug.expense, 0);
    assert.equal(aug.net, 0);

    const sep = res.json.months.find((m) => m.month === '2026-09');
    assert.equal(sep.income, 40000);
    assert.equal(sep.expense, 21700);
    assert.equal(sep.net, 40000 - 21700);

    const oct = res.json.months.find((m) => m.month === '2026-10');
    assert.equal(oct.income, 45000);
    assert.equal(oct.expense, 19000);
    assert.equal(oct.net, 45000 - 19000);
  });

  it('clamps months to 1..24', async () => {
    const tooMany = await req('GET', '/api/reports/income-expense?months=999', { auth: token });
    assert.equal(tooMany.json.monthsRequested, 24);
    assert.equal(tooMany.json.months.length, 24);
    const zero = await req('GET', '/api/reports/income-expense?months=0', { auth: token });
    assert.equal(zero.json.monthsRequested, 1);
  });
});

describe('GET /api/reports/custom', () => {
  it('treats endDate as an inclusive local day (PRD section 51)', async () => {
    const res = await req('GET', '/api/reports/custom?startDate=2026-10-02&endDate=2026-10-04', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.income, 0);
    assert.equal(res.json.expense, 18500); // 10000 + 5000 + 3500; excludes Oct 1 edge txn
    assert.equal(res.json.net, -18500);
  });

  it('spans months when asked', async () => {
    const res = await req('GET', '/api/reports/custom?startDate=2026-09-01&endDate=2026-10-31', { auth: token });
    assert.equal(res.json.income, 85000);
    assert.equal(res.json.expense, 21700 + 19000);
  });

  it('validates dates and order', async () => {
    const bad = await req('GET', '/api/reports/custom?startDate=nope&endDate=2026-10-01', { auth: token });
    assert.equal(bad.status, 400);
    const reversed = await req('GET', '/api/reports/custom?startDate=2026-10-02&endDate=2026-10-01', { auth: token });
    assert.equal(reversed.status, 400);
  });
});
