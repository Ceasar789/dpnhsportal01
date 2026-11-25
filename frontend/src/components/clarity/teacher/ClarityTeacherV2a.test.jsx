// @vitest-environment jsdom
// V2a: the Teacher shell on phones: the page name in the top bar and a
// Profile entry that is always in the drawer (the name card still toggles).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import TeacherDashboard from '../../../pages/dashboards/teacher/TeacherDashboard';

const h = vi.hoisted(() => ({ desktop: false }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isTeacher: () => true, userData: { uid: 'teacher-1', name: 'Sample Teacher', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => h.desktop }));
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
const title = () => document.querySelector('header.x-top .x-top-title');
const sidebar = () => document.getElementById('teacher-sidebar');

let raf;
beforeEach(() => {
  h.desktop = false; window.localStorage.clear(); window.sessionStorage.clear();
  raf = window.requestAnimationFrame; window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
  window.scrollTo = () => {};
});
afterEach(() => { cleanup(); window.localStorage.clear(); window.requestAnimationFrame = raf; });

describe('V2a teacher shell', () => {
  it.each([
    ['/teacher-dashboard', 'Overview'],
    ['/teacher-dashboard/worksheets', 'Worksheets'],
    ['/teacher-dashboard/worksheets/draft-1', 'Worksheets'],
    ['/teacher-dashboard/learning-materials', 'Learning Materials'],
    ['/teacher-dashboard/grades/', 'Grading'],
    ['/teacher-dashboard/profile', 'Profile Settings'],
  ])('%s shows "%s" in the top bar, after the menu button', (path, name) => {
    renderAt(path);
    expect(title().textContent).toBe(name);
    expect(title().getAttribute('title')).toBe(name);
    expect(title().previousElementSibling.classList.contains('x-menubtn')).toBe(true);
  });

  it('the profile card in the drawer opens Profile; there is no separate Profile & password item', () => {
    renderAt('/teacher-dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const entry = within(sidebar()).getByRole('link', { name: /\(Profile settings\)$/ });
    expect(within(sidebar()).queryByRole('link', { name: 'Profile & password' })).toBeNull();
    fireEvent.click(entry);
    expect(screen.getByTestId('where').textContent).toBe('/teacher-dashboard/profile');
    // The drawer closed on the way (hidden, so no accessible name): find it by its link.
    expect(sidebar().querySelector('a[href="/teacher-dashboard/profile"]').getAttribute('aria-current')).toBe('page');
  });

  it('collapsed desktop sidebar: the profile card keeps its name as an avatar', () => {
    h.desktop = true;
    renderAt('/teacher-dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const entry = within(sidebar()).getByRole('link', { name: /\(Profile settings\)$/ });
    expect(entry.querySelector('.x-user-txt')).toBeNull();
    expect(entry.getAttribute('title')).toMatch(/\(Profile settings\)$/);
  });
});
