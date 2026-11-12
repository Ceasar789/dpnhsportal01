// @vitest-environment jsdom
// Clarity T2: the real TeacherDashboard, Supabase mocked. Flag off: the
// classic Overview, Students and Announcements, untouched. Flag on: the
// Clarity versions on those three routes, the classic tabs everywhere else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../../config/supabase', () => {
  const query = () => {
    const q = new Proxy({}, {
      get: (_, prop) => prop === 'then'
        ? (res, rej) => Promise.resolve({ data: [], count: 0, error: null }).then(res, rej)
        : () => q,
    });
    return q;
  };
  return { supabase: { from: () => query() } };
});
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: (fn) => fn() }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isTeacher: () => true, userData: { uid: 'teacher-1', name: 'Sample Teacher', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button>Notifications</button> }));
vi.mock('../../../pages/dashboards/teacher/tabs/LessonPlansTab', () => ({ default: () => <h1>Lesson plans content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/WorksheetsTab', () => ({ default: () => <h1>Worksheets content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/GradesTab', () => ({ default: () => <h1>Grades content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

import TeacherDashboard from '../../../pages/dashboards/teacher/TeacherDashboard';

const SCOPE = ['theme', 'clarity'].join('-');
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
  </MemoryRouter>,
);
const sidebar = () => document.getElementById('teacher-sidebar');

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); document.documentElement.classList.remove(SCOPE); });

describe('the three Teacher tabs behind the flag', () => {
  it.each([
    ['/teacher-dashboard', 'Dashboard Overview'],
    ['/teacher-dashboard/students', 'Students'],
    ['/teacher-dashboard/announcements', 'Announcements'],
  ])('flag OFF at %s: the classic tab, no Clarity markup', async (path, heading) => {
    const { container } = renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
    expect(container.querySelector('.x-app, .x-tov, .x-tst, .x-tan')).toBeNull();
  });

  it.each([
    ['/teacher-dashboard?clarity=1', 'Dashboard Overview', '.x-tov'],
    ['/teacher-dashboard/students?clarity=1', 'Students', '.x-tst'],
    ['/teacher-dashboard/announcements?clarity=1', 'Announcements', '.x-tan'],
  ])('flag ON at %s: the Clarity tab, outside the classic wrapper', async (path, heading, root) => {
    const { container } = renderAt(path);
    const h1 = await screen.findByRole('heading', { level: 1, name: heading });
    expect(h1.closest(root)).toBeTruthy();
    expect(h1.closest('.x-tch-classic')).toBeNull();
    expect(container.querySelector('.x-tch-classic')).toBeNull();
  });

  it('flag ON: the other routes keep their classic tabs inside the classic wrapper', async () => {
    renderAt('/teacher-dashboard?clarity=1');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard Overview' });
    fireEvent.click(within(sidebar()).getByRole('link', { name: 'Grading' }));
    const h1 = await screen.findByRole('heading', { name: 'Grades content' });
    expect(h1.closest('.dashboard-shell.teacher-dashboard-shell.x-tch-classic')).toBeTruthy();
    fireEvent.click(within(sidebar()).getByRole('link', { name: 'Announcements' }));
    expect((await screen.findByRole('heading', { level: 1, name: 'Announcements' })).closest('.x-tan')).toBeTruthy();
  });
});
