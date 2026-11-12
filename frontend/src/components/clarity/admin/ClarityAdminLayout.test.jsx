// @vitest-environment jsdom
// Clarity phase 4F: the Admin flag, its one switch point and the Clarity
// Admin shell. Flag off is the classic shell; flag on keeps every shell
// behaviour (nav, guards, confirmations, drawer, toast) with the classic tabs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const h = vi.hoisted(() => ({
  desktop: true, page: 'overview', toast: null, dirty: false, sub: 'sec-general',
  deleteConfirm: null, logout: vi.fn(), scroll: vi.fn(), teachingLoad: vi.fn(), profile: vi.fn(),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'a1', name: 'Ana Admin', role: 'main_admin', profile: {} }, logout: h.logout, loading: false }),
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
    const [deleteConfirm, setDeleteConfirm] = React.useState(h.deleteConfirm);
    const [darkMode, setDarkMode] = React.useState(false);
    const value = { page, setPage, deleteConfirm, setDeleteConfirm, darkMode, setDarkMode, toast: h.toast,
      activeSettingsSub: h.sub, scrollToSection: h.scroll, settingsDirty: h.dirty };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => h.desktop }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
const { tab } = vi.hoisted(() => ({ tab: name => ({ default: () => <h1>{name} content</h1> }) }));
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
import AdminShellSwitch from './AdminShellSwitch';
import { CLARITY_STORAGE_KEY } from '../useClarityFlag';

const SCOPE = ['theme', 'clarity'].join('-');
const htmlHasClass = () => document.documentElement.classList.contains(SCOPE);
const NAV = ['Overview', 'User Management', 'Subjects', 'Teaching Load', 'Sections', 'Schedules',
  'News Management', 'Calendar', 'Memos', 'System Settings'];
const SAME = { News: 'News Management', Settings: 'System Settings' };

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/admin-dashboard" element={<><AdminDashboard /><Where /></>} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>
  </MemoryRouter>,
);
const CLARITY = '/admin-dashboard?clarity=1';
const CLASSIC = '/admin-dashboard';
// The Clarity shell is loaded on demand: wait for it.
const ready = async () => { await screen.findByRole('button', { name: 'Classic view' }, { timeout: 5000 }); };
const show = async (path) => { const view = renderAt(path); if (path.includes('clarity=1')) await ready(); return view; };
const sidebar = () => document.getElementById('admin-sidebar');
const navFacts = () => within(sidebar()).getAllByRole('button')
  .filter(b => NAV.includes(SAME[b.textContent.trim()] || b.textContent.trim()))
  .map(b => [SAME[b.textContent.trim()] || b.textContent.trim(), b.getAttribute('aria-current')]);
const subNav = () => within(sidebar()).queryAllByRole('button')
  .filter(b => ['General', 'Security', 'Notifications', 'Backup & Logs', 'Appearance'].includes(b.textContent.trim()))
  .map(b => [b.textContent.trim(), b.getAttribute('aria-current')]);

// Both shells, same mocks: run `check` on each and return [classic, clarity].
const both = async (check) => {
  const out = [];
  for (const path of [CLASSIC, CLARITY]) {
    try { window.localStorage.removeItem(CLARITY_STORAGE_KEY); } catch { /* none */ }
    await show(path);
    out.push(await check(path === CLARITY ? 'clarity' : 'classic'));
    cleanup();
  }
  return out;
};

let offsetParent;
beforeEach(() => {
  Object.assign(h, { desktop: true, page: 'overview', toast: null, dirty: false, sub: 'sec-general', deleteConfirm: null });
  [h.logout, h.scroll, h.teachingLoad, h.profile].forEach(fn => fn.mockClear());
  offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterEach(() => {
  cleanup();
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
  try { window.localStorage.clear(); } catch { /* none */ }
  document.documentElement.classList.remove(SCOPE);
  vi.restoreAllMocks();
});

describe('flag off: the classic shell', () => {
  it('the switch renders exactly the classic element it is given, with the same props', () => {
    const Probe = props => <div data-probe={JSON.stringify(props)}>classic</div>;
    const direct = render(<MemoryRouter><Probe a={1} b="x" /></MemoryRouter>).container.innerHTML;
    cleanup();
    const switched = render(<MemoryRouter><AdminShellSwitch classic={Probe} a={1} b="x" /></MemoryRouter>).container.innerHTML;
    expect(switched).toBe(direct);
  });

  it('by default: the classic shell, no Clarity markup, no class on <html>', async () => {
    const { container } = await show(CLASSIC);
    expect(container.querySelector('.dashboard-shell')).toBeTruthy();
    expect(container.querySelector('.x-app')).toBeNull();
    expect(htmlHasClass()).toBe(false);
    expect(screen.getByRole('heading', { name: 'Overview content' })).toBeTruthy();
  });

  it('?clarity=0 turns it off and forgets it', async () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '1');
    const { container } = await show('/admin-dashboard?clarity=0');
    expect(container.querySelector('.dashboard-shell')).toBeTruthy();
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
  });

  it('storage that throws: classic by default, and ?clarity=1 still works for that page load', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    let view = await show(CLASSIC);
    expect(view.container.querySelector('.dashboard-shell')).toBeTruthy();
    cleanup();
    view = await show(CLARITY);
    expect(view.container.querySelector('.x-app')).toBeTruthy();
  });
});

describe('flag on: the Clarity shell', () => {
  it('?clarity=1 shows it, remembers it, and adds the class on <html> while mounted', async () => {
    const view = await show(CLARITY);
    expect(view.container.querySelector('.x-app')).toBeTruthy();
    expect(view.container.querySelector('.dashboard-shell')).toBeNull();
    expect(htmlHasClass()).toBe(true);
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBe('1');
    view.unmount();
    expect(htmlHasClass()).toBe(false);
  });

  it('"Classic view" returns to the classic shell, keeps other parameters and removes the class', async () => {
    const view = await show('/admin-dashboard?tab=x&clarity=1');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(view.container.querySelector('.dashboard-shell')).toBeTruthy();
    expect(htmlHasClass()).toBe(false);
    const params = new URLSearchParams(screen.getByTestId('where').textContent.split('?')[1]);
    expect(params.get('tab')).toBe('x');
    expect(params.get('clarity')).toBe('0');
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
  });

  it('hosts the classic tab components and the classic tab styles', async () => {
    const view = await show(CLARITY);
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'User Management' }));
    expect(screen.getByRole('heading', { name: 'Users content' })).toBeTruthy();
    expect(view.container.querySelector('style').textContent).toContain('.table-card');
  });

  it('groups the same items under People / Academics / Communication / System (assumed mapping)', async () => {
    await show(CLARITY);
    const order = [...sidebar().querySelectorAll('[role="navigation"] .x-grp, [role="navigation"] .x-nav')].map(el => el.textContent.trim());
    expect(order).toEqual(['Overview', 'People', 'User Management', 'Academics', 'Subjects', 'Teaching Load', 'Sections', 'Schedules',
      'Communication', 'News', 'Calendar', 'Memos', 'System', 'Settings']);
    expect(sidebar().querySelector('.x-side-foot').textContent).toContain('Ana AdminAdministrator');
    expect(sidebar().querySelector('.cnt')).toBeNull();
    expect(document.querySelector('input[type="search"], [role="searchbox"]')).toBeNull();
    expect(document.querySelector('nav')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByText('Admin Portal')).toBeTruthy();
  });
});

describe('parity with the classic shell (same mocks)', () => {
  it('the same 10 nav items, order, labels and aria-current; clicking moves it', async () => {
    const [classic, clarity] = await both(async () => {
      const before = navFacts();
      fireEvent.click(within(sidebar()).getByRole('button', { name: 'User Management' }));
      return { before, after: navFacts(), content: screen.getByRole('heading', { level: 1 }).textContent };
    });
    expect(clarity).toEqual(classic);
    expect(classic.before.map(([l]) => l)).toEqual(NAV);
    expect(classic.before[0][1]).toBe('page');
    expect(classic.after.find(([, c]) => c === 'page')[0]).toBe('User Management');
    expect(classic.content).toBe('Users content');
  });

  it('the Settings sub-nav appears only on settings, with the same items and current item', async () => {
    const results = await both(async () => {
      const off = subNav();
      fireEvent.click(within(sidebar()).getByRole('button', { name: /^(System )?Settings$/ }));
      const on = subNav();
      fireEvent.click(within(sidebar()).getByRole('button', { name: 'Security' }));
      return { off, on, scrolled: h.scroll.mock.calls.at(-1)?.[0] };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0].off).toEqual([]);
    expect(results[0].on).toEqual([['General', 'true'], ['Security', null], ['Notifications', null], ['Backup & Logs', null], ['Appearance', null]]);
    expect(results[0].scrolled).toBe('sec-security');
  });

  it('unsaved Settings: the same confirm text; Cancel stays, OK leaves', async () => {
    Object.assign(h, { page: 'settings', dirty: true });
    const results = await both(async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      fireEvent.click(within(sidebar()).getByRole('button', { name: 'User Management' }));
      const stayed = screen.getByRole('heading', { level: 1 }).textContent;
      confirm.mockReturnValue(true);
      fireEvent.click(within(sidebar()).getByRole('button', { name: 'User Management' }));
      const text = confirm.mock.calls[0][0];
      confirm.mockRestore();
      return { stayed, left: screen.getByRole('heading', { level: 1 }).textContent, text };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual({ stayed: 'Settings content', left: 'Users content', text: 'You have unsaved settings. Discard them?' });
  });

  it('every page change goes through the Teaching Load and Profile guards, with the destination', async () => {
    const results = await both(async () => {
      h.teachingLoad.mockClear(); h.profile.mockClear();
      fireEvent.click(within(sidebar()).getByRole('button', { name: 'Subjects' }));
      return [h.teachingLoad.mock.calls, h.profile.mock.calls.length];
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual([[['Subjects']], 1]);
  });

  it('the profile menu: "Toggle profile menu" opens "Profile Settings", which opens the profile page', async () => {
    const results = await both(async () => {
      const toggle = screen.getByRole('button', { name: 'Toggle profile menu' });
      fireEvent.click(toggle);
      const expanded = toggle.getAttribute('aria-expanded');
      fireEvent.click(screen.getByRole('button', { name: 'Profile Settings' }));
      return [expanded, screen.getByRole('heading', { level: 1 }).textContent];
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual(['true', 'Profile content']);
  });

  it('archive confirmation: the same texts, busy state, closes only when confirmed, focus goes where asked', async () => {
    let finish;
    const focusAfterConfirm = vi.fn();

    for (const result of [false, true]) {
      const seen = [];
      for (const path of [CLASSIC, CLARITY]) {
        h.deleteConfirm = { label: 'Jane Teacher', role: 'teacher', focusAfterConfirm,
          onConfirm: () => new Promise((r) => { finish = r; }) };
        await show(path);
        const dialog = screen.getByRole('dialog', { name: 'Archive User?' });
        const text = flatText(dialog);
        const confirm = within(dialog).getByRole('button', { name: 'Yes, Archive' });
        fireEvent.click(confirm);
        const busy = [confirm.getAttribute('aria-busy'), confirm.textContent.trim()];
        fireEvent.click(confirm); // a second click while busy does nothing new
        await act(async () => { finish(result); });
        await act(async () => { await new Promise(r => setTimeout(r, 20)); });
        const open = Boolean(screen.queryByRole('dialog', { name: 'Archive User?' }));
        seen.push({ text, busy, open, focused: focusAfterConfirm.mock.calls.length });
        focusAfterConfirm.mockClear();
        cleanup();
        window.localStorage.clear();
      }
      expect(seen[1]).toEqual(seen[0]);
      expect(seen[0].busy).toEqual(['true', 'Deleting…']);
      expect(seen[0].open).toBe(!result);
      expect(seen[0].focused).toBe(result ? 1 : 0);
      expect(seen[0].text).toContain('This user will be moved to the archive and removed from the active user list:');
      expect(seen[0].text).toContain('Jane Teacher');
      expect(seen[0].text).toContain('The account will not be permanently deleted.');
    }
  });

  it('archive confirmation: Cancel closes it (and is ignored while busy)', async () => {
    for (const path of [CLASSIC, CLARITY]) {
      h.deleteConfirm = { label: 'X', onConfirm: () => new Promise(() => {}) };
      await show(path);
      const dialog = screen.getByRole('dialog', { name: 'Archive User?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, Archive' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('dialog', { name: 'Archive User?' }), path).toBeTruthy();
      cleanup();
      window.localStorage.clear();
      h.deleteConfirm = { label: 'X', onConfirm: () => true };
      await show(path);
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive User?' })).getByRole('button', { name: 'Cancel' }));
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect(screen.queryByRole('dialog', { name: 'Archive User?' }), path).toBeNull();
      cleanup();
      window.localStorage.clear();
    }
  });

  it('sign-out confirmation: same title and text; Cancel keeps you in, Sign Out logs out and goes to /login', async () => {
    const results = await both(async () => {
      h.logout.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      const dialog = screen.getByRole('dialog', { name: 'Sign Out?' });
      const text = flatText(dialog);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      const closed = !screen.queryByRole('dialog', { name: 'Sign Out?' });
      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Sign Out?' })).getByRole('button', { name: 'Sign Out' }));
      const page = await screen.findByRole('heading', { name: 'Login page' });
      return { hasDescription: text.includes('Are you sure you want to sign out of the Admin Dashboard?'), closed,
        logout: h.logout.mock.calls.length, login: Boolean(page) };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual({ hasDescription: true, closed: true, logout: 1, login: true });
  });

  it('the header controls have the same names', async () => {
    const results = await both(async () => {
      // jsdom applies the classic style text without media queries, so the
      // classic menu button is display:none there: find buttons by name text.
      const named = n => [...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') || b.textContent.trim()) === n);
      const names = ['Open navigation', 'Notifications', 'Switch to Dark Mode'].map(named);
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Dark Mode' }));
      return [...names, named('Switch to Light Mode')];
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual([true, true, true, true]);
  });

  it('the drawer: a dialog only while open, focus moves in and is trapped, Escape closes, scroll is locked, focus returns', async () => {
    h.desktop = false;
    const results = await both(async () => {
      const menu = document.querySelector('button[aria-label="Open navigation"]');
      const closedRole = sidebar().getAttribute('role');
      menu.focus();
      fireEvent.click(menu);
      const open = {
        role: sidebar().getAttribute('role'), modal: sidebar().getAttribute('aria-modal'),
        expanded: menu.getAttribute('aria-expanded'), focusInside: sidebar().contains(document.activeElement),
        locked: document.body.style.overflow,
      };
      fireEvent.keyDown(document, { key: 'Escape' });
      return { closedRole, open, closedAgain: sidebar().getAttribute('role'), unlocked: document.body.style.overflow,
        focusBack: document.activeElement === menu };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual({ closedRole: null, open: { role: 'dialog', modal: 'true', expanded: 'true', focusInside: true, locked: 'hidden' },
      closedAgain: null, unlocked: '', focusBack: true });
  });

  it('Clarity only: header and main are inert while the drawer is open (the classic shell does not do this)', async () => {
    h.desktop = false;
    const view = await show(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(view.container.querySelector('header').inert).toBe(true);
    expect(view.container.querySelector('main').inert).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(view.container.querySelector('main').inert).toBe(false);
  });

  it.each([['error', 'alert', 'assertive'], ['success', 'status', 'polite']])('toast %s: the same role and aria-live', async (type, role, live) => {
    h.toast = { type, msg: `Saved ${type}` };
    const results = await both(async () => {
      const region = screen.getByText(`Saved ${type}`);
      return [region.getAttribute('role'), region.getAttribute('aria-live'), region.getAttribute('aria-atomic')];
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[0]).toEqual([role, live, 'true']);
  });

  it('no toast: the live region is still mounted (empty) in both', async () => {
    const results = await both(async () => document.querySelectorAll('[aria-live="polite"][aria-atomic="true"]').length);
    expect(results).toEqual([1, 1]);
  });
});

function flatText(node) { return node.textContent.replace(/\s+/g, ' ').trim(); }

describe('source rules', () => {
  const SRC = resolve(['src', 'frontend/src'].find(p => existsSync(join(p, 'components', 'clarity'))));
  const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
  const literalIn = (text, from) => {
    const open = '<style>{' + String.fromCharCode(96);
    const close = String.fromCharCode(96) + '}</style>';
    const start = text.indexOf(open, from);
    return text.slice(start + open.length, text.indexOf(close, start));
  };

  it('ClassicAdminStyles holds exactly the classic style text, with no backtick', () => {
    const dashboard = read('pages/dashboards/admin/AdminDashboard.jsx');
    const classic = literalIn(dashboard, dashboard.indexOf('const AdminDashboardShell'));
    const copySource = read('components/clarity/admin/ClassicAdminStyles.jsx');
    const tick = String.fromCharCode(96);
    const start = copySource.indexOf('const CLASSIC_ADMIN_CSS = ' + tick) + ('const CLASSIC_ADMIN_CSS = ' + tick).length;
    const text = copySource.slice(start, copySource.indexOf(tick + ';', start));
    expect(classic.length).toBeGreaterThan(80000);
    expect(text).toBe(classic);
    expect(text.includes(tick)).toBe(false);
    expect(text.includes('${')).toBe(false);
  });

  it('the Clarity shell renders no bare <nav>, uses only x-* classes, and has no hard-coded colour', () => {
    const source = read('components/clarity/admin/ClarityAdminLayout.jsx');
    expect(source).not.toMatch(/<nav[\s>]/);
    // Plain className="..." values, and every string inside className={`...`}
    // (its static text and the quoted strings in its expressions).
    const plain = [...source.matchAll(/className="([^"]*)"/g)].map(m => m[1]);
    const templated = [...source.matchAll(/className=\{`([^`]*)`\}/g)].flatMap(m => [
      m[1].replace(/\$\{[^}]*\}/g, ' '),
      ...[...m[1].matchAll(/'([^']*)'/g)].map(q => q[1]),
    ]);
    const conditional = [...source.matchAll(/className=\{[^`"}]*\?\s*'([^']*)'\s*:\s*(?:undefined|'([^']*)')\}/g)].flatMap(m => [m[1], m[2] || '']);
    const tokens = [...plain, ...templated, ...conditional].flatMap(v => v.split(/\s+/)).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(20);
    const allowed = /^(x-[a-z0-9-]+|open|on|gh|in|dng|pri|admin-notification-bell|cnt)$/;
    for (const t of tokens) expect(t, t).toMatch(allowed);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(/var\(--(?!cl-)/);
  });

  it('only AdminDashboard.jsx imports from components/clarity/admin (tests aside)', () => {
    const walk = dir => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const inSrc = p => relative(SRC, p).split(sep).join('/');
    const importers = walk(SRC)
      .filter(p => /\.(jsx?|tsx?)$/.test(p) && !/\.test\.(jsx?|tsx?)$/.test(p))
      .filter(p => !inSrc(p).startsWith('components/clarity/admin/'))
      .filter(p => /components\/clarity\/admin\//.test(readFileSync(p, 'utf8')))
      .map(inSrc);
    expect(importers).toEqual(['pages/dashboards/admin/AdminDashboard.jsx']);
  });
});
