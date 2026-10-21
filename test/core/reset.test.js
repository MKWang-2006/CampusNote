// The SQL splitter that db:reset uses for files with DELIMITER (BB-4).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitSql, sqlFiles } = require('../../db/reset');

test('splitSql splits on ; outside quotes and comments', () => {
  const out = splitSql(
    '-- a comment; not a statement\nSELECT \'a;b\';\n# another; comment\nSELECT "c;d", `e;f`;\n/* x; y */ SELECT 1',
  );
  assert.deepEqual(
    out.map((s) => s.sql.replace(/\s+/g, ' ')),
    [
      "-- a comment; not a statement SELECT 'a;b'",
      '# another; comment SELECT "c;d", `e;f`',
      '/* x; y */ SELECT 1',
    ],
  );
  assert.deepEqual(
    out.map((s) => s.line),
    [2, 4, 5],
  );
});

test('splitSql understands DELIMITER, escaped quotes and doubled quotes', () => {
  const out = splitSql(
    "SELECT 'it''s; fine', 'a\\';b';\nDELIMITER $$\nCREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW\nBEGIN\n  SET @a = 1;\n  SET @b = 2;\nEND$$\nDELIMITER ;\nSELECT 2;",
  );
  assert.equal(out.length, 3);
  assert.match(out[1].sql, /^CREATE TRIGGER t[\s\S]*SET @b = 2;\nEND$/);
  assert.equal(out[1].line, 3);
  assert.equal(out[2].sql, 'SELECT 2');
});

test('db:reset loads the schema, module SQL, the core seed and module seeds in that order', () => {
  const files = sqlFiles();
  assert.equal(files[0], 'db/schema.sql');
  assert.ok(files.includes('modules/messages/db/triggers.sql'));
  assert.ok(files.indexOf('modules/messages/db/triggers.sql') < files.indexOf('db/seed/core.sql'));
});
