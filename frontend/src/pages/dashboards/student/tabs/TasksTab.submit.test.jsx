// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ calls: [], graph: null, items: [], saved: [], submitError: null, pendingSubmit: null,
  itemsError: null }));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }),
}));
vi.mock('../StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    const call = { table, operation: 'read', payload: null };
    state.calls.push(call);
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, single() { return query; },
      insert(payload) { call.operation = 'insert'; call.payload = payload; return query; },
      update(payload) { call.operation = 'update'; call.payload = payload; return query; },
      upsert(payload) { call.operation = 'upsert'; call.payload = payload; return query; },
      then(resolve, reject) {
        let result = { data: null, error: null };
        if (table === 'worksheet_items') result = { data: state.itemsError ? null : state.items, error: state.itemsError };
        if (table === 'worksheet_answers' && call.operation === 'read') result = { data: state.saved, error: null };
        if (table === 'worksheet_submissions' && call.operation === 'insert') {
          result = { data: { id: 'submission-1', status: 'in_progress', released: false }, error: null };
        }
        if (table === 'worksheet_submissions' && call.operation === 'update') result = { data: null, error: state.submitError };
        const pending = table === 'worksheet_submissions' && call.operation === 'update' && state.pendingSubmit;
        return (pending || Promise.resolve(result)).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import StudentTasksTab from './TasksTab';

const TITLE = 'Submit your answers?';
const ITEMS = [
  { id: 'mc-1', position: 1, question: 'Pick one', item_type: 'multiple_choice', options: ['One', 'Two'], points: 1 },
  { id: 'id-1', position: 2, question: 'Name it', item_type: 'identification', options: [], points: 1 },
];
const ALL_SAVED = [{ item_id: 'mc-1', answer: 'One' }, { item_id: 'id-1', answer: 'Typed' }];

beforeEach(() => {
  state.calls = [];
  state.items = ITEMS;
  state.saved = [];
  state.submitError = null;
  state.pendingSubmit = null;
  state.itemsError = null;
  state.graph = { fatalError: null, assignees: [{ task_id: 'worksheet-1', section_id: 'section-1', assigned_at: null, due_at: null }],
    sheetById: new Map([['worksheet-1', { id: 'worksheet-1', title: 'Sample quiz', subject: null, subject_id: null, task_type: 'quiz' }]]),
    submissionStates: [], releasedScores: [], subjectsById: new Map(), enrolments: [] };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const openTask = async (name = 'Start') => {
  render(<MemoryRouter><StudentTasksTab /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name }));
  await screen.findByRole('button', { name: /Back/ });
};
const answered = async () => { state.saved = ALL_SAVED; await openTask(); };
const mainSubmit = () => screen.getAllByRole('button', { name: 'Submit' })[0];
const dialog = () => screen.getByRole('dialog', { name: TITLE });
const updates = () => state.calls.filter(call => call.table === 'worksheet_submissions' && call.operation === 'update');

describe('Submit button', () => {
  it('is visible and disabled while an item is unanswered, with the count', async () => {
    state.saved = [{ item_id: 'mc-1', answer: 'One' }];
    await openTask();
    expect(mainSubmit().disabled).toBe(true);
    expect(screen.getByText('1 question(s) unanswered.')).toBeTruthy();
    fireEvent.click(mainSubmit());
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(updates()).toHaveLength(0);
  });

  it('is enabled with no count line once everything is answered', async () => {
    await answered();
    expect(mainSubmit().disabled).toBe(false);
    expect(screen.queryByText(/unanswered/)).toBeNull();
  });

  it('counts whitespace as unanswered', async () => {
    state.saved = [{ item_id: 'mc-1', answer: 'One' }, { item_id: 'id-1', answer: '   ' }];
    await openTask();
    expect(mainSubmit().disabled).toBe(true);
    expect(screen.getByText('1 question(s) unanswered.')).toBeTruthy();
  });

  it('has no Submit anyway path', async () => {
    await openTask();
    fireEvent.click(mainSubmit());
    expect(screen.queryByText(/Submit anyway/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Confirm incomplete worksheet' })).toBeNull();
  });

  it('is not shown once the task is submitted, even if an item was left empty before this rule', async () => {
    state.saved = [{ item_id: 'mc-1', answer: 'One' }];
    state.graph.submissionStates = [{ id: 'submission-1', worksheet_id: 'worksheet-1', status: 'submitted', released: false }];
    await openTask('Open');
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(screen.queryByText(/unanswered/)).toBeNull();
    expect(screen.getByText('Submitted. You cannot change your answers now.')).toBeTruthy();
  });
});

describe('confirmation', () => {
  it('asks first, and warns that answers cannot change', async () => {
    await answered();
    fireEvent.click(mainSubmit());
    expect(dialog().textContent).toContain('You cannot change your answers after submitting.');
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(updates()).toHaveLength(0);
  });

  it('Cancel sends nothing and keeps the answers', async () => {
    await answered();
    fireEvent.click(mainSubmit());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(updates()).toHaveLength(0);
    expect(screen.getByRole('radio', { name: 'One' }).checked).toBe(true);
  });

  it('Escape sends nothing', async () => {
    await answered();
    fireEvent.click(mainSubmit());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(updates()).toHaveLength(0);
  });

  it('a double click sends exactly one request, and the button is disabled while sending', async () => {
    let finish;
    state.pendingSubmit = new Promise((resolve) => { finish = resolve; });
    await answered();
    fireEvent.click(mainSubmit());
    const confirm = within(dialog()).getByRole('button', { name: 'Submit' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(updates()).toHaveLength(1));
    expect(within(dialog()).getByRole('button', { name: 'Submitting…' }).disabled).toBe(true);
    expect(within(dialog()).getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeTruthy();
    await act(async () => { finish({ data: null, error: null }); });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toEqual({ status: 'submitted' });
  });

  it('a failed submit closes the step, shows the error, and keeps the answers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.submitError = { message: 'RAW-DB-TEXT' };
    await answered();
    fireEvent.click(mainSubmit());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Could not submit. Check your connection and try again.')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(document.body.textContent).not.toContain('RAW-DB-TEXT');
    expect(screen.getByRole('radio', { name: 'One' }).checked).toBe(true);
    expect(mainSubmit().disabled).toBe(false);
  });

  it('a second try after a failure can succeed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.submitError = { message: 'down' };
    await answered();
    fireEvent.click(mainSubmit());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Submit' }));
    await screen.findByText('Could not submit. Check your connection and try again.');
    state.submitError = null;
    fireEvent.click(mainSubmit());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Submitted. Your teacher will check it.')).toBeTruthy();
    expect(updates()).toHaveLength(2);
  });
});

describe('safety', () => {
  it('renders markup in a question as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    state.items = [{ ...ITEMS[0], question: `Q ${attack}`, options: [`O ${attack}`, 'Two'] }];
    await openTask();
    expect(document.body.textContent).toContain(`Q ${attack}`);
    expect(document.body.textContent).toContain(`O ${attack}`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
