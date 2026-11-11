// @vitest-environment jsdom
// F1: ProtectedRoute's own role normalization. Known roles (any casing or
// spacing it already accepted) behave as before; anything else is no role.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ auth: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => h.auth }));
import ProtectedRoute from './ProtectedRoute';

const DASHBOARDS = {
  student: '/student-dashboard', teacher: '/teacher-dashboard',
  main_admin: '/admin-dashboard',
};

const renderAt = (path, { role, loading = false, authenticated = true } = {}) => {
  h.auth = { loading, isAuthenticated: authenticated, userData: { role, status: 'active' } };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/change-password" element={<ProtectedRoute><div>Change password page</div></ProtectedRoute>} />
        {Object.entries(DASHBOARDS).map(([key, route]) => (
          <Route key={key} path={route}
            element={<ProtectedRoute allowedRoles={[key]}><div>{`${key} dashboard`}</div></ProtectedRoute>} />
        ))}
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ProtectedRoute role normalization', () => {
  it.each([
    ['student', 'student'], ['  Student ', 'student'], ['TEACHER', 'teacher'],
    ['main_admin', 'main_admin'], ['admin', 'main_admin'], ['Main Admin', 'main_admin'],
  ])('known role %j reaches the %s dashboard', (role, key) => {
    renderAt(DASHBOARDS[key], { role });
    expect(screen.getByText(`${key} dashboard`)).toBeTruthy();
  });

  it.each(['guest', 'Guest', '', '   ', null, undefined, 'studnet', 'superuser'])(
    'role %j never reaches the student dashboard or a role-free route', (role) => {
      renderAt('/student-dashboard', { role });
      expect(screen.getByText('Login screen')).toBeTruthy();
      expect(screen.queryByText('student dashboard')).toBeNull();
      cleanup();
      renderAt('/change-password', { role });
      expect(screen.getByText('Login screen')).toBeTruthy();
      expect(screen.queryByText('Change password page')).toBeNull();
    });

  it('a known role on another dashboard is redirected to its own, as before', () => {
    renderAt('/student-dashboard', { role: 'teacher' });
    expect(screen.getByText('teacher dashboard')).toBeTruthy();
  });

  it('while loading, an unresolved role is not treated as unknown', () => {
    const view = renderAt('/student-dashboard', { role: null, loading: true, authenticated: false });
    expect(view.container.textContent).not.toContain('Login screen');
    expect(view.container.textContent).not.toContain('student dashboard');
  });
});
