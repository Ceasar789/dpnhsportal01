// ============================================
// FILE: src/pages/dashboards/admin/shared/userForm.js
// U3: the rules of the admin Create / Edit User dialog, kept pure so the
// classic and Clarity tabs and useAdminLogic.saveUser share one copy.
//   - field ids (unchanged from the old dialog, so e2e selectors still work)
//   - validation with friendly messages (D1: used on blur and on submit)
//   - the server-error mapping: a known backend sentence becomes a message
//     on the right field; anything else goes through friendlyError, so no
//     raw database or server text ever reaches the screen
// ============================================

import { compose, email, LRN_MESSAGES, lrn, required } from '../../../../lib/formRules';
import { friendlyError } from '../../../../lib/friendlyError';
import { LRN_REQUIRED, LRN_TAKEN } from './lrn';

export const USER_FIELDS = Object.freeze({
  name: 'users-full-name',
  email: 'users-email',
  role: 'users-role',
  dept: 'users-department-subject',
  lrn: 'users-lrn',
  status: 'users-account-status',
});

export const ASSIGNABLE_ROLES = ['student', 'teacher', 'main_admin'];

export const USER_MESSAGES = Object.freeze({
  nameRequired: 'Enter the full name.',
  emailRequired: 'Enter the email address.',
  emailTaken: 'An account with this email already exists.',
  lrnDigitsOnly: 'Digits only (0-9).',
  lrnSeparators: 'Spaces and dashes were removed.',
  lrnTruncated: 'Only the first 12 digits were kept.',
  invalidRequest: 'Check the name, email and role, then try again.',
  saveFailed: 'The user could not be saved. Please try again.',
  inviteUnconfirmed: "We couldn't confirm the invitation was sent. Check the user list before trying again.",
  resendFailed: 'The invitation could not be resent. Please try again.',
  userGone: "We couldn't find that user. Refresh the list and try again.",
  invitePending: 'This person was already invited. Use Resend instead.',
});

// P1: the Users list status chip for an account that has not set its first
// password yet (server field invite_link_state, from shared/inviteState.js).
export const INVITE_CHIP = Object.freeze({ invited: 'Invited', stale: 'Link expired or used' });
export const inviteChipLabel = (u) => (u?.invite_link_state === 'link_stale' ? INVITE_CHIP.stale : INVITE_CHIP.invited);

export const validateName = required(USER_MESSAGES.nameRequired);
export const validateEmail = compose(required(USER_MESSAGES.emailRequired), email());
// Required to create a student; on edit a legacy student may stay without one.
export const validateLrn = (editing) => (editing ? lrn() : compose(required(LRN_MESSAGES.empty), lrn()));

/**
 * Every problem with the form, in the order the fields appear.
 * @returns {{ fieldId: string, message: string }[]}
 */
export function validateUserForm({ name, email: mail, role, lrn: lrnValue, editing }) {
  const problems = [];
  const add = (fieldId, message) => { if (message) problems.push({ fieldId, message }); };
  add(USER_FIELDS.name, validateName(name));
  if (!editing) add(USER_FIELDS.email, validateEmail(mail));
  if (role === 'student') add(USER_FIELDS.lrn, validateLrn(editing)(lrnValue));
  return problems;
}

// The backend's own sentences (backend/src/routes/onboarding.js). They are
// the app's words, not raw database text; a test pins this list against the
// route file so a reworded message is noticed.
export const INVITE_SERVER_MESSAGES = Object.freeze({
  invalid: 'A valid name, email, and role are required.',
  emailTaken: 'An account already uses this email address.',
  authEmailTaken: 'An authentication account already uses this email address.',
  invitePending: 'This person was already invited. Use Resend instead.',
  resendCooldown: 'A link was sent less than a minute ago. Wait a minute, then try again.',
  inviteFailed: 'The invitation could not be completed. No account was added.',
  rateLimited: 'Too many invitation requests. Try again later.',
  resendFailed: 'The invitation could not be resent. Try again.',
  resendNotPending: 'This account no longer has a pending invitation.',
  resendArchived: 'Archived accounts cannot receive invitations.',
  notFound: 'User not found.',
});

/**
 * Turn a save error into where and what to show.
 * @returns {{ fieldId?: string, message: string }}
 */
export function userSaveError(error) {
  const text = typeof error?.message === 'string' ? error.message : '';
  if (text === LRN_TAKEN || error?.code === '23505') return { fieldId: USER_FIELDS.lrn, message: LRN_TAKEN };
  if (text === LRN_REQUIRED) return { fieldId: USER_FIELDS.lrn, message: LRN_MESSAGES.empty };
  // P1: a pending invite gets its own words; the dialog offers Resend next to it.
  if (text === INVITE_SERVER_MESSAGES.invitePending) return { fieldId: USER_FIELDS.email, message: USER_MESSAGES.invitePending };
  if (text === INVITE_SERVER_MESSAGES.emailTaken || text === INVITE_SERVER_MESSAGES.authEmailTaken) {
    return { fieldId: USER_FIELDS.email, message: USER_MESSAGES.emailTaken };
  }
  if (text === INVITE_SERVER_MESSAGES.invalid) return { message: USER_MESSAGES.invalidRequest };
  if (text === INVITE_SERVER_MESSAGES.inviteFailed) return { message: INVITE_SERVER_MESSAGES.inviteFailed };
  if (text === INVITE_SERVER_MESSAGES.rateLimited) return { message: friendlyError({ status: 429 }) };
  // backendRequest: the request may have reached the server (the invite may
  // exist), or the session could not be checked.
  if (error?.name === 'BackendRequestError' && error.kind === 'transport') return { message: USER_MESSAGES.inviteUnconfirmed };
  if (error?.name === 'BackendRequestError' && error.kind === 'session') return { message: friendlyError({ status: 401 }) };
  return { message: friendlyError(error, { fallback: USER_MESSAGES.saveFailed }) };
}

/** The resend-invitation row action: the same rule, its own sentences. */
export function resendInviteError(error) {
  const text = typeof error?.message === 'string' ? error.message : '';
  if (text === INVITE_SERVER_MESSAGES.resendNotPending || text === INVITE_SERVER_MESSAGES.resendArchived
    || text === INVITE_SERVER_MESSAGES.resendCooldown) return text;
  if (text === INVITE_SERVER_MESSAGES.notFound) return USER_MESSAGES.userGone;
  if (text === INVITE_SERVER_MESSAGES.resendFailed) return USER_MESSAGES.resendFailed;
  if (error?.name === 'BackendRequestError' && error.kind === 'session') return friendlyError({ status: 401 });
  return friendlyError(error, { fallback: USER_MESSAGES.resendFailed });
}
