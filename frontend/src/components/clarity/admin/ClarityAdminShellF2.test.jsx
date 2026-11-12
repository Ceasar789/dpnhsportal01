// @vitest-environment jsdom
// Clarity F2 (Admin shell, final design): no preview wording, the shorter
// News / Settings labels (classic labels and page keys unchanged), the News
// badge from the real published count, a clock icon for Schedules, the
// footer user card with the same logout handler, and a plain bell. Also
// re-checks the shell behaviours under the new labels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  page: 'overview', dirty: false, stats: { users: 9, news: 0, events: 1, memos: 2 }, statsErrors: {},
  logout: vi.fn(), teachingLoad: vi.fn(), profile: vi.fn(),
}));
const { tab } = vi.hoisted(() => ({ tab: name => ({ default: () => <h1>{name} content</h1> }) }));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'a1', name: 'Maria Santos', role: 'main_admin', profile: {} }, logout: h.logout, loading: false }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { h.profile(); go(); return true; } }),
}));
vi.mock('../../../context/TeachingLoadUnsavedChangesContext', () => ({
  useTeachingLoadUnsavedChanges: () => ({ requestTeachingLoadNavigation: (go, destination) => { h.teachingLoad(destination); go(); } }),
}));
vi.mock('../../../pages/dashboards/admin/AdminContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext(null);
  const AdminProvider = ({ children }) => {
    const [page, setPage] = React.useState(h.page);
    const [deleteConfirm, setDeleteConfirm] = React.useState(null);
    const [darkMode, setDarkMode] = React.useState(false);
    const value = { page, setPage, deleteConfirm, setDeleteConfirm, darkMode, setDarkMode, toast: null,
      activeSettingsSub: 'sec-general', scrollToSection: vi.fn(), settingsDirty: h.dirty, stats: h.stats, statsErrors: h.statsErrors };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({
  default: () => <div className="notification-bell"><button type="button" className="notification-bell-button" aria-label="Notifications" /></div>,
}));
vi.mock('../../../pages/dashboards/admin/tabs/OverviewTab', () => tab('Overview'));
vi.mock('../../../pages/dashboards/admin/tabs/UsersTab', () => tab('Users'));
vi.mock('../../../pages/dashboards/admin/tabs/SubjectsTab', () => tab('Subjects'));
vi.mock('../../../pages/dashboards/admin/tabs/TeachingLoadTab', () => tab('Teaching Load'));
vi.mock('../../../pages/dashboards/admin/tabs/SectionsTab', () => tab('Sections'));
vi.mock('../../../pages/dashboards/admin/tabs/SchedulesTab', () => tab('Schedules'));
vi.mock('../../../pages/dashboards/admin/tabs/NewsTab', () => tab('News'));
vi.mock('../../../pages/dashboards/admin/tabs/CalendarTab', () => tab('Calendar'));
vi.mock('../../../pages/dashboards/admin/tabs/MemosTab', () => tab('Memos'));
vi.mock('../../../pages/dashboards/admin/tabs/SettingsTab', () => tab('Settings'));
vi.mock('../../../pages/profile/ProfileTab', () => tab('Profile'));

import AdminDashboard from '../../../pages/dashboards/admin/AdminDashboard';

const CLARITY_NAV = ['Overview', 'User Management', 'Subjects', 'Teaching Load', 'Sections', 'Schedules',
  'News', 'Calendar', 'Memos', 'Settings'];
const CLASSIC_NAV = ['Overview', 'User Management', 'Subjects', 'Teaching Load', 'Sections', 'Schedules',
  'News Management', 'Calendar', 'Memos', 'System Settings'];

const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/admin-dashboard" element={<AdminDashboard />} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>
  </MemoryRouter>,
);
const showClarity = async () => {
  const view = renderAt('/admin-dashboard?clarity=1');
  // The Clarity shell is a lazily loaded chunk: allow it time under a busy run.
  await screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 });
  return view;
};
const menu = () => screen.getByRole('navigation', { name: 'Main' });
const navButton = label => within(menu()).getAllByRole('button').find(b => b.querySelector('span')?.textContent === label);
const navLabels = () => within(menu()).getAllByRole('button').map(b => b.querySelector('span')?.textContent)
  .filter(t => CLARITY_NAV.includes(t));
const foot = () => document.querySelector('.x-side-foot');

let offsetParent;
beforeEach(() => {
  Object.assign(h, { page: 'overview', dirty: false, stats: { users: 9, news: 0, events: 1, memos: 2 }, statsErrors: {} });
  [h.logout, h.teachingLoad, h.profile].forEach(fn => fn.mockClear());
  offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterEach(() => {
  cleanup();
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
  try { window.localStorage.clear(); } catch { /* none */ }
  document.documentElement.classList.remove(['theme', 'clarity'].join('-'));
});

describe('wording and brand', () => {
  it('never shows "preview" in text, aria-label, title or alt', async () => {
    const { container } = await showClarity();
    // Visible text only: the classic tab CSS in <style> has class names such
    // as .news-image-preview, which are not shown to anyone.
    const visible = container.cloneNode(true);
    visible.querySelectorAll('style').forEach(el => el.remove());
    expect(visible.textContent).not.toMatch(/preview/i);
    for (const el of container.querySelectorAll('[aria-label], [title], [alt]')) {
      for (const attr of ['aria-label', 'title', 'alt']) expect(el.getAttribute(attr) || '').not.toMatch(/preview/i);
    }
    expect(within(document.querySelector('.x-top')).getByRole('button', { name: 'Classic view' })).toBeTruthy();
  });

  it('keeps the EduScribe seal logo and "Admin Portal"', async () => {
    await showClarity();
    expect(document.querySelector('.x-brand img').getAttribute('src')).toBe('/EduScribeLogoIcon.png');
    expect(screen.getByText('Admin Portal')).toBeTruthy();
  });
});

describe('nav labels and icons', () => {
  it('Clarity uses "News" and "Settings", in the same order; the classic shell keeps its labels', async () => {
    await showClarity();
    expect(navLabels()).toEqual(CLARITY_NAV);
    cleanup();
    window.localStorage.clear();
    renderAt('/admin-dashboard?clarity=0');
    const classic = within(document.getElementById('admin-sidebar')).getAllByRole('button')
      .map(b => b.textContent.trim()).filter(t => CLASSIC_NAV.includes(t));
    expect(classic).toEqual(CLASSIC_NAV);
  });

  it('the renamed items still open the same pages (same page keys)', async () => {
    await showClarity();
    fireEvent.click(navButton('News'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('News');
    expect(navButton('News').getAttribute('aria-current')).toBe('page');
    fireEvent.click(navButton('Settings'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('System Settings');
    expect(within(menu()).getByRole('button', { name: 'Security' })).toBeTruthy();
  });

  it('Schedules uses a clock icon', async () => {
    await showClarity();
    expect(navButton('Schedules').querySelector('svg.lucide-clock')).toBeTruthy();
  });
});

describe('News badge', () => {
  it('shows the real published count when above 0', async () => {
    h.stats = { ...h.stats, news: 4 };
    await showClarity();
    expect(navButton('News').querySelector('.cnt').textContent).toBe('4 published');
  });

  it.each([
    ['0', () => { h.stats = { ...h.stats, news: 0 }; }],
    ['a failed count', () => { h.stats = { ...h.stats, news: 4 }; h.statsErrors = { news: true }; }],
    ['no stats yet', () => { h.stats = undefined; }],
  ])('%s: no badge', async (_, arrange) => {
    arrange();
    await showClarity();
    expect(navButton('News').querySelector('.cnt')).toBeNull();
  });
});

describe('footer user card', () => {
  it('shows the avatar initials, the name and "Administrator"', async () => {
    await showClarity();
    expect(foot().querySelector('.x-ava').textContent).toBe('MS');
    expect(within(foot()).getByText('Maria Santos')).toBeTruthy();
    expect(within(foot()).getByText('Administrator')).toBeTruthy();
  });

  it('the profile toggle keeps its behaviour: Profile Settings opens the profile page', async () => {
    await showClarity();
    const toggle = within(foot()).getByRole('button', { name: 'Toggle profile menu' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Profile Settings' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Profile content');
  });

  it('the logout icon button keeps the name "Logout" and the same handler (guards, confirm, logout, /login)', async () => {
    await showClarity();
    const logout = within(foot()).getByRole('button', { name: 'Logout' });
    expect(logout.className).toBe('x-iconbtn');
    fireEvent.click(logout);
    expect(h.teachingLoad).toHaveBeenLastCalledWith('Logout');
    const dialog = screen.getByRole('dialog', { name: 'Sign Out?' });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Sign Out' })); });
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy();
  });
});

describe('shell behaviours still hold under the new labels', () => {
  it('page changes go through the guards with the destination label', async () => {
    await showClarity();
    fireEvent.click(navButton('Subjects'));
    expect(h.teachingLoad).toHaveBeenLastCalledWith('Subjects');
    expect(h.profile).toHaveBeenCalled();
  });

  it('unsaved Settings still asks before leaving', async () => {
    Object.assign(h, { page: 'settings', dirty: true });
    await showClarity();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(navButton('Calendar'));
    expect(confirm).toHaveBeenCalledWith('You have unsaved settings. Discard them?');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('System Settings');
    confirm.mockRestore();
  });

  it('the header keeps the theme toggle, the bell and the menu button', async () => {
    await showClarity();
    const top = document.querySelector('.x-top');
    expect(within(top).getByRole('button', { name: 'Switch to Dark Mode' })).toBeTruthy();
    expect(within(top).getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(top.querySelector('button[aria-label="Open navigation"]')).toBeTruthy();
  });

  it('the bell sits in .x-bell with no dark circle (no inline background)', async () => {
    await showClarity();
    const wrap = document.querySelector('.x-bell');
    expect(wrap.querySelector('.notification-bell-button')).toBeTruthy();
    expect(wrap.getAttribute('style')).toBeNull();
  });
});
