// @vitest-environment jsdom
// L2: the student Clarity tabs show the shared skeleton while they load. The
// loading words stay on the same element (same role, same text, now visually
// hidden), the shapes sit in an aria-hidden group with no text, and the group
// is gone once the data is there.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ pending: true, loading: true, graph: null }));

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'stu-1', name: 'Sample Student' } }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: q => q() }));
vi.mock('../../../pages/dashboards/student/hooks', async orig => ({ ...(await orig()), useToast: () => ({ showToast: () => {}, Toast: () => null }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => {
  const { createContext } = await import('react');
  return {
    default: createContext({ graph: { enrolments: [{ section_id: 'sec-1', sections: { name: 'Mabini' } }] } }),
    useStudentData: () => ({ graph: h.graph, loading: h.loading, refresh: null }),
  };
});
vi.mock('../../../config/supabase', () => ({ supabase: { from() {
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
    ? (ok, bad) => (h.pending ? new Promise(() => {}) : Promise.resolve({ data: [], error: null })).then(ok, bad)
    : () => q) });
  return q;
} } }));

import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';
import ClarityScoresTab from './ClarityScoresTab';
import ClarityStudentAttendanceTab from './ClarityStudentAttendanceTab';
import ClarityStudentAnnouncementsTab from './ClarityStudentAnnouncementsTab';

const groups = () => [...document.querySelectorAll('[data-skeleton]')];
const show = Tab => render(<MemoryRouter><Tab /></MemoryRouter>);
const noTextInGroups = () => {
  expect(groups().length).toBeGreaterThan(0);
  for (const g of groups()) {
    expect(g.getAttribute('aria-hidden')).toBe('true');
    expect(g.textContent.trim()).toBe('');
  }
};

afterEach(() => { cleanup(); Object.assign(h, { pending: true, loading: true, graph: null }); });

describe('student tabs: skeleton while loading, gone when loaded', () => {
  it('Overview (#32, #34, #35): tiles still read "Loading…"; the bars and subject cards are skeletons', () => {
    show(ClarityStudentOverviewTab);
    const tiles = within(screen.getByRole('region', { name: 'Your progress' }));
    expect(tiles.getAllByText('Loading…')).toHaveLength(3);
    for (const t of tiles.getAllByText('Loading…')) expect(t.className).toBe('x-sr');
    const scores = screen.getByText('Loading your scores…');
    expect([scores.getAttribute('role'), scores.className]).toEqual(['status', 'x-sr']);
    const subjects = screen.getByText('Loading your subjects…');
    expect([subjects.getAttribute('role'), subjects.className]).toEqual(['status', 'x-sr']);
    expect(document.querySelector('[data-skeleton].x-sov-bars .x-rank')).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton].x-grid3 > .x-card').length).toBe(3);
    noTextInGroups();
  });

  it('Scores (#37): the score-card grid while loading, nothing once loaded', () => {
    show(ClarityScoresTab);
    expect(screen.getByRole('status').textContent).toBe('Loading your scores…');
    expect(document.querySelectorAll('[data-skeleton].x-sc-grid > .x-sc-card').length).toBe(4);
    noTextInGroups();
    cleanup();
    Object.assign(h, { loading: false, graph: { enrolments: [], worksheets: [], submissions: [], scores: [], subjects: [] } });
    show(ClarityScoresTab);
    expect(screen.queryByText('Loading your scores…')).toBeNull();
    expect(groups()).toEqual([]);
  });

  it('Attendance (#38, #39): the month grid and the rate card while loading, gone when settled', async () => {
    show(ClarityStudentAttendanceTab);
    const status = await screen.findByText('Loading your attendance…');
    expect([status.getAttribute('role'), status.className]).toEqual(['status', 'x-sr']);
    expect(document.querySelector('[data-skeleton] .x-sat-grid')).toBeTruthy();
    expect(document.querySelector('[data-skeleton] .x-sat-ring')).toBeTruthy();
    noTextInGroups();
    cleanup();
    h.pending = false;
    show(ClarityStudentAttendanceTab);
    await waitFor(() => expect(screen.queryByText('Loading your attendance…')).toBeNull());
    expect(groups()).toEqual([]);
  });

  it('Announcements (#40): post cards while loading, gone when settled', async () => {
    show(ClarityStudentAnnouncementsTab);
    const status = await screen.findByText('Loading announcements…');
    expect([status.getAttribute('role'), status.className]).toEqual(['status', 'x-sr']);
    expect(document.querySelectorAll('[data-skeleton].x-san-list > .x-san-item').length).toBe(3);
    noTextInGroups();
    cleanup();
    h.pending = false;
    show(ClarityStudentAnnouncementsTab);
    await waitFor(() => expect(screen.queryByText('Loading announcements…')).toBeNull());
    expect(groups()).toEqual([]);
  });
});
