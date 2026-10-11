import { supabase } from '../config/supabase';

export const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV && typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : '');

export class BackendRequestError extends Error {
  constructor(message, { kind = 'request', requestMayHaveReachedServer = false, cause } = {}) {
    super(message);
    this.name = 'BackendRequestError';
    this.kind = kind;
    this.requestMayHaveReachedServer = requestMayHaveReachedServer;
    this.cause = cause;
  }
}

export const isAmbiguousBackendRequestError = (error) => (
  error instanceof BackendRequestError
  && error.requestMayHaveReachedServer === true
);

export async function backendRequest(path, options = {}) {
  let session;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch (cause) {
    throw new BackendRequestError('Your session could not be verified. Please sign in again.', {
      kind: 'session',
      cause,
    });
  }
  if (!session?.access_token) {
    throw new BackendRequestError('Your session is unavailable. Sign in again.', {
      kind: 'session',
    });
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });
  } catch (cause) {
    throw new BackendRequestError('The server response could not be received.', {
      kind: 'transport',
      requestMayHaveReachedServer: true,
      cause,
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BackendRequestError(payload.error || 'The server could not complete the request.', {
      kind: 'response',
    });
  }
  return payload;
}
