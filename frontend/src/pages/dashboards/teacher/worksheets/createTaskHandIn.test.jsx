// @vitest-environment jsdom
// S4: creating an Activity or Assignment that students hand in as a file or a
// link (with Points), and proof that every other task is created exactly as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';

const { db, auth, hook } = vi.hoisted(() => ({
  db: { rows: [], inserts: [] },
  auth: { userData: { uid: 'teacher-1' } },
  hook: { state: {} },
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: (table) => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      insert: (rows) => {
        db.inserts.push(rows);
        return { select: () => ({ single: async () => {
          const row = { ...rows[0], id: `new-${db.inserts.length}` };
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
vi.mock('./useWorksheetAssessment', () => {
  const base = { mySubjects: [{ id: 'english', name: 'English', grades: ['Grade 7'] }], schoolYear: '2030-2031',
    subjectLoading: false, subjectError: false, postings: [], postingsError: false, fetchMySubject: vi.fn(),
    fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(), mySections: [], sectionsError: false, fetchMySections: vi.fn(),
    loadClassList: vi.fn(), loadAssignees: vi.fn(), loadSubmissions: vi.fn(), distributeTask: vi.fn(),
    loadItems: vi.fn(async () => ({ items: [], keys: {} })), saveItems: vi.fn(), setCheckingMode: vi.fn(),
    assigneeCounts: {}, firstAssignedAt: {}, assigneeCountsLoading: false, assigneeCountsError: false };
  return { useWorksheetAssessment: () => ({ ...base, ...hook.state }) };
});
vi.mock('./QuestionBuilderModal', () => ({ default: ({ worksheet }) => <section aria-label="Mock questions editor">Editing {worksheet.title}</section> }));
vi.mock('./DistributeModal', () => ({ default: () => null }));
vi.mock('./CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('./EncodeScoresModal', () => ({ default: () => null }));

import WorksheetsTab from '../tabs/WorksheetsTab';
import CreateTaskModal from './CreateTaskModal';
import { buildManualTaskRow, pointsProblem } from './manualTaskSave';

beforeEach(() => { db.rows = []; db.inserts = []; hook.state = {}; });
afterEach(cleanup);

const showForm = (onSave = vi.fn(async () => ({ ok: true }))) => {
  render(<CreateTaskModal subjectPicker={<p>Subject: English</p>} subjectReady saving={false} onSave={onSave} onClose={vi.fn()} />);
  return onSave;
};
const set = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const createBtn = () => screen.getByRole('button', { name: 'Create' });

describe('the create form', () => {
  it('"How students hand in" is offered for Activity and Assignment only', () => {
    showForm();
    expect(screen.getByLabelText('How students hand in').value).toBe('none');
    expect([...screen.getByLabelText('How students hand in').options].map(o => o.textContent)).toEqual(['Nothing to hand in', 'A file or a link']);
    set('Type', 'assignment');
    expect([...screen.getByLabelText('How students hand in').options].map(o => o.textContent)).toEqual(['Answers to questions', 'A file or a link']);
    for (const type of ['quiz', 'exam']) {
      set('Type', type);
      expect(screen.queryByLabelText('How students hand in')).toBeNull();
      expect(screen.queryByLabelText('Points')).toBeNull();
    }
  });

  it('file or link: Points required (above 0, at most 9999.99, 2 decimals), directions required, Checking hidden', () => {
    showForm();
    set('Type', 'assignment');
    set('How students hand in', 'attachment');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText('After creating, add the questions and their points.')).toBeNull();
    expect(screen.getByText(/Required for a file or link task\./)).toBeTruthy();
    set('Title', 'Poster');
    expect(createBtn().disabled).toBe(true);
    set('Directions', 'Draw the water cycle.');
    expect(createBtn().disabled).toBe(true);
    for (const bad of ['0', '-1', '10000', '1.234', 'ten']) {
      set('Points', bad);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toBe('Enter points above 0, up to 9999.99, with at most 2 decimals.');
      expect(screen.getByLabelText('Points').getAttribute('aria-describedby')).toBe(alert.id);
      expect(createBtn().disabled).toBe(true);
    }
    set('Points', '25.5');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(createBtn().disabled).toBe(false);
  });

  it('sends handIn and points only when a file or link was chosen', async () => {
    const onSave = showForm();
    set('Title', 'Poster');
    set('How students hand in', 'attachment');
    set('Directions', 'Draw it.');
    set('Points', ' 10 ');
    await act(async () => { fireEvent.click(createBtn()); });
    expect(onSave).toHaveBeenCalledWith({ title: 'Poster', taskType: 'activity', directions: 'Draw it.', checkingMode: 'manual', handIn: 'attachment', points: '10' });
  });

  it('switching back to Quiz drops the choice: the payload is exactly as before', async () => {
    const onSave = showForm();
    set('How students hand in', 'attachment');
    set('Type', 'quiz');
    set('Title', 'Fractions');
    await act(async () => { fireEvent.click(createBtn()); });
    expect(onSave).toHaveBeenCalledWith({ title: 'Fractions', taskType: 'quiz', directions: '', checkingMode: 'auto' });
  });

  it('the form is wrapped for its phone stylesheet (16px fields)', () => {
    showForm();
    expect(screen.getByLabelText('Title').closest('.ctm-form')).toBeTruthy();
  });
});

describe('the saved row', () => {
  const base = { teacherId: 't', title: 'Poster', directions: 'Draw it.', subject: { id: 'eng', name: 'English' }, gradeLevel: 'Grade 7' };

  it('a file/link task: submission_mode, max_points, Manual checking', () => {
    for (const taskType of ['activity', 'assignment']) {
      const row = buildManualTaskRow({ ...base, taskType, checkingMode: 'auto', handIn: 'attachment', points: '12.5' });
      expect(row).toMatchObject({ submission_mode: 'attachment', max_points: 12.5, checking_mode: 'manual', items: 0, instructions: 'Draw it.' });
    }
  });

  it('refused: missing directions, bad points, or a quiz/exam', () => {
    expect(buildManualTaskRow({ ...base, taskType: 'assignment', directions: '  ', handIn: 'attachment', points: '10' })).toBeNull();
    expect(buildManualTaskRow({ ...base, taskType: 'activity', handIn: 'attachment', points: '0' })).toBeNull();
    expect(buildManualTaskRow({ ...base, taskType: 'quiz', handIn: 'attachment', points: '10' })).toBeNull();
    expect(buildManualTaskRow({ ...base, taskType: 'exam', handIn: 'attachment', points: '10' })).toBeNull();
  });

  it('every other task has no submission_mode or max_points at all', () => {
    for (const taskType of ['activity', 'quiz', 'assignment', 'exam']) {
      const row = buildManualTaskRow({ ...base, taskType, checkingMode: 'auto' });
      expect(row).not.toHaveProperty('submission_mode');
      expect(row).not.toHaveProperty('max_points');
    }
    expect(pointsProblem('9999.99')).toBeNull();
    expect(pointsProblem('')).toBe('Enter the points for this task.');
  });
});

describe('WorksheetsTab', () => {
  const open = async () => {
    render(<WorksheetsTab />);
    await screen.findByText(/No worksheets yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    return screen.getByRole('dialog', { name: 'Create Worksheet' });
  };
  const fileTask = { id: 'w1', title: 'Poster', task_type: 'assignment', items: 0, instructions: 'Draw it.', origin: 'manual',
    submission_mode: 'attachment', max_points: 25, subject: 'English', subject_id: 'english', grade_level: 'Grade 7', created_at: '2026-11-01T00:00:00Z' };

  it('a file/link Assignment opens no Questions editor, shows a toast, and saves the mode and points', async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: 'assignment' } });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Poster' } });
    fireEvent.change(within(dialog).getByLabelText('How students hand in'), { target: { value: 'attachment' } });
    fireEvent.change(within(dialog).getByLabelText('Directions'), { target: { value: 'Draw it.' } });
    fireEvent.change(within(dialog).getByLabelText('Points'), { target: { value: '25' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Create' })); });
    expect(db.inserts[0][0]).toMatchObject({ task_type: 'assignment', submission_mode: 'attachment', max_points: 25, checking_mode: 'manual' });
    expect(screen.queryByRole('region', { name: 'Mock questions editor' })).toBeNull();
    expect(screen.getByText('Assignment created')).toBeTruthy();
  });

  it('the card reads "File or link · N pts" and Distribute is allowed with directions', async () => {
    db.rows = [fileTask];
    render(<WorksheetsTab />);
    const heading = await screen.findByRole('heading', { name: 'Poster' });
    const card = heading.closest('.rounded-xl');
    expect(within(card).getByText(/File or link · 25 pts/)).toBeTruthy();
    expect(within(card).getByText('Not distributed')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'More actions for Poster' }));
    expect(screen.getByRole('menuitem', { name: /^Distribute/ }).disabled).toBe(false);
  });

  it('a file/link task without directions cannot be distributed', async () => {
    db.rows = [{ ...fileTask, instructions: '  ' }];
    render(<WorksheetsTab />);
    const card = (await screen.findByRole('heading', { name: 'Poster' })).closest('.rounded-xl');
    fireEvent.click(within(card).getByRole('button', { name: 'More actions for Poster' }));
    expect(screen.getByRole('menuitem', { name: /Distribute/ }).disabled).toBe(true);
  });

  it('Preview offers no Edit questions for a file/link task (a manual quiz still does)', async () => {
    db.rows = [fileTask, { ...fileTask, id: 'w2', title: 'Quiz one', task_type: 'quiz', submission_mode: 'answers', max_points: null, instructions: null }];
    render(<WorksheetsTab />);
    const posterCard = (await screen.findByRole('heading', { name: 'Poster' })).closest('.rounded-xl');
    fireEvent.click(within(posterCard).getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText(/No questions yet\.$/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit questions' })).toBeNull();
    cleanup();
    render(<WorksheetsTab />);
    const quizCard = (await screen.findByRole('heading', { name: 'Quiz one' })).closest('.rounded-xl');
    fireEvent.click(within(quizCard).getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('button', { name: 'Edit questions' })).toBeTruthy();
  });
});

describe('the create form stylesheet', () => {
  const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');
  it('16px and 44px fields on phones, a passing error red, scoped to the form, imported by the modal, no theme literal', () => {
    const css = read('pages/dashboards/teacher/worksheets/create-task.css');
    expect(css).toMatch(/@media \(max-width: 767px\), \(max-width: 1099\.98px\) and \(max-height: 500px\) \{\s*\.ctm-form input,\s*\.ctm-form select,\s*\.ctm-form textarea \{ font-size: 16px; \}\s*\.ctm-form input,\s*\.ctm-form select \{ min-height: 44px; \}\s*\}/);
    expect(css).toContain('.ctm-form .ctm-error { color: var(--badge-red-fg); }');
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(css).not.toContain('!important');
    expect(read('pages/dashboards/teacher/worksheets/CreateTaskModal.jsx')).toContain("import './create-task.css';");
  });
});
