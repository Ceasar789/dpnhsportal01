// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// reread: the row read back after submit (null = not found, 'error' = failed read,
// 'throw' = the request throws). score: the released score read. mode: worksheets.checking_mode.
const state = vi.hoisted(() => ({ calls: [], graph: null, items: [], saved: [], reread: null, score: null, mode: 'auto', refresh: null }));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }),
}));
vi.mock('../StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: state.refresh }),
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    const call = { table, operation: 'read', select: null, eq: {} };
    state.calls.push(call);
    const query = {
      select(fields) { call.select = fields; return query; },
      eq(column, value) { call.eq[column] = value; return query; },
      order() { return query; }, single() { return query; },
      insert(payload) { call.operation = 'insert'; call.payload = payload; return query; },
      update(payload) { call.operation = 'update'; call.payload = payload; return query; },
      upsert(payload) { call.operation = 'upsert'; call.payload = payload; return query; },
      then(resolve, reject) {
        let result = { data: null, error: null };
        if (table === 'worksheet_items') result = { data: state.items, error: null };
        if (table === 'worksheet_answers' && call.operation === 'read') result = { data: state.saved, error: null };
        if (table === 'worksheets') result = { data: { checking_mode: state.mode }, error: null };
        if (table === 'worksheet_submissions' && call.operation === 'insert') {
          result = { data: { id: 'submission-1', worksheet_id: 'worksheet-1', status: 'in_progress', released: false }, error: null };
        }
        if (table === 'worksheet_submissions' && call.operation === 'read') {
          if (state.reread === 'throw') return Promise.reject(new Error('Failed to fetch')).then(resolve, reject);
          if (call.eq.released === true) result = { data: state.score, error: null };
          else result = state.reread === 'error' ? { data: null, error: { message: 'down' } } : { data: state.reread, error: null };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import StudentTasksTab from './TasksTab';
import { SUBMISSION_STATE_FIELDS } from '../../../../lib/studentTaskGraph';

const MC = { id: 'mc-1', position: 1, question: 'Pick one', item_type: 'multiple_choice', options: ['One', 'Two'], points: 1 };
const ESSAY = { id: 'es-1', position: 2, question: 'Explain', item_type: 'essay', options: null, points: 3,
  essay_min_sentences: 3, essay_min_words: 50 };
const sheet = { id: 'worksheet-1', title: 'Sample quiz', subject: null, subject_id: null, task_type: 'quiz' };
const setGraph = (submissionStates = [], releasedScores = []) => {
  state.graph = { fatalError: null, assignees: [{ task_id: 'worksheet-1', section_id: 'section-1', assigned_at: null, due_at: null }],
    sheetById: new Map([['worksheet-1', sheet]]), submissionStates, releasedScores, subjectsById: new Map(), enrolments: [] };
};
const row = fields => ({ id: 'submission-1', worksheet_id: 'worksheet-1', status: 'submitted', released: false, ...fields });

beforeEach(() => {
  Object.assign(state, { calls: [], items: [MC], saved: [{ item_id: 'mc-1', answer: 'One' }], reread: row(), score: null,
    mode: 'auto', refresh: vi.fn() });
  setGraph();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const openTask = async () => {
  render(<MemoryRouter><StudentTasksTab /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  await screen.findByRole('button', { name: /Back/ });
};
const submitAll = async () => {
  await openTask();
  fireEvent.click(screen.getAllByRole('button', { name: 'Submit' })[0]);
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Submit your answers?' })).getByRole('button', { name: 'Submit' }));
};
const submissionReads = () => state.calls.filter(call => call.table === 'worksheet_submissions' && call.operation === 'read');
const withEssay = () => {
  state.items = [MC, ESSAY];
  state.saved = [{ item_id: 'mc-1', answer: 'One' }, { item_id: 'es-1', answer: 'A long answer.' }];
};

describe('the essay rule on the paper', () => {
  it('shows the requirement under an essay with a rule only', async () => {
    state.items = [MC, ESSAY, { ...ESSAY, id: 'es-2', position: 3, essay_min_sentences: null, essay_min_words: null },
      { ...ESSAY, id: 'es-3', position: 4, essay_min_sentences: null, essay_min_words: 40 }];
    await openTask();
    expect(screen.getAllByText('Write at least 3 sentences and 50 words.')).toHaveLength(1);
    expect(screen.getAllByText('Write at least 40 words.')).toHaveLength(1);
    expect(screen.getAllByText(/^Write at least/)).toHaveLength(2);
    expect(state.calls.find(call => call.table === 'worksheet_items').select).toContain('essay_min_sentences, essay_min_words');
  });
});

describe('the toast after submitting', () => {
  it('released with a score names the score', async () => {
    state.reread = row({ status: 'checked', released: true });
    state.score = { score: 4, total_points: 5 };
    await submitAll();
    expect(await screen.findByText('Submitted. Your score: 4/5.')).toBeTruthy();
    expect(submissionReads().at(-1).eq).toEqual({ id: 'submission-1', student_id: 'student-1', released: true });
    expect(state.refresh).toHaveBeenCalled();
  });

  it('not released says the teacher will check the answers, and reads no score', async () => {
    await submitAll();
    expect(await screen.findByText('Submitted. Your teacher will check your answers.')).toBeTruthy();
    expect(submissionReads().some(call => /score/.test(call.select))).toBe(false);
    expect(state.refresh).toHaveBeenCalled();
  });

  it('Auto with an essay says the teacher will check the essay questions, and reads no score', async () => {
    withEssay();
    await submitAll();
    expect(await screen.findByText('Submitted. Your teacher will check the essay questions.')).toBeTruthy();
    expect(submissionReads().some(call => /score/.test(call.select))).toBe(false);
  });

  it('Manual with an essay says the teacher will check the answers', async () => {
    withEssay();
    state.mode = 'manual';
    await submitAll();
    expect(await screen.findByText('Submitted. Your teacher will check your answers.')).toBeTruthy();
  });

  it.each([['fails', 'error'], ['throws', 'throw'], ['finds nothing', null]])(
    'if the re-read %s it says "Submitted." and still refreshes the list', async (_name, reread) => {
      state.reread = reread;
      await submitAll();
      expect(await screen.findByText('Submitted.')).toBeTruthy();
      expect(state.refresh).toHaveBeenCalled();
    });
});

describe('the Tasks list', () => {
  const showList = async () => { render(<MemoryRouter><StudentTasksTab /></MemoryRouter>); await screen.findByText('Sample quiz'); };

  it('a released submission shows "Score: x/y"', async () => {
    setGraph([row({ status: 'checked', released: true })], [{ worksheet_id: 'worksheet-1', score: 7, total_points: 10 }]);
    await showList();
    expect(screen.getByText('Score: 7/10')).toBeTruthy();
    expect(screen.queryByText('Submitted — awaiting result')).toBeNull();
  });

  it.each([['not released', row()], ['an essay task scored provisionally', row({ status: 'checked' })]])(
    '%s shows "Submitted — awaiting result" and no score', async (_name, submission) => {
      setGraph([submission], [{ worksheet_id: 'worksheet-1', score: 7, total_points: 10 }]);
      await showList();
      expect(screen.getByText('Submitted — awaiting result')).toBeTruthy();
      expect(screen.queryByText(/7\/10|7 \/ 10/)).toBeNull();
    });
});

describe('Submitted late tag', () => {
  const showList = async () => { render(<MemoryRouter><StudentTasksTab /></MemoryRouter>); await screen.findByText('Sample quiz'); };

  it('the student reads is_late and submitted_at with the submission state, and never a score there', () => {
    expect(SUBMISSION_STATE_FIELDS).toBe('id, worksheet_id, status, released, is_late, submitted_at');
    expect(SUBMISSION_STATE_FIELDS).not.toMatch(/score|total_points/);
  });

  it.each([
    ['a late submitted task', row({ is_late: true, submitted_at: '2030-03-10T14:05:00' })],
    ['a late released task', row({ status: 'checked', released: true, is_late: true })],
  ])('%s shows it next to the status', async (_name, submission) => {
    setGraph([submission], submission.released ? [{ worksheet_id: 'worksheet-1', score: 7, total_points: 10 }] : []);
    await showList();
    expect(screen.getByText('Submitted late')).toBeTruthy();
  });

  it.each([
    ['on time', row({ is_late: false })],
    ['with no flag', row()],
    ['still in progress', row({ status: 'in_progress', is_late: true })],
  ])('a task %s does not show it', async (_name, submission) => {
    setGraph([submission]);
    await showList();
    expect(screen.queryByText('Submitted late')).toBeNull();
  });
});
