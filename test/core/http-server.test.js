// The test client must connect to the address family actually owned by its server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const { startTestServer } = require('../http-server');

const close = (server) =>
  new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((err) => (err ? reject(err) : resolve()));
  });

const markerApp = (marker) => (req, res) => {
  res.setHeader('X-Test-Server', marker);
  res.end(req.url);
};

// Keep the competing listener independent of the helper under test, including mutation checks.
async function startIPv4Sentinel() {
  const server = http.createServer(markerApp('unrelated-ipv4-listener'));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  return server;
}

test('test servers bind the IPv4 loopback address used by the HTTP client', async (t) => {
  const server = await startTestServer(markerApp('intended'));
  t.after(() => close(server));
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal(server.address().family, 'IPv4');
  const res = await request(server).get('/probe');
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-test-server'], 'intended');
  assert.equal(res.text, '/probe');
});

test('independent agents retain separate cookies on the shared test server', async (t) => {
  const app = express();
  app.use(session({ secret: 'synthetic-test-only', resave: false, saveUninitialized: false }));
  app.get('/session', (req, res) => {
    req.session.marker ||= crypto.randomUUID();
    res.json({ marker: req.session.marker });
  });
  const server = await startTestServer(app);
  t.after(() => close(server));
  const first = request.agent(server);
  const second = request.agent(server);
  const initial = await Promise.all([first.get('/session'), second.get('/session')]);
  assert.notEqual(initial[0].body.marker, initial[1].body.marker);
  const repeated = await Promise.all([first.get('/session'), second.get('/session')]);
  assert.deepEqual(
    repeated.map((res) => res.body.marker),
    initial.map((res) => res.body.marker),
  );
});

test('concurrent requests keep the intended server and leave both servers listening', async (t) => {
  const first = await startTestServer(markerApp('first'));
  t.after(() => close(first));
  const second = await startTestServer(markerApp('second'));
  t.after(() => close(second));
  const replies = await Promise.all(
    Array.from({ length: 32 }, async (_, i) => {
      const server = i % 2 ? first : second;
      const marker = i % 2 ? 'first' : 'second';
      const res = await request(server).get(`/probe/${i}`);
      assert.equal(res.headers['x-test-server'], marker);
      assert.equal(res.text, `/probe/${i}`);
      return res.status;
    }),
  );
  assert.ok(replies.every((status) => status === 200));
  assert.equal(first.listening, true);
  assert.equal(second.listening, true);
});

test('test servers reject a port already owned by an unrelated IPv4 listener', async (t) => {
  const sentinel = await startIPv4Sentinel();
  t.after(() => close(sentinel));
  let unexpectedServer;
  t.after(() => unexpectedServer && close(unexpectedServer));
  await assert.rejects(
    async () => {
      unexpectedServer = await startTestServer(markerApp('intended-test-app'), {
        port: sentinel.address().port,
      });
    },
    { code: 'EADDRINUSE' },
  );
  const res = await request(sentinel).get('/probe');
  assert.equal(res.headers['x-test-server'], 'unrelated-ipv4-listener');
});

test('an unrelated IPv4 listener cannot receive requests intended for the test app', async (t) => {
  const sentinel = await startIPv4Sentinel();
  t.after(() => close(sentinel));
  const port = sentinel.address().port;
  const ipv6 = http.createServer(markerApp('intended-ipv6-app'));
  t.after(() => close(ipv6));
  try {
    await new Promise((resolve, reject) => {
      ipv6.once('error', reject);
      ipv6.listen({ host: '::', port, ipv6Only: true }, resolve);
    });
  } catch (err) {
    if (['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EPROTONOSUPPORT', 'ENOTSUP'].includes(err.code)) {
      t.skip(`IPv6 loopback is unavailable: ${err.code}`);
      return;
    }
    throw err;
  }

  // The same port can name two different applications. A client must not replace an IPv6
  // wildcard with IPv4 and assume that both addresses reach the same listener.
  const ipv4Reply = await request(`http://127.0.0.1:${port}`).get('/probe');
  const ipv6Reply = await request(`http://[::1]:${port}`).get('/probe');
  assert.equal(ipv4Reply.headers['x-test-server'], 'unrelated-ipv4-listener');
  assert.equal(ipv6Reply.headers['x-test-server'], 'intended-ipv6-app');

  const intended = await startTestServer(markerApp('intended-test-app'));
  t.after(() => close(intended));
  assert.notEqual(intended.address().port, port);
  const res = await request.agent(intended).get('/probe');
  assert.equal(res.headers['x-test-server'], 'intended-test-app');
  assert.equal(res.text, '/probe');
});
