// @vitest-environment jsdom
// U-T3 (design p4): one status tab row with counts; Search, Subject and Source
// in one tidy row (labelled selects); Rename a saved worksheet through the
// owner's existing update path, with the result checked (0 rows = refused).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';
import { renameWorksheet, titleProblem } from '../worksheets/worksheetRename';

const { db, auth, counts } = vi.hoisted(() => ({ db: { rows: [], updates: [], reply: null }, auth: { userData: { uid: 'teacher-1' } },
  counts: { assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    let update = null;
    const query = {
      select: () => query, eq: (...args) => { if (update) update.eq = args; return query; }, order: () => query,
      update: (values) => { update = { values }; db.updates.push(update); return query; },
      then: resolve => Promise.resolve(update ? (db.reply ?? { data: [{ id: update.eq?.[1], title: update.values.title }], error: null })
        : { data: table === 'worksheets' ? db.rows : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => {
  const base = { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
    postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
    mySections: [], sectionsError: false, fetchMySections: vi.fn(), loadItems: vi.fn(), distributeTask: vi.fn(), firstAssignedAt: {} };
  return { useWorksheetAssessment: () => ({ ...base, ...counts }) };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const row = (id, title, subject, extra = {}) => ({ id, title, subject, origin: 'manual', source_lesson_plan_id: null, collection_id: null, task_type: 'quiz', items: 3, ...extra });
beforeEach(() => {
  db.rows = [row('a', 'Sent quiz', 'English'), row('b', 'Kept quiz', 'English'), row('c', 'Cells', 'Science', { origin: 'ai_generated' })];
  db.updates = []; db.reply = null;
  Object.assign(counts, { assigneeCounts: { a: 12 }, assigneeCountsLoading: false, assigneeCountsError: false });
});
afterEach(cleanup);
const show = async () => { render(<WorksheetsTab />); await screen.findByRole('heading', { name: 'Sent quiz' }); };
const tabs = () => within(screen.getByRole('group', { name: 'Filter worksheets by status' })).getAllByRole('button').map(b => b.textContent);
const headings = () => screen.queryAllByRole('heading', { level: 3 }).map(h => h.textContent);

describe('U-T3 filters', () => {
  it('one tab row with counts that follow Subject and Source', async () => {
    await show();
    expect(tabs()).toEqual(['All 3', 'Drafts 0', 'Saved 2', 'Distributed 1']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Subject' }), { target: { value: 'English' } });
    expect(tabs()).toEqual(['All 2', 'Drafts 0', 'Saved 1', 'Distributed 1']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Subject' }), { target: { value: 'All' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Source' }), { target: { value: 'AI-generated' } });
    expect(tabs()).toEqual(['All 1', 'Drafts 0', 'Saved 1', 'Distributed 0']);
    expect(headings()).toEqual(['Cells']);
  });

  it('while distribution is unknown, Saved and Distributed show no number (never a guess)', async () => {
    counts.assigneeCountsLoading = true;
    await show();
    expect(tabs()).toEqual(['All 3', 'Drafts 0', 'Saved', 'Distributed']);
  });

  it('Subject lists "All subjects" and the subjects present; Source has "All sources"', async () => {
    await show();
    expect([...screen.getByRole('combobox', { name: 'Subject' }).options].map(o => o.textContent)).toEqual(['All subjects', 'English', 'Science']);
    expect([...screen.getByRole('combobox', { name: 'Source' }).options].map(o => o.textContent)).toEqual(['All sources', 'AI-generated', 'Manual']);
  });
});

// U-PDF-T: Rename moved from the card into its ⋯ menu (same dialog and update path).
const rename = title => {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  fireEvent.click(screen.getByRole('menuitem', { name: /^Rename/ }));
};

describe('U-T3 rename', () => {
  it('renames through the owner update path and shows the new title', async () => {
    await show();
    rename('Kept quiz');
    const dialog = screen.getByRole('dialog', { name: 'Rename worksheet' });
    fireEvent.change(within(dialog).getByLabelText('Worksheet title'), { target: { value: '  Unit   quiz 2  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename worksheet' })).toBeNull());
    expect(db.updates).toEqual([{ values: { title: 'Unit quiz 2' }, eq: ['id', 'b'] }]);
    expect(headings()).toContain('Unit quiz 2');
    expect(headings()).not.toContain('Kept quiz');
  });

  it('an empty title is refused before any write', async () => {
    await show();
    rename('Kept quiz');
    const dialog = screen.getByRole('dialog', { name: 'Rename worksheet' });
    fireEvent.change(within(dialog).getByLabelText('Worksheet title'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));
    expect(await within(dialog).findByText('Enter a title.')).toBeTruthy();
    expect(db.updates).toHaveLength(0);
  });

  it('a refused or failed write keeps the dialog open with a friendly message; the old title stays', async () => {
    db.reply = { data: [], error: null };
    await show();
    rename('Kept quiz');
    const dialog = screen.getByRole('dialog', { name: 'Rename worksheet' });
    fireEvent.change(within(dialog).getByLabelText('Worksheet title'), { target: { value: 'New name' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save title' }));
    expect(await within(dialog).findByText('Only the teacher who made this worksheet can rename it.')).toBeTruthy();
    expect(headings()).toContain('Kept quiz');
  });

  it('the rules: trimmed, spaces collapsed, at most 150 characters; raw errors never shown', async () => {
    expect(titleProblem('')).toBe('Enter a title.');
    expect(titleProblem('x'.repeat(151))).toBe('Use 150 characters or fewer.');
    expect(titleProblem('x'.repeat(150))).toBe('');
    const client = { from: () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: null, error: { message: 'duplicate key value violates unique constraint' } }) }) }) }) };
    const result = await renameWorksheet('b', 'Okay', client);
    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/duplicate key|constraint/);
  });
});
