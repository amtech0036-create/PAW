const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Transaction = require('../src/models/Transaction');
const Settings = require('../src/models/Settings');

let mongod;
let server;
let baseUrl;
let tokenA;
let tokenB;
let userA;
let userB;

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
  assert.ok(cookie, 'auth cookie must be set');
  return cookie.split(';')[0].slice('token='.length);
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('export_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const regA = await req('POST', '/api/auth/register', {
    body: { name: 'User A', email: 'usera@example.com', password: 'Password123' },
  });
  tokenA = cookieToken(regA);
  userA = await User.findOne({ email: 'usera@example.com' });

  const regB = await req('POST', '/api/auth/register', {
    body: { name: 'User B', email: 'userb@example.com', password: 'Password123' },
  });
  tokenB = cookieToken(regB);
  userB = await User.findOne({ email: 'userb@example.com' });

  // Seed User A categories and transactions
  const foodCat = await Category.findOne({ userId: userA._id, name: 'Food' });
  const salaryCat = await Category.findOne({ userId: userA._id, name: 'Salary' });

  await Transaction.create([
    {
      userId: userA._id,
      type: 'income',
      amount: 25000,
      categoryId: salaryCat._id,
      source: 'Monthly Company, Inc.',
      date: new Date('2026-10-01T10:00:00.000Z'),
      note: 'Base salary, October',
    },
    {
      userId: userA._id,
      type: 'expense',
      amount: 1200.5,
      categoryId: foodCat._id,
      source: 'Grocery "Super" Mart',
      date: new Date('2026-10-02T12:00:00.000Z'),
      note: 'Weekly groceries',
    },
  ]);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('Export API (PRD section 39)', () => {
  it('rejects unauthenticated requests to export endpoints', async () => {
    const resCsv = await req('GET', '/api/export/csv');
    assert.equal(resCsv.status, 401);

    const resJson = await req('GET', '/api/export/json');
    assert.equal(resJson.status, 401);

    const resImport = await req('POST', '/api/import/json', { body: { transactions: [] } });
    assert.equal(resImport.status, 401);
  });

  it('GET /api/export/csv returns valid CSV with headers, transaction rows, and quotes escaping', async () => {
    const res = await req('GET', '/api/export/csv', { auth: tokenA });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /attachment; filename="cashflow-transactions-.*\.csv"/);

    const lines = res.raw.split('\r\n');
    assert.equal(lines[0], 'Date,Type,Category,Amount,Source,Note');
    assert.equal(lines.length, 3); // header + 2 transactions

    // Check row content and escaping of quotes and commas
    const salaryRow = lines.find((l) => l.includes('25000'));
    assert.ok(salaryRow);
    assert.ok(salaryRow.includes('"Monthly Company, Inc."'));
    assert.ok(salaryRow.includes('"Base salary, October"'));

    const foodRow = lines.find((l) => l.includes('1200.5'));
    assert.ok(foodRow);
    assert.ok(foodRow.includes('""Super""')); // escaped double quotes
  });

  it('GET /api/export/csv isolates user data (User B sees only header if no txns)', async () => {
    const res = await req('GET', '/api/export/csv', { auth: tokenB });
    assert.equal(res.status, 200);
    const lines = res.raw.split('\r\n');
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'Date,Type,Category,Amount,Source,Note');
  });

  it('GET /api/export/json returns structured backup with version, settings, categories, transactions', async () => {
    const res = await req('GET', '/api/export/json', { auth: tokenA });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.match(res.headers['content-disposition'], /attachment; filename="cashflow-backup-.*\.json"/);

    assert.equal(res.json.version, '1.0');
    assert.ok(res.json.exportedAt);
    assert.equal(res.json.user.email, 'usera@example.com');
    assert.ok(res.json.settings);
    assert.equal(res.json.settings.currency, 'BDT');
    assert.ok(Array.isArray(res.json.categories));
    assert.ok(res.json.categories.length >= 25);
    assert.ok(Array.isArray(res.json.transactions));
    assert.equal(res.json.transactions.length, 2);

    const salary = res.json.transactions.find((t) => t.amount === 25000);
    assert.ok(salary);
    assert.equal(salary.categoryName, 'Salary');
    assert.equal(salary.type, 'income');
  });
});

describe('Import API (PRD section 39)', () => {
  it('POST /api/import/json imports valid transactions array and auto-creates unknown categories', async () => {
    const payload = {
      transactions: [
        {
          date: '2026-10-10',
          type: 'income',
          categoryName: 'Freelance Design',
          amount: 8500,
          source: 'Client ABC',
          note: 'Logo design project',
        },
        {
          date: '2026-10-11',
          type: 'expense',
          categoryName: 'Office Supplies',
          amount: 450.75,
          source: 'Stationery shop',
          note: 'Notebooks and pens',
        },
      ],
    };

    const res = await req('POST', '/api/import/json', { auth: tokenB, body: payload });
    assert.equal(res.status, 200);
    assert.equal(res.json.imported.transactions, 2);
    assert.equal(res.json.imported.categoriesCreated, 2);

    // Verify User B's transactions in DB
    const listRes = await req('GET', '/api/transactions', { auth: tokenB });
    assert.equal(listRes.json.total, 2);
    assert.equal(listRes.json.transactions[0].amount, 450.75);
  });

  it('POST /api/import/json accepts full backup payload with settings update', async () => {
    const payload = {
      version: '1.0',
      settings: {
        openingBalance: 15000,
        openingBalanceDate: '2026-09-01',
        theme: 'dark',
      },
      transactions: [
        {
          date: '2026-10-15',
          type: 'income',
          categoryName: 'Salary',
          amount: 50000,
        },
      ],
    };

    const res = await req('POST', '/api/import/json', { auth: tokenB, body: payload });
    assert.equal(res.status, 200);
    assert.equal(res.json.imported.transactions, 1);
    assert.equal(res.json.imported.settingsUpdated, true);

    const settingsRes = await req('GET', '/api/settings', { auth: tokenB });
    assert.equal(settingsRes.json.settings.openingBalance, 15000);
    assert.equal(settingsRes.json.settings.theme, 'dark');
  });

  it('POST /api/import/json rejects invalid transactions without modifying existing data', async () => {
    const beforeCount = (await Transaction.find({ userId: userA._id })).length;

    const invalidPayload = {
      transactions: [
        {
          date: 'invalid-date',
          type: 'invalid-type',
          amount: -500,
          categoryName: '',
        },
      ],
    };

    const res = await req('POST', '/api/import/json', { auth: tokenA, body: invalidPayload });
    assert.equal(res.status, 400);
    assert.ok(res.json.error);
    assert.ok(res.json.details.length > 0);

    const afterCount = (await Transaction.find({ userId: userA._id })).length;
    assert.equal(afterCount, beforeCount, 'must not insert corrupted rows on validation error');
  });
});
