// ============================================
// FILE: src/lib/authLinks.js
// P1: the email links for invitations and set-password.
//   - the new link format: /auth/confirm?token_hash=...&type=invite|recovery
//     (Supabase email templates, SUPABASE-TEMPLATE-STEPS). The token is only
//     checked (verifyOtp) when the person presses the button, so a mail
//     scanner that opens the link cannot use it up.
//   - why a link did not work: expired, already used, or not valid
//   - asking for a new link (POST /api/onboarding/request-link)
// The old link format (#access_token / #error_code) keeps working through
// ResetPassword and the invitation guard.
// ============================================

import { API_BASE } from './backendApi';

export const LINK_TYPES = Object.freeze(['invite', 'recovery']);
// A Supabase token hash is 56 hex characters (a "pkce_" prefix on PKCE
// projects). Anything else was cut or changed on the way.
const TOKEN_HASH = /^(pkce_)?[A-Za-z0-9_-]{16,256}$/;

/** { tokenHash, type } from the query string, or null when it is not a usable link. */
export function parseConfirmLink(search) {
  const params = new URLSearchParams(search || '');
  const tokenHash = params.get('token_hash') || '';
  const type = params.get('type') || '';
  if (!TOKEN_HASH.test(tokenHash) || !LINK_TYPES.includes(type)) return null;
  return { tokenHash, type };
}

/** The error code an old-format link brought back (#error_code=otp_expired). */
export function linkErrorCode(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (params.get('error_code')) return params.get('error_code');
  return params.get('error') ? 'unknown' : null;
}

// Supabase answers otp_expired both for a link past its time and for one
// already used (a used token is deleted). "Already used" is only known for
// sure when this browser used it, so that is remembered (a short hash of
// the spent token, never the token itself).
const USED_KEY = 'smartedu-used-links';
const fingerprint = (text) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};
const readUsed = () => {
  try { const list = JSON.parse(localStorage.getItem(USED_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; }
};
export function rememberUsedLink(tokenHash) {
  try { localStorage.setItem(USED_KEY, JSON.stringify([fingerprint(tokenHash), ...readUsed()].slice(0, 10))); } catch { /* storage off: fine */ }
}
export const wasLinkUsedHere = (tokenHash) => Boolean(tokenHash) && readUsed().includes(fingerprint(tokenHash));

/** 'expired' | 'used' | 'invalid' */
export function linkProblemKind(code, usedHere = false) {
  if (code === 'otp_expired' || code === 'flow_state_expired') return usedHere ? 'used' : 'expired';
  return 'invalid';
}

/** A verifyOtp failure that is about the link itself (not the network). */
export const isLinkRejection = (error) => {
  const status = Number(error?.status);
  if (status === 429 || /rate_limit/.test(String(error?.code || ''))) return false;
  return Boolean(error?.code) || (status >= 400 && status < 500);
};

export const LINK_PROBLEMS = Object.freeze({
  expired: {
    title: 'This link has expired',
    body: 'Email links work for a limited time and only once. Ask for a new one below.',
  },
  used: {
    title: 'This link was already used',
    body: 'It was opened in this browser before. If your password is not set yet, ask for a new link below.',
  },
  invalid: {
    title: 'This link is not valid',
    body: 'It may be incomplete or changed. Open it straight from the email, or ask for a new one below.',
  },
});

export const REQUEST_LINK_MESSAGES = Object.freeze({
  sent: 'If this email belongs to an account that still needs a password, we sent a new link. Check your inbox and spam folder.',
  emailRequired: 'Enter your email address.',
  failed: "We couldn't send the request. Please try again.",
});

/** Ask the server for a new link. The answer is the same for every address. */
export async function requestNewLink(email, { captchaToken } = {}) {
  const response = await fetch(`${API_BASE}/api/onboarding/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email || '').trim(), ...(captchaToken ? { captchaToken } : {}) }),
  });
  if (!response.ok) {
    // Only our own code is read (to tell "security check failed" from "bad email"); no text is shown.
    const code = response.status === 400 && typeof response.json === 'function' ? await response.json().then((b) => b?.code, () => undefined) : undefined;
    throw Object.assign(new Error('request-link failed'), { status: response.status, code });
  }
}
