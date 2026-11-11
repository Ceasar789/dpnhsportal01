// @vitest-environment jsdom
// F2: the app has three roles (main_admin, teacher, student). The faculty and
// registrar screens are gone, and those roles get no access anywhere.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ auth: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => h.auth }));
import ProtectedRoute from './ProtectedRoute';

const src = rel => [`src/${rel}`, `frontend/src/${rel}`].find(existsSync);
const read = rel => readFileSync(src(rel), 'utf8');

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('faculty and registrar screens are removed', () => {
  it('the two dashboard folders no longer exist', () => {
    expect(src('pages/dashboards/faculty/FacultyDashboard.jsx')).toBeUndefined();
    expect(src('pages/dashboards/registrar/RegistrarDashboard.jsx')).toBeUndefined();
  });

  it('AppRoutes has no faculty or registrar dashboard route, and keeps the staff login page', () => {
    const routes = read('routes/AppRoutes.jsx');
    expect(routes).not.toMatch(/faculty-dashboard|registrar-dashboard|FacultyDashboard|RegistrarDashboard/);
    expect(routes).toContain('<Route path="/faculty-login"');
    for (const path of ['/student-dashboard/*', '/teacher-dashboard/*', '/admin-dashboard/*']) {
      expect(routes).toContain(`<Route path="${path}"`);
    }
  });

  it('the shared layouts no longer list faculty or registrar navigation', () => {
    for (const file of ['DashboardLayout', 'SideBar', 'MobileDrawer', 'MobileAppBar']) {
      expect(read(`components/layout/${file}.jsx`)).not.toMatch(/faculty|registrar/i);
    }
  });
});

const renderAt = (path, role) => {
  h.auth = { loading: false, isAuthenticated: true, userData: { role, status: 'active' } };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/change-password" element={<ProtectedRoute><div>Change password page</div></ProtectedRoute>} />
        <Route path="/student-dashboard" element={<ProtectedRoute allowedRoles={['student']}><div>student dashboard</div></ProtectedRoute>} />
        <Route path="/teacher-dashboard" element={<ProtectedRoute allowedRoles={['teacher']}><div>teacher dashboard</div></ProtectedRoute>} />
        <Route path="/admin-dashboard" element={<ProtectedRoute allowedRoles={['main_admin']}><div>main_admin dashboard</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute: faculty and registrar are unrecognised', () => {
  it.each(['faculty', 'registrar', 'Faculty', ' REGISTRAR '])('%j reaches no protected route', (role) => {
    for (const path of ['/student-dashboard', '/teacher-dashboard', '/admin-dashboard', '/change-password']) {
      renderAt(path, role);
      expect(screen.getByText('Login screen')).toBeTruthy();
      cleanup();
    }
  });

  it.each([['student', 'student'], ['teacher', 'teacher'], ['main_admin', 'main_admin'], ['admin', 'main_admin']])(
    'the remaining role %j still reaches its dashboard and is redirected there from another', (role, key) => {
      renderAt(`/${key === 'main_admin' ? 'admin' : key}-dashboard`, role);
      expect(screen.getByText(`${key} dashboard`)).toBeTruthy();
      cleanup();
      renderAt(key === 'student' ? '/teacher-dashboard' : '/student-dashboard', role);
      expect(screen.getByText(`${key} dashboard`)).toBeTruthy();
    });
});
