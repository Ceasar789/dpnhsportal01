// ============================================
// FILE: src/lib/friendlyError.js
// U2 form kit: turn any error into one plain sentence for the person using
// the app. It NEVER returns text that came from the server, the database or
// the browser: every sentence it can return is written in this file (or
// passed in by the caller as `overrides` / `fallback`, which are the
// caller's own words). The raw error is only READ, to pick a sentence.
//
// Where it will be used (U1 report, appendix A: 30 places that show
// error.message today). What each one receives:
//   Supabase PostgREST / Postgres errors { code: '23505' | 'PGRST116' | ... }
//     admin  useAcademicLogic.jsx:100, :273, :337
//            useAdminLogic.jsx:446 (save user), :811, :894, :955, :979, :1097
//     teacher WorksheetsTab.jsx:310, :394, :402, :415, :421
//            LessonPlansTab.jsx:1036, :1091; useWorksheetAssessment.jsx:276
//   Supabase Auth errors { code: 'invalid_credentials' | 'weak_password' | ... }
//            ResetPassword.jsx:94
//   Supabase Functions / invite route { status, code: app code }
//            useAdminLogic.jsx:355 (resend invitation), :446 (create user)
//   Backend API (fetch) errors: TypeError "Failed to fetch", AbortError,
//   HTTP status, trusted-persistence codes ('assignment_denied', ...)
//            useAIGeneration.js:45, :75, :105; ILAWLessonPlanGenerator.jsx:68, :94
//            GenerateDayTaskModal.jsx:102, :114; LessonPlansTab.jsx:1049
//            FullManualIlawEditor.jsx:125; useAdminLogic.jsx:657, :795
//   Plain fetch / query errors
//            hooks/useSupabaseQuery.js:16; public/Calendar.jsx:45
//   (Dev-only labs, lower priority: EssayReviewLab.jsx:110,
//    LocalDistributionModal.jsx:29, :89.)
// ============================================

export const GENERIC = 'Something went wrong. Please try again.';

export const MESSAGES = Object.freeze({
  offline: 'You appear to be offline. Check your connection and try again.',
  network: "We couldn't reach the server. Check your connection and try again.",
  timeout: 'This is taking too long. Please try again.',
  session: 'Your session has ended. Please sign in again.',
  permission: "You don't have permission to do that.",
  duplicate: 'This already exists.',
  inUse: "This is still used by other records, so it can't be changed or removed.",
  invalid: 'Some information is missing or not valid. Check the form and try again.',
  tooLong: 'Some text is too long. Shorten it and try again.',
  notFound: "We couldn't find that record. It may have been removed.",
  conflict: 'This was changed somewhere else. Refresh and try again.',
  tooLarge: 'The file is too large.',
  rateLimit: 'Too many attempts. Please wait a moment and try again.',
  server: 'The server had a problem. Please try again in a moment.',
  wrongLogin: 'The email or password is incorrect.',
  emailNotConfirmed: 'Please confirm your email address first, then sign in.',
  emailTaken: 'An account with this email already exists.',
  weakPassword: 'Choose a stronger password that meets all the rules.',
  samePassword: "Choose a password you haven't used here before.",
  linkExpired: 'This link has expired or was already used. Ask for a new one.',
  notAssigned: "You aren't assigned to this subject and grade.",
  pastYear: "Past school years can't be changed.",
  // P2: password security
  captcha: "The security check didn't pass. Complete it again, then retry.",
  codeInvalid: 'That code is wrong or has expired. Use the newest code from your email, or send a new one.',
  codeNeeded: 'Enter the code we sent to your email.',
  currentPassword: 'Your current password is incorrect.',
});

// Known error codes. Postgres SQLSTATE, PostgREST, Supabase Auth, and the
// app's own trusted-persistence / RPC codes seen in this repo.
export const CODE_TABLE = Object.freeze({
  // Postgres
  23505: 'duplicate', // unique_violation
  23503: 'inUse', // foreign_key_violation
  23502: 'invalid', // not_null_violation
  23514: 'invalid', // check_violation
  '22P02': 'invalid', // invalid_text_representation
  22001: 'tooLong', // string_data_right_truncation
  22007: 'invalid', // invalid_datetime_format
  22008: 'invalid', // datetime_field_overflow
  42501: 'permission', // insufficient_privilege (RLS)
  57014: 'timeout', // query_canceled (statement timeout)
  '40001': 'conflict', // serialization_failure
  '40P01': 'conflict', // deadlock_detected
  // PostgREST
  PGRST116: 'notFound', // no rows for .single()
  PGRST301: 'session', // JWT expired / invalid
  PGRST302: 'session',
  // Supabase Auth
  invalid_credentials: 'wrongLogin',
  email_not_confirmed: 'emailNotConfirmed',
  user_already_exists: 'emailTaken',
  email_exists: 'emailTaken',
  weak_password: 'weakPassword',
  same_password: 'samePassword',
  otp_expired: 'linkExpired',
  session_not_found: 'session',
  refresh_token_not_found: 'session',
  over_email_send_rate_limit: 'rateLimit',
  over_request_rate_limit: 'rateLimit',
  captcha_failed: 'captcha',
  reauthentication_not_valid: 'codeInvalid', // wrong OR expired code: Supabase answers both alike
  reauthentication_needed: 'codeNeeded',
  current_password_mismatch: 'currentPassword',
  current_password_required: 'currentPassword',
  // App codes (backend trusted persistence, RPC guards, invite route)
  not_authenticated: 'session',
  inactive_or_wrong_role: 'permission',
  forbidden: 'permission',
  assignment_denied: 'notAssigned',
  historical_write_blocked: 'pastYear',
  not_found: 'notFound',
  payload_too_large: 'tooLarge',
  invalid_document: 'invalid',
  invalid_request: 'invalid',
  invalid_scores: 'invalid',
  rate_limited: 'rateLimit',
  stale_revision: 'conflict',
  invalid_revision: 'conflict',
});

const STATUS = (status) => {
  if (status === 401) return 'session';
  if (status === 403) return 'permission';
  if (status === 404) return 'notFound';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 409) return 'conflict';
  if (status === 413) return 'tooLarge';
  if (status === 429) return 'rateLimit';
  if (status >= 500 && status <= 599) return 'server';
  return null;
};

const field = (error, key) => (error && typeof error === 'object' ? error[key] : undefined);

/**
 * @param {unknown} error   anything: an Error, a Supabase error, a Response,
 *                          a string, null
 * @param {object}  [options]
 * @param {Object<string,string>} [options.overrides]  sentences keyed by code
 *        or by MESSAGES key, e.g. { 23505: 'This LRN is already used.' }
 * @param {string}  [options.fallback]  the sentence for anything unknown
 * @returns {string} always a sentence written by the app, never raw text
 */
export function friendlyError(error, { overrides = {}, fallback = GENERIC } = {}) {
  const say = key => overrides[key] ?? MESSAGES[key];

  // Offline beats everything: whatever failed, that is why.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return say('offline');
  if (error == null) return fallback;

  const code = field(error, 'code') ?? field(error, 'error_code') ?? field(error, 'errorCode');
  if (code != null && overrides[String(code)] !== undefined) return overrides[String(code)];
  const fromCode = code != null ? CODE_TABLE[String(code)] : undefined;
  if (fromCode) return say(fromCode);

  const name = String(field(error, 'name') ?? '');
  if (name === 'AbortError' || name === 'TimeoutError' || code === 'ETIMEDOUT') return say('timeout');

  const status = Number(field(error, 'status') ?? field(error, 'statusCode'));
  const fromStatus = Number.isFinite(status) ? STATUS(status) : null;
  if (fromStatus) return say(fromStatus);

  // Network failures carry no code; recognise them by their well-known
  // browser wording only to CHOOSE a sentence (the wording is never shown).
  const raw = typeof error === 'string' ? error : String(field(error, 'message') ?? '');
  if (/failed to fetch|networkerror|network request failed|load failed|err_network|econnrefused|enotfound/i.test(raw)) return say('network');
  if (/timed? ?out|timeout/i.test(raw)) return say('timeout');
  if (/jwt expired|invalid jwt|refresh token/i.test(raw)) return say('session');

  return fallback;
}

export default friendlyError;
