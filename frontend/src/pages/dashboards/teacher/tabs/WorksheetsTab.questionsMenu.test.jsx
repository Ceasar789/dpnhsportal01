// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

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
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: ({ worksheet }) => <section aria-label="Mock questions editor">{worksheet.title}</section> }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const dayTask = { id: 'd1', title: 'Cells - Monday Quiz', subject: 'Science', task_type: 'quiz', items: 10,
  origin: 'manual', source_lesson_plan_id: 'plan-1', collection_id: null };
const aiRow = { id: 'a1', title: 'AI worksheet', subject: 'Science', items: 5, origin: 'ai_generated' };
const manual = { id: 'm1', title: 'Hand quiz', subject: 'Science', task_type: 'quiz', items: 3,
  origin: 'manual', source_lesson_plan_id: null, collection_id: null };

beforeEach(() => { hook.state = {}; });
afterEach(cleanup);

const show = async (rows) => {
  db.rows = rows;
  render(<WorksheetsTab />);
  await screen.findByRole('heading', { name: rows[0].title });
};
const menuItems = (title) => {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  const menu = screen.getByRole('menu', { name: `Actions for ${title}` });
  return within(menu).getAllByRole('menuitem');
};
const labels = items => items.map(item => item.childNodes[0].textContent);

describe('Questions in the card menu', () => {
  it('a day task has no Questions; the rest of its menu is unchanged', async () => {
    await show([dayTask]);
    expect(labels(menuItems('Cells - Monday Quiz'))).toEqual(['Distribute', 'Check submissions', 'Delete']);
  });

  it('an ai_generated row has no Questions and, as before, no Delete', async () => {
    await show([aiRow]);
    expect(labels(menuItems('AI worksheet'))).toEqual(['Distribute', 'Check submissions']);
  });

  it('a Create Worksheet row has no Questions; the rest of its menu is unchanged', async () => {
    await show([manual]);
    expect(labels(menuItems('Hand quiz'))).toEqual(['Distribute', 'Check submissions', 'Delete']);
  });

  it('a distributed Create Worksheet row has no Questions; Delete keeps "Already distributed"', async () => {
    hook.state = { assigneeCounts: { m1: 2 } };
    await show([manual]);
    const items = menuItems('Hand quiz');
    expect(labels(items)).not.toContain('Questions');
    const remove = items.find(item => item.childNodes[0].textContent === 'Delete');
    expect(remove.disabled).toBe(true);
    expect(remove.textContent).toContain('Already distributed');
  });

  it('while counts load, a manual row has no Questions and Delete stays locked', async () => {
    hook.state = { assigneeCountsLoading: true };
    await show([manual]);
    const items = menuItems('Hand quiz');
    expect(labels(items)).not.toContain('Questions');
    expect(items.find(item => item.childNodes[0].textContent === 'Delete').disabled).toBe(true);
  });

  it('a mixed list has Questions on no card', async () => {
    await show([dayTask, aiRow, manual]);
    expect(labels(menuItems('Cells - Monday Quiz'))).not.toContain('Questions');
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Actions for Cells - Monday Quiz' }), { key: 'Escape' });
    expect(labels(menuItems('AI worksheet'))).not.toContain('Questions');
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Actions for AI worksheet' }), { key: 'Escape' });
    expect(labels(menuItems('Hand quiz'))).not.toContain('Questions');
  });
});

describe('Edit questions in Preview', () => {
  const legacy = { id: 'l1', title: 'Old sheet', subject: 'Science', task_type: 'quiz', items: 3 };
  const preview = async (rows, title) => {
    await show(rows);
    const card = screen.getByRole('heading', { name: title }).closest('div[class]').parentElement;
    fireEvent.click(within(card).getAllByRole('button', { name: 'Preview' })[0]);
    await screen.findByRole('heading', { name: `Preview: ${title}` });
  };
  const editButton = () => screen.queryByRole('button', { name: 'Edit questions' });
  beforeEach(() => { hook.state = { loadItems: vi.fn(async () => ({ items: [], keys: {} })) }; });

  it('an undistributed manual task offers it, and it opens the editor in place of the preview', async () => {
    await preview([manual], 'Hand quiz');
    fireEvent.click(editButton());
    expect(screen.getByRole('region', { name: 'Mock questions editor' }).textContent).toBe('Hand quiz');
    expect(screen.queryByRole('heading', { name: 'Preview: Hand quiz' })).toBeNull();
  });

  it('an undistributed manual row in the plain Preview also offers it', async () => {
    await preview([legacy], 'Old sheet');
    fireEvent.click(editButton());
    expect(screen.getByRole('region', { name: 'Mock questions editor' }).textContent).toBe('Old sheet');
  });

  it.each([
    ['distributed', { assigneeCounts: { m1: 2 } }],
    ['while the counts load', { assigneeCountsLoading: true }],
    ['when the counts failed', { assigneeCountsError: true }],
  ])('a manual task %s does not offer it', async (_name, extra) => {
    hook.state = { ...hook.state, ...extra };
    await preview([manual], 'Hand quiz');
    expect(editButton()).toBeNull();
  });

  it.each([['a Generate Day Task row', dayTask], ['an ai_generated row', aiRow]])('%s does not offer it', async (_name, row) => {
    await preview([row], row.title);
    expect(editButton()).toBeNull();
    expect(screen.queryByRole('region', { name: 'Mock questions editor' })).toBeNull();
  });
});
