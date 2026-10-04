const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createApp } = require('../src/app');

let server;
let baseUrl;

function request(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      })
      .on('error', reject);
  });
}

before(async () => {
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('Phase 1: server smoke tests', () => {
  it('GET /api/health returns ok with db status', async () => {
    const res = await request('/api/health');

    assert.equal(res.status, 200);

    const data = JSON.parse(res.body);
    assert.equal(data.status, 'ok');
    assert.equal(data.db, 'disconnected'); // No MongoDB running in test env
    assert.ok(typeof data.uptime === 'number');
    assert.ok(data.timestamp);
  });

  it('GET /api/unknown returns 404 JSON', async () => {
    const res = await request('/api/unknown');

    assert.equal(res.status, 404);
    assert.deepEqual(JSON.parse(res.body), { error: 'Not found' });
  });

  it('serves the static frontend at /', async () => {
    const res = await request('/');

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /Personal Cash Flow Tracker/);
  });

  it('security headers are present (helmet)', async () => {
    const res = await request('/api/health');

    assert.ok(res.headers['x-content-type-options']);
  });
});
