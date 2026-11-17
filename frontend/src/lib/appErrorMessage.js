// ============================================
// FILE: src/lib/appErrorMessage.js
// U5: the message to show for a caught error.
// This app throws its own sentences as plain `new Error('...')`, and
// backendApi.js throws BackendRequestError with its own or the backend's
// fixed sentences. Those are shown as they are. Anything else (a database,
// storage, browser or library error) is never shown raw: it becomes a
// friendlyError sentence.
// ============================================

import { friendlyError } from './friendlyError';

export function appErrorMessage(error, fallback) {
  const own = error instanceof Error
    && (error.constructor === Error || error.name === 'BackendRequestError');
  return own && typeof error.message === 'string' && error.message.trim()
    ? error.message
    : friendlyError(error, { fallback });
}

export default appErrorMessage;
