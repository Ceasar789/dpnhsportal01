// @vitest-environment jsdom
// P2: the real AuthProvider passes the optional security-check token to
// Supabase only when there is one, and never retries with a spent token.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ signIn: vi.fn(), reset: vi.fn() }));
vi.mock('../config/supabase', () => {
  const profile = { id: 'u-1', role: 'student', status: 'active', email: 'user@example.test' };
  const chain = () => {
    const c = { select: () => c, eq: () => c, single: () => Promise.resolve({ data: profile, error: null }) };
    return c;
  };
  const channel = { on: () => channel, subscribe: () => channel, presenceState: () => ({}), track: async () => ({}) };
  return {
    supabase: {
      from: chain,
      channel: () => channel,
      removeChannel: () => {},
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getSession: async () => ({ data: { session: null } }),
        signInWithPassword: (...args) => h.signIn(...args),
        resetPasswordForEmail: (...args) => h.reset(...args),
        signOut: async () => ({ error: null }),
      },
    },
  };
});

const { AuthProvider, useAuth } = await import('./AuthContext');

let auth;
const Grab = () => { auth = useAuth(); return null; };

beforeEach(() => {
  h.signIn.mockReset().mockImplementation(async ({ email }) => ({ data: { user: { id: 'u-1', email } }, error: null }));
  h.reset.mockReset().mockResolvedValue({ data: {}, error: null });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<AuthProvider><Grab /></AuthProvider>);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('P2 AuthContext security-check token', () => {
  it('sign-in without a token sends exactly email and password', async () => {
    await act(async () => { await auth.login('user@example.test', 'pw'); });
    expect(h.signIn).toHaveBeenCalledWith({ email: 'user@example.test', password: 'pw' });
  });

  it('sign-in with a token sends it as options.captchaToken', async () => {
    await act(async () => { await auth.login('user@example.test', 'pw', null, { captchaToken: 'tok' }); });
    expect(h.signIn).toHaveBeenCalledWith({ email: 'user@example.test', password: 'pw', options: { captchaToken: 'tok' } });
  });

  it('a failed security check is not retried with the same (spent) token', async () => {
    h.signIn.mockResolvedValue({ data: {}, error: Object.assign(new Error('captcha protection'), { code: 'captcha_failed', status: 400 }) });
    await act(async () => { await auth.login('user@example.test', 'pw', null, { captchaToken: 'tok' }).catch(() => {}); });
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });

  it('password reset passes the token only when there is one', async () => {
    await act(async () => { await auth.sendPasswordReset(' a@example.test '); });
    expect(h.reset.mock.calls[0][1]).toEqual({ redirectTo: `${window.location.origin}/reset-password` });
    await act(async () => { await auth.sendPasswordReset('a@example.test', { captchaToken: 'tok' }); });
    expect(h.reset.mock.calls[1]).toEqual(['a@example.test', { redirectTo: `${window.location.origin}/reset-password`, captchaToken: 'tok' }]);
  });
});
