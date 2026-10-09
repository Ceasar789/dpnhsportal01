// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const TeachingLoadTab = (await import('./TeachingLoadTab')).default;

const MATH = { id: 'sub-math', name: 'Mathematics', code: 'MATH' };
const ENG = { id: 'sub-eng', name: 'English', code: 'ENG' };
const SCI = { id: 'sub-sci', name: 'Science', code: 'SCI' };

const ANA = {
  id: 't-ana', name: 'Ana Cruz', email: 'ana@example.com', department: 'English', status: 'active',
};
const RAMON = {
  id: 't-ramon', name: 'Ramon Delgado', email: 'ramon@example.com', department: 'Mathematics', status: 'active',
};

const load = (id, teacher, subject, grade = 'Grade 7') => ({
  id, teacher_id: teacher.id, subject_id: subject.id,
  grade_level: grade, school_year: '2026-2027',
});

const baseCtx = (over = {}) => ({
  schoolYear: '2026-2027',
  setSchoolYear: vi.fn(),
  teachers: [ANA, RAMON],
  teachersError: false,
  teachersLoading: false,
  subjects: [MATH, ENG, SCI],
  subjectsError: false,
  fetchSubjects: vi.fn(),
  teachingLoad: [],
  teachingLoadLoading: false,
  teachingLoadError: false,
  fetchTeachingLoad: vi.fn(),
  fetchTeachers: vi.fn(),
  addLoadEntries: vi.fn().mockResolvedValue(1),
  removeLoad: vi.fn().mockResolvedValue(true),
  copyLoadFromYear: vi.fn(),
  showToast: vi.fn(),
  ...over,
});

const chooseTeacher = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(name, 'i') }));
const subjectSelect = () => screen.getByLabelText('Add Subject');
const assignedSubjects = () => screen.getByLabelText(/Subjects assigned to/);
const addSubject = (id) => {
  fireEvent.change(subjectSelect(), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Subject' }));
};

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(cleanup);

describe('TeachingLoadTab teacher-centred workflow', () => {
  it('keeps the school-year and grade selectors and starts with guided teacher selection', () => {
    render(<TeachingLoadTab />);

    expect(screen.getByLabelText('School Year').value).toBe('2026-2027');
    expect(screen.getByRole('button', { name: /^Grade 7/ }).classList.contains('active')).toBe(true);
    expect(screen.getByText('Select a teacher to begin assigning subjects.')).toBeTruthy();
  });

  it('keeps the selected teacher, grade, status, and assigned count visible', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG), load('l2', ANA, SCI)] });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');

    const detail = screen.getByRole('heading', { name: 'Ana Cruz' }).closest('.teaching-detail');
    expect(within(assignedSubjects()).getByText('English')).toBeTruthy();
    expect(within(assignedSubjects()).getByText('Science')).toBeTruthy();
    expect(within(detail).getAllByText('Grade 7').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('Active').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('2').length).toBeGreaterThan(0);
  });

  it('searches teachers by department and reports the filtered count', () => {
    render(<TeachingLoadTab />);
    fireEvent.change(screen.getByLabelText('Search teachers'), { target: { value: 'mathemat' } });

    expect(screen.getByRole('button', { name: /Ramon Delgado/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ana Cruz/ })).toBeNull();
    expect(screen.getByText('1 of 2 shown')).toBeTruthy();
  });

  it('adds multiple subjects for one teacher without losing teacher context', () => {
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    addSubject(ENG.id);
    addSubject(SCI.id);

    expect(screen.getByRole('heading', { name: 'Ana Cruz' })).toBeTruthy();
    expect(within(assignedSubjects()).getByText('English')).toBeTruthy();
    expect(within(assignedSubjects()).getByText('Science')).toBeTruthy();
    expect(screen.getByText('2 changes across this teaching load')).toBeTruthy();
    expect(h.ctx.addLoadEntries).not.toHaveBeenCalled();
  });

  it('keeps the school-year context fixed until staged changes are saved or discarded', () => {
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    addSubject(ENG.id);

    expect(screen.getByLabelText('School Year').disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Copy from 2025-2026/ }).disabled).toBe(true);
    expect(screen.getByText('Save or discard changes before changing the school year.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('School Year').disabled).toBe(false);
  });

  it('allows another teacher to hold a subject already used in the grade', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', RAMON, MATH)] });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    addSubject(MATH.id);

    expect(within(assignedSubjects()).getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(h.ctx.showToast).not.toHaveBeenCalled();
  });

  it('blocks only the same subject for the same teacher and grade with friendly copy', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, SCI)] });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    addSubject(SCI.id);

    expect(h.ctx.showToast).toHaveBeenCalledWith(
      'Science is already assigned to Ana Cruz for Grade 7.', 'error',
    );
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('stages saved-subject removal until Save Assignment', async () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG)] });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');

    fireEvent.click(screen.getByRole('button', { name: /Remove English from Ana Cruz/ }));
    expect(h.ctx.removeLoad).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));
    await waitFor(() => expect(h.ctx.removeLoad).toHaveBeenCalledWith(['l1'], { refresh: false }));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy());
  });

  it('saves all staged subjects in one existing batch call', async () => {
    h.ctx = baseCtx({ addLoadEntries: vi.fn().mockResolvedValue(2) });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    addSubject(ENG.id);
    addSubject(SCI.id);

    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));
    await waitFor(() => expect(h.ctx.addLoadEntries).toHaveBeenCalledWith([
      { teacher_id: ANA.id, subject_id: ENG.id, grade_level: 'Grade 7' },
      { teacher_id: ANA.id, subject_id: SCI.id, grade_level: 'Grade 7' },
    ]));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy());
  });

  it('keeps unsaved changes when a save fails', async () => {
    h.ctx = baseCtx({ addLoadEntries: vi.fn().mockResolvedValue(null) });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    addSubject(ENG.id);
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

    await waitFor(() => expect(h.ctx.addLoadEntries).toHaveBeenCalled());
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(within(assignedSubjects()).getByText('English')).toBeTruthy();
  });

  it('keeps the selected teacher while changing grade context', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG, 'Grade 8')] });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    fireEvent.click(screen.getByRole('button', { name: /^Grade 8/ }));

    expect(screen.getByRole('heading', { name: 'Ana Cruz' })).toBeTruthy();
    expect(within(assignedSubjects()).getByText('English')).toBeTruthy();
    expect(screen.getAllByText('Grade 8').length).toBeGreaterThan(0);
  });

  it('reports teaching-load and subject read failures with the correct retry', () => {
    h.ctx = baseCtx({ teachingLoadError: true, subjectsError: true });
    render(<TeachingLoadTab />);
    chooseTeacher('Ana Cruz');

    expect(screen.getByText(/Could not load teaching assignments/)).toBeTruthy();
    expect(screen.getByText(/Could not load subjects/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
  });
});
