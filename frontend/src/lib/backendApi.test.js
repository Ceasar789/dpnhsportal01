import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('../config/supabase', () => ({ supabase: { auth: { getSession: h.getSession } } }));

const { backendRequest, isAmbiguousBackendRequestError } = await import('./backendApi');

beforeEach(() => {
  h.getSession.mockReset();
  h.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } });
  vi.unstubAllGlobals();
});

describe('backendRequest outcome classification', () => {
  it('AR-11 marks a fetch rejection as an ambiguous request outcome', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await backendRequest('/synthetic', { method: 'PATCH' }).catch(value => value);
    expect(isAmbiguousBackendRequestError(error)).toBe(true);
    expect(error.message).not.toMatch(/failed to fetch/i);
  });

  it('AR-12 keeps controlled HTTP failures non-ambiguous', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Request rejected.' }),
    }));
    const error = await backendRequest('/synthetic', { method: 'PATCH' }).catch(value => value);
    expect(isAmbiguousBackendRequestError(error)).toBe(false);
    expect(error.kind).toBe('response');
  });

  it('AR-13 keeps session lookup failures non-ambiguous and does not send a request', async () => {
    h.getSession.mockRejectedValue(new Error('private session detail'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const error = await backendRequest('/synthetic', { method: 'PATCH' }).catch(value => value);
    expect(isAmbiguousBackendRequestError(error)).toBe(false);
    expect(error.kind).toBe('session');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
