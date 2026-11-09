// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, itemsError: null, itemReads: 0 }));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }),
}));
vi.mock('../StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, single() { return query; },
      insert() { return query; },
      then(resolve, reject) {
        let result = { data: null, error: null };
        if (table === 'worksheet_items') {
          state.itemReads += 1;
          result = state.itemsError ? { data: null, error: state.itemsError } : { data: [], error: null };
        }
        if (table === 'worksheets') result = { data: { id: 'w1', instructions: 'Read.', sections: null }, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import StudentTasksTab from './TasksTab';

const activity = { id: 'w1', title: 'Conflict map', subject: 'English', subject_id: null, task_type: 'worksheet',
  items: 0, instructions: 'Find the conflict.' };
const setSheet = (sheet, assignee = {}) => {
  state.graph = { fatalError: null, enrolments: [], submissionStates: [], releasedScores: [], subjectsById: new Map(),
    assignees: [{ task_id: sheet.id, section_id: 's1', assigned_at: null, due_at: '2099-01-15T23:59:00', ...assignee }],
    sheetById: new Map([[sheet.id, sheet]]) };
};
const show = () => render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);

beforeEach(() => { state.itemsError = null; state.itemReads = 0; setSheet(activity); });
afterEach(() => cleanup());

describe('Tasks header', () => {
  it('has a plain h1 and a 44px Refresh button', async () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh tasks' }).className).toContain('w-11 h-11');
    expect((await screen.findByRole('button', { name: 'Open' })).className).toContain('min-h-11');
  });
});

describe('Manila due and assigned dates', () => {
  it('shows the naive due_at as Manila wall-clock time', async () => {
    setSheet(activity, { due_at: '2099-01-15T23:59:00', assigned_at: '2099-01-10T01:00:00+00:00' });
    show();
    await screen.findByRole('button', { name: 'Open' });
    expect(screen.getByText(/^Due /).textContent.trim()).toBe('Due Jan 15, 2099, 11:59 PM');
    expect(screen.getByText(/^Assigned /).textContent.trim()).toBe('Assigned Jan 10, 2099');
  });
});

describe('Activity badge', () => {
  it('a teacher Activity (worksheet with no questions) reads Activity once, never Worksheet', async () => {
    show();
    await screen.findByRole('button', { name: 'Open' });
    expect(screen.getAllByText('Activity')).toHaveLength(1);
    expect(screen.queryByText('Worksheet')).toBeNull();
  });

  it('a worksheet with questions keeps its Worksheet badge and status', async () => {
    setSheet({ ...activity, items: 5 });
    show();
    await screen.findByRole('button', { name: 'Start' });
    expect(screen.getByText('Worksheet')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.queryByText('Activity')).toBeNull();
  });
});

describe('a task that fails to open', () => {
  it('shows an inline error with Retry, and Retry opens it', async () => {
    state.itemsError = { message: 'offline' };
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    const alert = await screen.findByText(/Could not open/);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('Could not open “Conflict map”.');
    const card = alert.parentElement;
    state.itemsError = null;
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    await screen.findByRole('button', { name: /Back/ });
    expect(state.itemReads).toBe(2);
  });
});
