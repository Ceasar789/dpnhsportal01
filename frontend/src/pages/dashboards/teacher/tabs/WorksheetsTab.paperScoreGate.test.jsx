// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

// The paper-score switch (useWorksheetAssessment's paperScoreEncodingAvailable)
// hides "Encode scores" while saving is gated off, and brings it back when on.
const { db, auth, hook } = vi.hoisted(() => ({ db: { rows: [] }, auth: { userData: { uid: 'teacher-1' } }, hook: { state: {} } }));
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
  const base = { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
    postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
    mySections: [], sectionsError: false, fetchMySections: vi.fn(), loadItems: vi.fn(), distributeTask: vi.fn(),
    assigneeCounts: {}, firstAssignedAt: {}, assigneeCountsLoading: false, assigneeCountsError: false };
  return { useWorksheetAssessment: () => ({ ...base, ...hook.state }) };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: ({ task }) => <section aria-label="Mock distribute">{task.title}</section> }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: ({ worksheet, paperScoresAvailable }) =>
  <section aria-label="Mock check submissions">{worksheet.title}{paperScoresAvailable ? ' with paper hint' : ''}</section> }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: ({ worksheet }) => <section aria-label="Mock encode scores">{worksheet.title}</section> }));

const manual = { id: 'm1', title: 'Hand quiz', subject: 'Science', task_type: 'quiz', items: 3,
  origin: 'manual', source_lesson_plan_id: null, collection_id: null };
const aiRow = { id: 'a1', title: 'AI worksheet', subject: 'Science', items: 5, origin: 'ai_generated' };

beforeEach(() => { hook.state = {}; });
afterEach(cleanup);

const show = async (rows) => {
  db.rows = rows;
  render(<WorksheetsTab />);
  await screen.findByRole('heading', { name: rows[0].title });
};
const openMenu = (title) => {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  return screen.getByRole('menu', { name: `Actions for ${title}` });
};
const labels = menu => within(menu).getAllByRole('menuitem').map(item => item.childNodes[0].textContent);
const item = (menu, name) => within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) });

describe('Encode scores while paper-score saving is gated off', () => {
  it.each([
    ['a manual row', [manual], 'Hand quiz', {}, ['Distribute', 'Check submissions', 'Delete']],
    ['an AI-generated row', [aiRow], 'AI worksheet', {}, ['Distribute', 'Check submissions']],
    ['a distributed row', [manual], 'Hand quiz', { assigneeCounts: { m1: 2 } }, ['Distribute', 'Check submissions', 'Delete']],
  ])('%s has no Encode scores item; the rest of the menu is unchanged', async (_name, rows, title, extra, expected) => {
    hook.state = extra;
    await show(rows);
    expect(labels(openMenu(title))).toEqual(expected);
    expect(screen.queryByRole('region', { name: 'Mock encode scores' })).toBeNull();
  });

  it('the distributed row keeps Delete locked with its reason, and Distribute and Check submissions still open', async () => {
    hook.state = { assigneeCounts: { m1: 2 } };
    await show([manual]);
    let menu = openMenu('Hand quiz');
    expect(item(menu, 'Delete').disabled).toBe(true);
    expect(item(menu, 'Delete').textContent).toContain('Already distributed');
    fireEvent.click(item(menu, 'Check submissions'));
    expect(screen.getByRole('region', { name: 'Mock check submissions' }).textContent).toBe('Hand quiz');
    cleanup();
    await show([manual]);
    menu = openMenu('Hand quiz');
    fireEvent.click(item(menu, 'Distribute'));
    expect(screen.getByRole('region', { name: 'Mock distribute' }).textContent).toBe('Hand quiz');
    expect(screen.queryByRole('region', { name: 'Mock encode scores' })).toBeNull();
  });
});

describe('Encode scores with the gate on', () => {
  it('the menu item comes back in its old place and opens the encoding modal', async () => {
    hook.state = { paperScoreEncodingAvailable: true };
    await show([manual]);
    const menu = openMenu('Hand quiz');
    expect(labels(menu)).toEqual(['Distribute', 'Check submissions', 'Encode scores', 'Delete']);
    fireEvent.click(item(menu, 'Encode scores'));
    expect(screen.getByRole('region', { name: 'Mock encode scores' }).textContent).toBe('Hand quiz');
  });

  it('Check submissions gets the paper hint only with the gate on', async () => {
    await show([manual]);
    fireEvent.click(item(openMenu('Hand quiz'), 'Check submissions'));
    expect(screen.getByRole('region', { name: 'Mock check submissions' }).textContent).toBe('Hand quiz');
    cleanup();
    hook.state = { paperScoreEncodingAvailable: true };
    await show([manual]);
    fireEvent.click(item(openMenu('Hand quiz'), 'Check submissions'));
    expect(screen.getByRole('region', { name: 'Mock check submissions' }).textContent).toBe('Hand quiz with paper hint');
  });
});
