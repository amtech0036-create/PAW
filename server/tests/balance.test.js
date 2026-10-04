/**
 * Phase 5 balance service tests (PRD sections 13/18/57).
 *
 * "This phase is financially critical" (Phase 5, PRD): every test asserts
 * exact numbers. The canonical PRD section 57 example is:
 *   Opening = 10,000 | Income = 5,000 | Expense = 2,000 | Expected = 13,000
 *
 * Tests run against mongodb-memory-server; users/settings/categories are
 * seeded through the real registration flow so the data looks exactly
 * like production.
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
const { getBalanceSummary, computeBalance, roundMoney } = require('../src/services/balanceService');

let mongod;
let server;
let baseUrl;

function req(method, path, { body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers = { 'Content-Type': 'application/json' };
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
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

/**
 * Registers a fresh user through the real endpoint (seeds Settings +
 * default categories, including the built-in 'Opening Balance' category
 * from Phase 5) and returns ids needed to create transactions.
 */
async function makeUser(name) {
  const email = `${name.toLowerCase()}@balance.test`;
  const reg = await req('POST', '/api/auth/register', {
    body: { name, email, password: 'supersecret1' },
  });
  assert.equal(reg.status, 201, `registration failed: ${reg.raw}`);

  const user = await User.findOne({ email });
  assert.ok(user);

  const cats = await Category.find({ userId: user._id }).lean();
  const openingCat = cats.find((c) => c.name === 'Opening Balance');
  assert.ok(openingCat, "built-in 'Opening Balance' income category must exist (Phase 5)");
  assert.equal(openingCat.type, 'income');

  return {
    userId: user._id,
    incomeCatId: cats.find((c) => c.name === 'Salary')._id,
    expenseCatId: cats.find((c) => c.name === 'Food')._id,
    openingCatId: openingCat._id,
  };
}

function createTxn(userId, categoryId, type, amount, date = '2026-10-05') {
  return Transaction.create({ userId, categoryId, type, amount, date });
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('balance_test'), { serverSelectionTimeoutMS: 10000 });

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

describe('computeBalance (pure arithmetic, PRD section 18)', () => {
  it('implements Current Balance = Opening + Income - Expense', () => {
    assert.deepEqual(computeBalance({ openingBalance: 10000, totalIncome: 5000, totalExpense: 2000 }), {
      openingBalance: 10000,
      totalIncome: 5000,
      totalExpense: 2000,
      currentBalance: 13000,
      netCashFlow: 3000,
    });
  });

  it('defaults everything to 0 and never returns undefined', () => {
    const b = computeBalance();
    assert.deepEqual(b, {
      openingBalance: 0,
      totalIncome: 0,
      totalExpense: 0,
      currentBalance: 0,
      netCashFlow: 0,
    });
  });

  it('allows negative net cash flow and negative current balance', () => {
    const b = computeBalance({ openingBalance: 0, totalIncome: 1000, totalExpense: 2500 });
    assert.equal(b.netCashFlow, -1500);
    assert.equal(b.currentBalance, -1500);
  });

  it('rounds float artifacts to 2 decimals', () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    const b = computeBalance({ totalIncome: 0.1 + 0.2, totalExpense: 0.3 });
    assert.equal(b.totalIncome, 0.3);
    assert.equal(b.netCashFlow, 0);
  });
});

describe('getBalanceSummary (PRD section 57 balance example)', () => {
  it('Opening = 10,000, Income = 5,000, Expense = 2,000 -> Expected = 13,000', async () => {
    const u = await makeUser('Example');
    await Settings.updateOne(
      { userId: u.userId },
      { $set: { openingBalance: 10000, openingBalanceDate: new Date('2026-01-01') } }
    );

    // Two income transactions summing to 5,000; one expense of 2,000.
    await createTxn(u.userId, u.incomeCatId, 'income', 3000, '2026-10-01');
    await createTxn(u.userId, u.incomeCatId, 'income', 2000, '2026-10-02');
    await createTxn(u.userId, u.expenseCatId, 'expense', 2000, '2026-10-03');

    const b = await getBalanceSummary(u.userId);
    assert.equal(b.openingBalance, 10000);
    assert.equal(b.totalIncome, 5000);
    assert.equal(b.totalExpense, 2000);
    assert.equal(b.currentBalance, 13000); // the PRD's expected number
    assert.equal(b.netCashFlow, 3000);
  });

  it('returns all zeros for a brand-new user (empty dashboard state)', async () => {
    const u = await makeUser('Empty');
    const b = await getBalanceSummary(u.userId);
    assert.deepEqual(b, {
      openingBalance: 0,
      totalIncome: 0,
      totalExpense: 0,
      currentBalance: 0,
      netCashFlow: 0,
    });
  });

  it('counts only income toward totalIncome and only expense toward totalExpense', async () => {
    const u = await makeUser('OnlyIncome');
    await createTxn(u.userId, u.incomeCatId, 'income', 700);

    let b = await getBalanceSummary(u.userId);
    assert.equal(b.totalIncome, 700);
    assert.equal(b.totalExpense, 0);
    assert.equal(b.currentBalance, 700);
    assert.equal(b.netCashFlow, 700);

    const only = await makeUser('OnlyExpense');
    await createTxn(only.userId, only.expenseCatId, 'expense', 250);

    b = await getBalanceSummary(only.userId);
    assert.equal(b.totalIncome, 0);
    assert.equal(b.totalExpense, 250);
    assert.equal(b.currentBalance, -250); // negative balance is possible
    assert.equal(b.netCashFlow, -250);
  });

  it('sums many transactions of both types', async () => {
    const u = await makeUser('Many');
    const incomes = [1200.5, 300.25, 499.25];
    const expenses = [99.99, 0.01, 450];
    for (const [i, a] of incomes.entries()) {
      await createTxn(u.userId, u.incomeCatId, 'income', a, `2026-10-0${i + 1}`);
    }
    for (const [i, a] of expenses.entries()) {
      await createTxn(u.userId, u.expenseCatId, 'expense', a, `2026-10-1${i}`);
    }

    const b = await getBalanceSummary(u.userId);
    assert.equal(b.totalIncome, 2000);
    assert.equal(b.totalExpense, 550);
    assert.equal(b.currentBalance, 1450);
    assert.equal(b.netCashFlow, 1450);
  });

  it('keeps paisa (2-decimal) precision exact', async () => {
    const u = await makeUser('Decimals');
    await createTxn(u.userId, u.incomeCatId, 'income', 0.1);
    await createTxn(u.userId, u.incomeCatId, 'income', 0.2);
    await createTxn(u.userId, u.incomeCatId, 'income', 10.05);
    await createTxn(u.userId, u.expenseCatId, 'expense', 0.35);

    const b = await getBalanceSummary(u.userId);
    assert.equal(b.totalIncome, 10.35); // 0.1+0.2+10.05 = 10.350000000000001 raw
    assert.equal(b.totalExpense, 0.35);
    assert.equal(b.currentBalance, 10);
    assert.equal(b.netCashFlow, 10);
  });

  it('uses the opening balance even with zero transactions', async () => {
    const u = await makeUser('OpeningOnly');
    await Settings.updateOne({ userId: u.userId }, { $set: { openingBalance: 30000 } });

    const b = await getBalanceSummary(u.userId);
    assert.equal(b.openingBalance, 30000);
    assert.equal(b.totalIncome, 0);
    assert.equal(b.totalExpense, 0);
    assert.equal(b.currentBalance, 30000);
    assert.equal(b.netCashFlow, 0);
  });

  it('falls back to openingBalance 0 when the settings document is missing', async () => {
    const u = await makeUser('NoSettings');
    await createTxn(u.userId, u.incomeCatId, 'income', 1000);
    await Settings.deleteOne({ userId: u.userId });

    const b = await getBalanceSummary(u.userId);
    assert.equal(b.openingBalance, 0);
    assert.equal(b.totalIncome, 1000);
    assert.equal(b.currentBalance, 1000);
  });

  it('never mixes users: another user transactions do not change this balance', async () => {
    const a = await makeUser('IsolatedA');
    await createTxn(a.userId, a.incomeCatId, 'income', 500);

    const b = await makeUser('IsolatedB');
    await Settings.updateOne({ userId: b.userId }, { $set: { openingBalance: 9999 } });
    await createTxn(b.userId, b.expenseCatId, 'expense', 777);

    const ba = await getBalanceSummary(a.userId);
    assert.equal(ba.openingBalance, 0);
    assert.equal(ba.totalIncome, 500);
    assert.equal(ba.totalExpense, 0);
    assert.equal(ba.currentBalance, 500);

    const bb = await getBalanceSummary(b.userId);
    assert.equal(bb.openingBalance, 9999);
    assert.equal(bb.currentBalance, 9999 - 777);
  });

  it('accepts a string userId (as the JWT sub provides)', async () => {
    const u = await makeUser('StringId');
    await createTxn(u.userId, u.incomeCatId, 'income', 42);

    const b = await getBalanceSummary(u.userId.toString());
    assert.equal(b.totalIncome, 42);
  });
});
