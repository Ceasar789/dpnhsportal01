// @vitest-environment jsdom
// Clarity A1b: Admin Overview layout fixes against the final design
// (centred header button, auto-width phone button, 5:3 chart row, role
// control under the subtitle, 130px donut with counts only, text-coloured
// "View users"), all scoped to the Overview.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import ClarityAdminOverviewTab from './ClarityAdminOverviewTab';
import AdminShellSwitch from './AdminShellSwitch';
import Donut from '../charts/Donut';

const user = (id, role, status = 'active') => ({ id, role, status, created_at: '2026-01-05T00:00:00Z' });
const ctx = (extra = {}) => ({
  stats: { users: 5, news: 1, events: 0, memos: 0 }, statsErrors: {}, overviewLoading: false,
  settings: { academic_year: '2026-2027', semester: '2nd Quarter' }, settingsStatus: 'ready',
  users: [user('s1', 'student'), user('s2', 'student'), user('t1', 'teacher'), user('a1', 'main_admin')],
  usersLoading: false, usersError: null, newsItems: [], calEvents: [], memos: [], activityLogs: [],
  setPage: vi.fn(), openCreateUser: vi.fn(), ...extra,
});
const show = (extra) => { h.ctx = ctx(extra); return render(<MemoryRouter><ClarityAdminOverviewTab /></MemoryRouter>); };
const roles = () => screen.getByRole('region', { name: 'Role distribution' });

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r\n/g, '\n');
const SCOPE = ['html.theme', 'clarity'].join('-');
const rule = (sel, text = css) => {
  const m = text.match(new RegExp(`(^|\\n)\\s*${SCOPE.replace(/\./g, '\\.')} ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));
  return m ? m[2] : null;
};
const phoneBlock = css.slice(css.indexOf('@media (max-width: 767px) {'), css.indexOf('@media (max-width: 520px) {'));

afterEach(() => cleanup());

describe('1. header: "Create user" centred against the title block', () => {
  it('the Overview header has the modifier class next to the shared one', () => {
    const { container } = show();
    const head = container.querySelector('.x-head');
    expect(head.className).toBe('x-head x-ov-head');
    expect(within(head).getByRole('button', { name: 'Create user' })).toBeTruthy();
  });
  it('the modifier centres it; the shared .x-head rule is untouched (flex-end)', () => {
    expect(rule('.x-ov-head.x-head')).toMatch(/align-items: center/);
    expect(rule('.x-head')).toMatch(/align-items: flex-end/);
  });
});

describe('2. phone: "Create user" on its own line, auto width, left-aligned', () => {
  it('scoped phone rules give the action row the full line and the button its own width', () => {
    expect(rule('.x-ov-head .x-act', phoneBlock)).toMatch(/flex-basis: 100%/);
    expect(rule('.x-ov-head .x-act .x-btn', phoneBlock)).toMatch(/flex: none/);
    // The shared phone rule (flex: 1) stays for every other page.
    expect(rule('.x-act .x-btn', phoneBlock)).toMatch(/flex: 1/);
    // Phone buttons keep at least 40px.
    expect(parseInt(rule('.x-btn', phoneBlock).match(/min-height: (\d+)px/)[1], 10)).toBeGreaterThanOrEqual(40);
  });
});

describe('3. chart row', () => {
  it('is about 5:3 on desktop and one column on phones', () => {
    expect(rule('.x-ov-row')).toMatch(/grid-template-columns: minmax\(0, 5fr\) minmax\(0, 3fr\)/);
    expect(rule('.x-ov-row', phoneBlock)).toMatch(/grid-template-columns: minmax\(0, 1fr\)/);
  });
});

describe('4. controls', () => {
  it('the Donut/Split/Ranked control sits under the subtitle, in the same column', () => {
    show();
    const subtitle = within(roles()).getByText('4 active accounts');
    const group = within(roles()).getByRole('group', { name: 'Role distribution view' });
    expect(group.closest('.x-ov-seg').parentElement).toBe(subtitle.parentElement);
    expect(subtitle.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rule('.x-ov-seg')).toMatch(/margin-top: 12px/);
  });
  it('the sign-in card has no control while it shows the empty state', () => {
    show();
    const card = screen.getByRole('region', { name: 'Sign-in activity' });
    expect(within(card).getByText('No sign-in data yet')).toBeTruthy();
    expect(within(card).queryByRole('group')).toBeNull();
  });
});

describe('5-6. donut size and legend', () => {
  it('the role donut is 130px and its legend shows counts only (bold), no percentages', () => {
    show();
    const svg = within(roles()).getByRole('img');
    expect(svg.style.maxWidth).toBe('130px');
    expect([...roles().querySelectorAll('.x-legend b')].map(b => b.textContent)).toEqual(['2', '1', '1']);
    expect(roles().querySelector('.x-legend').textContent).not.toMatch(/%/);
    // The screen-reader summary still has the percentages.
    expect(svg.getAttribute('aria-label')).toBe('Role distribution: 4 users. Students 2 (50 percent), Teachers 1 (25 percent), Admins 1 (25 percent)');
  });
  it('Donut by default keeps 180px and "count · percent" in the legend (unchanged behaviour)', () => {
    const { container } = render(<Donut segments={[{ label: 'A', value: 3 }, { label: 'B', value: 1 }]} />);
    expect(container.querySelector('svg').style.maxWidth).toBe('180px');
    expect([...container.querySelectorAll('.x-legend b')].map(b => b.textContent)).toEqual(['3 · 75%', '1 · 25%']);
  });
});

describe('7. "View users" colour', () => {
  it('uses the text colour token on the Overview and keeps the shared focus ring', () => {
    expect(rule('.x-ov .x-link')).toMatch(/color: var\(--cl-tx\)/);
    expect(css).toMatch(new RegExp(`${SCOPE.replace(/\./g, '\\.')} \\.x-link:focus-visible`));
    expect(rule('.x-link')).toMatch(/color: var\(--cl-ac\)/);
  });
});

describe('scope and flag', () => {
  it('every Overview selector is scoped under the theme class', () => {
    const lines = css.split('\n').filter(l => /\.x-ov/.test(l));
    expect(lines.length).toBe(16);
    for (const line of lines) expect(line.trim().startsWith(`${SCOPE} .x-ov`), line).toBe(true);
  });
  it('flag OFF: the switch renders the classic shell it is given', () => {
    const Classic = () => <h1>Classic shell</h1>;
    render(<MemoryRouter initialEntries={['/?clarity=0']}><AdminShellSwitch classic={Classic} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Classic shell' })).toBeTruthy();
    expect(screen.queryByText('Dashboard Overview')).toBeNull();
  });
});
