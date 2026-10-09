const AUTH_CALLBACK_KEYS = ['access_token', 'refresh_token', 'error', 'error_code'];

const callbackParams = (hash) => new URLSearchParams(hash.replace(/^#/, ''));

export const isIncompleteInvitation = (user, profileStatus) => Boolean(
  user?.invited_at
  && user.app_metadata?.onboarding_complete !== true
  && !['active', 'archived'].includes(String(profileStatus || '').toLowerCase())
);

export function invitationCallbackDecision({ pathname, hash, user, profileStatus, loading }) {
  const params = callbackParams(hash);
  const isRootCallback = pathname === '/'
    && AUTH_CALLBACK_KEYS.some((key) => params.has(key));

  if (isRootCallback && (params.has('error') || params.has('error_code'))) {
    return { destination: '/setup-password', preserveHash: false };
  }

  if (isRootCallback && loading) return { pending: true };

  if (isIncompleteInvitation(user, profileStatus) && pathname !== '/setup-password') {
    return { destination: '/setup-password', preserveHash: false };
  }

  return null;
}
