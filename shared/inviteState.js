// ============================================
// FILE: shared/inviteState.js
// P1: the one definition of "invited but not activated yet", used by the
// admin directory (status chip, Resend), the resend route, the public
// request-link route and the browser's invitation guard.
//
// The activation marker (backend/src/routes/onboarding.js): an invite creates
// the auth user (auth invited_at) and a profile with role 'guest' and status
// 'inactive'. /api/onboarding/complete sets the first password, makes the
// profile 'active' and writes app_metadata.onboarding_complete = true.
// Opening the email link alone (a person, or a mail scanner) only sets
// email_confirmed_at: the account is still not activated.
// ============================================

// Supabase's default email link lifetime (Auth > Email OTP expiration,
// 86400 s). Only used to label a link "expired" in the admin list; Supabase
// itself decides whether a link still works.
export const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string|null|undefined} profileStatus  profiles.status (may be unknown)
 * @param {object|null|undefined} authUser       the Supabase auth user
 */
export function isNotActivated(profileStatus, authUser) {
  const status = String(profileStatus || '').toLowerCase();
  if (status === 'active' || status === 'archived') return false;
  return Boolean(authUser?.invited_at) && authUser.app_metadata?.onboarding_complete !== true;
}

const time = (value) => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** When the newest invite or set-password email went out, in ms (or null). */
export function lastLinkSentAt(authUser) {
  const sent = [authUser?.invited_at, authUser?.confirmation_sent_at, authUser?.recovery_sent_at]
    .map(time).filter((ms) => ms !== null);
  return sent.length ? Math.max(...sent) : null;
}

/**
 * For a not-activated account: 'invited' while the newest link is unopened
 * and young enough to work, 'link_stale' once it was opened without a
 * password being set (email confirmed) or is older than LINK_LIFETIME_MS.
 */
export function inviteLinkState(authUser, now = Date.now()) {
  if (authUser?.email_confirmed_at) return 'link_stale';
  const sent = lastLinkSentAt(authUser);
  if (sent === null || now - sent > LINK_LIFETIME_MS) return 'link_stale';
  return 'invited';
}

/** Seconds left before another link may be sent, 0 when it may be sent now. */
export function cooldownLeft(authUser, windowMs, now = Date.now()) {
  const sent = lastLinkSentAt(authUser);
  if (sent === null) return 0;
  return Math.max(0, Math.ceil((sent + windowMs - now) / 1000));
}
