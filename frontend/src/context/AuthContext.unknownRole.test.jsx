// @vitest-environment jsdom
// F1: an unrecognised role (guest, empty, a typo) is "no role" and gets no
// access. It must never become 'student'. The six known roles are unchanged.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ profile: null, authCallback: null, signOut: null }));

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
        onAuthStateChange: (cb) => { h.authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: async ({ email }) => ({ data: { user: { id: 'u-1', email } }, error: null }),
        signOut: (...args) => h.signOut(...args),
      },
    },
  };
});

import { AuthProvider, useAuth } from './AuthContext';
import ProtectedRoute from '../routes/ProtectedRoute';

beforeEach(() => {
  h.profile = null;
  h.authCallback = null;
  h.signOut = vi.fn(async () => ({ error: null }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const DASHBOARDS = {
  student: '/student-dashboard', teacher: '/teacher-dashboard',
  main_admin: '/admin-dashboard',
};

describe('ProtectedRoute driven by the real AuthProvider', () => {
  const renderAt = (path, auth) => {
    // Drive ProtectedRoute through the real provider: emit a session whose
    // profile has the given role/status.
    h.profile = auth.profile;
    const view = render(
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<div>Login screen</div>} />
            <Route path="/change-password" element={<ProtectedRoute><div>Change password page</div></ProtectedRoute>} />
            {Object.entries(DASHBOARDS).map(([role, route]) => (
              <Route key={role} path={`${route}/*`}
                element={<ProtectedRoute allowedRoles={[role]}><div>{`${role} dashboard`}</div></ProtectedRoute>} />
            ))}
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    return view;
  };
  const emitSession = async () => {
    await act(async () => { h.authCallback('INITIAL_SESSION', { user: { id: 'u-1', email: 'x@example.test' } }); });
  };

  it('a loading profile is not treated as unknown: spinner only, no redirect, no sign-out', async () => {
    const view = renderAt('/student-dashboard/tasks', { profile: { id: 'u-1', role: 'student', status: 'active' } });
    // Before the auth event has been handled, identity is unresolved.
    expect(view.container.textContent).not.toContain('Login screen');
    expect(view.container.textContent).not.toContain('student dashboard');
    expect(h.signOut).not.toHaveBeenCalled();
    await emitSession();
    await waitFor(() => expect(screen.getByText('student dashboard')).toBeTruthy());
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it.each(['guest', '', null, 'studnet'])('an active account with role %j cannot reach /student-dashboard', async (role) => {
    renderAt('/student-dashboard/tasks', { profile: { id: 'u-1', role, status: 'active' } });
    await emitSession();
    await waitFor(() => expect(screen.getByText('Login screen')).toBeTruthy());
    expect(screen.queryByText('student dashboard')).toBeNull();
    // The session is kept (an invitee on /setup-password needs it); access is not.
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('an unknown role cannot reach a role-free protected route either', async () => {
    renderAt('/change-password', { profile: { id: 'u-1', role: 'guest', status: 'active' } });
    await emitSession();
    await waitFor(() => expect(screen.getByText('Login screen')).toBeTruthy());
    expect(screen.queryByText('Change password page')).toBeNull();
  });

  it.each([
    ['student', 'student'], ['teacher', 'teacher'],
    ['main_admin', 'main_admin'], ['admin', 'main_admin'],
  ])('role %s reaches its own dashboard', async (role, normalized) => {
    renderAt(`${DASHBOARDS[normalized]}/x`, { profile: { id: 'u-1', role, status: 'active' } });
    await emitSession();
    await waitFor(() => expect(screen.getByText(`${normalized} dashboard`)).toBeTruthy());
  });

  it.each([
    ['teacher', '/student-dashboard/x', 'teacher'], ['student', '/admin-dashboard/x', 'student'],
    ['admin', '/teacher-dashboard/x', 'main_admin'],
  ])('role %s on another dashboard is redirected to its own, as before', async (role, path, normalized) => {
    renderAt(path, { profile: { id: 'u-1', role, status: 'active' } });
    await emitSession();
    await waitFor(() => expect(screen.getByText(`${normalized} dashboard`)).toBeTruthy());
  });
});

describe('login with an unknown role', () => {
  let auth;
  const Probe = () => { auth = useAuth(); return <div>{auth.isAuthenticated ? 'in' : 'out'}</div>; };
  const renderProvider = () => render(<AuthProvider><Probe /></AuthProvider>);

  it.each([['guest', null], ['Guest', null], ['', 'teacher'], ['   ', null], ['studnet', null], ['superuser', null], [null, 'main_admin'], [undefined, null]])(
    'role %j (portal %j) is signed out with a clear message, never authenticated', async (role, expectedRole) => {
      h.profile = { id: 'u-1', role, status: 'active' };
      renderProvider();
      let caught;
      await act(async () => {
        try { await auth.login('x@example.test', 'pw', expectedRole); } catch (err) { caught = err; }
      });
      expect(caught?.message).toBe('ROLE_UNKNOWN');
      expect(caught?.userMessage).toBe('This account has no valid role. Please contact the administrator.');
      expect(h.signOut).toHaveBeenCalledWith();
      expect(screen.getByText('out')).toBeTruthy();
    });

  it.each([
    ['student', 'student'], ['  Student ', 'student'], ['teacher', 'teacher'], ['TEACHER', 'teacher'],
    ['main_admin', 'main_admin'], ['admin', 'main_admin'], ['ADMIN', 'main_admin'],
  ])('a known role %j still signs in as %s', async (role, expected) => {
    h.profile = { id: 'u-1', role, status: 'active' };
    renderProvider();
    await act(async () => { await auth.login('x@example.test', 'pw'); });
    expect(screen.getByText('in')).toBeTruthy();
    expect(auth.userData.role).toBe(expected);
  });

  it('a portal mismatch for a known role is still ROLE_MISMATCH', async () => {
    h.profile = { id: 'u-1', role: 'teacher', status: 'active' };
    renderProvider();
    let caught;
    await act(async () => {
      try { await auth.login('x@example.test', 'pw', 'registrar'); } catch (err) { caught = err; }
    });
    expect(caught?.message).toBe('ROLE_MISMATCH:teacher');
  });
});
