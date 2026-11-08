// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { db, auth, loader } = vi.hoisted(() => ({
  db: { rows: [] }, auth: { userData: { uid: 'teacher-1' } }, loader: { result: null, calls: [] },
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? db.rows : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => {
  const loadItems = async (id) => { loader.calls.push(id); return loader.result; };
  const base = { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
    postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
    mySections: [], sectionsError: false, fetchMySections: vi.fn(), loadItems, distributeTask: vi.fn(),
    assigneeCounts: {}, firstAssignedAt: {}, assigneeCountsLoading: false, assigneeCountsError: false };
  return { useWorksheetAssessment: () => base };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const manual = { origin: 'manual', source_lesson_plan_id: null, collection_id: null, subject: 'English', grade_level: 'Grade 7' };
const quiz = { ...manual, id: 'q1', title: 'Conflict quiz', task_type: 'quiz', instructions: 'Answer every item.', items: 1 };
const quizItems = { items: [{ id: 'i1', position: 1, question: 'Name the red planet', item_type: 'multiple_choice',
  options: ['Mars', 'Venus'], points: 2 }], keys: { i1: { correct_answer: 'Mars' } } };

beforeEach(() => { loader.result = { items: [], keys: {} }; loader.calls = []; });
afterEach(cleanup);

const preview = async (row, button = 'Preview') => {
  db.rows = [row];
  render(<WorksheetsTab />);
  await screen.findByRole('heading', { name: row.title });
  fireEvent.click(screen.getByRole('button', { name: button }));
};
const paper = () => screen.findByRole('article', { name: 'Student-facing worksheet' });

describe('Preview of a Create Worksheet row', () => {
  it('a manual Quiz shows its directions, questions, points and the teacher key', async () => {
    loader.result = quizItems;
    await preview(quiz);
    const doc = await paper();
    expect(within(doc).getByRole('heading', { name: 'QUIZ' })).toBeTruthy();
    expect(doc.textContent).toContain('Answer every item.');
    expect(doc.textContent).toContain('Name the red planet');
    expect(doc.textContent).toContain('2 points');
    expect(loader.calls).toEqual(['q1']);
    expect(screen.queryByText('File Information')).toBeNull();
    expect(screen.queryByText(/^No questions yet\./)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show teacher answer key' }));
    const key = screen.getByRole('article', { name: 'Teacher answer key' });
    expect(key.textContent).toContain('Mars');
  });

  it('a manual Activity shows the ACTIVITY handout with its directions and no empty state', async () => {
    await preview({ ...manual, id: 'a1', title: 'Map the conflict', task_type: 'worksheet', items: 0,
      instructions: 'Objective: Map the conflict.\nGrouping: Pairs' });
    const doc = await paper();
    expect(within(doc).getByRole('heading', { name: 'ACTIVITY' })).toBeTruthy();
    expect(doc.textContent).toContain('Map the conflict.');
    expect(screen.queryByText(/^No questions yet\./)).toBeNull();
  });

  it('a Quiz with no questions shows the empty state and its directions', async () => {
    await preview({ ...quiz, items: 0 });
    const doc = await paper();
    expect(doc.textContent).toContain('Answer every item.');
    expect(screen.getByText('No questions yet. Use Edit questions to add some.')).toBeTruthy();
  });

  it('an Assignment with no questions and no directions shows the empty state', async () => {
    await preview({ ...manual, id: 's1', title: 'Essay on conflict', task_type: 'assignment', instructions: null, items: 0 });
    expect(within(await paper()).getByRole('heading', { name: 'ASSIGNMENT' })).toBeTruthy();
    expect(screen.getByText('No questions yet. Use Edit questions to add some.')).toBeTruthy();
  });

  it('a failed load shows the friendly message', async () => {
    loader.result = null;
    await preview(quiz);
    expect((await screen.findByText('This task could not be loaded. Close this preview and try again.')).getAttribute('role')).toBe('alert');
    expect(screen.queryByRole('article', { name: 'Student-facing worksheet' })).toBeNull();
  });

  it('text with an HTML tag renders as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    loader.result = { items: [{ ...quizItems.items[0], question: `Q ${attack}` }], keys: quizItems.keys };
    await preview({ ...quiz, title: `T ${attack}`, instructions: `D ${attack}` });
    const doc = await paper();
    expect(doc.textContent).toContain(`D ${attack}`);
    expect(doc.textContent).toContain(`Q ${attack}`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});

describe('other rows keep their preview', () => {
  it('a row with a file keeps the old preview and loads no questions', async () => {
    await preview({ ...quiz, file_url: 'https://synthetic.invalid/quiz.pdf' }, 'View');
    expect(await screen.findByText('File Information')).toBeTruthy();
    expect(loader.calls).toEqual([]);
  });

  it('a row in a collection keeps the old preview', async () => {
    await preview({ ...quiz, collection_id: 'c1', day_of_week: null });
    expect(await screen.findByText('File Information')).toBeTruthy();
    expect(loader.calls).toEqual([]);
  });

  it('a row with no origin keeps the old preview', async () => {
    const legacy = { ...quiz, origin: undefined };
    await preview(legacy);
    expect(await screen.findByText('No file attached')).toBeTruthy();
    expect(loader.calls).toEqual([]);
  });

  it('a day task keeps its paper preview', async () => {
    loader.result = quizItems;
    await preview({ ...quiz, id: 'd1', title: 'Cells - Monday Quiz', source_lesson_plan_id: 'p1' });
    expect(within(await paper()).getByRole('heading', { name: 'QUIZ' })).toBeTruthy();
    expect(loader.calls).toEqual(['d1']);
  });
});
