// @vitest-environment jsdom
// Clarity A1: the Admin Overview (final design) from real context data only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const h = vi.hoisted(() => ({ ctx: {} }));
const { tab } = vi.hoisted(() => ({ tab: name => ({ default: () => <h1>{name} content</h1> }) }));

vi.mock('../../../pages/dashboards/admin/AdminContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext(null);
  const AdminProvider = ({ children }) => {
    const [page, setPage] = React.useState(h.ctx.page || 'overview');
    const value = { ...h.ctx, page, setPage: (p) => { h.ctx.setPageSpy?.(p); setPage(p); } };
    return React.createElement(Ctx.Provider, { value }, children);
  };
  return { AdminProvider, useAdminContext: () => React.useContext(Ctx) };
});
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'a1', name: 'Maria Santos', role: 'main_admin', profile: {} }, logout: vi.fn(), loading: false }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../context/TeachingLoadUnsavedChangesContext', () => ({
  useTeachingLoadUnsavedChanges: () => ({ requestTeachingLoadNavigation: (go) => { go(); } }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../pages/dashboards/admin/tabs/OverviewTab', () => tab('Classic overview'));
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

// 10:00 on Wed 12 Nov 2026, Manila.
const NOW = new Date('2026-11-12T02:00:00Z');
const user = (id, role, status = 'active', created_at = '2026-01-05T00:00:00Z') => ({ id, role, status, created_at, name: id });
const baseCtx = () => ({
  stats: { users: 12, news: 3, events: 9, memos: 4 }, statsErrors: {}, overviewLoading: false, fetchStats: vi.fn(),
  settings: { academic_year: '2026-2027', semester: '2nd Quarter' }, settingsStatus: 'ready',
  users: [
    user('s1', 'student'), user('s2', 'student'), user('s3', 'student', 'active', '2026-11-03T01:00:00Z'),
    user('s4', 'student', 'archived'), user('t1', 'teacher', 'active', '2026-11-10T01:00:00Z'), user('t2', 'teacher', 'inactive'),
    user('a1', 'main_admin'), user('a2', 'admin'), user('g1', 'guest'), user('r1', 'registrar'), user('f1', 'faculty'),
    user('t3', 'teacher', 'archived'),
  ],
  usersLoading: false, usersError: null, fetchUsers: vi.fn(),
  newsItems: [{ id: 1, status: 'Published' }, { id: 2, status: 'Draft' }, { id: 3, status: 'draft' }, { id: 4, status: 'Archived' }],
  newsLoading: false, newsError: '',
  calEvents: [{ id: 1, event_date: '2026-11-20' }, { id: 2, event_date: '2026-11-02' }, { id: 3, event_date: '2026-10-30' }],
  calLoading: false, calError: false,
  memos: [{ id: 9, created_at: '2026-11-10T03:00:00Z' }, { id: 8, created_at: '2026-10-01T03:00:00Z' }],
  memosLoading: false, memosError: '',
  activityLogs: [
    { id: 'l1', action: 'Created news', actorName: 'Maria Santos', message: 'Enrollment reminder', created_at: '2026-11-12T01:50:00Z' },
    { id: 'l2', action: 'Invited user', actorName: 'Maria Santos', message: '', created_at: '2026-11-11T23:00:00Z' },
    { id: 'l3', action: 'Updated settings', actorName: 'Former user', message: 'Quarter changed', created_at: '2026-11-10T01:00:00Z' },
    { id: 'l4', action: 'Created memo', actorName: 'Jane Cruz (archived)', message: 'Faculty meeting', created_at: '2026-11-12T01:59:40Z' },
    { id: 'l5', action: 'Created event', actorName: 'Maria Santos', message: 'Sports fest', created_at: '2026-11-09T05:00:00Z' },
  ],
  activityError: '', fetchLogs: vi.fn(),
  openCreateUser: vi.fn(), setPageSpy: vi.fn(),
  // The shell reads these.
  darkMode: false, setDarkMode: vi.fn(), toast: null, activeSettingsSub: 'sec-general', scrollToSection: vi.fn(),
  deleteConfirm: null, setDeleteConfirm: vi.fn(), settingsDirty: false,
});

const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/admin-dashboard" element={<AdminDashboard />} /></Routes>
  </MemoryRouter>,
);
const show = async () => {
  renderAt('/admin-dashboard?clarity=1');
  await screen.findByRole('heading', { level: 1, name: 'Dashboard Overview' }, { timeout: 5000 });
};
const kpi = label => screen.getByText(label, { selector: '.x-kl' }).closest('.x-kpi');
const roles = () => screen.getByRole('region', { name: 'Role distribution' });

let offsetParent;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.ctx = baseCtx();
  offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
  try { window.localStorage.clear(); } catch { /* none */ }
  document.documentElement.classList.remove(['theme', 'clarity'].join('-'));
});

describe('flag', () => {
  it('flag OFF still renders the classic Overview', () => {
    renderAt('/admin-dashboard');
    expect(screen.getByRole('heading', { name: 'Classic overview content' })).toBeTruthy();
    expect(screen.queryByText('Dashboard Overview')).toBeNull();
  });
  it('flag ON renders the Clarity Overview, not the classic one', async () => {
    await show();
    expect(screen.queryByRole('heading', { name: 'Classic overview content' })).toBeNull();
  });
});

describe('header', () => {
  it('the subtitle is the school name, then the loaded year and quarter, as in the design', async () => {
    await show();
    expect(screen.getByText('Dela Paz National High School · Academic Year 2026-2027 · 2nd Quarter')).toBeTruthy();
  });
  it('a school_name in settings, if ever set, is preferred over the static name', async () => {
    h.ctx.settings = { ...h.ctx.settings, school_name: '  Another School  ' };
    await show();
    expect(screen.getByText('Another School · Academic Year 2026-2027 · 2nd Quarter')).toBeTruthy();
  });
  it('until the settings have really loaded, only the school name (no default year or quarter)', async () => {
    h.ctx.settingsStatus = 'loading';
    await show();
    expect(screen.getByText('Dela Paz National High School', { selector: '.x-sub' })).toBeTruthy();
    expect(screen.queryByText(/Academic Year/)).toBeNull();
  });
  it('"Create user" opens the Users page and its create dialog', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(h.ctx.setPageSpy).toHaveBeenCalledWith('users');
    expect(h.ctx.openCreateUser).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'User Management' })).toBeTruthy();
  });
});

describe('KPI cards', () => {
  it('values come from the real totals', async () => {
    await show();
    expect(kpi('Total users').querySelector('.x-kv').textContent).toBe('12');
    expect(kpi('Published news').querySelector('.x-kv').textContent).toBe('3');
    expect(kpi('Calendar events').querySelector('.x-kv').textContent).toBe('9');
    expect(kpi('Memos sent').querySelector('.x-kv').textContent).toBe('4');
  });

  it('captions from real fields: new users this month, drafts, events this month, last memo date', async () => {
    await show();
    expect(kpi('Total users').querySelector('.x-ov-up').textContent).toBe('+2');
    expect(kpi('Total users').querySelector('.x-kd').textContent).toBe('+2 new this month');
    expect(kpi('Published news').querySelector('.x-kd').textContent).toBe('2 drafts waiting');
    expect(kpi('Calendar events').querySelector('.x-kd').textContent).toBe('2 this month');
    expect(kpi('Memos sent').querySelector('.x-kd').textContent).toBe('Last sent Nov 10');
  });

  it('the news ring is drawn with both real counts, and says them', async () => {
    await show();
    const ring = kpi('Published news').querySelector('svg[role="img"]');
    expect(ring.getAttribute('aria-label')).toBe('Published share of news: 60 percent, 3 published, 2 drafts');
  });

  it.each([
    ['the news list failed', c => { c.newsError = 'x'; }],
    ['the news list is loading', c => { c.newsLoading = true; }],
    ['the published count failed', c => { c.statsErrors = { news: true }; }],
  ])('no ring when %s', async (_, arrange) => {
    arrange(h.ctx);
    await show();
    expect(kpi('Published news').querySelector('svg[role="img"]')).toBeNull();
  });

  it('captions are omitted when their data is missing, never faked', async () => {
    Object.assign(h.ctx, { usersError: 'x', newsError: 'x', calError: true, memos: [] });
    await show();
    for (const label of ['Total users', 'Published news', 'Calendar events', 'Memos sent']) {
      expect(kpi(label).querySelector('.x-kd'), label).toBeNull();
    }
  });

  it('a failed total says "Unavailable" (with Retry); loading says "Loading…", never a fake 0', async () => {
    h.ctx.statsErrors = { users: true };
    await show();
    expect(kpi('Total users').querySelector('.x-kv').textContent).toBe('Unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry totals' }));
    expect(h.ctx.fetchStats).toHaveBeenCalled();
    cleanup();
    h.ctx = { ...baseCtx(), overviewLoading: true };
    await show();
    expect(kpi('Memos sent').querySelector('.x-kv').textContent).toBe('Loading…');
  });
});

describe('Role distribution', () => {
  it('counts only ACTIVE students, teachers and admins; the centre is their sum', async () => {
    await show();
    expect(within(roles()).getByText('6 active accounts')).toBeTruthy();
    const donut = within(roles()).getByRole('img');
    expect(donut.getAttribute('aria-label')).toBe('Role distribution: 6 users. Students 3 (50 percent), Teachers 1 (17 percent), Admins 2 (33 percent)');
    expect(donut.querySelector('.x-ringval').textContent).toBe('6');
    expect(within(roles()).getByText('Students')).toBeTruthy();
  });

  it('an invited (inactive) account is left out, as are archived ones and guest/registrar/faculty', async () => {
    h.ctx.users = [user('t1', 'teacher'), user('t2', 'teacher', 'inactive'), user('t3', 'teacher', 'archived'),
      user('s1', 'student', 'Active'), user('g1', 'guest'), user('r1', 'registrar'), user('n1', 'student', undefined)];
    h.ctx.users[6].status = undefined;
    await show();
    expect(within(roles()).getByText('3 active accounts')).toBeTruthy();
    expect(within(roles()).getByRole('img').getAttribute('aria-label')).toBe('Role distribution: 3 users. Students 2 (67 percent), Teachers 1 (33 percent), Admins 0 (0 percent)');
  });

  it('the role donut is drawn with thin gaps between segments', async () => {
    await show();
    const arcs = [...within(roles()).getByRole('img').querySelectorAll('.x-seg-ring')];
    const sum = arcs.reduce((total, arc) => total + Number(arc.getAttribute('stroke-dasharray').split(' ')[0]), 0);
    expect(arcs).toHaveLength(3);
    expect(sum).toBeCloseTo(100 - 3 * 0.5, 5);
  });

  it('Donut / Split / Ranked: native buttons with aria-pressed, each view draws the same numbers', async () => {
    await show();
    const group = within(roles()).getByRole('group', { name: 'Role distribution view' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map(b => [b.textContent, b.getAttribute('aria-pressed'), b.tagName, b.type])).toEqual([
      ['Donut', 'true', 'BUTTON', 'button'], ['Split', 'false', 'BUTTON', 'button'], ['Ranked', 'false', 'BUTTON', 'button'],
    ]);
    buttons[1].focus();
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.click(buttons[1]);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(within(roles()).getByRole('img').getAttribute('aria-label')).toContain('6 users in total. Students 3');
    fireEvent.click(buttons[2]);
    expect(within(roles()).getByRole('img').getAttribute('aria-label')).toContain('Students 50 percent');
  });

  it('a failed user list: an error with Retry, no chart, no fake count', async () => {
    h.ctx.usersError = 'x';
    await show();
    expect(within(roles()).getByRole('alert').textContent).toContain('Role distribution is unavailable.');
    fireEvent.click(within(roles()).getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchUsers).toHaveBeenCalled();
    expect(within(roles()).queryByRole('img')).toBeNull();
    expect(within(roles()).queryByRole('group')).toBeNull();
  });
});

describe('Sign-in activity (no real series)', () => {
  it('keeps the card with an empty state, and no Line/Area/Bars control or takeaway', async () => {
    await show();
    const card = screen.getByRole('region', { name: 'Sign-in activity' });
    expect(within(card).getByText('Daily sign-ins, this week')).toBeTruthy();
    expect(within(card).getByText('No sign-in data yet')).toBeTruthy();
    expect(within(card).queryByRole('group')).toBeNull();
    expect(card.textContent).not.toMatch(/Line|Area|Bars|busiest/);
  });
});

describe('Recent activity', () => {
  const activity = () => screen.getByRole('region', { name: 'Recent activity' });

  it('renders the same rows as classic: title, actor and detail without the time, relative time', async () => {
    await show();
    const rows = [...activity().querySelectorAll('li')].map(li => [
      li.querySelector('.t').textContent, li.querySelector('.m').textContent, li.querySelector('time').textContent,
    ]);
    expect(rows).toEqual([
      ['Created news', 'Maria Santos · Enrollment reminder', '10 min ago'],
      ['Invited user', 'Maria Santos', '3 h ago'],
      ['Updated settings', 'Former user · Quarter changed', 'Nov 10'],
      ['Created memo', 'Jane Cruz (archived) · Faculty meeting', 'Just now'],
      ['Created event', 'Maria Santos · Sports fest', 'Nov 9'],
    ]);
  });

  it('icons follow the logged action', async () => {
    await show();
    const icons = [...activity().querySelectorAll('li .x-ico svg')].map(s => [...s.classList].find(c => c.startsWith('lucide-') && c !== 'lucide'));
    expect(icons).toEqual(['lucide-newspaper', 'lucide-users', 'lucide-settings', 'lucide-file-text', 'lucide-calendar']);
  });

  it.each([
    ['error', c => { c.activityError = 'Recent activity is unavailable.'; }, 'Recent activity is unavailable.'],
    ['empty', c => { c.activityLogs = []; }, 'No recent activity'],
  ])('%s state', async (_, arrange, text) => {
    arrange(h.ctx);
    await show();
    expect(within(activity()).getByText(text)).toBeTruthy();
  });

  it('"View users" switches to the Users page with setPage (as the sidebar does)', async () => {
    await show();
    fireEvent.click(within(activity()).getByRole('button', { name: 'View users' }));
    expect(h.ctx.setPageSpy).toHaveBeenCalledWith('users');
    expect(screen.getByRole('heading', { level: 1, name: 'User Management' })).toBeTruthy();
  });
});

describe('nothing invented, nothing called preview', () => {
  it('no sample numbers or labels from the design, and no "preview"', async () => {
    await show();
    const main = document.querySelector('main').textContent;
    for (const text of ['1,310', '210', 'Online', 'Offline', 'Last active', '+24']) expect(main, text).not.toContain(text);
    expect(main).not.toMatch(/preview/i);
  });
});

describe('CSS', () => {
  it('every new Overview selector is scoped under the theme class', () => {
    const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
    const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const lines = css.split(/\r?\n/).filter(l => /\.x-ov/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(11);
    for (const line of lines) expect(line.trim().startsWith(`${scope} .x-ov`), line).toBe(true);
  });
});
