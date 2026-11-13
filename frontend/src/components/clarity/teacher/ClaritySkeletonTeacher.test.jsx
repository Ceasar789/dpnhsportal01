// @vitest-environment jsdom
// L2: the teacher Clarity tabs show the shared skeleton while they load. The
// loading words stay on the same role="status" element (now visually
// hidden), the shapes sit in an aria-hidden group with no text, and the group
// is gone once the reads settle. Supabase is a fake that either never
// answers (loading) or answers with nothing (settled).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ pending: true }));

vi.mock('../../../config/supabase', () => {
  const settled = { data: [], count: 0, error: null };
  const query = () => {
    const q = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') return (res, rej) => (h.pending ? new Promise(() => {}) : Promise.resolve(settled)).then(res, rej);
        return () => q;
      },
    });
    return q;
  };
  return { supabase: { from: query, storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } } };
});
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1', name: 'Sample Teacher' } }) }));

import ClarityTeacherOverviewTab from './ClarityTeacherOverviewTab';
import ClarityTeacherStudentsTab from './ClarityTeacherStudentsTab';
import ClarityTeacherAnnouncementsTab from './ClarityTeacherAnnouncementsTab';
import ClarityTeacherGradingTab from './ClarityTeacherGradingTab';
import ClarityTeacherAttendanceTab from './ClarityTeacherAttendanceTab';
import ClarityTeacherMaterialsTab from './ClarityTeacherMaterialsTab';

const groups = () => [...document.querySelectorAll('[data-skeleton]')];
const show = Tab => render(<MemoryRouter><Tab /></MemoryRouter>);

afterEach(() => { cleanup(); h.pending = true; });

describe('teacher tabs: skeleton while loading, gone when settled', () => {
  it.each([
    ['Overview (#22, #24)', ClarityTeacherOverviewTab, 'Loading dashboard data…', '.x-kpis'],
    ['Students (#25)', ClarityTeacherStudentsTab, 'Loading student rosters…', '.x-tst-table'],
    ['Announcements (#30)', ClarityTeacherAnnouncementsTab, 'Loading announcements…', '.x-tan-list'],
    ['Grading (#27)', ClarityTeacherGradingTab, 'Loading your worksheets…', '.sk-row'],
    ['Learning Materials (#26)', ClarityTeacherMaterialsTab, 'Loading learning materials…', '.x-tlm-grid'],
  ])('%s', async (_, Tab, text, shape) => {
    show(Tab);
    const status = await screen.findByText(text);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.className).toContain('x-sr');
    await waitFor(() => expect(document.querySelector(`[data-skeleton]${shape}, [data-skeleton] ${shape}`)).toBeTruthy());
    for (const g of groups()) {
      expect(g.getAttribute('aria-hidden')).toBe('true');
      expect(g.textContent.trim()).toBe('');
    }
    cleanup();
    h.pending = false;
    show(Tab);
    await waitFor(() => expect(screen.queryByText(text)).toBeNull());
    expect(groups()).toEqual([]);
  });

  it('Overview: the three list cards keep their words, hidden, beside row skeletons', async () => {
    show(ClarityTeacherOverviewTab);
    for (const text of ['Loading classes…', 'Loading AI activity…', 'Loading lesson plans…']) {
      expect((await screen.findByText(text)).className).toBe('x-sr');
    }
    expect(document.querySelector('[data-skeleton] .x-tov-day')).toBeTruthy();
    expect(document.querySelector('[data-skeleton] .x-tov-facts')).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton] .x-kpis > .x-kpi').length + document.querySelectorAll('[data-skeleton].x-kpis > .x-kpi').length).toBe(4);
  });

  it('Attendance (#29): the roster skeleton uses disabled, unfocusable status buttons', async () => {
    show(ClarityTeacherAttendanceTab);
    const status = await screen.findByText('Loading attendance…');
    expect(status.getAttribute('role')).toBe('status');
    const buttons = [...document.querySelectorAll('[data-skeleton] .x-pst button')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.disabled).toBe(true);
      expect(b.tabIndex).toBe(-1);
    }
  });
});
