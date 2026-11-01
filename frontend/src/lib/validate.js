/**
 * Client-side checks that mirror the backend's Zod rules, so people see a clear
 * message before anything is sent. Each returns an error string or ''.
 */
export const required = (label) => (v) => (String(v ?? '').trim() ? '' : `${label} is required`);

export const email = (v) =>
  !String(v ?? '').trim()
    ? 'Email is required'
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
      ? ''
      : 'Enter a valid email address';

export const password = (v) => {
  if (!v) return 'Password is required';
  if (v.length < 8) return 'Password must be at least 8 characters';
  if (v.length > 72) return 'Password must be at most 72 characters';
  if (!/[A-Za-z]/.test(v)) return 'Password must contain at least one letter';
  if (!/\d/.test(v)) return 'Password must contain at least one number';
  return '';
};

export const minLen = (label, n) => (v) =>
  String(v ?? '').trim().length >= n ? '' : `${label} must be at least ${n} characters`;

export const studentId = (v) =>
  /^[A-Za-z0-9-]{3,20}$/.test(String(v ?? '').trim())
    ? ''
    : 'Student ID must be 3-20 letters, digits or dashes';

export const kenyanPhone = (v) => {
  const n = String(v ?? '').replace(/[\s-]/g, '').replace(/^\+/, '').replace(/^0/, '254');
  return /^254[17]\d{8}$/.test(n) ? '' : 'Enter a valid Safaricom number, e.g. 0712345678';
};

export const positiveInt = (label) => (v) =>
  Number.isInteger(Number(v)) && Number(v) > 0 ? '' : `${label} must be a whole number above 0`;

/** Runs `rules` ({field: fn}) over `values`; returns an errors object (empty = valid). */
export function validate(values, rules) {
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const message = rule(values[field], values);
    if (message) errors[field] = message;
  }
  return errors;
}
