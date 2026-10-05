/**
 * Phase 12 category API tests (PRD sections 14/16/37).
 *
 * Critical rule (PRD section 12): a category required by existing
 * transactions is never hard-deleted - DELETE returns 409 and the client
 * disables it instead.
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

let mongod;
let server;
let baseUrl;
let token; // bearer token for USER
let otherToken;
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

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('categories_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const reg = await req('POST', '/api/auth/register', {
    body: { name: 'Cat Owner', email: 'owner@categories.test', password: 'supersecret1' },
  });
  assert.equal(reg.status, 201);
  token = cookieToken(reg);

  const regOther = await req('POST', '/api/auth/register', {
    body: { name: 'Other User', email: 'other@categories.test', password: 'supersecret1' },
  });
  assert.equal(regOther.status, 201);
  otherToken = cookieToken(regOther);

  const user = await User.findOne({ email: 'owner@categories.test' });
  userId = user._id;

  const cats = await Category.find({ userId: user._id }).lean();
  incomeCatId = cats.find((c) => c.name === 'Salary')._id.toString();
  expenseCatId = cats.find((c) => c.name === 'Food')._id.toString();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('GET /api/categories', () => {
  it('requires authentication', async () => {
    const res = await req('GET', '/api/categories');
    assert.equal(res.status, 401);
  });

  it('returns the seeded default categories with names and types', async () => {
    const res = await req('GET', '/api/categories', { auth: token });
    assert.equal(res.status, 200);
    const names = res.json.categories.map((c) => c.name);
    assert.ok(names.includes('Salary'));
    assert.ok(names.includes('Food'));
    assert.ok(res.json.categories.every((c) => c.isActive === true));
    assert.ok(res.json.categories.every((c) => typeof c.id === 'string'));
  });

  it('filters by type', async () => {
    const res = await req('GET', '/api/categories?type=expense', { auth: token });
    assert.equal(res.status, 200);
    assert.ok(res.json.categories.length > 0);
    assert.ok(res.json.categories.every((c) => c.type === 'expense'));
  });

  it('never returns another user’s categories', async () => {
    const res = await req('GET', '/api/categories', { auth: otherToken });
    assert.equal(res.status, 200);
    const ids = res.json.categories.map((c) => c.id);
    assert.ok(!ids.includes(incomeCatId));
  });
});

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    const res = await req('POST', '/api/categories', {
      auth: token,
      body: { name: 'Ramadan Charity', type: 'expense', icon: '🌙' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.category.name, 'Ramadan Charity');
    assert.equal(res.json.category.type, 'expense');
    assert.equal(res.json.category.isDefault, false);
    assert.equal(res.json.category.isActive, true);
  });

  it('rejects a duplicate name within the same type with 409', async () => {
    const res = await req('POST', '/api/categories', {
      auth: token,
      body: { name: 'Food', type: 'expense' },
    });
    assert.equal(res.status, 409);
  });

  it('allows the same name under a different type', async () => {
    const res = await req('POST', '/api/categories', {
      auth: token,
      body: { name: 'Food', type: 'income' },
    });
    assert.equal(res.status, 201);
  });

  it('validates name and type', async () => {
    const empty = await req('POST', '/api/categories', { auth: token, body: { name: '  ', type: 'expense' } });
    assert.equal(empty.status, 400);
    const badType = await req('POST', '/api/categories', { auth: token, body: { name: 'X', type: 'savings' } });
    assert.equal(badType.status, 400);
  });
});

describe('PUT /api/categories/:id', () => {
  it('renames a category', async () => {
    const created = await req('POST', '/api/categories', {
      auth: token,
      body: { name: 'Old Name', type: 'expense' },
    });
    const res = await req('PUT', `/api/categories/${created.json.category.id}`, {
      auth: token,
      body: { name: 'New Name' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.category.name, 'New Name');
  });

  it('disables (isActive false) and re-enables a category', async () => {
    const created = await req('POST', '/api/categories', {
      auth: token,
      body: { name: 'Disable Me', type: 'income' },
    });
    const off = await req('PUT', `/api/categories/${created.json.category.id}`, {
      auth: token,
      body: { isActive: false },
    });
    assert.equal(off.status, 200);
    assert.equal(off.json.category.isActive, false);

    // Hidden from the default list, visible with includeInactive=true.
    const list = await req('GET', '/api/categories?type=income', { auth: token });
    assert.ok(!list.json.categories.some((c) => c.id === created.json.category.id));
    const all = await req('GET', '/api/categories?type=income&includeInactive=true', { auth: token });
    assert.ok(all.json.categories.some((c) => c.id === created.json.category.id));

    const on = await req('PUT', `/api/categories/${created.json.category.id}`, {
      auth: token,
      body: { isActive: true },
    });
    assert.equal(on.json.category.isActive, true);
  });

  it('blocks changing type once the category has transactions (409)', async () => {
    await Transaction.create({
      userId,
      categoryId: expenseCatId,
      type: 'expense',
      amount: 100,
      date: '2026-10-05',
    });
    const res = await req('PUT', `/api/categories/${expenseCatId}`, {
      auth: token,
      body: { type: 'income' },
    });
    assert.equal(res.status, 409);
  });

  it('returns 404 for another user’s category', async () => {
    const res = await req('PUT', `/api/categories/${incomeCatId}`, {
      auth: otherToken,
      body: { name: 'Hijack' },
    });
    assert.equal(res.status, 404);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('hard-deletes a category that has no transactions', async () => {
    const created = await req('POST', '/api/categories', {
      auth: token,
      body: { name: 'Unused', type: 'expense' },
    });
    const res = await req('DELETE', `/api/categories/${created.json.category.id}`, { auth: token });
    assert.equal(res.status, 200);
    const gone = await Category.findOne({ _id: created.json.category.id });
    assert.equal(gone, null);
  });

  it('refuses to delete a category required by existing transactions (409) and keeps it', async () => {
    const res = await req('DELETE', `/api/categories/${expenseCatId}`, { auth: token });
    assert.equal(res.status, 409);
    assert.ok(res.json.error.includes('Disable'));
    const stillThere = await Category.findOne({ _id: expenseCatId }).lean();
    assert.ok(stillThere, 'category must survive a blocked delete');
  });
});
