const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseHkt, formatHkt, validateEvent } = require('../forms');

test('Hong Kong form dates round-trip across the UTC day boundary', () => {
  assert.equal(parseHkt('2026-10-22T01:30').toISOString(), '2026-10-21T17:30:00.000Z');
  assert.equal(formatHkt(new Date('2026-10-21T17:30Z')), '2026-10-22T01:30');
  assert.equal(parseHkt('2026-02-30T12:00'), null);
  assert.equal(parseHkt(['2026-10-22T12:00']), null);
  assert.equal(parseHkt('2026-10-22T25:00'), null);
  assert.equal(parseHkt('0999-10-22T12:00'), null);
  assert.equal(parseHkt('0000-01-01T00:00'), null);
  assert.equal(parseHkt('1000-01-01T00:00'), null);
  assert.equal(parseHkt('1000-01-01T08:00').toISOString(), '1000-01-01T00:00:00.000Z');
});

test('event fields reject invalid capacity, empty text, and impossible time order', () => {
  const { errors } = validateEvent({
    title: '',
    description: 'Description',
    venue: 'Hall',
    capacity: '1.5',
    audience: 'other',
    starts_at: '2026-10-22T12:00',
    ends_at: '2026-10-22T11:00',
    release_at: '2026-10-22T12:00',
  });
  for (const key of ['title', 'capacity', 'audience', 'ends_at', 'release_at'])
    assert.ok(errors[key]);
});
