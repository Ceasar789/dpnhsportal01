import { isNotActivated } from '../../../shared/inviteState.js';

const AUTH_CALLBACK_KEYS = ['access_token', 'refresh_token', 'error', 'error_code'];

const callbackParams = (hash) => new URLSearchParams(hash.replace(/^#/, ''));

// P1: the one shared definition of "invited, no first password yet".
export const isIncompleteInvitation = (user, profileStatus) => isNotActivated(profileStatus, user);

export function invitationCallbackDecision({ pathname, hash, user, profileStatus, loading }) {
  const params = callbackParams(hash);
  const isRootCallback = pathname === '/'
    && AUTH_CALLBACK_KEYS.some((key) => params.has(key));

  // P1: the hash is kept so the page can tell an expired link from a bad one.
  if (isRootCallback && (params.has('error') || params.has('error_code'))) {
    return { destination: '/setup-password', preserveHash: true };
  }

  if (isRootCallback && loading) return { pending: true };

  if (isIncompleteInvitation(user, profileStatus) && pathname !== '/setup-password') {
    return { destination: '/setup-password', preserveHash: false };
  }

  return null;
}
