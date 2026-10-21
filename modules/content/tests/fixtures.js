const { after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../../../core/config');

// Each test process owns its files; never write into the running demonstration's upload folder.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'campusnote-content-test-'));
config.uploadDir = directory;
after(() => fs.rmSync(directory, { recursive: true, force: true }));

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN5kAAAAASUVORK5CYII=',
  'base64',
);

async function publish(agent, fields = {}, files = []) {
  const page = await agent.page('/compose');
  let req = agent.raw.post(page.$('form[enctype]').attr('action'));
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  for (const file of files)
    req = req.attach('images', file.bytes || PNG, {
      filename: file.name || 'image.png',
      contentType: file.type || 'image/png',
    });
  return req;
}

const fileList = () =>
  fs
    .readdirSync(directory, { recursive: true })
    .filter((p) => fs.statSync(path.join(directory, p)).isFile())
    .sort();

module.exports = { PNG, publish, fileList };
