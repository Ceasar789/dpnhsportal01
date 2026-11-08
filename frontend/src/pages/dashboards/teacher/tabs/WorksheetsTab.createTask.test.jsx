// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { db, auth, hook } = vi.hoisted(() => ({
  db: { rows: [], inserts: [], deletes: 0, listReads: 0, insertResult: null, pending: null },
  auth: { userData: { uid: 'teacher-1' } },
  hook: { state: {} },
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      insert: rows => {
        db.inserts.push(rows);
        return { select: () => ({ single: async () => {
          if (db.pending) await db.pending;
          if (db.insertResult) return db.insertResult;
          const row = { ...rows[0], id: `new-${db.inserts.length}` };
          db.rows = [row, ...db.rows];
          return { data: row, error: null };
        } }) };
      },
      delete: () => { db.deletes += 1; return query; },
      then: resolve => {
        if (table === 'worksheets') db.listReads += 1;
        return Promise.resolve({ data: table === 'worksheets' ? db.rows : [], error: null }).then(resolve);
      },
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => {
  const base = { mySubjects: [{ id: 'english', name: 'English', grades: ['Grade 7'] }], schoolYear: '2030-2031',
    subjectLoading: false, subjectError: false, postings: [], postingsError: false, fetchMySubject: vi.fn(),
    fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(), mySections: [], sectionsError: false, fetchMySections: vi.fn(),
    loadClassList: vi.fn(), loadAssignees: vi.fn(), loadSubmissions: vi.fn(), distributeTask: vi.fn(),
    loadItems: vi.fn(async () => ({ items: [], keys: {} })), saveItems: vi.fn(), setCheckingMode: vi.fn(),
    assigneeCounts: {}, firstAssignedAt: {}, assigneeCountsLoading: false, assigneeCountsError: false };
  return { useWorksheetAssessment: () => ({ ...base, ...hook.state }) };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: ({ worksheet, onClose }) => <section aria-label="Mock questions editor">
  <p>Editing {worksheet.title} ({worksheet.id})</p>
  <button onClick={onClose}>Mock close editor</button>
</section> }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

beforeEach(() => {
  Object.assign(db, { rows: [], inserts: [], deletes: 0, listReads: 0, insertResult: null, pending: null });
  hook.state = {};
  auth.userData = { uid: 'teacher-1' };
});
afterEach(cleanup);

const open = async () => {
  render(<WorksheetsTab />);
  await screen.findByText(/No worksheets yet/);
  fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
  return screen.getByRole('dialog', { name: 'Create Worksheet' });
};
const fill = (dialog, { type, title, directions }) => {
  fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: type } });
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: title } });
  if (directions !== undefined) fireEvent.change(within(dialog).getByLabelText('Directions'), { target: { value: directions } });
};
const create = async dialog => { await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Create' })); }); };

describe('Create Worksheet button', () => {
  it('opens the create dialog, not the local draft editor', async () => {
    const dialog = await open();
    expect(within(dialog).getByText('English')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Manual Worksheet draft entry' })).toBeNull();
    expect(db.inserts).toHaveLength(0);
  });

  it.each([['no teacher id', () => { auth.userData = {}; }], ['no school year', () => { hook.state = { schoolYear: null }; }]])(
    'is disabled with %s', async (_name, setup) => {
      setup();
      render(<WorksheetsTab />);
      expect(screen.getByRole('button', { name: 'Create Worksheet' }).disabled).toBe(true);
    });
});

describe('creating', () => {
  it('a Quiz opens the Questions editor on the new row and the list refreshes', async () => {
    const dialog = await open();
    const readsBefore = db.listReads;
    fill(dialog, { type: 'quiz', title: 'Conflict quiz' });
    await create(dialog);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0][0]).toMatchObject({ task_type: 'quiz', checking_mode: 'auto', origin: 'manual', items: 0,
      subject_id: 'english', grade_level: 'Grade 7', teacher_id: 'teacher-1' });
    expect(screen.getByText('Editing Conflict quiz (new-1)')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Create Worksheet' })).toBeNull();
    await waitFor(() => expect(db.listReads).toBeGreaterThan(readsBefore));
  });

  it('closing the editor keeps the empty task as a card', async () => {
    const dialog = await open();
    fill(dialog, { type: 'assignment', title: 'Essay on conflict' });
    await create(dialog);
    expect(db.inserts[0][0].checking_mode).toBe('manual');
    fireEvent.click(screen.getByRole('button', { name: 'Mock close editor' }));
    expect(await screen.findByRole('heading', { name: 'Essay on conflict' })).toBeTruthy();
    expect(db.deletes).toBe(0);
  });

  it('an Activity closes the dialog, shows a toast and opens no editor', async () => {
    const dialog = await open();
    fill(dialog, { type: 'activity', title: 'Map the conflict', directions: 'Work in pairs.' });
    await create(dialog);
    expect(db.inserts[0][0]).toMatchObject({ task_type: 'worksheet', instructions: 'Work in pairs.', checking_mode: 'manual' });
    expect(screen.queryByRole('dialog', { name: 'Create Worksheet' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Mock questions editor' })).toBeNull();
    expect(screen.getByText('Activity created')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Map the conflict' })).toBeTruthy();
  });

  it('a double click inserts one row', async () => {
    let release;
    db.pending = new Promise(resolve => { release = resolve; });
    const dialog = await open();
    fill(dialog, { type: 'quiz', title: 'Quiz' });
    const button = within(dialog).getByRole('button', { name: 'Create' });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => { release(); });
    expect(db.inserts).toHaveLength(1);
  });

  it('a failed insert keeps the dialog open with a friendly message and no editor', async () => {
    db.insertResult = { data: null, error: { message: 'permission denied for table worksheets' } };
    const dialog = await open();
    fill(dialog, { type: 'quiz', title: 'Quiz' });
    await create(dialog);
    expect(within(dialog).getByRole('alert').textContent).toBe('The worksheet could not be created. Check your worksheet list, then try again.');
    expect(screen.queryByText(/permission denied/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Mock questions editor' })).toBeNull();
  });

  it('a title with an HTML tag is saved and shown as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    const dialog = await open();
    fill(dialog, { type: 'quiz', title: `Q ${attack}` });
    await create(dialog);
    expect(db.inserts[0][0].title).toBe(`Q ${attack}`);
    expect(screen.getByText(`Editing Q ${attack} (new-1)`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mock close editor' }));
    expect(await screen.findByRole('heading', { name: `Q ${attack}` })).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
