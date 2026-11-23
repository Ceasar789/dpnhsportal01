// ============================================
// FILE: src/lib/formRules.js
// U2 form kit: pure validators with friendly messages. Each validator takes
// a value and returns a message, or null when the value is fine. Nothing
// here touches React, the DOM or the network.
//
// Optional fields: every validator except `required` treats an empty value
// as fine, so "optional but must be valid when filled in" is just the
// validator on its own, and "required and valid" is
// compose(required(), email()).
// ============================================

const text = value => (value == null ? '' : String(value));
const blank = value => text(value).trim() === '';

/** A value must be present (spaces alone do not count). */
export const required = (message = 'This field is required.') => value => (
  Array.isArray(value) ? (value.length ? null : message) : (blank(value) ? message : null)
);

/** The first message from a list of validators, or null. */
export const compose = (...validators) => value => {
  for (const validate of validators) {
    const message = validate(value);
    if (message) return message;
  }
  return null;
};

// One @, something before it, a dot in the part after it, no spaces. Not the
// full RFC: the server and the invitation email are the real check.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export const EMAIL_MESSAGE = 'Enter a valid email address, for example JuanDelacruz@gmail.com.';
export const email = (message = EMAIL_MESSAGE) => value => (
  blank(value) || EMAIL.test(text(value).trim()) ? null : message
);

export const minLength = (min, message) => value => (
  blank(value) || [...text(value).trim()].length >= min ? null
    : message || `Use at least ${min} characters.`
);
export const maxLength = (max, message) => value => (
  [...text(value)].length <= max ? null : message || `Use ${max} characters or fewer.`
);

// ---- LRN (DepEd Learner Reference Number): exactly twelve digits 0-9 ----
export const LRN_LENGTH = 12;
export const LRN_MESSAGES = Object.freeze({
  empty: "Enter the student's 12-digit LRN.",
  digitsOnly: 'Digits only (0-9).',
  length: count => `The LRN must be 12 digits. You've entered ${count}.`,
});

/**
 * Clean what was typed or pasted into an LRN box, and say what was removed,
 * so the field can show "Digits only" instead of silently dropping letters.
 *   value      the ASCII digits kept, at most 12
 *   dropped    true when anything other than 0-9 was removed (letters,
 *              spaces, dashes, and non-ASCII digits such as fullwidth or
 *              Arabic-Indic numerals, which the LRN does not use)
 *   separators true when ONLY spaces or dashes were removed (a pasted
 *              "1081-2345-6789"): worth a gentler note than "Digits only"
 *   truncated  true when more than 12 digits were given
 */
export function lrnInput(raw) {
  const source = text(raw);
  const digits = source.replace(/[^0-9]/g, '');
  const removed = source.replace(/[0-9]/g, '');
  return {
    value: digits.slice(0, LRN_LENGTH),
    dropped: removed.length > 0,
    separators: removed.length > 0 && /^[\s-]+$/.test(removed),
    truncated: digits.length > LRN_LENGTH,
  };
}

/** Validate an LRN as stored (empty is fine: wrap in required() if needed). */
export const lrn = () => value => {
  const v = text(value).trim();
  if (v === '') return null;
  if (/[^0-9]/.test(v)) return LRN_MESSAGES.digitsOnly;
  if (v.length !== LRN_LENGTH) return LRN_MESSAGES.length(v.length);
  return null;
};

// ---- Phone: a Philippine mobile number, 09XXXXXXXXX or +639XXXXXXXXX ----
export const PHONE_MESSAGE = 'Enter a mobile number like 0917 123 4567.';
export const phone = (message = PHONE_MESSAGE) => value => {
  if (blank(value)) return null;
  const compact = text(value).replace(/[\s().-]/g, '');
  return /^(09\d{9}|\+639\d{9})$/.test(compact) ? null : message;
};

// ---- Password rules for the live checklist (PasswordField `rules`) ----
/**
 * Build the checklist rules from a policy, so the app passes its real
 * policy in and nothing here hard-codes one. Each rule:
 *   { id, label, test(value) => boolean }
 */
export function passwordRules({ minLength: min = 0, uppercase = false, lowercase = false, number = false, special = false } = {}) {
  const rules = [];
  if (min > 0) rules.push({ id: 'length', label: `At least ${min} characters`, test: v => [...text(v)].length >= min });
  if (uppercase) rules.push({ id: 'uppercase', label: 'One uppercase letter (A-Z)', test: v => /[A-Z]/.test(text(v)) });
  if (lowercase) rules.push({ id: 'lowercase', label: 'One lowercase letter (a-z)', test: v => /[a-z]/.test(text(v)) });
  if (number) rules.push({ id: 'number', label: 'One number (0-9)', test: v => /[0-9]/.test(text(v)) });
  if (special) rules.push({ id: 'special', label: 'One special character (like ! or #)', test: v => /[^A-Za-z0-9]/.test(text(v)) });
  return rules;
}

/** The rules a value does not meet yet. */
export const unmetRules = (rules, value) => (rules || []).filter(rule => !rule.test(value));

/** A validator from checklist rules: one friendly message when any is unmet. */
export const passwordMeets = (rules, message = 'Your password does not meet all the rules yet.') => value => (
  unmetRules(rules, value).length ? message : null
);
