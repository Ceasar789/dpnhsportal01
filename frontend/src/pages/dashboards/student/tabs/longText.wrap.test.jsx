// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const LONG_WORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2);
const LONG_URL = `https://example.test/${'abcdefghij'.repeat(12)}`;
const WRAP = '[overflow-wrap:anywhere]';

const state = vi.hoisted(() => ({ news: null, graph: null, items: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    let operation = 'read';
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; }, order() { return query; }, single() { return query; },
      insert() { operation = 'insert'; return query; }, upsert() { operation = 'upsert'; return query; },
      then(resolve, reject) {
        let result = { data: null, error: null };
        if (table === 'news') result = state.news;
        if (table === 'worksheet_items') result = { data: state.items, error: null };
        if (table === 'worksheet_answers') result = { data: [], error: null };
        if (table === 'worksheet_submissions' && operation === 'insert') result = { data: { id: 'sub-1', status: 'in_progress', released: false }, error: null };
        if (table === 'worksheets') result = { data: { id: 'w1', instructions: `Read ${LONG_URL}`, sections: null }, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import AnnouncementsTab from './AnnouncementsTab';
import StudentTasksTab from './TasksTab';

const classes = el => el.className.split(/\s+/);

beforeEach(() => {
  state.news = { data: [{ id: 'n1', title: `Enrollment ${LONG_WORD}`, content: `Please read ${LONG_URL} today.`, status: 'Published',
    created_at: new Date().toISOString(), category: 'Academics' }], error: null };
  state.items = [{ id: 'mc-1', position: 1, question: `Define ${LONG_WORD}`, item_type: 'multiple_choice', options: ['Brave', LONG_WORD], points: 1 },
    { id: 'tf-1', position: 2, question: 'True?', item_type: 'true_false', options: ['True', 'False'], points: 1 }];
  state.graph = { fatalError: null, assignees: [{ task_id: 'w1', section_id: 's1', assigned_at: null, due_at: '2099-01-15T23:59:00' }],
    sheetById: new Map([['w1', { id: 'w1', title: `Quiz ${LONG_WORD}`, subject: 'English', subject_id: null, task_type: 'quiz', items: 2, instructions: `Read ${LONG_URL}` }]]),
    submissionStates: [], releasedScores: [], subjectsById: new Map(), enrolments: [] };
});
afterEach(cleanup);

describe('long unbroken text wraps on student screens', () => {
  it('announcement title and body wrap, with the text unchanged', async () => {
    render(<AnnouncementsTab />);
    const title = await screen.findByRole('heading', { name: `Enrollment ${LONG_WORD}` });
    expect(classes(title)).toContain(WRAP);
    const body = screen.getByText(`Please read ${LONG_URL} today.`);
    expect(classes(body)).toContain(WRAP);
  });

  it('the task title in the list wraps, inside a shrinkable column', async () => {
    render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
    const title = await screen.findByText(`Quiz ${LONG_WORD}`);
    expect(classes(title)).toEqual(expect.arrayContaining([WRAP, 'min-w-0']));
    expect(classes(title.parentElement.parentElement)).toContain('min-w-0');
  });

  it('worksheet question and every answer choice wrap, and choices still answer', async () => {
    render(<MemoryRouter initialEntries={['/?view=all']}><StudentTasksTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const paper = await screen.findByRole('article', { name: 'Worksheet test paper' });
    expect(classes(within(paper).getByText(new RegExp(`Define ${LONG_WORD}`)))).toContain(WRAP);
    const longChoice = within(paper).getByRole('radio', { name: LONG_WORD });
    expect(classes(longChoice.closest('label'))).toEqual(expect.arrayContaining([WRAP, 'min-w-0']));
    expect(classes(within(paper).getByRole('radio', { name: 'True' }).closest('label'))).toContain(WRAP);
    expect(within(paper).getByText(/Directions:/).parentElement.className).toContain(WRAP);
  });
});
