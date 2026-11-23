// ============================================
// FILE: src/lib/passwordSecurity.js
// P2: the signed-in password change, in three Supabase calls:
//   1. verifyCurrentPassword  a sign-in with the current password on a
//      separate client that keeps nothing (no storage, no refresh), then
//      that extra session is signed out again. A wrong password stops
//      here, before any email is sent.
//   2. sendPasswordCode       supabase.auth.reauthenticate(): Supabase
//      emails a one-time code (the "nonce").
//   3. changePassword         updateUser({ password, nonce, current_password }),
//      then signOut({ scope: 'others' }): every other device is signed
//      out, this one stays signed in.
// What Supabase itself checks (see P2-REPORT.md): the code only when
// "Secure password change" is on AND this session is over 24 hours old;
// current_password only when "require current password" is on. Step 1 is
// the app's own check so a wrong current password fails either way.
// Passwords, codes and tokens are never logged.
// ============================================

import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

/** Seconds before "Send a new code" works again (Supabase's default email frequency is 60 s). */
export const CODE_COOLDOWN_SECONDS = 60;

/** 6 digits by default; Supabase allows a longer code length (up to 10). */
export const CODE_PATTERN = /^\d{6,10}$/;

/** The Change Password page's own fixed sentences. */
export const CHANGE_MESSAGES = Object.freeze({
  currentRequired: 'Enter your current password.',
  mismatch: 'Passwords do not match',
  sameAsCurrent: "Choose a password you haven't used here before.",
  codeNeeded: 'Enter the code we sent to your email.',
  codeFormat: 'Enter the code from the email. It is made of numbers only.',
  failed: 'Failed to change password. Please try again.',
  sendFailed: "We couldn't send the code. Please try again.",
  codeSent: 'We sent a code to your email. It can take a minute to arrive; check your spam folder too.',
  codeResent: 'We sent a new code. Use the newest email.',
  done: 'Your password was changed.',
  othersOut: 'Your other devices were signed out. You are still signed in here.',
  othersUnknown: "We couldn't confirm that your other devices were signed out. Sign out on them, then sign in with the new password.",
});

const fail = (code, status) => Object.assign(new Error(code), { code, status });

/** The signed-in person's own address, from the live session (never from the page). */
export async function sessionEmail() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.email || '';
}

export async function verifyCurrentPassword(currentPassword, { captchaToken } = {}) {
  const email = await sessionEmail();
  if (!email) throw fail('session_not_found', 401);
  const check = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'smartedu-password-check' },
  });
  const { data, error } = await check.auth.signInWithPassword({
    email,
    password: currentPassword,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error) {
    if (error.code === 'invalid_credentials' || (error.status === 400 && /invalid login credentials/i.test(error.message || ''))) {
      throw fail('current_password_mismatch', 400);
    }
    throw error;
  }
  // The check's own session is not needed: end it on the server too.
  if (data?.session) {
    try { await check.auth.signOut({ scope: 'local' }); } catch { /* expires by itself */ }
  }
}

export async function sendPasswordCode() {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw error;
}

/** Returns { othersSignedOut } — false only when the extra sign-out call failed. */
export async function changePassword({ password, code, currentPassword }) {
  if (!CODE_PATTERN.test(String(code || ''))) throw fail('reauthentication_needed', 400);
  const { error } = await supabase.auth.updateUser({ password, nonce: code, current_password: currentPassword });
  if (error) throw error;
  return { othersSignedOut: await signOutOtherSessions() };
}

/** After a password change or reset: end every other session, keep this one. */
export async function signOutOtherSessions() {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    return !error;
  } catch {
    return false;
  }
}
