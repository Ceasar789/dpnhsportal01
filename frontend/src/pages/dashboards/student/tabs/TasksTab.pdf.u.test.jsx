// @vitest-environment jsdom
// U-PDF-S (design p9, p22): with `pdf` (the Clarity route) the Tasks list is one
// card of rows: icon, title, "Subject · Assigned …" plus the type and finer
// status, a due pill, a status pill (Pending, Submitted, Graded, Missing,
// Overdue) and "Open" on every task; the open task gets a title line, the
// Assigned / Turned in / Marked steps and a Details card. Without `pdf` the
// classic rows are unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from() {
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then' ? (ok, bad) => Promise.resolve({ data: [], error: null }).then(ok, bad) : () => q) });
  return q;
} } }));
vi.mock('../submissions/YourWorkPanel', () => ({ default: () => <section aria-label="Your work">panel</section> }));

import StudentTasksTab from './TasksTab';
import { taskRowPills } from '../taskGroups';

// 10:00 AM Wed 25 Nov 2026 in Manila.
const NOW = new Date('2026-11-25T02:00:00Z');
const sheet = (id, extra = {}) => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id: 'eng', task_type: 'quiz', items: 5, instructions: 'Answer.', checking_mode: 'manual', max_points: 10, ...extra });
const TASKS = [
  { sheet: sheet('today'), due: '2026-11-25T17:00:00' },
  { sheet: sheet('later'), due: '2026-11-28T17:00:00' },
  { sheet: sheet('missing'), due: '2026-11-20T17:00:00' },
  { sheet: sheet('late-started'), due: '2026-11-20T17:00:00', submission: { id: 's1', status: 'in_progress' } },
  { sheet: sheet('handed'), due: '2026-11-28T17:00:00', submission: { id: 's2', status: 'submitted', released: false, is_late: true } },
  { sheet: sheet('graded', { checking_mode: 'auto' }), due: '2026-11-20T17:00:00', submission: { id: 's3', status: 'checked', released: true, score: 9, total_points: 10 } },
  { sheet: sheet('upload', { task_type: 'worksheet', submission_mode: 'attachment', items: 0, subject_id: 'math' }), due: '2026-11-28T17:00:00' },
];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.graph = {
    fatalError: null,
    enrolments: [{ section_id: 's1', sections: { name: 'Rizal', grade_level: '8', school_year: '2026-2027' } }],
    assignees: TASKS.map(t => ({ task_id: t.sheet.id, section_id: 's1', assigned_at: '2026-11-18T08:00:00', due_at: t.due })),
    sheetById: new Map(TASKS.map(t => [t.sheet.id, t.sheet])),
    submissionStates: TASKS.filter(t => t.submission).map(t => ({ worksheet_id: t.sheet.id, ...t.submission })),
    releasedScores: [], subjectsById: new Map([['eng', 'English'], ['math', 'Mathematics']]),
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = (pdf = true) => render(<MemoryRouter><StudentTasksTab pdf={pdf} /></MemoryRouter>);
const row = title => screen.getByText(title, { selector: '.x-stk-title' }).closest('li');
const pills = title => [...row(title).querySelectorAll('.x-stk-pill')].map(p => [p.textContent, p.className.replace('x-stk-pill', '').trim()]);

describe('U-PDF-S pills (taskRowPills)', () => {
  it('due pill and status pill for every state', () => {
    const rows = TASKS.map(t => ({ sheet: t.sheet, assignee: { due_at: t.due }, submission: t.submission || null }));
    expect(rows.map(r => taskRowPills(r, NOW))).toEqual([
      { due: { tone: 'wa', text: 'Due today' }, status: { tone: 'wa', text: 'Pending' } },
      { due: { tone: '', text: 'Due Nov 28' }, status: { tone: 'wa', text: 'Pending' } },
      { due: { tone: 'er', text: 'Missing' }, status: { tone: 'er', text: 'Overdue' } },
      { due: { tone: '', text: 'Due Nov 20' }, status: { tone: 'er', text: 'Overdue' } },
      { due: null, status: { tone: 'in', text: 'Submitted' } },
      { due: null, status: { tone: 'ok', text: 'Graded' } },
      { due: { tone: '', text: 'Due Nov 28' }, status: { tone: 'wa', text: 'Pending' } },
    ]);
  });
});

describe('U-PDF-S Tasks rows (design p9)', () => {
  it('one card of rows; subtitle as the design; tabs carry a count bubble', () => {
    show();
    expect(screen.getByText('Worksheets and activities from your teachers')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Tasks' }).children).toHaveLength(7);
    expect(screen.getByRole('button', { name: /^All/ }).querySelector('.x-stk-n').textContent).toBe('7');
  });

  it('each row: title, the grey detail line with type and finer status, the two pills, and Open', () => {
    show();
    expect(pills('Task today')).toEqual([['Due today', 'wa'], ['Pending', 'dot wa']]);
    expect(pills('Task missing')).toEqual([['Missing', 'er'], ['Overdue', 'dot er']]);
    expect(pills('Task handed')).toEqual([['Submitted', 'dot in']]);
    expect(pills('Task graded')).toEqual([['Graded', 'dot ok']]);
    expect(row('Task today').querySelector('.x-stk-meta').textContent).toBe('English · Assigned Nov 18 · Quiz · Not started');
    expect(row('Task handed').querySelector('.x-stk-meta').textContent).toBe('English · Assigned Nov 18 · Quiz · Submitted — awaiting result · Submitted late · Pending teacher review');
    expect(row('Task graded').querySelector('.x-stk-meta').textContent).toBe('English · Assigned Nov 18 · Quiz · Score: 9/10 · Checked automatically');
    for (const title of TASKS.map(t => t.sheet.title)) {
      expect(within(row(title)).getByRole('button', { name: `Open ${title}` })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull();
  });

  it('without pdf (classic shell) the rows are the classic ones', () => {
    show(false);
    expect(screen.queryByRole('list', { name: 'Tasks' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Work your teachers have assigned to you.')).toBeTruthy();
  });
});

describe('U-PDF-S open task (design p22)', () => {
  it('title and meta line, the steps, Details, and Back to Tasks', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Open Task upload' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Task upload' })).toBeTruthy();
    expect(screen.getByText('Mathematics · 10 points · Due Nov 28, 2026, 5:00 PM')).toBeTruthy();
    const steps = screen.getByRole('list', { name: 'Progress' });
    expect([...steps.children].map(li => [li.textContent, li.getAttribute('aria-current')])).toEqual([['Assigned, in progress', 'step'], ['Turned in, not yet', null], ['Marked, not yet', null]]);
    const details = screen.getByRole('region', { name: 'Details' });
    expect([...details.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent])).toEqual([
      ['Section', 'Grade 8 – Rizal'], ['Checking', 'By teacher'], ['Due', 'Nov 28, 2026, 5:00 PM']]);
    expect(screen.getByRole('region', { name: 'Your work' }).parentElement.className).toBe('x-std-work');
    expect(screen.getByRole('button', { name: '‹ Back to Tasks' })).toBeTruthy();
  });
});
