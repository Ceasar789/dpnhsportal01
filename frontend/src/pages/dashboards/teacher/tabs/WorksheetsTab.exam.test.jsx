// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { db, auth } = vi.hoisted(() => ({ db: { rows: [], inserts: [] }, auth: { userData: { uid: 'teacher-1' } } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      insert: rows => {
        db.inserts.push(rows);
        return { select: () => ({ single: async () => {
          const row = { ...rows[0], id: 'new-exam' };
          db.rows = [row, ...db.rows];
          return { data: row, error: null };
        } }) };
      },
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? db.rows : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => {
  const base = { mySubjects: [{ id: 'english', name: 'English', grades: ['Grade 7'] }], schoolYear: '2030-2031',
    subjectLoading: false, subjectError: false, postings: [], postingsError: false, fetchMySubject: vi.fn(),
    fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(), mySections: [], sectionsError: false, fetchMySections: vi.fn(),
    loadItems: vi.fn(), saveItems: vi.fn(), setCheckingMode: vi.fn(), distributeTask: vi.fn(),
    assigneeCounts: {}, firstAssignedAt: {}, assigneeCountsLoading: false, assigneeCountsError: false };
  return { useWorksheetAssessment: () => base };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: ({ worksheet }) => <section aria-label="Mock questions editor">
  <p>Editing {worksheet.title} ({worksheet.task_type})</p>
</section> }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const exam = { id: 'e1', title: 'Unit exam', subject: 'English', task_type: 'exam', origin: 'manual',
  source_lesson_plan_id: null, collection_id: null, items: 3 };

beforeEach(() => { db.rows = []; db.inserts = []; });
afterEach(cleanup);

const distributeItem = (title) => {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  return within(screen.getByRole('menu', { name: `Actions for ${title}` })).getByRole('menuitem', { name: /^Distribute/ });
};

describe('Exam in the Worksheets tab', () => {
  it('Create Exam saves an exam row and opens the Questions editor', async () => {
    render(<WorksheetsTab />);
    await screen.findByText(/No worksheets yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Worksheet' });
    fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: 'exam' } });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Unit exam' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Create' })); });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0][0]).toMatchObject({ task_type: 'exam', checking_mode: 'auto', items: 0, origin: 'manual',
      source_lesson_plan_id: null, collection_id: null });
    expect(screen.getByText('Editing Unit exam (exam)')).toBeTruthy();
    expect(screen.queryByText('Activity created')).toBeNull();
  });

  it('an Exam with questions can be distributed', async () => {
    db.rows = [exam];
    render(<WorksheetsTab />);
    await screen.findByRole('heading', { name: 'Unit exam' });
    expect(distributeItem('Unit exam').disabled).toBe(false);
  });

  it('an Exam with no questions has Distribute disabled with the reason', async () => {
    db.rows = [{ ...exam, items: 0, instructions: 'Read carefully.' }];
    render(<WorksheetsTab />);
    await screen.findByRole('heading', { name: 'Unit exam' });
    const control = distributeItem('Unit exam');
    expect(control.disabled).toBe(true);
    expect(control.textContent).toContain('No questions or directions yet');
  });

  it('an Exam is Manual in the Source filter and its badge', async () => {
    db.rows = [exam, { id: 'a1', title: 'AI sheet', subject: 'English', origin: 'ai_generated', items: 2 }];
    render(<WorksheetsTab />);
    await screen.findByRole('heading', { name: 'Unit exam' });
    expect(screen.getByRole('heading', { name: 'Unit exam' }).parentElement.textContent).toContain('Manual');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter worksheets by source' })).getByRole('button', { name: 'Manual' }));
    expect(screen.getByRole('heading', { name: 'Unit exam' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'AI sheet' })).toBeNull();
  });
});
