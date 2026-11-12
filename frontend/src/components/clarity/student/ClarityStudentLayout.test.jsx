// @vitest-environment jsdom
// The Student switch point and the Clarity Student shell, driven through the
// real StudentDashboard with the same mocks as the classic shell test.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ logout: vi.fn(), toggle: vi.fn(), dark: false, desktop: false }));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isStudent: () => true, userData: { uid: 'student-1', name: 'Sample Student', profile: {} }, logout: h.logout }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({ darkMode: h.dark, toggleDarkMode: h.toggle }),
  DashboardThemeStyles: () => null,
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => h.desktop }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../components/FlippingLogo', () => ({ default: () => <span>Logo</span> }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ StudentDataProvider: ({ children }) => children, useStudentData: () => ({ graph: null, loading: false, refresh: null }) }));
vi.mock('../../../pages/dashboards/student/tabs/OverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/TasksTab', () => ({ default: () => <h1>Tasks content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/ScoresTab', () => ({ default: () => <h1>Scores content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/AnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

import StudentDashboard from '../../../pages/dashboards/student/StudentDashboard';
import { CLARITY_STORAGE_KEY } from '../useClarityFlag';

const SCOPE = ['theme', 'clarity'].join('-');
const htmlHasClass = () => document.documentElement.classList.contains(SCOPE);

const Where = () => { const l = useLocation(); return <p data-testid="where">{`${l.pathname}${l.search}`}</p>; };
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/student-dashboard/*" element={<><StudentDashboard /><Where /></>} />
      <Route path="/login" element={<h1>Login page</h1>} />
      <Route path="/" element={<h1>Home page</h1>} />
    </Routes>
  </MemoryRouter>,
);

let originalOffsetParent;
let originalFrame;
beforeEach(() => {
  h.logout.mockReset(); h.toggle.mockReset(); h.dark = false; h.desktop = false;
  window.localStorage.clear();
  originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
  originalFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
  else delete HTMLElement.prototype.offsetParent;
  window.requestAnimationFrame = originalFrame;
});

const navLinks = container => [...container.querySelectorAll('nav a')]
  .map(a => ({ label: a.textContent.trim(), href: a.getAttribute('href'), current: a.getAttribute('aria-current') }));

describe('flag off (the default): the classic shell, exactly as before', () => {
  it('renders the classic shell, no Clarity class on <html>, nothing stored', () => {
    const { container } = renderAt('/student-dashboard/tasks');
    expect(container.querySelector('.student-dashboard-shell')).toBeTruthy();
    expect(container.querySelector('.x-app')).toBeNull();
    expect(screen.queryByText('Clarity preview')).toBeNull();
    expect(htmlHasClass()).toBe(false);
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tasks content' })).toBeTruthy();
  });
  it('an unknown parameter value keeps the classic shell', () => {
    const { container } = renderAt('/student-dashboard?clarity=yes');
    expect(container.querySelector('.student-dashboard-shell')).toBeTruthy();
    expect(htmlHasClass()).toBe(false);
  });
});

describe('flag on: the Clarity shell', () => {
  it('?clarity=1 shows the Clarity shell with the tab content, sets the <html> class and remembers it', () => {
    const { container } = renderAt('/student-dashboard/tasks?clarity=1');
    expect(container.querySelector('.x-app')).toBeTruthy();
    expect(container.querySelector('.student-dashboard-shell')).toBeNull();
    expect(container.querySelector('.x-app')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tasks content' })).toBeTruthy();
    expect(htmlHasClass()).toBe(true);
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBe('1');
  });

  it('has the same nav items, order, hrefs and aria-current as the classic shell', () => {
    const classic = renderAt('/student-dashboard/scores');
    const before = navLinks(classic.container);
    cleanup();
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '1');
    const clarity = renderAt('/student-dashboard/scores');
    expect(navLinks(clarity.container)).toEqual(before);
    expect(before.map(l => l.label)).toEqual(['Overview', 'Tasks', 'Scores', 'Attendance', 'Announcements']);
    expect(before.find(l => l.current === 'page').label).toBe('Scores');
  });

  it('navigating to another tab keeps the flag (stored) and moves aria-current', () => {
    h.desktop = true;
    renderAt('/student-dashboard?clarity=1');
    fireEvent.click(screen.getByRole('link', { name: 'Attendance' }));
    expect(screen.getByRole('heading', { name: 'Attendance content' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Attendance' }).getAttribute('aria-current')).toBe('page');
    expect(htmlHasClass()).toBe(true);
  });

  it('the class is removed when the student leaves the dashboard (logout to /login) and on unmount', async () => {
    h.desktop = true;
    h.logout.mockResolvedValue(undefined);
    const view = renderAt('/student-dashboard?clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Log out' })); });
    await screen.findByRole('heading', { name: 'Login page' });
    expect(htmlHasClass()).toBe(false);
    view.unmount();
    expect(htmlHasClass()).toBe(false);
  });

  it('Classic view returns to the classic shell, clears the flag and keeps other parameters', () => {
    h.desktop = true;
    const { container } = renderAt('/student-dashboard/tasks?view=done&clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(container.querySelector('.student-dashboard-shell')).toBeTruthy();
    expect(container.querySelector('.x-app')).toBeNull();
    expect(htmlHasClass()).toBe(false);
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
    const where = new URLSearchParams(screen.getByTestId('where').textContent.split('?')[1]);
    expect(where.get('view')).toBe('done');
    expect(where.get('clarity')).toBe('0');
  });

  it('theme toggle: same accessible names, calls the same useDashboardTheme toggle', () => {
    renderAt('/student-dashboard?clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Dark Mode' }));
    expect(h.toggle).toHaveBeenCalledTimes(1);
    cleanup();
    h.dark = true;
    renderAt('/student-dashboard?clarity=1');
    expect(screen.getByRole('button', { name: 'Switch to Light Mode' })).toBeTruthy();
  });

  it('notification bell and profile menu are present; Profile Settings opens the profile route', () => {
    h.desktop = true;
    renderAt('/student-dashboard?clarity=1');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Toggle profile menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.className).toBe('x-user');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Profile Settings' }));
    expect(screen.getByText('Profile content')).toBeTruthy();
  });
});

describe('drawer below 1024px', () => {
  it('opens as a modal dialog, makes header and main inert, Escape closes and focus returns to the menu button', async () => {
    const { container } = renderAt('/student-dashboard?clarity=1');
    const menu = screen.getByRole('button', { name: 'Open navigation menu' });
    const aside = container.querySelector('#student-sidebar');
    expect(aside.style.visibility).toBe('hidden');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    menu.focus();
    fireEvent.click(menu);
    expect(aside.getAttribute('role')).toBe('dialog');
    expect(aside.getAttribute('aria-modal')).toBe('true');
    expect(aside.className).toContain('open');
    expect(aside.style.visibility).toBe('');
    expect(container.querySelector('header').inert).toBe(true);
    expect(container.querySelector('main').inert).toBe(true);
    expect(container.querySelector('.x-scrim')).toBeTruthy();
    expect(aside.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(aside.getAttribute('role')).toBeNull();
    expect(container.querySelector('header').inert).toBe(false);
    expect(container.querySelector('main').inert).toBe(false);
    expect(document.activeElement).toBe(menu);
  });

  it('Tab stays inside the open drawer', () => {
    const { container } = renderAt('/student-dashboard?clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const aside = container.querySelector('#student-sidebar');
    const items = [...aside.querySelectorAll('a[href], button:not([disabled])')];
    items[items.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('the scrim and the Close navigation button close it; a nav link closes it', () => {
    const { container } = renderAt('/student-dashboard?clarity=1');
    const menu = screen.getByRole('button', { name: 'Open navigation menu' });
    fireEvent.click(menu);
    fireEvent.click(container.querySelector('.x-scrim'));
    expect(container.querySelector('.x-scrim')).toBeNull();
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(container.querySelector('.x-scrim')).toBeNull();
    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('link', { name: 'Tasks' }));
    expect(container.querySelector('.x-scrim')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Tasks content' })).toBeTruthy();
  });
});

describe('logout confirmation', () => {
  it('Cancel keeps the session; Log out calls the same logout and goes to /login', async () => {
    h.desktop = true;
    h.logout.mockResolvedValue(undefined);
    renderAt('/student-dashboard?clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    expect(dialog.className).toBe('x-modal');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull();
    expect(h.logout).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Logout' })));

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Log out' })); });
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy();
  });

  it('a failed logout shows the same error and keeps the dialog open', async () => {
    h.desktop = true;
    h.logout.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/student-dashboard?clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Log out' })); });
    expect(screen.getByRole('alert').textContent).toBe('Could not log out. Please try again.');
    expect(screen.getByRole('dialog', { name: 'Log out of EduScribe?' })).toBeTruthy();
  });
});

describe('styling: the Clarity shell uses only Clarity classes on its own elements', () => {
  const CLARITY = /^(x-[a-z0-9-]+|on|open|pri|dng|gh|in)$/;
  it('no Tailwind utility class on any element the Clarity shell renders itself', () => {
    const { container } = renderAt('/student-dashboard?clarity=1');
    const own = [...container.querySelectorAll('.x-app, .x-app *')].filter(el => !el.closest('[data-shared]')
      && !el.closest('main > *') && !el.closest('svg') && el.tagName !== 'H1');
    const bad = own.flatMap(el => [...el.classList].filter(c => !CLARITY.test(c)).map(c => `${el.tagName}.${c}`));
    expect(bad).toEqual([]);
  });
});

describe('inert for the rest of the app', () => {
  it('only StudentDashboard.jsx (and tests) imports from components/clarity outside that folder', () => {
    const SRC = resolve(['src', 'frontend/src'].find(p => existsSync(join(p, 'components', 'clarity'))));
    const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const inSrc = p => relative(SRC, p).split(sep).join('/');
    const importers = walk(SRC)
      .filter(p => /\.(jsx?|tsx?)$/.test(p) && /\.test\./.test(p) === false)
      .filter(p => inSrc(p).startsWith('components/clarity/') === false)
      .filter(p => /components\/clarity\//.test(readFileSync(p, 'utf8')))
      .map(inSrc);
    expect(importers).toEqual(['pages/dashboards/admin/AdminDashboard.jsx', 'pages/dashboards/student/StudentDashboard.jsx']);
  });
});
