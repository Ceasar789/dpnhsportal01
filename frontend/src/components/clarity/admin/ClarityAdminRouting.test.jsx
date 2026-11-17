// @vitest-environment jsdom
// V2b-2: the Clarity admin page in the URL, tested with a real data router
// (the app's '/admin-dashboard/*' route): deep links, refresh, Back/Forward,
// unknown paths, the query kept, and the unsaved guards (Settings in the app,
// the Teaching Load route blocker still in charge on its page).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { readFileSync } from 'node:fs';

// D-R3: a blocked route change names the admin page ("Leaving for User Management"),
// other paths keep their path; one line, word for word in both Teaching Load copies.
const PAGE_NAME_LINE = "      destination: ({ '/admin-dashboard': 'Overview', '/admin-dashboard/users': 'User Management', '/admin-dashboard/subjects': 'Subjects', '/admin-dashboard/sections': 'Sections', '/admin-dashboard/schedules': 'Schedules', '/admin-dashboard/news': 'News', '/admin-dashboard/calendar': 'Calendar', '/admin-dashboard/memos': 'Memos', '/admin-dashboard/settings': 'Settings', '/admin-dashboard/profile': 'Profile Settings' })[blocker.location?.pathname] || blocker.location?.pathname || 'the requested page',";

const PHONE = '(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';
const h = vi.hoisted(() => ({ dirty: false, tlBlocked: 0, phone: false }));
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
    const [page, setPage] = React.useState('overview');
    const [deleteConfirm, setDeleteConfirm] = React.useState(null);
    const [darkMode, setDarkMode] = React.useState(false);
    const value = { page, setPage, deleteConfirm, setDeleteConfirm, darkMode, setDarkMode, toast: null,
      activeSettingsSub: 'sec-general', scrollToSection: vi.fn(), settingsDirty: h.dirty, stats: {}, statsErrors: {},
      currentUserId: 'a1', openCreateUser: vi.fn() };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: q => (q === PHONE ? h.phone : !h.phone), useIsNarrow: () => h.phone }));
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
vi.mock('./ClarityAdminOverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('./ClarityAdminUsersTab', () => ({ default: () => <h1>Users content</h1> }));
vi.mock('./ClarityAdminSubjectsTab', () => ({ default: () => <h1>Subjects content</h1> }));
// A stand-in for the real Teaching Load tab's route blocker (always dirty here).
vi.mock('./ClarityAdminTeachingLoadTab', async () => {
  const { useBlocker } = await import('react-router-dom');
  const TeachingLoadStandIn = () => {
    const blocker = useBlocker(true);
    if (blocker.state === 'blocked') h.tlBlocked += 1;
    return <h1>Teaching Load content{blocker.state === 'blocked' ? ' (leave?)' : ''}</h1>;
  };
  return { default: TeachingLoadStandIn };
});
vi.mock('./ClarityAdminSectionsTab', () => ({ default: () => <h1>Sections content</h1> }));
vi.mock('./ClarityAdminSchedulesTab', () => ({ default: () => <h1>Schedules content</h1> }));
vi.mock('./ClarityAdminNewsTab', () => ({ default: () => <h1>News content</h1> }));
vi.mock('./ClarityAdminCalendarTab', () => ({ default: () => <h1>Calendar content</h1> }));
vi.mock('./ClarityAdminMemosTab', () => ({ default: () => <h1>Memos content</h1> }));
vi.mock('./ClarityAdminSettingsTab', () => ({ default: () => <h1>Settings content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <h1>Profile content</h1> }));

import AdminDashboard from '../../../pages/dashboards/admin/AdminDashboard';
import { pageFromSplat, pathForPage } from './useAdminPageUrl';

let router;
const open = async (url) => {
  router = createMemoryRouter([
    { path: '/admin-dashboard/*', element: <AdminDashboard /> },
    { path: '/login', element: <p>Login screen</p> },
  ], { initialEntries: ['/login', url], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  await waitFor(() => { if (!document.querySelector('.x-app .x-top')) throw new Error('not ready'); }, { timeout: 5000 });
};
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const where = () => router.state.location.pathname + router.state.location.search;
const menu = () => document.getElementById('admin-sidebar');
const go = async (delta) => { await act(async () => { await router.navigate(delta); }); };

beforeEach(() => {
  h.dirty = false; h.tlBlocked = 0; h.phone = false; window.localStorage.clear(); window.sessionStorage.clear();
  // jsdom's AbortSignal is not the one Node's Request accepts; the router only
  // needs a Request object, so drop the signal (as ClarityAdminTeachingLoadTab.test.jsx does).
  const NativeRequest = globalThis.Request;
  vi.stubGlobal('Request', class extends NativeRequest {
    constructor(input, init = {}) { const rest = { ...init }; delete rest.signal; super(input, rest); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('V2b-2 path helpers', () => {
  it('maps paths to pages and back; unknown paths are null', () => {
    expect(pageFromSplat('')).toBe('overview');
    expect(pageFromSplat('teaching-load')).toBe('teaching-load');
    expect(pageFromSplat('users/123')).toBe('users');
    expect(pageFromSplat('nope')).toBeNull();
    expect(pathForPage('overview')).toBe('/admin-dashboard');
    expect(pathForPage('memos')).toBe('/admin-dashboard/memos');
  });
});

describe('V2b-2 the Clarity admin page lives in the URL', () => {
  it('a deep link opens that page (and so does a refresh of it)', async () => {
    await open('/admin-dashboard/schedules?clarity=1');
    await waitFor(() => expect(heading()).toBe('Schedules content'));
    cleanup();
    await open('/admin-dashboard/schedules?clarity=1');
    await waitFor(() => expect(heading()).toBe('Schedules content'));
    expect(where()).toBe('/admin-dashboard/schedules?clarity=1');
  });

  it('a menu click adds a history entry with the page path, keeping the query', async () => {
    await open('/admin-dashboard?clarity=1');
    fireEvent.click(within(menu()).getByRole('button', { name: 'User Management' }));
    await waitFor(() => expect(where()).toBe('/admin-dashboard/users?clarity=1'));
    expect(heading()).toBe('Users content');
    expect(router.state.historyAction).toBe('PUSH');
  });

  it('Back and Forward move between admin pages instead of leaving the dashboard', async () => {
    await open('/admin-dashboard');
    fireEvent.click(within(menu()).getByRole('button', { name: 'Subjects' }));
    await waitFor(() => expect(heading()).toBe('Subjects content'));
    fireEvent.click(within(menu()).getByRole('button', { name: 'News' }));
    await waitFor(() => expect(heading()).toBe('News content'));
    await go(-1);
    await waitFor(() => expect(heading()).toBe('Subjects content'));
    expect(where()).toBe('/admin-dashboard/subjects');
    await go(-1);
    await waitFor(() => expect(heading()).toBe('Overview content'));
    await go(1);
    await waitFor(() => expect(heading()).toBe('Subjects content'));
  });

  it('an unknown page path is replaced by Overview (no extra history entry)', async () => {
    await open('/admin-dashboard/nope?clarity=1');
    await waitFor(() => expect(where()).toBe('/admin-dashboard?clarity=1'));
    expect(heading()).toBe('Overview content');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('unsaved Settings: Back asks in the app; Keep editing stays, Discard changes goes back', async () => {
    h.dirty = true;
    await open('/admin-dashboard');
    fireEvent.click(within(menu()).getByRole('button', { name: 'Settings' }));
    // Leaving Overview is not guarded; Settings is now open and unsaved.
    await waitFor(() => expect(where()).toBe('/admin-dashboard/settings'));
    await go(-1);
    const ask = await screen.findByRole('alertdialog', { name: 'Leave Settings?' });
    expect(ask.textContent).toContain('You have unsaved settings. Discard them?');
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(where()).toBe('/admin-dashboard/settings');
    expect(heading()).toBe('Settings content');
    await go(-1);
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Leave Settings?' })).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(heading()).toBe('Overview content'));
    expect(where()).toBe('/admin-dashboard');
  });

  it('the Teaching Load route blocker still decides on its own page (no Settings blocker in the way)', async () => {
    await open('/admin-dashboard');
    fireEvent.click(within(menu()).getByRole('button', { name: 'Teaching Load' }));
    await waitFor(() => expect(where()).toBe('/admin-dashboard/teaching-load'));
    await go(-1);
    await waitFor(() => expect(heading()).toBe('Teaching Load content (leave?)'));
    expect(where()).toBe('/admin-dashboard/teaching-load');
    expect(h.tlBlocked).toBeGreaterThan(0);
  });

  it('phones: the bottom bar and the Menu sheet go through the same URLs; a deep link marks the Menu tab', async () => {
    h.phone = true;
    await open('/admin-dashboard?clarity=1');
    const bar = () => document.querySelector('.x-pnav');
    fireEvent.click(within(bar()).getByRole('button', { name: 'Users' }));
    await waitFor(() => expect(where()).toBe('/admin-dashboard/users?clarity=1'));
    fireEvent.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Schedules' }));
    await waitFor(() => expect(where()).toBe('/admin-dashboard/schedules?clarity=1'));
    expect(heading()).toBe('Schedules content');
    await go(-1);
    await waitFor(() => expect(heading()).toBe('Users content'));
    cleanup();
    await open('/admin-dashboard/memos');
    await waitFor(() => expect(heading()).toBe('Memos content'));
    expect(within(bar()).getByRole('button', { name: /^Menu/ }).className).toContain('on');
  });

  it('the Teaching Load leave dialog names the admin page, not its path, in both copies', () => {
    for (const file of ['../../../pages/dashboards/admin/tabs/TeachingLoadTab.jsx', './ClarityAdminTeachingLoadTab.jsx']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, file).toContain(PAGE_NAME_LINE);
    }
  });
});
