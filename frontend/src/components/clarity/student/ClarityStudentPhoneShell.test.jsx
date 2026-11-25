// @vitest-environment jsdom
// SHELL: the Student Clarity shell on phones: no hamburger, the brand in the
// top bar, the bottom tab bar (Overview, Tasks, Scores, Attendance, Menu) and
// the Menu sheet (Announcements, the profile card, Sign out).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const PHONE = '(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';
const h = vi.hoisted(() => ({ phone: true }));
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
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: q => (q === PHONE ? h.phone : false), useIsNarrow: () => h.phone }));
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
const bar = () => screen.getByRole('navigation', { name: 'Main' });
const barLabels = () => [...bar().querySelectorAll('.x-pnav-l')].map(e => e.textContent);
const where = () => screen.getByTestId('where').textContent;
const openMenu = () => { fireEvent.click(within(bar()).getByRole('button', { name: /^Menu/ })); return screen.getByRole('dialog', { name: 'Menu' }); };

beforeEach(() => { h.phone = true; window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('SHELL student on phones', () => {
  it('no hamburger and no page name; the brand mark, the theme toggle and the bell', () => {
    renderAt('/student-dashboard');
    const top = document.querySelector('header.x-top');
    expect(within(top).queryByRole('button', { name: 'Open navigation menu' })).toBeNull();
    expect(top.querySelector('.x-menubtn, .x-top-title')).toBeNull();
    expect(top.querySelector('.x-pbrand').textContent).toBe('EduScribe');
    expect(within(top).getByRole('button', { name: /Switch to (Dark|Light) Mode/ })).toBeTruthy();
    expect(within(top).getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('the bottom tab bar: Overview, Tasks, Scores, Attendance, Menu', () => {
    renderAt('/student-dashboard/tasks/abc');
    expect(barLabels()).toEqual(['Overview', 'Tasks', 'Scores', 'Attendance', 'Menu']);
    expect(within(bar()).getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(bar()).getByRole('link', { name: 'Scores' }));
    expect(where()).toBe('/student-dashboard/scores');
  });

  it('the Menu sheet: Announcements, the profile card, Sign out; Announcements marks the Menu tab', () => {
    renderAt('/student-dashboard');
    const sheet = openMenu();
    expect([...sheet.querySelectorAll('.x-psheet-row')].map(r => r.textContent)).toEqual(['Announcements', 'SSSample StudentStudent (Profile settings)', 'Sign out']);
    fireEvent.click(within(sheet).getByRole('link', { name: 'Announcements' }));
    expect(where()).toBe('/student-dashboard/announcements');
    expect(within(bar()).getByRole('button', { name: /^Menu/ }).className).toContain('on');
  });

  it('Profile: the Menu tab is marked and no bar item claims the page', () => {
    renderAt('/student-dashboard/profile');
    expect(within(bar()).getByRole('button', { name: /^Menu/ }).className).toContain('on');
    expect(bar().querySelector('[aria-current="page"]')).toBeNull();
  });

  it('Sign out from the sheet asks with the same dialog', async () => {
    renderAt('/student-dashboard');
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('dialog', { name: 'Log out of EduScribe?' })).toBeTruthy();
  });

  it('tablet and desktop keep the menu button; no tab bar', () => {
    h.phone = false;
    renderAt('/student-dashboard');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeTruthy();
    expect(document.querySelector('.x-pnav')).toBeNull();
  });
});
