// core/uploads.js: type, size and count checks, and where files land (BB-3, BR-18).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { startTestServer, stopTestServer } = require('../http-server');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-uploads-'));
process.env.UPLOAD_DIR = dir;
const config = require('../../core/config');
config.uploadDir = dir;
const uploads = require('../../core/uploads');

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

const app = express();
app.post('/up', uploads.images({ field: 'images', max: 2 }), (req, res) => {
  res.json({ files: req.files, error: req.uploadError || null, body: req.body });
});

let server;
before(async () => {
  server = await startTestServer(app);
});
after(async () => {
  try {
    await stopTestServer(server);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const filesOnDisk = () =>
  fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile());

test('accepts images, stores them under YYYY/MM and reports public paths', async () => {
  const res = await request(server)
    .post('/up')
    .field('body', 'hello')
    .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
    .attach('images', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });
  assert.equal(res.status, 200);
  assert.equal(res.body.error, null);
  assert.equal(res.body.body.body, 'hello');
  assert.equal(res.body.files.length, 2);
  for (const f of res.body.files)
    assert.match(f.publicPath, /^\/uploads\/\d{4}\/\d{2}\/[0-9a-f]{16}\.(png|jpg)$/);
  assert.equal(filesOnDisk().length, 2);
  uploads.remove(res.body.files.map((f) => f.publicPath));
  assert.equal(filesOnDisk().length, 0);
});

test('a form without files gives req.files = []', async () => {
  const res = await request(server).post('/up').field('body', 'text only');
  assert.deepEqual(res.body.files, []);
  assert.equal(res.body.error, null);
});

for (const [name, attach] of [
  [
    'a wrong type',
    (r) =>
      r.attach('images', Buffer.from('<html>'), { filename: 'x.html', contentType: 'text/html' }),
  ],
  [
    'a renamed file (content is not the claimed type)',
    (r) =>
      r.attach('images', Buffer.from('<svg></svg> padding'), {
        filename: 'x.png',
        contentType: 'image/png',
      }),
  ],
  [
    'too many files',
    (r) =>
      r
        .attach('images', PNG, { filename: '1.png', contentType: 'image/png' })
        .attach('images', PNG, { filename: '2.png', contentType: 'image/png' })
        .attach('images', PNG, { filename: '3.png', contentType: 'image/png' }),
  ],
  [
    'a file over 5 MB',
    (r) =>
      r.attach('images', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), {
        filename: 'big.png',
        contentType: 'image/png',
      }),
  ],
]) {
  test(`refuses ${name}: nothing kept, the handler still runs with the message`, async () => {
    const res = await attach(request(server).post('/up').field('body', 'draft'));
    assert.equal(res.status, 200);
    assert.equal(res.body.error, 'Up to 2 images, JPEG, PNG, WebP or GIF, 5 MB each.');
    assert.deepEqual(res.body.files, []);
    assert.equal(res.body.body.body, 'draft');
    assert.equal(filesOnDisk().length, 0);
  });
}

test('remove() ignores paths outside the upload folder', () => {
  const outside = path.join(os.tmpdir(), `cn-keep-${process.pid}.txt`);
  fs.writeFileSync(outside, 'keep');
  uploads.remove(['/uploads/../' + path.basename(outside), outside, '/static/img/favicon.svg']);
  assert.ok(fs.existsSync(outside));
  fs.rmSync(outside);
});

test('a one-image field says so in its message', () => {
  assert.equal(uploads.message(1), 'One image only: JPEG, PNG, WebP or GIF, at most 5 MB.');
  assert.equal(uploads.message(6), 'Up to 6 images, JPEG, PNG, WebP or GIF, 5 MB each.');
});

test('a late upload callback cannot advance the router twice after a size refusal', () => {
  const multer = require('multer');
  const prototype = Object.getPrototypeOf(multer());
  const original = prototype.array;
  try {
    prototype.array = () => (req, res, done) => {
      req.files = [];
      done(new multer.MulterError('LIMIT_FILE_SIZE'));
      done();
    };
    const req = {};
    let calls = 0;
    uploads.images({ field: 'images', max: 2 })(req, {}, () => {
      calls += 1;
    });
    assert.equal(calls, 1);
    assert.equal(req.uploadError, 'Up to 2 images, JPEG, PNG, WebP or GIF, 5 MB each.');
    assert.deepEqual(req.files, []);
  } finally {
    prototype.array = original;
  }
});
