// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, loadError: false }));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }),
}));
vi.mock('../StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from() { throw new Error('no reads expected'); } } }));

import StudentTasksTab from './TasksTab';

const sheet = (id, extra = {}) => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id: 'eng', task_type: 'quiz',
  items: 5, instructions: 'Answer.', ...extra });
const PAST = '2000-01-15T23:59:00';
const FUTURE = '2099-01-15T23:59:00';
const setTasks = (tasks) => {
  state.graph = {
    fatalError: state.loadError ? { message: 'offline' } : null, enrolments: [],
    assignees: tasks.map(t => ({ task_id: t.sheet.id, section_id: 's1', assigned_at: null, due_at: t.due ?? null })),
    sheetById: new Map(tasks.map(t => [t.sheet.id, t.sheet])),
    submissionStates: tasks.filter(t => t.submission).map(t => ({ worksheet_id: t.sheet.id, ...t.submission })),
    releasedScores: [], subjectsById: new Map([['eng', 'English'], ['math', 'Math']]),
  };
};
const tasks = [
  { sheet: sheet('overdue'), due: PAST },
  { sheet: sheet('nodue') },
  { sheet: sheet('later'), due: FUTURE },
  { sheet: sheet('math-later', { subject_id: 'math' }), due: FUTURE },
  { sheet: sheet('handed', { subject_id: 'math' }), due: FUTURE, submission: { id: 'x', status: 'submitted', released: false } },
  { sheet: sheet('act', { task_type: 'worksheet', items: 0, instructions: 'Do this.' }), due: FUTURE },
];

const seen = {};
const Where = () => {
  const current = useLocation();
  useEffect(() => { seen.search = current.search; });
  return null;
};
const show = (entry = '/') => render(<MemoryRouter initialEntries={[entry]}><StudentTasksTab /><Where /></MemoryRouter>);
const chip = name => screen.getByRole('button', { name: new RegExp(`^${name} \\(`) });
const titles = () => screen.queryAllByText(/^Task /).map(el => el.textContent);

beforeEach(() => { state.loadError = false; setTasks(tasks); });
afterEach(() => cleanup());

describe('task view chips', () => {
  it('defaults to All (design p9), with counts on every chip', () => {
    show();
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    expect(chip('All').textContent).toBe('All (6)');
    expect(chip('Pending').textContent).toBe('Pending (4)');
    expect(chip('Submitted').textContent).toBe('Submitted (1)');
    expect(chip('Graded').textContent).toBe('Graded (0)');
    expect(titles()).toHaveLength(6);
    expect(chip('All').className).toContain('min-h-11');
  });

  it('marks overdue rows Overdue, never-started ones also Missing, and keeps the row content', () => {
    show('/?view=pending');
    const overdueRow = screen.getByText('Task overdue').closest('.p-4');
    expect(within(overdueRow).getByText('Overdue')).toBeTruthy();
    expect(within(overdueRow).getByText('Missing')).toBeTruthy();
    expect(within(overdueRow).getByText(/^Late by/)).toBeTruthy();
    expect(within(overdueRow).getByText('Not started')).toBeTruthy();
    expect(within(overdueRow).getByRole('button', { name: 'Start' })).toBeTruthy();
    expect(within(screen.getByText('Task nodue').closest('.p-4')).queryByText('Overdue')).toBeNull();
  });

  it('switches views with the chips and keeps the choice in the URL', () => {
    show();
    fireEvent.click(chip('Submitted'));
    expect(chip('Submitted').getAttribute('aria-pressed')).toBe('true');
    expect(chip('All').getAttribute('aria-pressed')).toBe('false');
    expect(titles()).toEqual(['Task handed']);
    expect(screen.getByText('Submitted — awaiting result')).toBeTruthy();
    expect(screen.getByText('Pending teacher review')).toBeTruthy();
    expect(seen.search).toBe('?view=submitted');
    fireEvent.click(chip('Graded'));
    expect(titles()).toEqual([]);
    expect(screen.getByText('No graded work yet.')).toBeTruthy();
    fireEvent.click(chip('All'));
    expect(titles()).toHaveLength(6);
  });

  it('combines with ?subject=, and an old ?view= value still opens the matching view', () => {
    show('/?subject=math&view=upcoming');
    expect(chip('Pending').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Pending').textContent).toBe('Pending (1)');
    expect(chip('Submitted').textContent).toBe('Submitted (1)');
    expect(chip('Graded').textContent).toBe('Graded (0)');
    expect(chip('All').textContent).toBe('All (2)');
    expect(titles()).toEqual(['Task math-later']);
    fireEvent.click(chip('Graded'));
    expect(screen.getByText('No graded work yet.')).toBeTruthy();
    expect(new URLSearchParams(seen.search).get('subject')).toBe('math');
    expect(new URLSearchParams(seen.search).get('view')).toBe('graded');
  });
  it('a failed load shows the error, not chips with zeros', () => {
    state.loadError = true;
    setTasks(tasks);
    show();
    expect(screen.getByText('Could not load your tasks.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Filter tasks' })).toBeNull();
    expect(screen.queryByText(/\(0\)/)).toBeNull();
  });
});
