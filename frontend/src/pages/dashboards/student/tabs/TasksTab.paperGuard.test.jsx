// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ calls: [], graph: null, items: [], saved: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
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
        if (table === 'worksheet_items') result = { data: state.items, error: null };
        if (table === 'worksheet_answers' && call.operation === 'read') result = { data: state.saved, error: null };
        if (table === 'worksheet_submissions' && call.operation === 'insert') result = { data: { id: 'sub-1', status: 'in_progress', released: false }, error: null };
        if (table === 'worksheets') result = { data: { id: 'w1', instructions: 'Answer every item.', sections: null }, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import StudentTasksTab from './TasksTab';

const ITEMS = [
  { id: 'mc-1', position: 1, question: 'Pick one', item_type: 'multiple_choice', options: ['One', 'Two'], points: 1 },
  { id: 'id-1', position: 2, question: 'Name it', item_type: 'identification', options: [], points: 1 },
  { id: 'en-1', position: 3, question: 'List two', item_type: 'enumeration', options: [], points: 2 },
];
const PAST = '2000-01-15T23:59:00';
const FUTURE = '2099-01-15T23:59:00';
const sheet = { id: 'w1', title: 'Unit quiz', subject: 'English', subject_id: null, task_type: 'quiz', items: 3, instructions: 'Answer every item.' };
const setGraph = ({ due = FUTURE, submission = null, sheetRow = sheet } = {}) => {
  state.graph = { fatalError: null, assignees: [{ task_id: 'w1', section_id: 's1', assigned_at: null, due_at: due }],
    sheetById: new Map([['w1', sheetRow]]), submissionStates: submission ? [{ worksheet_id: 'w1', ...submission }] : [],
    releasedScores: [], subjectsById: new Map(), enrolments: [] };
};

beforeEach(() => { state.calls = []; state.items = ITEMS; state.saved = []; setGraph(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const openPaper = async (name = 'Start') => {
  render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('article', { name: 'Worksheet test paper' });
};
const showList = async () => {
  render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
  await screen.findByText('Unit quiz');
};

describe('the paper cannot be selected or copied', () => {
  it('the paper is not selectable, but answer fields are', async () => {
    const paper = await openPaper();
    expect(paper.getAttribute('style')).toMatch(/user-select: none/);
    const input = paper.querySelector('input[type="text"]');
    const textarea = paper.querySelector('textarea');
    const radio = paper.querySelector('input[type="radio"]');
    for (const element of [input, textarea, radio]) expect(element.getAttribute('style')).toMatch(/user-select: text/);
  });

  it.each([['copy'], ['cut'], ['dragStart']])('%s is blocked on the paper text but not in an answer field', async (event) => {
    const paper = await openPaper();
    expect(fireEvent[event](screen.getByText(/Pick one/))).toBe(false);
    expect(fireEvent[event](paper)).toBe(false);
    expect(fireEvent[event](paper.querySelector('input[type="text"]'))).toBe(true);
    expect(fireEvent[event](paper.querySelector('textarea'))).toBe(true);
  });

  it('the context menu is blocked on the paper but not inside a textarea or input', async () => {
    const paper = await openPaper();
    expect(fireEvent.contextMenu(screen.getByText(/Name it/))).toBe(false);
    expect(fireEvent.contextMenu(paper.querySelector('textarea'))).toBe(true);
    expect(fireEvent.contextMenu(paper.querySelector('input[type="text"]'))).toBe(true);
  });

  it('paste into an answer field is not blocked', async () => {
    const paper = await openPaper();
    expect(fireEvent.paste(paper.querySelector('input[type="text"]'))).toBe(true);
  });

  it('answers can still be typed, chosen and autosaved', async () => {
    const paper = await openPaper();
    const input = paper.querySelector('input[type="text"]');
    fireEvent.change(input, { target: { value: 'Mars' } });
    await act(async () => { fireEvent.blur(input); });
    fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
    await act(async () => {});
    const upserts = state.calls.filter(call => call.table === 'worksheet_answers' && call.operation === 'upsert');
    expect(upserts.map(call => call.payload[0].answer)).toEqual(expect.arrayContaining(['Mars', 'Two']));
    expect(input.value).toBe('Mars');
    expect(screen.getByRole('radio', { name: 'Two' }).checked).toBe(true);
  });

  it('the submitted, read-only paper is protected too', async () => {
    setGraph({ submission: { id: 'sub-1', status: 'submitted', released: false } });
    state.saved = [{ item_id: 'mc-1', answer: 'One' }];
    const paper = await openPaper('Open');
    expect(paper.getAttribute('style')).toMatch(/user-select: none/);
    expect(fireEvent.copy(screen.getByText(/Pick one/))).toBe(false);
  });

  it('the Activity handout is protected too', async () => {
    state.items = [];
    setGraph({ sheetRow: { ...sheet, task_type: 'worksheet', items: 0, instructions: 'Objective: Read the story.' } });
    const paper = await openPaper('Open');
    expect(paper.getAttribute('style')).toMatch(/user-select: none/);
    expect(fireEvent.copy(screen.getByText(/Read the story/))).toBe(false);
    expect(fireEvent.contextMenu(paper)).toBe(false);
  });

  it('a question with an HTML tag still renders as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    state.items = [{ ...ITEMS[1], question: `Q ${attack}` }];
    const paper = await openPaper();
    expect(paper.textContent).toContain(`Q ${attack}`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('the list after submitting', () => {
  it.each([['submitted', { id: 'sub-1', status: 'submitted', released: false }],
    ['released', { id: 'sub-1', status: 'checked', released: true, score: 3, total_points: 4 }]])(
    'a %s, overdue task shows no countdown and no "Late by"', async (_name, submission) => {
      setGraph({ due: PAST, submission });
      await showList();
      expect(screen.queryByText(/^Late by/)).toBeNull();
      expect(screen.queryByText(/ left$/)).toBeNull();
      expect(screen.queryByText('Submitted late')).toBeNull();
    });

  it('an on-time submitted task shows no countdown and no extra tag', async () => {
    setGraph({ due: FUTURE, submission: { id: 'sub-1', status: 'submitted', released: false } });
    await showList();
    expect(screen.queryByText(/ left$/)).toBeNull();
    expect(screen.getByText('Submitted — awaiting result')).toBeTruthy();
    expect(screen.queryByText('Submitted late')).toBeNull();
  });

  it('an overdue task still in progress keeps the live "Late by" badge', async () => {
    setGraph({ due: PAST, submission: { id: 'sub-1', status: 'in_progress', released: false } });
    await showList();
    expect(screen.getByText(/^Late by/)).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
  });

  it('a task not started keeps its countdown', async () => {
    setGraph({ due: FUTURE });
    await showList();
    expect(screen.getByText(/ left$/)).toBeTruthy();
  });
});
