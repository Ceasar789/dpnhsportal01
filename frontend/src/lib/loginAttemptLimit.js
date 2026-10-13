export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_LOCKOUT_MS = 60_000;

const storageKey = (email) => `smartedu-login-attempts:${email.trim().toLowerCase()}`;
const emptyState = () => ({ count: 0, lockedUntil: null });

export const readLoginAttempts = (email, now = Date.now(), storage = globalThis.localStorage) => {
  try {
    const saved = JSON.parse(storage.getItem(storageKey(email)) || 'null');
    if (!saved || !Number.isFinite(saved.count)) return emptyState();

    // Sprint B migration: the previous implementation stored count=5 with
    // no expiry, permanently locking that browser. Treat those legacy rows
    // as expired rather than carrying the defect forward.
    if (saved.count >= LOGIN_ATTEMPT_LIMIT && !Number.isFinite(saved.lockedUntil)) {
      storage.removeItem(storageKey(email));
      return emptyState();
    }

    if (Number.isFinite(saved.lockedUntil) && saved.lockedUntil <= now) {
      storage.removeItem(storageKey(email));
      return emptyState();
    }

    return {
      count: Math.max(0, Math.min(LOGIN_ATTEMPT_LIMIT, saved.count)),
      lockedUntil: Number.isFinite(saved.lockedUntil) ? saved.lockedUntil : null,
    };
  } catch {
    return emptyState();
  }
};

export const clearLoginAttempts = (email, storage = globalThis.localStorage) => {
  try { storage.removeItem(storageKey(email)); }
  catch { /* Storage can be unavailable in hardened/private browser modes. */ }
};

export const recordLoginFailure = (email, now = Date.now(), storage = globalThis.localStorage) => {
  const current = readLoginAttempts(email, now, storage);
  const count = Math.min(LOGIN_ATTEMPT_LIMIT, current.count + 1);
  const next = {
    count,
    lockedUntil: count >= LOGIN_ATTEMPT_LIMIT ? now + LOGIN_LOCKOUT_MS : null,
  };
  try { storage.setItem(storageKey(email), JSON.stringify(next)); }
  catch { /* Supabase still applies its own server-side Auth rate limits. */ }
  return next;
};

export const remainingLockSeconds = (attempts, now = Date.now()) =>
  attempts.lockedUntil && attempts.lockedUntil > now
    ? Math.ceil((attempts.lockedUntil - now) / 1000)
    : 0;

export const isCredentialFailure = (error) =>
  error?.code === 'invalid_credentials'
  || /invalid login credentials/i.test(error?.message || '');

export const loginErrorMessage = (error) => {
  if (error?.userMessage) return error.userMessage;
  const message = error?.message || '';
  if (/invalid login credentials/i.test(message)) return 'Invalid email or password';
  if (/email not confirmed/i.test(message)) return 'Please verify your email first';
  if (error?.code === 'over_request_rate_limit' || /too many requests|over_request_rate_limit/i.test(message)) {
    return 'Too many attempts. Please try again later';
  }
  return 'Login failed. Please try again.';
};
