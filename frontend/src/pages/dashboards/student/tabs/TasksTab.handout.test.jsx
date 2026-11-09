// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ calls: [], graph: null, items: [], itemsError: null }));

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
        if (table === 'worksheet_items') result = { data: state.itemsError ? null : state.items, error: state.itemsError };
        if (table === 'worksheet_answers') result = { data: [], error: null };
        if (table === 'worksheet_submissions') result = { data: { id: 'submission-1', status: 'in_progress', released: false }, error: null };
        if (table === 'worksheets') result = { data: { id: 'worksheet-1', instructions: 'Read data', sections: null }, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import StudentTasksTab from './TasksTab';

const MESSAGE = "This is an activity. Follow your teacher's directions.";
const OLD_MESSAGE = 'This worksheet has no questions to answer in the app. Download it from your teacher instead.';
const handoutSheet = { id: 'worksheet-1', title: 'Conflict map', subject: 'English', subject_id: null, task_type: 'worksheet',
  items: 0, instructions: 'Objective: Find conflict.\nGrouping: Pairs' };
const PAST_DUE = '2000-01-15T23:59:00';
const FUTURE_DUE = '2099-01-15T23:59:00';

const setSheet = (sheet, due = FUTURE_DUE) => {
  state.graph = { fatalError: null, assignees: [{ task_id: 'worksheet-1', section_id: 'section-1', assigned_at: null, due_at: due }],
    sheetById: new Map([['worksheet-1', sheet]]), submissionStates: [], releasedScores: [], subjectsById: new Map(), enrolments: [] };
};
const show = () => render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
const openRow = async (name) => {
  show();
  fireEvent.click(await screen.findByRole('button', { name }));
  await screen.findByRole('button', { name: /Back/ });
};
const inserts = () => state.calls.filter(call => call.table === 'worksheet_submissions' && call.operation === 'insert');
const reads = table => state.calls.filter(call => call.table === table);

beforeEach(() => {
  state.calls = [];
  state.items = [];
  state.itemsError = null;
  setSheet(handoutSheet);
});
afterEach(() => cleanup());

describe('handout in the list', () => {
  it('shows Activity and Open, and keeps its due date', async () => {
    show();
    expect(await screen.findByRole('button', { name: 'Open' })).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.queryByText('Not started')).toBeNull();
    expect(screen.getByText(/^Due /)).toBeTruthy();
    expect(screen.getByText(/ left$/)).toBeTruthy();
  });

  it('shows no Late badge after the due date, and keeps the due text', async () => {
    setSheet(handoutSheet, PAST_DUE);
    show();
    await screen.findByRole('button', { name: 'Open' });
    expect(screen.queryByText(/^Late by/)).toBeNull();
    expect(screen.getByText(/^Due /)).toBeTruthy();
  });

  it('a normal task past its due date still shows Late, Not started and Start', async () => {
    setSheet({ ...handoutSheet, task_type: 'quiz', items: 5 }, PAST_DUE);
    show();
    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.getByText(/^Late by/)).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
  });
});

describe('opening a handout', () => {
  it('shows the instructions and message on the paper, with no submission', async () => {
    await openRow('Open');
    const paper = screen.getByRole('article', { name: 'Worksheet test paper' });
    expect(paper.textContent).toContain(MESSAGE);
    expect(paper.textContent).toContain('Objective: Find conflict.');
    expect(paper.textContent).not.toContain('Download it from your teacher');
    expect(inserts()).toHaveLength(0);
    expect(reads('worksheet_answers')).toHaveLength(0);
  });

  it('has the ACTIVITY label, no Score line, no answer area and no Submit', async () => {
    await openRow('Open');
    expect(screen.getByRole('heading', { name: 'ACTIVITY' })).toBeTruthy();
    expect(screen.queryByText('WORKSHEET')).toBeNull();
    expect(screen.queryByText('Score:')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });

  it('uses no submission even when an old in-progress row exists', async () => {
    state.graph.submissionStates = [{ id: 'old-1', worksheet_id: 'worksheet-1', status: 'in_progress', released: false }];
    await openRow('Open');
    expect(screen.getByRole('heading', { name: 'ACTIVITY' })).toBeTruthy();
    expect(inserts()).toHaveLength(0);
    expect(reads('worksheet_answers')).toHaveLength(0);
  });

  it('renders markup in the instructions as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    setSheet({ ...handoutSheet, instructions: `I ${attack}`, title: `T ${attack}` });
    await openRow('Open');
    expect(document.body.textContent).toContain(`I ${attack}`);
    expect(document.body.textContent).toContain(`T ${attack}`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('when the row and the real items disagree', () => {
  it('real items win: a stale zero opens as a normal worksheet', async () => {
    state.items = [{ id: 'i1', position: 1, question: 'A real question', item_type: 'identification', options: [], points: 1 }];
    await openRow('Open');
    expect(screen.getByText(/A real question/)).toBeTruthy();
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
    expect(screen.getByText('Score:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
    expect(inserts()).toHaveLength(1);
  });

  it('a failed item read keeps the error and opens nothing', async () => {
    state.itemsError = { message: 'down' };
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Could not load the questions. Check your connection.')).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Worksheet test paper' })).toBeNull();
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(inserts()).toHaveLength(0);
  });
});

describe('zero-item tasks that are not handouts behave as today', () => {
  it.each([
    ['a quiz', { ...handoutSheet, task_type: 'quiz' }],
    ['a worksheet with no instructions', { ...handoutSheet, instructions: null }],
    ['a worksheet with blank instructions', { ...handoutSheet, instructions: '   ' }],
    ['an unknown item count', { ...handoutSheet, items: undefined }],
    ['a null item count', { ...handoutSheet, items: null }],
  ])('%s', async (_name, sheet) => {
    setSheet(sheet);
    await openRow('Start');
    expect(screen.getByText(OLD_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(MESSAGE)).toBeNull();
    expect(screen.getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
    expect(screen.getByText('Score:')).toBeTruthy();
    expect(inserts()).toHaveLength(1);
  });
});
