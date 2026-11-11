// @vitest-environment jsdom
// F2: signing in with a faculty or registrar account is refused like any
// other unrecognised role (F1 path); admin, teacher and student are unchanged.
import { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ profile: null, signOut: null }));

vi.mock('../config/supabase', () => {
  const chain = (table) => {
    const result = table === 'profiles' ? { data: h.profile, error: null } : { data: null, error: null };
    const c = { select: () => c, eq: () => c, single: () => Promise.resolve(result) };
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
        signInWithPassword: async ({ email }) => ({ data: { user: { id: 'u-1', email } }, error: null }),
        signOut: (...args) => h.signOut(...args),
      },
    },
  };
});

import { AuthProvider, useAuth } from './AuthContext';

const seen = { auth: null };
const Probe = () => {
  const value = useAuth();
  useEffect(() => { seen.auth = value; });
  return <div>{value.isAuthenticated ? 'in' : 'out'}</div>;
};

beforeEach(() => {
  h.signOut = vi.fn(async () => ({ error: null }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const tryLogin = async (role, expectedRole) => {
  h.profile = { id: 'u-1', role, status: 'active' };
  render(<AuthProvider><Probe /></AuthProvider>);
  let caught = null;
  await act(async () => { try { await seen.auth.login('x@example.test', 'pw', expectedRole); } catch (err) { caught = err; } });
  return caught;
};

describe('faculty and registrar accounts cannot sign in', () => {
  it.each([['faculty', 'faculty'], ['registrar', 'registrar'], ['Faculty', null], ['registrar', 'teacher']])(
    'role %j (portal choice %j) is refused as an unrecognised role', async (role, expectedRole) => {
      const err = await tryLogin(role, expectedRole);
      expect(err?.message).toBe('ROLE_UNKNOWN');
      expect(err?.userMessage).toBe('This account has no valid role. Please contact the administrator.');
      expect(h.signOut).toHaveBeenCalledWith();
      expect(screen.getByText('out')).toBeTruthy();
    });

  it.each([['main_admin', 'main_admin'], ['admin', 'main_admin'], ['teacher', 'teacher'], ['student', 'student']])(
    'role %j still signs in as %s', async (role, expected) => {
      const err = await tryLogin(role, null);
      expect(err).toBeNull();
      expect(seen.auth.userData.role).toBe(expected);
      expect(screen.getByText('in')).toBeTruthy();
    });

  it('the context no longer offers faculty or registrar helpers', async () => {
    await tryLogin('teacher', null);
    expect(seen.auth.isFaculty).toBeUndefined();
    expect(seen.auth.isRegistrar).toBeUndefined();
    expect(seen.auth.userData.isFaculty).toBeUndefined();
    expect(seen.auth.userData.isRegistrar).toBeUndefined();
    expect(seen.auth.isTeacher()).toBe(true);
  });
});
