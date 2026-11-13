// @vitest-environment jsdom
// L2: the admin Clarity tabs show the shared skeleton while they load. The
// loading words stay on the same element (same role, same text, now visually
// hidden), the shapes sit in an aria-hidden group with no text of their own,
// and the group is gone once the data is there.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useBlocker: () => ({ state: 'unblocked' }) }));

import ClarityAdminOverviewTab from './ClarityAdminOverviewTab';
import ClarityAdminUsersTab from './ClarityAdminUsersTab';
import ClarityAdminSubjectsTab from './ClarityAdminSubjectsTab';
import ClarityAdminSectionsTab from './ClarityAdminSectionsTab';
import ClarityAdminSchedulesTab from './ClarityAdminSchedulesTab';
import ClarityAdminNewsTab from './ClarityAdminNewsTab';
import ClarityAdminCalendarTab from './ClarityAdminCalendarTab';
import ClarityAdminMemosTab from './ClarityAdminMemosTab';
import ClarityAdminSettingsTab from './ClarityAdminSettingsTab';
import ClarityAdminTeachingLoadTab from './ClarityAdminTeachingLoadTab';

const noop = () => {};
// A forgiving admin context: handlers are no-ops, flags are false, lists are
// empty; each case sets only what it needs.
const ctxOf = overrides => new Proxy({ schoolYear: '2026-2027', settings: {}, settingsStatus: 'ready', stats: {}, statsErrors: {}, ...overrides }, {
  get(target, key) {
    if (key in target) return target[key];
    if (typeof key !== 'string') return undefined;
    if (/^(fetch|set|open|close|save|delete|begin|toggle|change|scroll|select|resend|update|copy|remove|request|go|handle|archive|restore|confirm)/.test(key)) return noop;
    if (/(Loading|Error|Busy|Saving|Dirty)$/.test(key)) return false;
    if (/(s|List|Items|Rows|Grid|Logs|Events|History|Members)$/.test(key)) return [];
    return undefined;
  },
});

const groups = () => [...document.querySelectorAll('[data-skeleton]')];
const expectSkeleton = () => {
  const found = groups();
  expect(found.length).toBeGreaterThan(0);
  for (const g of found) {
    expect(g.getAttribute('aria-hidden')).toBe('true');
    expect(g.textContent.trim()).toBe('');
    expect(g.querySelector('.sk-b')).toBeTruthy();
  }
};
const hiddenText = (text, role) => {
  const el = screen.getByText(text);
  expect(el.className).toContain('x-sr');
  if (role) expect(el.getAttribute('role')).toBe(role);
  return el;
};

afterEach(() => { cleanup(); });

describe('admin tabs: skeleton while loading, gone when loaded', () => {
  it.each([
    ['Users (#4)', ClarityAdminUsersTab, { usersLoading: true }, { usersLoading: false }, 'Loading users…', 'status'],
    ['Subjects (#5)', ClarityAdminSubjectsTab, { subjectsLoading: true }, {}, 'Loading subjects…', null],
    ['Sections (#8)', ClarityAdminSectionsTab, { sectionsLoading: true }, {}, 'Loading sections…', 'status'],
    ['News (#14)', ClarityAdminNewsTab, { newsLoading: true }, {}, 'Loading posts…', 'status'],
    ['Memos (#18)', ClarityAdminMemosTab, { memosLoading: true }, {}, 'Loading memos…', 'status'],
  ])('%s', (_, Tab, loading, loaded, text, role) => {
    h.ctx = ctxOf(loading);
    const { unmount } = render(<Tab />);
    hiddenText(text, role);
    expectSkeleton();
    unmount();
    h.ctx = ctxOf(loaded);
    render(<Tab />);
    expect(screen.queryByText(text)).toBeNull();
    expect(groups()).toEqual([]);
  });

  it('Overview (#1-#3): KPI values keep "Loading…" as their text, with a bar beside it', () => {
    h.ctx = ctxOf({ overviewLoading: true, usersLoading: true });
    render(<ClarityAdminOverviewTab />);
    const values = [...document.querySelectorAll('.x-kv')];
    expect(values.length).toBe(4);
    for (const v of values) {
      expect(v.textContent).toBe('Loading…');
      expect(v.querySelector('[data-skeleton] .sk-b')).toBeTruthy();
    }
    expectSkeleton();
    cleanup();
    h.ctx = ctxOf({ stats: { users: 1, news: 0, events: 0, memos: 0 } });
    render(<ClarityAdminOverviewTab />);
    expect(groups()).toEqual([]);
  });

  it('Schedules (#10): the timetable-shaped skeleton while sections load', () => {
    h.ctx = ctxOf({ sectionsLoading: true });
    render(<ClarityAdminSchedulesTab />);
    expect(document.querySelector('[data-skeleton] .x-sch-table')).toBeTruthy();
    expectSkeleton();
  });

  it('Calendar (#15, #16): the week grid and the agenda list while events load', () => {
    h.ctx = ctxOf({ calLoading: true, calGrid: Array.from({ length: 30 }, (_, i) => ({ d: i + 1, cur: true })), calMonth: 10, calYear: 2026 });
    render(<ClarityAdminCalendarTab />);
    const shown = () => ['.x-cal-week', '.cal-agenda-day'].filter(s => document.querySelector(`[data-skeleton] ${s}`));
    const first = shown();
    expectSkeleton();
    fireEvent.click(screen.getByRole('button', { name: first.includes('.x-cal-week') ? 'Month' : 'Week' }));
    expect([...first, ...shown()].sort()).toEqual(['.cal-agenda-day', '.x-cal-week']);
    expectSkeleton();
  });

  it('Teaching Load (#6): the teacher picker keeps its status element; the rows are a skeleton', () => {
    h.ctx = ctxOf({ teachersLoading: true, teachers: [], subjects: [], teachingLoad: [] });
    render(<ClarityAdminTeachingLoadTab />);
    expect(document.querySelector('p.x-sr[role="status"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton] .x-tld-teacher').length).toBe(5);
    expectSkeleton();
  });

  it('Settings (#20): backup history keeps its status element; the list is a skeleton', () => {
    h.ctx = ctxOf({ backupHistoryStatus: 'loading', overviewLoading: true, settingsStatus: 'ready' });
    render(<ClarityAdminSettingsTab />);
    const status = document.querySelector('p.x-sr[role="status"]');
    expect(status).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton] .x-set-list').length).toBe(2);
    expectSkeleton();
  });
});
