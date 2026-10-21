// Form validation helpers (ARCHITECTURE.md §6.9). They never throw: text() and oneOf() record a
// message in errors[key], and every helper returns a cleaned value (or null).

// Trimmed text that must not be blank and must fit; length is counted in characters, as MySQL's
// CHAR_LENGTH does, so an emoji or a Chinese character counts as one.
function text(value, { max, label = 'This field' } = {}, errors, key) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (errors && key) {
    if (s.length === 0) errors[key] = `${label} cannot be blank`;
    else if (max && [...s].length > max)
      errors[key] = `${label} is too long (at most ${max} characters)`;
  }
  return s;
}

// A whole number within the bounds, or null (missing, not a number, out of range).
function int(value, { min, max } = {}) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || !/^-?\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  if (!Number.isSafeInteger(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

// The value if it is one of the list, else null (and errors[key] = message when errors is given).
function oneOf(value, list, errors, key, message = 'Choose one of the options') {
  if (typeof value === 'string' && list.includes(value)) return value;
  if (errors && key) errors[key] = message;
  return null;
}

// Checkboxes and toggles: '1', 'on' and 'true' mean true; anything else (or nothing) false.
// A toggle sends a hidden 0 before its checkbox, so the last value wins.
function bool(value) {
  const v = Array.isArray(value) ? value[value.length - 1] : value;
  return v === '1' || v === 'on' || v === 'true' || v === true;
}

module.exports = { text, int, oneOf, bool };
