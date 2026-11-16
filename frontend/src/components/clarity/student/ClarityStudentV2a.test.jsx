// @vitest-environment jsdom
// V2a: the Student shell on phones: the page name in the top bar and a
// Profile entry that is always in the drawer (the name card still toggles).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isStudent: () => true, userData: { uid: 'student-1', name: 'Sample Student', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; }, registerProfileGuard: () => () => {} }),
}));
vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({ darkMode: false, toggleDarkMode: vi.fn() }),
  DashboardThemeStyles: () => null,
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => ({ default: (await import('react')).createContext(null), StudentDataProvider: ({ children }) => children, useStudentData: () => ({ graph: null, loading: false, refresh: null }) }));
vi.mock('../../../pages/dashboards/student/tabs/OverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/TasksTab', () => ({ default: () => <h1>Tasks content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/ScoresTab', () => ({ default: () => <h1>Scores content</h1> }));
vi.mock('./ClarityStudentAttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('./ClarityStudentAnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('./ClarityStudentProfileTab', () => ({ default: () => <h1>Profile content</h1> }));
vi.mock('./ClarityStudentOverviewTab', () => ({ default: () => <h1>Overview content</h1> }));

import StudentDashboard from '../../../pages/dashboards/student/StudentDashboard';

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/student-dashboard/*" element={<><StudentDashboard /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const title = () => document.querySelector('header.x-top .x-top-title');

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('V2a student shell', () => {
  it.each([
    ['/student-dashboard', 'Overview'],
    ['/student-dashboard/tasks', 'Tasks'],
    ['/student-dashboard/tasks/abc', 'Tasks'],
    ['/student-dashboard/attendance/', 'Attendance'],
    ['/student-dashboard/profile', 'Profile Settings'],
  ])('%s shows "%s" in the top bar, after the menu button, with a title for the full name', (path, name) => {
    renderAt(path);
    expect(title().textContent).toBe(name);
    expect(title().getAttribute('title')).toBe(name);
    expect(title().previousElementSibling.classList.contains('x-menubtn')).toBe(true);
    expect(title().classList.contains('x-iconbtn')).toBe(false);
  });

  it('Profile & password is in the drawer without opening the name card, and opens Profile', () => {
    renderAt('/student-dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    const entry = within(drawer).getByRole('link', { name: 'Profile & password' });
    expect(within(drawer).getByRole('button', { name: 'Toggle profile menu' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(entry);
    expect(screen.getByTestId('where').textContent).toBe('/student-dashboard/profile');
    // The drawer closed on the way (hidden, so no accessible name): find it by its link.
    expect(document.querySelector('#student-sidebar a[href="/student-dashboard/profile"]').getAttribute('aria-current')).toBe('page');
  });
});
