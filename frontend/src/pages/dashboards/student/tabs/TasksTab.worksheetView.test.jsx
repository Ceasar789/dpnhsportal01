// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ calls: [], graph: null, items: [], saved: [],
  insertError: null, pendingWrite: null, finishWrite: null, metadata: null, metadataError: null,
  pendingMetadata: null, finishMetadata: null, pendingSubmit: null, finishSubmit: null,
  existingSubmission: null, scoreResult: null }));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }),
}));
vi.mock('../StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    const call = { table, operation: 'read', columns: '', filters: [], payload: null };
    state.calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(column, value) { call.filters.push([column, value]); return query; },
      order() { return query; },
      single() { return query; },
      insert(payload) { call.operation = 'insert'; call.payload = payload; return query; },
      update(payload) { call.operation = 'update'; call.payload = payload; return query; },
      upsert(payload) { call.operation = 'upsert'; call.payload = payload; return query; },
      then(resolve, reject) {
        let result = { data: null, error: null };
        if (table === 'worksheet_items') result = { data: state.items, error: null };
        if (table === 'worksheet_answers' && call.operation === 'read') result = { data: state.saved, error: null };
        if (table === 'worksheet_submissions' && call.operation === 'insert') {
          result = state.insertError
            ? { data: null, error: state.insertError }
            : { data: { id: 'submission-1', status: 'in_progress', released: false }, error: null };
        }
        if (table === 'worksheet_submissions' && call.operation === 'read') {
          result = call.columns === 'score, total_points'
            ? { data: state.scoreResult, error: null }
            : { data: state.existingSubmission || { id: 'submission-1', status: 'in_progress', released: false }, error: null };
        }
        if (table === 'worksheets') result = state.metadataError
          ? { data: null, error: state.metadataError }
          : { data: state.metadata, error: null };
        const pending = table === 'worksheet_answers' && call.operation === 'upsert' && state.pendingWrite
          || table === 'worksheets' && state.pendingMetadata
          || table === 'worksheet_submissions' && call.operation === 'update' && state.pendingSubmit;
        return (pending || Promise.resolve(result)).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import StudentTasksTab from './TasksTab';
import { ThemeContext } from '../hooks';

const makeItem = (id, type, extra = {}) => ({ id, position: 1, question: `Sample ${type} question`,
  item_type: type, options: [], points: 2, ...extra });

beforeEach(() => {
  state.calls = [];
  state.items = [makeItem('mc-1', 'multiple_choice', { options: ['One', 'Two', 'Three', 'Four'] }),
    makeItem('enum-1', 'enumeration'), makeItem('text-1', 'identification')];
  state.saved = [];
  state.insertError = null;
  state.pendingWrite = null;
  state.finishWrite = null;
  state.metadata = null;
  state.metadataError = null;
  state.pendingMetadata = null;
  state.finishMetadata = null;
  state.pendingSubmit = null;
  state.finishSubmit = null;
  state.existingSubmission = null;
  state.scoreResult = null;
  state.graph = { fatalError: null, assignees: [{ task_id: 'worksheet-1', section_id: 'section-1',
    assigned_at: null, due_at: null }], sheetById: new Map([['worksheet-1',
    { id: 'worksheet-1', title: 'Sample worksheet', subject: null, subject_id: null, task_type: 'worksheet' }]]),
  submissionStates: [], releasedScores: [], subjectsById: new Map(), enrolments: [] };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderTask() {
  return render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
}
async function openTask() {
  renderTask();
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  await screen.findByRole('button', { name: /Back/ });
}
const callsFor = (table, operation) => state.calls.filter(call => call.table === table && call.operation === operation);

it('creates an in-progress submission on first open', async () => {
  await openTask();
  expect(callsFor('worksheet_submissions', 'insert')[0].payload[0]).toMatchObject({
    worksheet_id: 'worksheet-1', student_id: 'student-1', section_id: 'section-1', status: 'in_progress',
  });
  expect(callsFor('worksheet_answers', 'read')[0].filters).toContainEqual(['submission_id', 'submission-1']);
});

it('recovers an existing in-progress submission after a unique conflict', async () => {
  state.insertError = { code: '23505', message: 'already exists' };
  await openTask();
  expect(callsFor('worksheet_submissions', 'read')[0].columns).toContain('status');
  expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
});

it('saves a multiple-choice selection immediately', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  await waitFor(() => expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(1));
  expect(callsFor('worksheet_answers', 'upsert')[0].payload[0]).toMatchObject({ item_id: 'mc-1', answer: 'Two' });
});

it('saves enumeration as trimmed non-blank lines', async () => {
  await openTask();
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: ' First \n \n Second ' } });
  fireEvent.blur(screen.getByPlaceholderText('One answer per line'));
  await waitFor(() => expect(callsFor('worksheet_answers', 'upsert').length).toBeGreaterThan(0));
  expect(callsFor('worksheet_answers', 'upsert').at(-1).payload[0].answer).toEqual(['First', 'Second']);
});

it('saves typed answers after the debounce and again on blur', async () => {
  await openTask();
  const input = screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT');
  fireEvent.change(input, { target: { value: 'first' } });
  expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(0);
  await waitFor(() => expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(1), { timeout: 1800 });
  fireEvent.change(input, { target: { value: 'second' } });
  fireEvent.blur(input);
  await waitFor(() => expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(2));
  expect(callsFor('worksheet_answers', 'upsert')[1].payload[0].answer).toBe('second');
});

it('flushes a pending answer before submitting', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: 'One' } });
  state.pendingWrite = new Promise(resolve => { state.finishWrite = resolve; });
  fireEvent.change(screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT'), { target: { value: 'pending' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Submit your answers?' })).getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(3));
  expect(callsFor('worksheet_submissions', 'update')).toHaveLength(0);
  await act(async () => { state.finishWrite({ data: null, error: null }); });
  await waitFor(() => expect(callsFor('worksheet_submissions', 'update')[0].payload).toEqual({ status: 'submitted' }));
});

it('blocks an empty worksheet response without writing on Submit', async () => {
  await openTask();
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(true);
  expect(screen.getByText('3 question(s) unanswered.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(callsFor('worksheet_submissions', 'update')).toHaveLength(0);
  expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(0);
});

it('keeps a partial response open with Submit disabled', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(true);
  expect(screen.getByText('2 question(s) unanswered.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.queryByRole('dialog', { name: 'Submit your answers?' })).toBeNull();
  expect(callsFor('worksheet_submissions', 'update')).toHaveLength(0);
});

it('submits after confirmation when every item has an answer', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: 'One' } });
  fireEvent.change(screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT'), { target: { value: 'Typed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(callsFor('worksheet_submissions', 'update')).toHaveLength(0);
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Submit your answers?' })).getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(callsFor('worksheet_submissions', 'update')).toHaveLength(1));
});

it('counts an empty enumeration array as unanswered', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: ' \n ' } });
  fireEvent.change(screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT'), { target: { value: 'Typed' } });
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(true);
  expect(screen.getByText('1 question(s) unanswered.')).toBeTruthy();
  expect(callsFor('worksheet_submissions', 'update')).toHaveLength(0);
});

it('recomputes the unanswered count as answers are typed', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  expect(screen.getByText('2 question(s) unanswered.')).toBeTruthy();
  fireEvent.change(screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT'), { target: { value: 'Typed' } });
  expect(screen.getByText('1 question(s) unanswered.')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: 'One' } });
  await waitFor(() => expect(screen.queryByText(/unanswered/)).toBeNull());
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(false);
});

it('allows only one submit update during a double click', async () => {
  await openTask();
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: 'One' } });
  fireEvent.change(screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT'), { target: { value: 'Typed' } });
  state.pendingSubmit = new Promise(resolve => { state.finishSubmit = resolve; });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  const confirm = within(screen.getByRole('dialog', { name: 'Submit your answers?' })).getByRole('button', { name: 'Submit' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(callsFor('worksheet_submissions', 'update')).toHaveLength(1));
  await act(async () => { state.finishSubmit({ data: null, error: null }); });
  expect(callsFor('worksheet_submissions', 'update')).toHaveLength(1);
});

it('locks answer inputs on an already submitted worksheet', async () => {
  state.graph.submissionStates = [{ id: 'submission-1', worksheet_id: 'worksheet-1',
    status: 'submitted', released: false }];
  renderTask();
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  await screen.findByRole('button', { name: /Back/ });
  expect(screen.getByRole('radio', { name: 'Two' }).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
});

it('locks answer inputs after submitting and reopening the refreshed task', async () => {
  const view = renderTask();
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  await screen.findByRole('button', { name: 'Submit' });
  fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
  fireEvent.change(screen.getByPlaceholderText('One answer per line'), { target: { value: 'One' } });
  fireEvent.change(screen.getAllByRole('textbox').find(element => element.tagName === 'INPUT'), { target: { value: 'Typed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Submit your answers?' })).getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(callsFor('worksheet_submissions', 'update')[0].payload)
    .toEqual({ status: 'submitted' }));
  state.graph = { ...state.graph, submissionStates: [{ id: 'submission-1',
    worksheet_id: 'worksheet-1', status: 'submitted', released: false }] };
  view.rerender(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  await screen.findByRole('button', { name: /Back/ });
  expect(screen.getByRole('radio', { name: 'Two' }).disabled).toBe(true);
});

it('shows the document header and student identity without an empty subject', async () => {
  state.graph.enrolments = [{ section_id: 'section-1', sections: {
    name: 'Sample Section', grade_level: 'Grade 7' } }];
  await openTask();
  expect(screen.getByText('Republic of the Philippines')).toBeTruthy();
  expect(screen.getByText('Department of Education')).toBeTruthy();
  expect(screen.getByText('DELA PAZ NATIONAL HIGH SCHOOL')).toBeTruthy();
  expect(screen.getByText('WORKSHEET')).toBeTruthy();
  expect(screen.getByText('Sample Student')).toBeTruthy();
  expect(screen.getByText('Grade 7 - Sample Section')).toBeTruthy();
  expect(screen.getByText('Score:').closest('p').textContent).toMatch(/Score:\s*\/ 6/);
  expect(screen.queryByText('Subject:')).toBeNull();
  expect(screen.queryByText('School year:')).toBeNull();
});

it('prints the released score from the task row on the paper without another score read', async () => {
  state.graph.submissionStates = [{ id: 'submission-1', worksheet_id: 'worksheet-1',
    status: 'checked', released: true }];
  state.graph.releasedScores = [{ worksheet_id: 'worksheet-1', score: 4, total_points: 32 }];
  renderTask();
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  await screen.findByRole('button', { name: /Back/ });
  const score = within(screen.getByRole('article', { name: 'Worksheet test paper' })).getByText('Score:').closest('p');
  expect(score.textContent).toMatch(/Score:\s*4\s*\/\s*32/);
  expect(score.querySelector('[aria-label="blank score"]')).toBeNull();
  expect(callsFor('worksheet_submissions', 'read').filter(call => call.columns === 'score, total_points')).toHaveLength(0);
});

it('keeps a score blank and makes no score read before release', async () => {
  state.graph.submissionStates = [{ id: 'submission-1', worksheet_id: 'worksheet-1',
    status: 'submitted', released: false, score: 4, total_points: 32 }];
  renderTask();
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  await screen.findByRole('button', { name: /Back/ });
  const score = within(screen.getByRole('article', { name: 'Worksheet test paper' })).getByText('Score:').closest('p');
  expect(score.querySelector('[aria-label="blank score"]')).toBeTruthy();
  expect(score.textContent).toMatch(/Score:\s*\/ 6/);
  expect(callsFor('worksheet_submissions', 'read').filter(call => call.columns === 'score, total_points')).toHaveLength(0);
});

it('reads only its own released score when recovering a row without score fields', async () => {
  state.insertError = { code: '23505', message: 'already exists' };
  state.existingSubmission = { id: 'submission-1', status: 'checked', released: true };
  state.scoreResult = { score: 4, total_points: 32 };
  await openTask();
  const scoreRead = callsFor('worksheet_submissions', 'read').filter(call => call.columns === 'score, total_points');
  expect(scoreRead).toHaveLength(1);
  expect(scoreRead[0].filters).toEqual([
    ['id', 'submission-1'], ['student_id', 'student-1'], ['released', true],
  ]);
  const score = within(screen.getByRole('article', { name: 'Worksheet test paper' })).getByText('Score:').closest('p');
  expect(score.textContent).toMatch(/Score:\s*4\s*\/\s*32/);
});

it('shows worksheet directions without grouping by saved section', async () => {
  state.metadata = { id: 'worksheet-1', instructions: 'Complete the worksheet.',
    sections: [{ id: 'part-a', title: 'Part A', directions: 'Choose carefully.' }] };
  await openTask();
  expect(await screen.findByRole('region', { name: 'Multiple choice' })).toBeTruthy();
  expect(screen.getByText('Complete the worksheet.')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Part A' })).toBeNull();
  expect(screen.getAllByText(/Sample .* question/)).toHaveLength(3);
  expect(callsFor('worksheets', 'read')[0]).toMatchObject({
    columns: 'id, instructions, sections', filters: [['id', 'worksheet-1']],
  });
});

it('groups by item type even when saved sections cannot map items', async () => {
  state.metadata = { id: 'worksheet-1', instructions: null,
    sections: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] };
  await openTask();
  expect(await screen.findByRole('region', { name: 'Multiple choice' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Enumeration' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Identification' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'A' })).toBeNull();
  expect(screen.getAllByText(/Sample .* question/)).toHaveLength(3);
});

it('keeps questions answerable when the presentation read fails and never requests keys', async () => {
  state.metadataError = { message: 'read unavailable' };
  await openTask();
  await waitFor(() => expect(callsFor('worksheets', 'read')).toHaveLength(1));
  expect(screen.getByRole('region', { name: 'Multiple choice' })).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'One' }));
  await waitFor(() => expect(callsFor('worksheet_answers', 'upsert')).toHaveLength(1));
  expect(state.calls.some(call => ['worksheet_item_keys', 'worksheet_item_private'].includes(call.table))).toBe(false);
});

it('ignores an old presentation read after closing and reopening', async () => {
  state.pendingMetadata = new Promise(resolve => { state.finishMetadata = resolve; });
  await openTask();
  fireEvent.click(screen.getByRole('button', { name: /Back/ }));
  state.pendingMetadata = null;
  state.metadata = { id: 'worksheet-1', instructions: 'Current directions.', sections: null };
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  await screen.findByText('Current directions.');
  await act(async () => { state.finishMetadata({ data: {
    id: 'worksheet-1', instructions: 'Old directions.', sections: null }, error: null }); });
  expect(screen.queryByText('Old directions.')).toBeNull();
  expect(screen.getByText('Current directions.')).toBeTruthy();
});

it('keeps the header and all questions inside one light paper with Submit below it', async () => {
  render(<MemoryRouter><ThemeContext.Provider value={{ dark: true, toggleDark: vi.fn() }}>
    <StudentTasksTab />
  </ThemeContext.Provider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  await screen.findByRole('button', { name: /Back/ });
  const paper = screen.getByRole('article', { name: 'Worksheet test paper' });
  expect(paper.style.backgroundColor).toBe('rgb(255, 254, 251)');
  expect(paper.style.color).toBe('rgb(31, 31, 31)');
  expect(paper.style.fontFamily).toContain('Georgia');
  expect(paper.contains(screen.getByText('WORKSHEET'))).toBe(true);
  expect(within(paper).getAllByText(/Sample .* question/)).toHaveLength(3);
  expect(paper.contains(screen.getByRole('button', { name: 'Submit' }))).toBe(false);
  expect(within(paper).getAllByRole('textbox').find(element => element.tagName === 'INPUT').style.color)
    .toBe('rgb(31, 31, 31)');
});

it('prints blank Score, Manila date, enrollment, and omits unavailable labels and directions', async () => {
  state.graph.enrolments = [{ section_id: 'section-1', sections: {
    name: 'Madrid', grade_level: 'Grade 7' } }];
  await openTask();
  const paper = screen.getByRole('article', { name: 'Worksheet test paper' });
  expect(within(paper).getByText('Sample Student')).toBeTruthy();
  expect(within(paper).getByText('Grade 7 - Madrid')).toBeTruthy();
  const score = within(paper).getByText('Score:').closest('p');
  expect(score.textContent).toMatch(/Score:\s*\/ 6/);
  expect(score.querySelector('[aria-label="blank score"]').textContent.trim()).toBe('');
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
  expect(within(paper).getByText(today)).toBeTruthy();
  expect(within(paper).queryByText('Subject:')).toBeNull();
  expect(within(paper).queryByText('School year:')).toBeNull();
  expect(within(paper).queryByText('Directions:')).toBeNull();
});

it('uses a bordered directions box and retains optional subject and school year', async () => {
  state.graph.sheetById.get('worksheet-1').subject = 'Filipino';
  state.graph.enrolments = [{ section_id: 'section-1', sections: {
    name: 'Madrid', grade_level: 'Grade 7', school_year: '2026-2027' } }];
  state.metadata = { id: 'worksheet-1', instructions: 'Complete every item.', sections: null };
  await openTask();
  const paper = screen.getByRole('article', { name: 'Worksheet test paper' });
  const directions = await within(paper).findByText(/Complete every item\./);
  expect(directions.closest('div').style.borderColor).toBe('rgb(183, 169, 153)');
  expect(within(paper).getByText('Filipino')).toBeTruthy();
  expect(within(paper).getByText('2026-2027')).toBeTruthy();
});

it('orders type groups, skips empty types, and numbers original items continuously', async () => {
  state.items = [
    makeItem('essay-1', 'essay', { position: 1, points: 5, question: 'Essay item' }),
    makeItem('mc-2', 'multiple_choice', { position: 4, points: 3, question: 'Second MC item', options: ['A', 'B'] }),
    makeItem('mc-1', 'multiple_choice', { position: 2, points: 2, question: 'First MC item', options: ['C', 'D'] }),
    makeItem('tf-1', 'true_false', { position: 5, points: 1, question: 'True false item' }),
    makeItem('other-1', 'matching', { position: 3, points: 4, question: 'Other item' }),
  ];
  await openTask();
  const paper = screen.getByRole('article', { name: 'Worksheet test paper' });
  expect(within(paper).getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
    'I. Multiple choice', 'II. True or false (1 point each)',
    'III. Essay (5 points each)', 'IV. Other questions (4 points each)',
  ]);
  const mc = within(paper).getByRole('region', { name: 'Multiple choice' });
  expect(within(mc).getByText(/First MC item/).textContent).toMatch(/^1\. First MC item/);
  expect(within(mc).getByText(/Second MC item/).textContent).toMatch(/^2\. Second MC item/);
  expect(within(paper).getByText(/True false item/).textContent).toMatch(/^3\./);
  expect(within(paper).getByText(/Essay item/).textContent).toMatch(/^4\./);
  expect(within(paper).getByText(/Other item/).textContent).toMatch(/^5\./);
  expect(within(mc).getByRole('radio', { name: 'C' }).name).toBe('mc-1');
  expect(within(mc).getByRole('radio', { name: 'A' }).name).toBe('mc-2');
  expect(state.calls.some(call => ['worksheet_item_keys', 'worksheet_item_private'].includes(call.table))).toBe(false);
});
