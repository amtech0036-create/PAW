/**
 * Settings API tests (PRD sections 13/17/38).
 * Opening balance is a setting, not a transaction (PRD section 13) - the
 * balance service folds it into Current Balance.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const Settings = require('../src/models/Settings');

let mongod;
let server;
let baseUrl;
let token;

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
  await mongoose.connect(mongod.getUri('settings_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const reg = await req('POST', '/api/auth/register', {
    body: { name: 'Settings User', email: 'settings@settings.test', password: 'supersecret1' },
  });
  assert.equal(reg.status, 201);
  token = cookieToken(reg);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  if (server) await new Promise((resolve) => server.close(resolve));
});

describe('GET /api/settings', () => {
  it('requires authentication', async () => {
    const res = await req('GET', '/api/settings');
    assert.equal(res.status, 401);
  });

  it('returns PRD section 17 defaults for a fresh user', async () => {
    const res = await req('GET', '/api/settings', { auth: token });
    assert.equal(res.status, 200);
    const s = res.json.settings;
    assert.equal(s.openingBalance, 0);
    assert.equal(s.openingBalanceDate, null);
    assert.equal(s.currency, 'BDT');
    assert.equal(s.currencySymbol, '৳');
    assert.equal(s.timezone, 'Asia/Dhaka');
    assert.equal(s.theme, 'system');
    assert.equal(s.language, 'en');
    assert.equal(s.dateFormat, 'DD/MM/YYYY');
  });
});

describe('PUT /api/settings/opening-balance', () => {
  it('sets the opening balance and date', async () => {
    const res = await req('PUT', '/api/settings/opening-balance', {
      auth: token,
      body: { amount: 10000, date: '2026-10-01' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.openingBalance, 10000);
    assert.ok(res.json.settings.openingBalanceDate);

    const doc = await Settings.findOne().lean();
    assert.equal(doc.openingBalance, 10000);
  });

  it('accepts numeric strings and rounds to 2 decimals', async () => {
    const res = await req('PUT', '/api/settings/opening-balance', {
      auth: token,
      body: { amount: '1500.555' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.openingBalance, 1500.56);
  });

  it('accepts 0 to clear the opening balance', async () => {
    const res = await req('PUT', '/api/settings/opening-balance', {
      auth: token,
      body: { amount: 0 },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.openingBalance, 0);
  });

  it('rejects negative and non-numeric amounts with 400', async () => {
    const negative = await req('PUT', '/api/settings/opening-balance', {
      auth: token,
      body: { amount: -5 },
    });
    assert.equal(negative.status, 400);
    const nan = await req('PUT', '/api/settings/opening-balance', {
      auth: token,
      body: { amount: 'abc' },
    });
    assert.equal(nan.status, 400);
  });

  it('rejects an invalid date with 400', async () => {
    const res = await req('PUT', '/api/settings/opening-balance', {
      auth: token,
      body: { amount: 10, date: 'not-a-date' },
    });
    assert.equal(res.status, 400);
  });
});

describe('PUT /api/settings', () => {
  it('updates theme, language, and date format', async () => {
    const res = await req('PUT', '/api/settings', {
      auth: token,
      body: { theme: 'dark', language: 'bn', dateFormat: 'YYYY-MM-DD' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.theme, 'dark');
    assert.equal(res.json.settings.language, 'bn');
    assert.equal(res.json.settings.dateFormat, 'YYYY-MM-DD');
  });

  it('rejects unsupported values with 400', async () => {
    const badTheme = await req('PUT', '/api/settings', { auth: token, body: { theme: 'neon' } });
    assert.equal(badTheme.status, 400);
    const badFormat = await req('PUT', '/api/settings', { auth: token, body: { dateFormat: 'YY' } });
    assert.equal(badFormat.status, 400);
  });

  it('does not allow changing the opening balance through the preferences endpoint', async () => {
    const res = await req('PUT', '/api/settings', { auth: token, body: { openingBalance: 999 } });
    assert.equal(res.status, 400);
    const doc = await Settings.findOne().lean();
    assert.equal(doc.openingBalance, 0);
  });
});
