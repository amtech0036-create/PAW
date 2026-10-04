/**
 * Phase 3 authentication tests (PRD sections 30/33/57/59).
 * Runs the real Express app over HTTP against a real mongod
 * (mongodb-memory-server).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { createApp } = require('../src/app');
const User = require('../src/models/User');

let mongod;
let server;
let baseUrl;

const USER = { name: 'Anim', email: 'anim@example.com', password: 'supersecret1' };

function req(method, path, { body, cookie, auth } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`);
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.Cookie = cookie;
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
  return setCookie[0].split(';')[0]; // "token=..."
}

before(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  await mongoose.connect(mongod.getUri('auth_test'), { serverSelectionTimeoutMS: 10000 });

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

describe('Register (PRD section 57)', () => {
  it('registers a new user, sets httpOnly cookie, returns user without password', async () => {
    const res = await req('POST', '/api/auth/register', { body: USER });

    assert.equal(res.status, 201);
    assert.equal(res.json.user.email, USER.email);
    assert.equal(res.json.user.name, USER.name);
    assert.ok(!('passwordHash' in res.json.user));

    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /^token=/);

    // User + Settings + default categories were created.
    const user = await User.findOne({ email: USER.email });
    assert.ok(user);
    assert.ok(user.passwordHash.startsWith('$2'));
    assert.notEqual(user.passwordHash, USER.password); // hashed, never plaintext

    const Settings = require('../src/models/Settings');
    const Category = require('../src/models/Category');
    assert.equal(await Settings.countDocuments({ userId: user._id }), 1);
    assert.equal(await Category.countDocuments({ userId: user._id, type: 'income' }), 10); // includes 'Opening Balance' seeded since Phase 5
    assert.equal(await Category.countDocuments({ userId: user._id, type: 'expense' }), 15);
  });

  it('rejects duplicate email with 409', async () => {
    const res = await req('POST', '/api/auth/register', { body: USER });
    assert.equal(res.status, 409);
    assert.match(res.json.error, /already exists/i);
  });

  it('rejects invalid email with 400', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { name: 'X', email: 'not-an-email', password: 'supersecret1' },
    });
    assert.equal(res.status, 400);
  });

  it('rejects short password with 400', async () => {
    const res = await req('POST', '/api/auth/register', {
      body: { name: 'X', email: 'shortpw@example.com', password: 'short' },
    });
    assert.equal(res.status, 400);
  });
});

describe('Login (PRD section 57)', () => {
  it('logs in with correct credentials and sets cookie', async () => {
    const res = await req('POST', '/api/auth/login', {
      body: { email: USER.email, password: USER.password },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.email, USER.email);
    assert.ok(res.headers['set-cookie']);
  });

  it('rejects wrong password with 401 and identical message', async () => {
    const res = await req('POST', '/api/auth/login', {
      body: { email: USER.email, password: 'wrongpassword' },
    });
    assert.equal(res.status, 401);

    // Same generic message for unknown email (no user enumeration).
    const res2 = await req('POST', '/api/auth/login', {
      body: { email: 'ghost@example.com', password: 'whatever123' },
    });
    assert.equal(res2.status, 401);
    assert.equal(res.json.error, res2.json.error);
  });
});

describe('Session /me (PRD section 57: unauthorized request)', () => {
  it('rejects /me without credentials with 401', async () => {
    const res = await req('GET', '/api/auth/me');
    assert.equal(res.status, 401);
  });

  it('rejects /me with a garbage token with 401', async () => {
    const res = await req('GET', '/api/auth/me', { auth: 'not-a-jwt' });
    assert.equal(res.status, 401);
  });

  it('accepts /me with the httpOnly cookie', async () => {
    const login = await req('POST', '/api/auth/login', {
      body: { email: USER.email, password: USER.password },
    });
    const cookie = loginCookie(login);

    const res = await req('GET', '/api/auth/me', { cookie });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.email, USER.email);
  });

  it('accepts /me with a Bearer token', async () => {
    const login = await req('POST', '/api/auth/login', {
      body: { email: USER.email, password: USER.password },
    });
    const cookie = loginCookie(login);
    const token = cookie.slice('token='.length);

    const res = await req('GET', '/api/auth/me', { auth: token });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.email, USER.email);
  });
});

describe('Logout (PRD section 57)', () => {
  it('clears the auth cookie; /me then returns 401', async () => {
    const login = await req('POST', '/api/auth/login', {
      body: { email: USER.email, password: USER.password },
    });
    const cookie = loginCookie(login);

    const out = await req('POST', '/api/auth/logout', { cookie });
    assert.equal(out.status, 200);

    const expired = out.headers['set-cookie'][0];
    assert.match(expired, /Expires=Thu, 01 Jan 1970/i);

    // The old cookie no longer authenticates the browser session view:
    // server-side the JWT itself remains valid until expiry, but the cookie
    // is cleared client-side. Send the cleared cookie to prove the browser
    // is logged out.
    const clearedCookie = expired.split(';')[0];
    const res = await req('GET', '/api/auth/me', { cookie: clearedCookie });
    assert.equal(res.status, 401);
  });
});

describe('Protected routes behave correctly', () => {
  it('health endpoint stays public', async () => {
    const res = await req('GET', '/api/health');
    assert.equal(res.status, 200);
  });

  it('unknown /api route returns 404 JSON', async () => {
    const res = await req('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
  });
});
