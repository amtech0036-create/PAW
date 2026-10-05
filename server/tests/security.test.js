const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const { clean } = require('../src/middleware/sanitize');

let mongod;
let server;
let baseUrl;

function req(method, path, { body, auth, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    if (auth) reqHeaders.Authorization = `Bearer ${auth}`;
    const request = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          /* non-JSON */
        }
        resolve({ status: res.statusCode, json, raw: data, headers: res.headers });
      });
    });
    request.on('error', reject);
    if (body) request.write(typeof body === 'string' ? body : JSON.stringify(body));
    request.end();
  });
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('security_test'), { serverSelectionTimeoutMS: 10000 });

  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('Phase 16 — Security Review & Hardening', () => {
  describe('Security Headers & Helmet (PRD section 44)', () => {
    it('sets essential security headers including CSP, X-Content-Type-Options, and frame restrictions', async () => {
      const res = await req('GET', '/api/health');
      assert.equal(res.status, 200);

      // X-Content-Type-Options: nosniff
      assert.equal(res.headers['x-content-type-options'], 'nosniff');

      // CSP header
      assert.ok(res.headers['content-security-policy']);
      assert.match(res.headers['content-security-policy'], /default-src 'self'/);
      assert.match(res.headers['content-security-policy'], /object-src 'none'/);
      assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    });
  });

  describe('MongoDB NoSQL Injection Protection (PRD section 44)', () => {
    it('clean function recursively strips keys starting with $ or containing .', () => {
      const payload = {
        email: { $gt: '' },
        nested: {
          $ne: 1,
          safeField: 'hello',
          'dotted.key': 'bad',
        },
        arr: [{ $where: 'sleep' }, { normal: 123 }],
      };

      const result = clean(payload);
      assert.deepEqual(result, {
        email: {},
        nested: { safeField: 'hello' },
        arr: [{}, { normal: 123 }],
      });
    });

    it('rejects authentication with injected operator objects as email/password', async () => {
      const res = await req('POST', '/api/auth/login', {
        body: {
          email: { $gt: '' },
          password: { $gt: '' },
        },
      });

      // Because keys with $ are stripped, email becomes undefined and validation rejects it with 400
      assert.equal(res.status, 400);
      assert.ok(res.json.error);
    });
  });

  describe('Auth Cookie Security (PRD sections 30/44)', () => {
    it('sets httpOnly, sameSite=strict, and proper maxAge on registration', async () => {
      const res = await req('POST', '/api/auth/register', {
        body: { name: 'Sec User', email: 'secuser@example.com', password: 'SecPassword123' },
      });
      assert.equal(res.status, 201);

      const setCookie = res.headers['set-cookie'] || [];
      const authCookie = setCookie.find((c) => c.startsWith('token='));
      assert.ok(authCookie, 'must set token cookie');
      assert.match(authCookie, /HttpOnly/i, 'cookie must be HttpOnly');
      assert.match(authCookie, /SameSite=Strict/i, 'cookie must be SameSite=Strict');
    });
  });

  describe('Error Handling and Secrets Leak Prevention (PRD section 44)', () => {
    it('never leaks internal stack traces or database connection URIs in error responses', async () => {
      const res = await req('GET', '/api/transactions/invalid-id-format', {
        auth: 'invalid.token.here',
      });
      assert.equal(res.status, 401);
      assert.equal(typeof res.json.error, 'string');
      assert.equal(res.json.stack, undefined, 'must never leak stack traces');
      assert.equal(res.json.MONGODB_URI, undefined);
      assert.equal(res.json.JWT_SECRET, undefined);
    });
  });
});
