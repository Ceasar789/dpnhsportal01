// @vitest-environment jsdom
// Clarity F5: the Clarity design is the default for all three dashboards.
// The flag: no parameter and nothing stored is ON; ?clarity=0 and "Classic
// view" turn it OFF and remember that; ?clarity=1 turns it ON; a stored OFF
// wins over the default; blocked storage falls back to ON. Then each real
// dashboard (every data source mocked) shows its Clarity shell by default and
// its classic layout with ?clarity=0.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../config/supabase', () => {
  const query = () => {
    const q = new Proxy({}, {
      get: (_, prop) => prop === 'then'
        ? (res, rej) => Promise.resolve({ data: [], count: 0, error: null }).then(res, rej)
        : () => q,
    });
    return q;
  };
  return { supabase: { from: () => query(), rpc: () => query() } };
});
vi.mock('../../lib/supabaseRetry', () => ({ withRetry: (fn) => fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isStudent: () => true, isTeacher: () => true, loading: false, logout: vi.fn(),
    userData: { uid: 'user-1', name: 'Sample User', role: 'main_admin', profile: {} } }),
}));
vi.mock('../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../context/TeachingLoadUnsavedChangesContext', () => ({
  useTeachingLoadUnsavedChanges: () => ({ requestTeachingLoadNavigation: (go) => { go(); } }),
}));
vi.mock('../../pages/dashboards/admin/AdminContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext(null);
  const AdminProvider = ({ children }) => {
    const [page, setPage] = React.useState('overview');
    const [deleteConfirm, setDeleteConfirm] = React.useState(null);
    const [darkMode, setDarkMode] = React.useState(false);
    const value = { page, setPage, deleteConfirm, setDeleteConfirm, darkMode, setDarkMode, toast: null,
      activeSettingsSub: 'sec-general', scrollToSection: () => {}, settingsDirty: false };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../styles/dashboardTheme', () => ({ useDashboardTheme: () => ({ darkMode: false, toggleDarkMode: () => {} }), DashboardThemeStyles: () => null }));
vi.mock('../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <span>Logo</span> }));
vi.mock('../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));
vi.mock('../../pages/dashboards/student/StudentDataContext', () => ({ StudentDataProvider: ({ children }) => children, useStudentData: () => ({ graph: null, loading: false, refresh: null }) }));
const { tab } = vi.hoisted(() => ({ tab: name => ({ default: () => <h1>{name} content</h1> }) }));
vi.mock('../../pages/dashboards/admin/tabs/OverviewTab', () => tab('Admin overview'));
vi.mock('../../pages/dashboards/admin/tabs/UsersTab', () => tab('Users'));
vi.mock('../../pages/dashboards/admin/tabs/SubjectsTab', () => tab('Subjects'));
vi.mock('../../pages/dashboards/admin/tabs/TeachingLoadTab', () => tab('Teaching Load'));
vi.mock('../../pages/dashboards/admin/tabs/SectionsTab', () => tab('Sections'));
vi.mock('../../pages/dashboards/admin/tabs/SchedulesTab', () => tab('Schedules'));
vi.mock('../../pages/dashboards/admin/tabs/NewsTab', () => tab('News'));
vi.mock('../../pages/dashboards/admin/tabs/CalendarTab', () => tab('Calendar'));
vi.mock('../../pages/dashboards/admin/tabs/MemosTab', () => tab('Memos'));
vi.mock('../../pages/dashboards/admin/tabs/SettingsTab', () => tab('Settings'));
vi.mock('./admin/ClarityAdminOverviewTab', () => tab('Clarity admin overview'));
vi.mock('../../pages/dashboards/teacher/tabs/OverviewTab', () => tab('Teacher overview'));
vi.mock('../../pages/dashboards/teacher/tabs/StudentsTab', () => tab('Teacher students'));
vi.mock('../../pages/dashboards/teacher/tabs/LessonPlansTab', () => tab('Lesson plans'));
vi.mock('../../pages/dashboards/teacher/tabs/WorksheetsTab', () => tab('Worksheets'));
vi.mock('../../pages/dashboards/teacher/tabs/GradesTab', () => tab('Grades'));
vi.mock('../../pages/dashboards/teacher/tabs/AttendanceTab', () => tab('Teacher attendance'));
vi.mock('../../pages/dashboards/teacher/tabs/AnnouncementsTab', () => tab('Teacher announcements'));
vi.mock('./teacher/ClarityTeacherOverviewTab', () => tab('Clarity teacher overview'));
vi.mock('../../pages/dashboards/student/tabs/OverviewTab', () => tab('Student overview'));
vi.mock('../../pages/dashboards/student/tabs/TasksTab', () => tab('Tasks'));
vi.mock('../../pages/dashboards/student/tabs/ScoresTab', () => tab('Scores'));
vi.mock('../../pages/dashboards/student/tabs/AttendanceTab', () => tab('Student attendance'));
vi.mock('../../pages/dashboards/student/tabs/AnnouncementsTab', () => tab('Student announcements'));
vi.mock('./student/ClarityStudentOverviewTab', () => tab('Clarity student overview'));

import { CLARITY_STORAGE_KEY, readStoredFlag, resolveClarityFlag, useClarityFlag } from './useClarityFlag';
import AdminDashboard from '../../pages/dashboards/admin/AdminDashboard';
import TeacherDashboard from '../../pages/dashboards/teacher/TeacherDashboard';
import StudentDashboard from '../../pages/dashboards/student/StudentDashboard';

const SCOPE = ['theme', 'clarity'].join('-');
const Probe = () => {
  const { enabled, turnOff } = useClarityFlag();
  const l = useLocation();
  return <div><p data-testid="state">{enabled ? 'on' : 'off'}</p><p data-testid="url">{l.pathname + l.search}</p>
    <button type="button" onClick={turnOff}>Classic view</button></div>;
};
const probeAt = path => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<Probe />} /></Routes></MemoryRouter>);
const state = () => screen.getByTestId('state').textContent;
const stored = () => window.sessionStorage.getItem(CLARITY_STORAGE_KEY);

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); document.documentElement.classList.remove(SCOPE); });

describe('the flag: Clarity by default', () => {
  it('resolve: nothing stored is on; a stored value or the parameter still decides', () => {
    expect(resolveClarityFlag('', null)).toBe(true);
    expect(resolveClarityFlag('', undefined)).toBe(true);
    expect(resolveClarityFlag('', false)).toBe(false);
    expect(resolveClarityFlag('', true)).toBe(true);
    expect(resolveClarityFlag('?clarity=0', null)).toBe(false);
    expect(resolveClarityFlag('?clarity=1', false)).toBe(true);
  });

  it('readStoredFlag: a session rollback "0" is off; localStorage never decides; nothing stored null', () => {
    expect(readStoredFlag()).toBeNull();
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '0'); expect(readStoredFlag()).toBeNull();
    window.sessionStorage.setItem(CLARITY_STORAGE_KEY, '0'); expect(readStoredFlag()).toBe(false);
  });

  it('nothing stored, no parameter: on, and nothing is written', () => {
    probeAt('/student-dashboard');
    expect(state()).toBe('on');
    expect(stored()).toBeNull();
  });

  it('?clarity=0 turns it off and keeps it off for this tab session', () => {
    probeAt('/teacher-dashboard?clarity=0');
    expect(state()).toBe('off');
    expect(stored()).toBe('0');
    cleanup();
    probeAt('/teacher-dashboard/students');
    expect(state()).toBe('off');
  });

  it('?clarity=1 turns it on and clears a session rollback', () => {
    window.sessionStorage.setItem(CLARITY_STORAGE_KEY, '0');
    probeAt('/admin-dashboard?clarity=1');
    expect(state()).toBe('on');
    expect(stored()).toBeNull();
  });

  it('a session rollback wins over the default', () => {
    window.sessionStorage.setItem(CLARITY_STORAGE_KEY, '0');
    probeAt('/admin-dashboard');
    expect(state()).toBe('off');
  });

  it('turnOff sets the session rollback and keeps the other parameters', () => {
    probeAt('/student-dashboard/tasks?view=done');
    expect(state()).toBe('on');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(state()).toBe('off');
    expect(stored()).toBe('0');
    expect(screen.getByTestId('url').textContent).toBe('/student-dashboard/tasks?view=done&clarity=0');
  });

  it('storage that throws falls back to on, without crashing; ?clarity=0 still works for that load', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    probeAt('/student-dashboard');
    expect(state()).toBe('on');
    cleanup();
    probeAt('/student-dashboard?clarity=0');
    expect(state()).toBe('off');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(state()).toBe('off');
  });

  it('a localStorage getter that throws falls back to on', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      probeAt('/student-dashboard');
      expect(state()).toBe('on');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});

const dash = (base, Dashboard) => path => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path={`${base}/*`} element={<Dashboard />} /></Routes></MemoryRouter>,
);
const CASES = [
  ['Admin', '/admin-dashboard', AdminDashboard, 'Clarity admin overview content', 'Admin overview content'],
  ['Teacher', '/teacher-dashboard', TeacherDashboard, 'Clarity teacher overview content', 'Teacher overview content'],
  ['Student', '/student-dashboard', StudentDashboard, 'Clarity student overview content', 'Student overview content'],
];

describe('each dashboard', () => {
  it.each(CASES)('%s: the Clarity shell by default (no parameter, nothing stored)', async (_, base, Dashboard, clarity) => {
    const { container } = dash(base, Dashboard)(base);
    expect(await screen.findByRole('heading', { name: clarity }, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Classic view' })).toBeNull();
    expect(container.querySelector('.x-app')).toBeTruthy();
    expect(document.documentElement.classList.contains(SCOPE)).toBe(true);
    // Visible text only: inline <style> blocks carry class names like .memo-preview.
    const visible = document.body.cloneNode(true);
    visible.querySelectorAll('style, script').forEach(n => n.remove());
    expect(visible.textContent).not.toMatch(/preview/i);
  });

  it.each(CASES)('%s: the classic layout with ?clarity=0', async (_, base, Dashboard, clarity, classic) => {
    const { container } = dash(base, Dashboard)(`${base}?clarity=0`);
    expect(await screen.findByRole('heading', { name: classic })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: clarity })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Classic view' })).toBeNull();
    expect(container.querySelector('.x-app')).toBeNull();
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
  });

  it.each(CASES)('%s: after the default Clarity load, ?clarity=0 shows classic and stores \'0\'', async (_, base, Dashboard, clarity, classic) => {
    dash(base, Dashboard)(base);
    expect(await screen.findByRole('heading', { name: clarity }, { timeout: 5000 })).toBeTruthy();
    cleanup();
    dash(base, Dashboard)(`${base}?clarity=0`);
    expect(await screen.findByRole('heading', { name: classic })).toBeTruthy();
    expect(stored()).toBe('0');
  });
});
