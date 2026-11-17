// @vitest-environment jsdom
// SHELL: the Admin Clarity shell on phones: no hamburger, the brand in the
// top bar, the bottom tab bar (Overview, Users, News, Calendar, Menu) and the
// Menu sheet with every other page, Profile & password and Sign out.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const PHONE = '(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';
const h = vi.hoisted(() => ({ phone: true, page: 'overview', stats: {} }));
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
      activeSettingsSub: 'sec-general', scrollToSection: vi.fn(), settingsDirty: false, stats: h.stats, statsErrors: {},
      currentUserId: 'a1', openCreateUser: vi.fn() };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: q => (q === PHONE ? h.phone : false), useIsNarrow: () => h.phone }));
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
vi.mock('./ClarityAdminOverviewTab', () => tab('Overview'));
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

const show = async () => {
  render(
    <MemoryRouter initialEntries={['/admin-dashboard?clarity=1']}>
      <Routes><Route path="/admin-dashboard" element={<AdminDashboard />} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => { if (!document.querySelector('.x-app .x-top')) throw new Error('not ready'); }, { timeout: 5000 });
};
const bar = () => screen.getByRole('navigation', { name: 'Main' }).closest('.x-pnav');
const barLabels = () => [...bar().querySelectorAll('.x-pnav-l')].map(e => e.textContent);
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const openMenu = () => { fireEvent.click(within(bar()).getByRole('button', { name: /^Menu/ })); return screen.getByRole('dialog', { name: 'Menu' }); };

beforeEach(() => { Object.assign(h, { phone: true, page: 'overview', stats: {} }); window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('SHELL admin on phones', () => {
  it('no hamburger and no page name in the top bar; the brand mark instead; the theme toggle and bell stay', async () => {
    await show();
    const top = document.querySelector('header.x-top');
    expect(within(top).queryByRole('button', { name: 'Open navigation' })).toBeNull();
    expect(top.querySelector('.x-menubtn, .x-top-title')).toBeNull();
    expect(top.querySelector('.x-pbrand').textContent).toBe('EduScribe');
    expect(within(top).getByRole('button', { name: 'Switch to Dark Mode' })).toBeTruthy();
    expect(within(top).getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('the bottom tab bar: Overview, Users, News, Calendar, Menu; Overview current', async () => {
    await show();
    expect(barLabels()).toEqual(['Overview', 'Users', 'News', 'Calendar', 'Menu']);
    expect(within(bar()).getByRole('button', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
  });

  it('a bar item opens its page; the published-news count from the stats shows on News', async () => {
    h.stats = { news: 2 };
    await show();
    fireEvent.click(within(bar()).getByRole('button', { name: 'Users' }));
    await waitFor(() => expect(heading()).toBe('Users content'));
    expect(within(bar()).getByRole('button', { name: 'Users' }).getAttribute('aria-current')).toBe('page');
    expect(within(bar()).getByRole('button', { name: /^News/ }).textContent).toBe('News2 published');
  });

  it('the Menu sheet: the other pages grouped like the sidebar, then Profile & password and Sign out', async () => {
    await show();
    const sheet = openMenu();
    expect(within(sheet).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Academics', 'Communication', 'System']);
    expect([...sheet.querySelectorAll('.x-psheet-row')].map(r => r.textContent)).toEqual(
      ['Subjects', 'Teaching Load', 'Sections', 'Schedules', 'Memos', 'Settings', 'Profile & password', 'Sign out']);
  });

  it('a page from the sheet opens; the sheet closes; the Menu tab shows that the page is inside it', async () => {
    await show();
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Teaching Load' }));
    await waitFor(() => expect(heading()).toBe('Teaching Load content'));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    const menu = within(bar()).getByRole('button', { name: /^Menu/ });
    expect(menu.className).toContain('on');
    expect(menu.textContent).toContain('the current page is in the menu');
    expect(document.activeElement).toBe(menu);
  });

  it('Profile & password and Sign out from the sheet', async () => {
    await show();
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Profile & password' }));
    await waitFor(() => expect(heading()).toBe('Profile content'));
    fireEvent.click(within(openMenu()).getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('dialog', { name: 'Sign Out?' })).toBeTruthy();
  });

  it('tablet and desktop keep the menu button and the sidebar; no tab bar', async () => {
    h.phone = false;
    await show();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
    expect(document.querySelector('.x-pnav')).toBeNull();
  });
});
