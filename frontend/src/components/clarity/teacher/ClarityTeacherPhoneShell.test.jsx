// @vitest-environment jsdom
// SHELL: the Teacher Clarity shell on phones: no hamburger, the brand in the
// top bar, the bottom tab bar (Overview, Plans, Grading, Attendance, Menu)
// and the Menu sheet with the other teacher pages, the profile card and
// Sign out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TeacherDashboard from '../../../pages/dashboards/teacher/TeacherDashboard';

const PHONE = '(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';
const h = vi.hoisted(() => ({ phone: true }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isTeacher: () => true, userData: { uid: 'teacher-1', name: 'Sample Teacher', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: q => (q === PHONE ? h.phone : false), useIsNarrow: () => h.phone }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: ({ className }) => <button className={className}>Notifications</button> }));
vi.mock('../../../pages/dashboards/teacher/tabs/LessonPlansTab', () => ({ default: () => <h1>Lesson plans content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/WorksheetsTab', () => ({ default: () => <h1>Worksheets content</h1> }));
vi.mock('./ClarityTeacherOverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('./ClarityTeacherStudentsTab', () => ({ default: () => <h1>Students content</h1> }));
vi.mock('./ClarityTeacherAnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('./ClarityTeacherGradingTab', () => ({ default: () => <h1>Grades content</h1> }));
vi.mock('./ClarityTeacherAttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('./ClarityTeacherMaterialsTab', () => ({ default: () => <h1>Materials content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/teacher-dashboard/*" element={<><TeacherDashboard /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const bar = () => screen.getByRole('navigation', { name: 'Main' });
const barLabels = () => [...bar().querySelectorAll('.x-pnav-l')].map(e => e.textContent);
const where = () => screen.getByTestId('where').textContent;
const openMenu = () => { fireEvent.click(within(bar()).getByRole('button', { name: /^Menu/ })); return screen.getByRole('dialog', { name: 'Menu' }); };

let raf;
beforeEach(() => {
  h.phone = true; window.localStorage.clear(); window.sessionStorage.clear();
  raf = window.requestAnimationFrame; window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
  window.scrollTo = () => {};
});
afterEach(() => { cleanup(); window.localStorage.clear(); window.requestAnimationFrame = raf; });

describe('SHELL teacher on phones', () => {
  it('no hamburger and no page name; the brand mark, the theme toggle and the bell', () => {
    renderAt('/teacher-dashboard');
    const top = document.querySelector('header.x-top');
    expect(within(top).queryByRole('button', { name: 'Open navigation menu' })).toBeNull();
    expect(top.querySelector('.x-menubtn, .x-top-title')).toBeNull();
    expect(top.querySelector('.x-pbrand').textContent).toBe('EduScribe');
    expect(within(top).getByRole('button', { name: /Switch to (Dark|Light) Mode/ })).toBeTruthy();
    expect(within(top).getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('the bottom tab bar: Overview, Plans, Grading, Attendance, Menu; links to the real pages', () => {
    renderAt('/teacher-dashboard/grades');
    expect(barLabels()).toEqual(['Overview', 'Plans', 'Grading', 'Attendance', 'Menu']);
    expect([...bar().querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(
      ['/teacher-dashboard', '/teacher-dashboard/lesson-plans', '/teacher-dashboard/grades', '/teacher-dashboard/attendance']);
    expect(within(bar()).getByRole('link', { name: 'Grading' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(bar()).getByRole('link', { name: 'Plans' }));
    expect(where()).toBe('/teacher-dashboard/lesson-plans');
  });

  it('the Menu sheet: Students, then Teaching (Worksheets, Learning Materials), then School (Announcements), the profile card, Sign out', () => {
    renderAt('/teacher-dashboard');
    const sheet = openMenu();
    expect(within(sheet).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual([null, 'Teaching', 'School']);
    expect([...sheet.querySelectorAll('.x-psheet-row')].map(r => r.textContent)).toEqual(
      ['Students', 'Worksheets', 'Learning Materials', 'Announcements', 'STSample TeacherTeacher (Profile settings)', 'Sign out']);
  });

  it('a page inside the menu (also a sub-path) marks the Menu tab; choosing one closes the sheet', () => {
    renderAt('/teacher-dashboard');
    fireEvent.click(within(openMenu()).getByRole('link', { name: 'Worksheets' }));
    expect(where()).toBe('/teacher-dashboard/worksheets');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    expect(within(bar()).getByRole('button', { name: /^Menu/ }).className).toContain('on');
    cleanup();
    renderAt('/teacher-dashboard/worksheets/draft-1');
    expect(within(bar()).getByRole('button', { name: /^Menu/ }).className).toContain('on');
    expect(within(openMenu()).getByRole('link', { name: 'Worksheets' }).getAttribute('aria-current')).toBe('page');
  });

  it('the profile card from the sheet; Sign out asks with the same dialog', async () => {
    renderAt('/teacher-dashboard');
    fireEvent.click(within(openMenu()).getByRole('link', { name: /\(Profile settings\)$/ }));
    expect(where()).toBe('/teacher-dashboard/profile');
    expect(within(bar()).getByRole('button', { name: /^Menu/ }).className).toContain('on');
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('dialog', { name: 'Log out of EduScribe?' })).toBeTruthy();
  });

  it('tablet and desktop keep the menu button; no tab bar', () => {
    h.phone = false;
    renderAt('/teacher-dashboard');
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeTruthy();
    expect(document.querySelector('.x-pnav')).toBeNull();
  });
});
