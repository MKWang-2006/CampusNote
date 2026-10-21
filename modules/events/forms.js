const { text, int, oneOf } = require('../../core/validate');

// BR-17: datetime-local is Hong Kong time, independently of the server's local timezone.
function parseHkt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  // MySQL DATETIME supports years 1000–9999, even though JavaScript accepts earlier ones.
  if (Number(value.slice(0, 4)) < 1000) return null;
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1000) return null;
  // Date.parse normalizes dates such as 30 February; reject them rather than silently shifting.
  return formatHkt(date) === value ? date : null;
}

function formatHkt(value) {
  return new Date(new Date(value).getTime() + 8 * 3600e3).toISOString().slice(0, 16);
}

function validateEvent(values = {}, uploadError) {
  const errors = {};
  const fields = {
    title: text(values.title, { max: 80, label: 'Title' }, errors, 'title'),
    description: text(
      values.description,
      { max: 2000, label: 'Description' },
      errors,
      'description',
    ),
    venue: text(values.venue, { max: 120, label: 'Venue' }, errors, 'venue'),
    capacity: int(values.capacity, { min: 1, max: 5000 }),
    audience: oneOf(values.audience, ['university', 'all'], errors, 'audience'),
  };
  if (fields.capacity === null) errors.capacity = 'Capacity must be a whole number from 1 to 5,000';
  for (const key of ['starts_at', 'ends_at', 'release_at']) {
    fields[key] = parseHkt(values[key]);
    if (!fields[key]) errors[key] = 'Enter a valid Hong Kong date and time';
  }
  if (fields.starts_at && fields.ends_at && fields.ends_at <= fields.starts_at)
    errors.ends_at = 'End must be after the start';
  if (fields.starts_at && fields.release_at && fields.release_at >= fields.starts_at)
    errors.release_at = 'Release must be before the start';
  if (uploadError) errors.cover = uploadError;
  return { fields, errors };
}

module.exports = { parseHkt, formatHkt, validateEvent };
