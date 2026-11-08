// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TASK_TYPE_LABELS } from '../../../../lib/taskFormatting';
import { buildManualTaskRow } from './manualTaskSave';
import CreateTaskModal from './CreateTaskModal';
import SavedDayTaskPreview from './SavedDayTaskPreview';

vi.mock('../../../../config/supabase', () => ({ supabase: {} }));
afterEach(cleanup);

const base = { teacherId: 'teacher-1', title: 'Unit exam', directions: '', subject: { id: 'english', name: 'English' }, gradeLevel: 'Grade 7' };

describe('manualTaskSave and Exam', () => {
  it.each([['auto', 'auto'], ['manual', 'manual']])('an Exam with %s asked is written like a Quiz', (asked, stored) => {
    expect(buildManualTaskRow({ ...base, taskType: 'exam', checkingMode: asked })).toEqual({
      teacher_id: 'teacher-1', title: 'Unit exam', task_type: 'exam', instructions: null, items: 0, origin: 'manual',
      source_lesson_plan_id: null, collection_id: null, checking_mode: stored, status: 'Draft',
      subject: 'English', subject_id: 'english', grade_level: 'Grade 7', created_at: expect.any(String) });
  });

  it('an Exam does not need directions', () => {
    expect(buildManualTaskRow({ ...base, taskType: 'exam', directions: '   ' })).not.toBeNull();
  });

  it.each([['bogus'], ['project'], ['worksheet'], ['Exam'], [undefined]])('an unknown type %s is still refused', (taskType) => {
    expect(buildManualTaskRow({ ...base, taskType })).toBeNull();
  });
});

describe('the Exam label', () => {
  it('TASK_TYPE_LABELS names it Exam', () => {
    expect(TASK_TYPE_LABELS.exam).toBe('Exam');
  });
});

describe('Create Worksheet dialog and Exam', () => {
  const show = () => {
    const onSave = vi.fn(async () => ({ ok: true }));
    render(<CreateTaskModal subjectPicker={<p>Subject: English</p>} subjectReady saving={false} onSave={onSave} onClose={vi.fn()} />);
    return onSave;
  };
  const radio = name => screen.getByRole('radio', { name: new RegExp(`^${name}`) });

  it('lists Activity, Quiz, Assignment, Exam in that order', () => {
    show();
    expect(within(screen.getByLabelText('Type')).getAllByRole('option').map(option => option.textContent))
      .toEqual(['Activity', 'Quiz', 'Assignment', 'Exam']);
  });

  it('an Exam has the Quiz fields: optional directions and Auto-check by default, changeable', async () => {
    const onSave = show();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'exam' } });
    expect(screen.getByText(/Optional\./)).toBeTruthy();
    expect(radio('Auto-check').checked).toBe(true);
    expect(radio('Auto-check').disabled).toBe(false);
    expect(screen.queryByText('Assignments are answered in writing and checked by you.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unit exam' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create' })); });
    expect(onSave).toHaveBeenCalledWith({ title: 'Unit exam', taskType: 'exam', directions: '', checkingMode: 'auto' });
  });

  it('an Exam can be set to Manual check', async () => {
    const onSave = show();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'exam' } });
    fireEvent.click(radio('Manual check'));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unit exam' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create' })); });
    expect(onSave.mock.calls[0][0].checkingMode).toBe('manual');
  });
});

describe('preview of an Exam', () => {
  const exam = { id: 'e1', title: 'Unit exam', subject: 'English', grade_level: 'Grade 7', task_type: 'exam', instructions: 'Answer all.' };
  const paper = () => screen.findByRole('article', { name: 'Student-facing worksheet' });

  it('shows the EXAM heading with its questions', async () => {
    render(<SavedDayTaskPreview worksheet={exam} onClose={vi.fn()} loadItems={vi.fn(async () => ({
      items: [{ id: 'i1', position: 1, question: 'Name the planet', item_type: 'identification', options: null, points: 2 }],
      keys: { i1: { correct_answer: ['Mars'] } } }))} />);
    const doc = await paper();
    expect(within(doc).getByRole('heading', { name: 'EXAM' })).toBeTruthy();
    expect(doc.textContent).toContain('Name the planet');
    expect(screen.queryByText(/^No questions yet\./)).toBeNull();
  });

  it('an Exam with no questions shows the empty state, without Edit questions wording when there is no button', async () => {
    render(<SavedDayTaskPreview worksheet={exam} onClose={vi.fn()} loadItems={vi.fn(async () => ({ items: [], keys: {} }))} />);
    expect(within(await paper()).getByRole('heading', { name: 'EXAM' })).toBeTruthy();
    expect(screen.getByText('No questions yet.')).toBeTruthy();
    expect(screen.queryByText(/Edit questions/)).toBeNull();
  });

  it('with the Edit questions button, the empty state points to it', async () => {
    const onEditQuestions = vi.fn();
    render(<SavedDayTaskPreview worksheet={exam} onClose={vi.fn()} onEditQuestions={onEditQuestions}
      loadItems={vi.fn(async () => ({ items: [], keys: {} }))} />);
    expect(await screen.findByText('No questions yet. Use Edit questions to add some.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit questions' }));
    expect(onEditQuestions).toHaveBeenCalledTimes(1);
  });

  it('renders an HTML tag in the directions and title as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    render(<SavedDayTaskPreview worksheet={{ ...exam, title: `T ${attack}`, instructions: `D ${attack}` }} onClose={vi.fn()}
      loadItems={vi.fn(async () => ({ items: [], keys: {} }))} />);
    expect((await paper()).textContent).toContain(`D ${attack}`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
