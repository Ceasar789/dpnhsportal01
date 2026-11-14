// @vitest-environment jsdom
// S3: TasksTab with file/link tasks (submission_mode = 'attachment'), and proof
// that answers worksheets, quizzes, handouts and rows without the column behave
// exactly as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ calls: [], graph: null, items: [], guard: null, panelProps: null }));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }),
}));
vi.mock('../StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    const call = { table, operation: 'read' };
    state.calls.push(call);
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, single() { return query; },
      insert() { call.operation = 'insert'; return query; },
      then(resolve, reject) {
        let result = { data: null, error: null };
        if (table === 'worksheet_items') result = { data: state.items, error: null };
        if (table === 'worksheet_answers') result = { data: [], error: null };
        if (table === 'worksheet_submissions') result = { data: { id: 'submission-1', status: 'in_progress', released: false }, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } },
}));
// The panel has its own tests; here it only records what TasksTab hands it.
vi.mock('../submissions/YourWorkPanel', () => ({
  default: (props) => {
    state.panelProps = props;
    return <section aria-label="Your work" />;
  },
}));

import StudentTasksTab from './TasksTab';
import { isAttachmentTask, isHandout } from './studentAnswers';
import { groupOf, groupTasks } from '../taskGroups';

const FUTURE_DUE = '2099-01-15T23:59:00';
const activity = { id: 'task-1', title: 'Poster', subject: 'Science', subject_id: null, task_type: 'worksheet', items: 0,
  instructions: 'Make a poster about the water cycle.', submission_mode: 'attachment', max_points: 10 };
const handout = { ...activity, submission_mode: 'answers' };
// A row read before the columns existed: no submission_mode, no max_points.
const noColumn = { id: 'task-1', title: 'Poster', subject: 'Science', subject_id: null, task_type: 'worksheet', items: 0,
  instructions: 'Make a poster about the water cycle.' };

const setGraph = (sheet, submission = null, score = null) => {
  state.graph = { fatalError: null, assignees: [{ task_id: 'task-1', section_id: 'section-1', assigned_at: null, due_at: FUTURE_DUE }],
    sheetById: new Map([['task-1', sheet]]), submissionStates: submission ? [{ worksheet_id: 'task-1', ...submission }] : [],
    releasedScores: score ? [{ worksheet_id: 'task-1', ...score }] : [], subjectsById: new Map(), enrolments: [] };
};
const show = () => render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
const card = async () => (await screen.findByText('Poster')).closest('.rounded-xl');
const openRow = async (name = 'Open') => {
  show();
  fireEvent.click(await screen.findByRole('button', { name }));
  await screen.findByRole('button', { name: /Back/ });
};
const inserts = () => state.calls.filter(c => c.table === 'worksheet_submissions' && c.operation === 'insert');
const reads = table => state.calls.filter(c => c.table === table);

beforeEach(() => { state.calls = []; state.items = []; state.panelProps = null; setGraph(activity); });
afterEach(() => cleanup());

describe('an attachment task in the list', () => {
  it('an Activity: Activity, Assigned, Open (not Start)', async () => {
    show();
    const c = await card();
    expect(within(c).getByText('Activity')).toBeTruthy();
    expect(within(c).getByText('Assigned')).toBeTruthy();
    expect(within(c).getByRole('button', { name: 'Open' })).toBeTruthy();
    expect(within(c).queryByText('Not started')).toBeNull();
  });

  it('an Assignment keeps its type label', async () => {
    setGraph({ ...activity, task_type: 'assignment' });
    show();
    expect(within(await card()).getByText('Assignment')).toBeTruthy();
  });

  it.each([
    [{ id: 's', status: 'submitted', released: false, is_late: false }, null, 'Turned in'],
    [{ id: 's', status: 'checked', released: false, is_late: false }, null, 'Graded'],
    [{ id: 's', status: 'checked', released: true, is_late: false }, { score: 9, total_points: 10 }, 'Returned'],
  ])('status %j reads %s', async (submission, score, label) => {
    setGraph(activity, submission, score);
    show();
    expect(within(await card()).getByText(label)).toBeTruthy();
  });

  it('a late turn-in keeps the existing Submitted late badge', async () => {
    setGraph(activity, { id: 's', status: 'submitted', released: false, is_late: true });
    show();
    expect(within(await card()).getByText('Submitted late')).toBeTruthy();
  });

  it('counts as work to do (not an Activity handout), and as done once turned in', () => {
    const row = { assignee: { due_at: FUTURE_DUE }, sheet: activity, submission: null };
    expect(groupOf(row)).toBe('upcoming');
    expect(groupOf({ ...row, assignee: { due_at: null } })).toBe('todo');
    expect(groupTasks([row], new Date()).activities).toHaveLength(0);
    expect(groupOf({ ...row, sheet: handout })).toBe('activities');
    const turned = { ...row, submission: { status: 'submitted', released: false } };
    expect(groupTasks([turned], new Date()).done).toHaveLength(1);
  });
});

describe('opening an attachment task', () => {
  it('shows the paper, the message and the Your work panel; no submission insert, no answers read, no Submit', async () => {
    await openRow();
    expect(screen.getByRole('heading', { name: 'ACTIVITY' })).toBeTruthy();
    expect(screen.getByText('Add your work below, then turn it in.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Your work' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(screen.queryByText('Score:')).toBeNull();
    expect(inserts()).toHaveLength(0);
    expect(reads('worksheet_answers')).toHaveLength(0);
    expect(state.panelProps.row.sheet).toBe(activity);
    expect(state.panelProps.row.assignee.section_id).toBe('section-1');
  });

  it('an Assignment paper is headed ASSIGNMENT', async () => {
    setGraph({ ...activity, task_type: 'assignment' });
    await openRow();
    expect(screen.getByRole('heading', { name: 'ASSIGNMENT' })).toBeTruthy();
  });

  it('Back asks the panel first, and only leaves when it allows', async () => {
    await openRow();
    let proceed;
    act(() => { state.panelProps.registerLeaveGuard((action) => { proceed = action; }); });
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByRole('region', { name: 'Your work' })).toBeTruthy();
    act(() => { proceed(); });
    expect(await screen.findByText('Poster')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your work' })).toBeNull();
  });

  it('real questions win: a stale zero opens as a normal worksheet with no panel', async () => {
    state.items = [{ id: 'i1', position: 1, question: 'Q?', item_type: 'identification', points: 1 }];
    await openRow();
    expect(screen.queryByRole('region', { name: 'Your work' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });
});

describe('no change for everything else', () => {
  it.each([
    ['submission_mode "answers"', handout],
    ['no submission_mode column (older data)', noColumn],
  ])('a handout with %s is still a handout: Activity, Open, no panel, no Submit', async (_name, sheet) => {
    setGraph(sheet);
    expect(isHandout(sheet)).toBe(true);
    expect(isAttachmentTask(sheet)).toBe(false);
    await openRow();
    expect(screen.getByText("This is an activity. Follow your teacher's directions.")).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your work' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(inserts()).toHaveLength(0);
  });

  it.each([
    ['an answers worksheet', { ...noColumn, items: 2, instructions: null }],
    ['a quiz', { ...noColumn, task_type: 'quiz', items: 2 }],
    ['an exam', { ...noColumn, task_type: 'exam', items: 2, submission_mode: 'answers' }],
  ])('%s: Start and Not started as before; opening inserts the submission and shows Submit', async (_name, sheet) => {
    setGraph(sheet);
    state.items = [{ id: 'i1', position: 1, question: 'Q?', item_type: 'identification', points: 1 }];
    show();
    const c = await card();
    expect(within(c).getByText('Not started')).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: 'Submit' })).toBeTruthy();
    expect(inserts()).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Your work' })).toBeNull();
  });

  it('isAttachmentTask is only the explicit mode', () => {
    expect(isAttachmentTask({ submission_mode: 'attachment' })).toBe(true);
    for (const sheet of [{}, null, undefined, { submission_mode: 'answers' }, { submission_mode: 'ATTACHMENT' }]) {
      expect(isAttachmentTask(sheet)).toBe(false);
    }
  });
});
