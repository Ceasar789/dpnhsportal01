// @vitest-environment jsdom
// V2a: the Admin shell on phones (page name in the top bar, Profile always in
// the drawer) and the Admin Overview's Getting started card and empty states.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ page: 'overview', dirty: false, overview: {} }));
const { tab } = vi.hoisted(() => ({ tab: name => ({ default: () => <h1>{name} content</h1> }) }));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'a1', name: 'Maria Santos', role: 'main_admin', profile: {} }, logout: vi.fn(), loading: false }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../context/TeachingLoadUnsavedChangesContext', () => ({
  useTeachingLoadUnsavedChanges: () => ({ requestTeachingLoadNavigation: (go) => { go(); } }),
}));
vi.mock('../../../pages/dashboards/admin/AdminContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext(null);
  const AdminProvider = ({ children }) => {
    const [page, setPage] = React.useState(h.page);
    const [deleteConfirm, setDeleteConfirm] = React.useState(null);
    const [darkMode, setDarkMode] = React.useState(false);
    const value = { page, setPage, deleteConfirm, setDeleteConfirm, darkMode, setDarkMode, toast: null,
      activeSettingsSub: 'sec-general', scrollToSection: vi.fn(), settingsDirty: h.dirty, stats: {}, statsErrors: {},
      currentUserId: 'a1', openCreateUser: vi.fn(), ...h.overview };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button" aria-label="Notifications" /> }));
vi.mock('../../../pages/dashboards/admin/tabs/OverviewTab', () => tab('Classic OverviewTab'));
vi.mock('../../../pages/dashboards/admin/tabs/UsersTab', () => tab('Classic UsersTab'));
vi.mock('../../../pages/dashboards/admin/tabs/SubjectsTab', () => tab('Classic SubjectsTab'));
vi.mock('../../../pages/dashboards/admin/tabs/TeachingLoadTab', () => tab('Classic TeachingLoadTab'));
vi.mock('../../../pages/dashboards/admin/tabs/SectionsTab', () => tab('Classic SectionsTab'));
vi.mock('../../../pages/dashboards/admin/tabs/SchedulesTab', () => tab('Classic SchedulesTab'));
vi.mock('../../../pages/dashboards/admin/tabs/NewsTab', () => tab('Classic NewsTab'));
vi.mock('../../../pages/dashboards/admin/tabs/CalendarTab', () => tab('Classic CalendarTab'));
vi.mock('../../../pages/dashboards/admin/tabs/MemosTab', () => tab('Classic MemosTab'));
vi.mock('../../../pages/dashboards/admin/tabs/SettingsTab', () => tab('Classic SettingsTab'));
vi.mock('./ClarityAdminUsersTab', () => tab('Users'));
vi.mock('./ClarityAdminSubjectsTab', () => tab('Subjects'));
vi.mock('./ClarityAdminTeachingLoadTab', () => tab('Teaching Load'));
vi.mock('./ClarityAdminSectionsTab', () => tab('Sections'));
vi.mock('./ClarityAdminSchedulesTab', () => tab('Schedules'));
vi.mock('./ClarityAdminNewsTab', () => tab('News'));
vi.mock('./ClarityAdminCalendarTab', () => tab('Calendar'));
vi.mock('./ClarityAdminMemosTab', () => tab('Memos'));
vi.mock('./ClarityAdminSettingsTab', () => tab('Settings'));
vi.mock('../../../pages/profile/ProfileTab', () => tab('Profile'));

import AdminDashboard from '../../../pages/dashboards/admin/AdminDashboard';

// The Clarity shell is a lazily loaded chunk: wait for its menu.
const show = async () => {
  render(
    <MemoryRouter initialEntries={['/admin-dashboard?clarity=1']}>
      <Routes><Route path="/admin-dashboard" element={<AdminDashboard />} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => { if (!document.querySelector('.x-app .x-top')) throw new Error('not ready'); }, { timeout: 5000 });
};
const title = () => document.querySelector('header.x-top .x-top-title');
const sidebar = () => document.getElementById('admin-sidebar');
const card = () => screen.queryByRole('region', { name: 'Getting started' });

beforeEach(() => { h.page = 'overview'; h.overview = {}; window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('V2a admin shell', () => {
  it.each([['overview', 'Overview'], ['users', 'User Management'], ['teaching-load', 'Teaching Load'], ['profile', 'Profile Settings']])(
    'page %s shows "%s" in the top bar, after the menu button', async (page, name) => {
      h.page = page;
      await show();
      expect(title().textContent).toBe(name);
      expect(title().getAttribute('title')).toBe(name);
      expect(title().previousElementSibling.classList.contains('x-menubtn')).toBe(true);
    });

  it('Profile & password is in the drawer without opening the name card, and opens Profile', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const entry = within(sidebar()).getByRole('button', { name: 'Profile & password' });
    expect(within(sidebar()).getByRole('button', { name: 'Toggle profile menu' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(entry);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Profile content'));
    expect(title().textContent).toBe('Profile Settings');
  });
});

describe('V2a admin Overview', () => {
  it.each([['Open Settings', 'Settings'], ['Open Subjects', 'Subjects'], ['Open Users', 'Users'], ['Open Teaching Load', 'Teaching Load'], ['Open Schedules', 'Schedules']])(
    '%s opens %s', async (button, page) => {
      await show();
      fireEvent.click(within(card()).getByRole('button', { name: button }));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(`${page} content`);
    });

  it('Getting started lists the set-up order in four steps; the last step has two buttons', async () => {
    await show();
    const items = within(card()).getAllByRole('listitem');
    expect(items.map(li => li.querySelector('.t').textContent)).toEqual(['Check the school year', 'Add subjects and sections', 'Add teachers and students', 'Assign teachers and schedules']);
    const steps = items.map(li => within(li).getAllByRole('button').map(b => b.textContent));
    expect(steps).toEqual([['Open Settings'], ['Open Subjects'], ['Open Users'], ['Open Teaching Load', 'Open Schedules']]);
    fireEvent.click(within(card()).getByRole('button', { name: 'Open Teaching Load' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Teaching Load content');
    expect(JSON.parse(window.localStorage.getItem('smartedu-getting-started-admin-a1'))).toEqual({ hidden: false, done: ['teaching-load'] });
  });

  it('the merged step is done only after both of its pages were opened', async () => {
    window.localStorage.setItem('smartedu-getting-started-admin-a1', JSON.stringify({ hidden: false, done: ['settings', 'subjects', 'users', 'teaching-load'] }));
    await show();
    const last = within(card()).getAllByRole('listitem')[3];
    expect(last.querySelector('.x-ico').textContent).toBe('4');
    fireEvent.click(within(last).getByRole('button', { name: 'Open Schedules' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Schedules content');
    expect(card()).toBeNull();
  });

  it('no accounts yet: a sentence and a Create the first user button', async () => {
    h.overview = { users: [], usersLoading: false, usersError: null };
    await show();
    const empty = screen.getByText('No accounts yet').closest('.x-empty');
    fireEvent.click(within(empty).getByRole('button', { name: 'Create the first user' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Users content');
  });

  it('no recent activity: says what will appear', async () => {
    h.overview = { activityLogs: [] };
    await show();
    expect(screen.getByText('No recent activity').closest('.x-empty').textContent).toContain('New accounts and changes will show here.');
  });
});
