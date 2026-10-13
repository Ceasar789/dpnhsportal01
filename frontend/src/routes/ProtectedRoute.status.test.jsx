// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ auth: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => h.auth }));
import ProtectedRoute from './ProtectedRoute';

const renderRoute = ({ role = 'main_admin', status = 'active', loading = false, authenticated = true } = {}) => {
  h.auth = {
    loading,
    isAuthenticated: authenticated,
    userData: role == null ? null : { role, status },
  };
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/admin" element={<ProtectedRoute allowedRoles={['main_admin']}><div>Admin content</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
};

afterEach(cleanup);

describe('ProtectedRoute account status enforcement', () => {
  it('allows an active authorized account', () => {
    renderRoute();
    expect(screen.getByText('Admin content')).toBeTruthy();
  });

  it.each(['inactive', 'suspended', 'archived', 'unknown', '', null])('denies %s status', (status) => {
    renderRoute({ status });
    expect(screen.getByText('Login screen')).toBeTruthy();
    expect(screen.queryByText('Admin content')).toBeNull();
  });

  it('denies an authenticated session with no profile', () => {
    renderRoute({ role: null, authenticated: true });
    expect(screen.getByText('Login screen')).toBeTruthy();
  });

  it('does not render protected content while identity is unresolved', () => {
    const view = renderRoute({ loading: true, role: null, authenticated: false });
    expect(view.container.textContent).not.toContain('Admin content');
    expect(view.container.textContent).not.toContain('Login screen');
  });
});
