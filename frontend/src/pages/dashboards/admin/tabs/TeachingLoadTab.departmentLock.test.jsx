// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const TeachingLoadTab = (await import('./TeachingLoadTab')).default;

const ENG = { id: 'eng', name: 'English', code: 'ENG' };
const SCI = { id: 'sci', name: 'Science', code: 'SCI' };
const MATH = { id: 'math', name: 'Mathematics', code: 'MATH' };
const ANA = { id: 'ana', name: 'Ana Cruz', email: 'ana@example.test', department: ' english ', status: 'active' };
const RAMON = { id: 'ramon', name: 'Ramon Delgado', email: 'ramon@example.test', department: 'Mathematics', status: 'active' };
const load = (id, teacher, subject, grade = 'Grade 7') => ({
  id, teacher_id: teacher.id, subject_id: subject.id, grade_level: grade, school_year: '2026-2027',
});

const ctx = (over = {}) => ({
  schoolYear: '2026-2027', setSchoolYear: vi.fn(),
  teachers: [ANA, RAMON], teachersError: false, teachersLoading: false, fetchTeachers: vi.fn(),
  subjects: [ENG, SCI, MATH], subjectsError: false, fetchSubjects: vi.fn(),
  teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(),
  addLoadEntries: vi.fn().mockResolvedValue(1), removeLoad: vi.fn().mockResolvedValue(true),
  copyLoadFromYear: vi.fn(), showToast: vi.fn(),
  ...over,
});
const choose = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
const lockedChip = () => screen.getByRole('group', { name: 'English, department subject, locked' });
const chips = () => screen.getByLabelText(/Subjects assigned to/);
const addSubject = (id) => {
  fireEvent.change(screen.getByLabelText('Add Subject'), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Subject' }));
};
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));

afterEach(cleanup);

describe('Teaching Load: the department subject is locked', () => {
  it('shows the locked chip, with "(department)", in every grade tab', () => {
    h.ctx = ctx();
    render(<TeachingLoadTab />);
    choose('Ana Cruz');
    for (const grade of GRADE_LEVELS) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${grade}`) }));
      expect(within(chips()).getByRole('group', { name: 'English, department subject, locked' })).toBeTruthy();
      expect(lockedChip().textContent).toContain('English (department)');
    }
  });

  it('cannot be removed or deselected, and counts as an assigned subject', () => {
    h.ctx = ctx({ teachingLoad: [load('l1', ANA, ENG), load('l2', ANA, SCI)] });
    render(<TeachingLoadTab />);
    choose('Ana Cruz');
    expect(within(lockedChip()).queryAllByRole('button')).toHaveLength(0);
    expect(lockedChip().getAttribute('tabindex')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove English/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Remove Science from Ana Cruz/ })).toBeTruthy();
    addSubject(ENG.id);
    expect(h.ctx.showToast).toHaveBeenCalledWith('English is already assigned to Ana Cruz for Grade 7.', 'error');
    const count = screen.getByText('Assigned Subjects', { selector: 'dt' }).nextElementSibling.textContent;
    expect(count).toBe('2');
  });

  it('says "not saved for this grade yet" until the row exists, then not', () => {
    h.ctx = ctx({ teachingLoad: [load('l1', ANA, ENG, 'Grade 8')] });
    const view = render(<TeachingLoadTab />);
    choose('Ana Cruz');
    expect(within(lockedChip()).getByText('not saved for this grade yet')).toBeTruthy();
    expect(screen.getByText('English (department) is not saved for Grade 7 yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Grade 8/ }));
    expect(within(lockedChip()).queryByText('not saved for this grade yet')).toBeNull();
    expect(screen.getByText('All changes saved')).toBeTruthy();
    h.ctx = ctx({ teachingLoad: [load('l1', ANA, ENG, 'Grade 8'), load('l2', ANA, ENG, 'Grade 7')] });
    view.rerender(<TeachingLoadTab />);
    fireEvent.click(screen.getByRole('button', { name: /^Grade 7/ }));
    expect(within(lockedChip()).queryByText('not saved for this grade yet')).toBeNull();
  });

  it('with nothing else staged, Save Assignment writes only the locked subject', async () => {
    h.ctx = ctx();
    render(<TeachingLoadTab />);
    choose('Ana Cruz');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    save();
    await waitFor(() => expect(h.ctx.addLoadEntries).toHaveBeenCalledWith([
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 7' },
    ]));
  });

  it('save adds the locked subject for this teacher, in this grade and grades with staged changes, after the chosen ones', async () => {
    h.ctx = ctx({ teachingLoad: [load('l9', ANA, SCI, 'Grade 9'), load('l10', ANA, ENG, 'Grade 10')] });
    render(<TeachingLoadTab />);
    choose('Ana Cruz');
    fireEvent.click(screen.getByRole('button', { name: /^Grade 8/ }));
    addSubject(SCI.id);
    fireEvent.click(screen.getByRole('button', { name: /^Grade 9/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove Science from Ana Cruz for Grade 9/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Grade 10/ }));
    save();
    await waitFor(() => expect(h.ctx.addLoadEntries).toHaveBeenCalledWith([
      { teacher_id: 'ana', subject_id: 'sci', grade_level: 'Grade 8' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 8' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 9' },
    ]));
    expect(h.ctx.removeLoad).toHaveBeenCalledWith(['l9'], { refresh: false });
  });

  it('never writes a locked row for a teacher who is not part of the save', async () => {
    h.ctx = ctx();
    render(<TeachingLoadTab />);
    choose('Ramon Delgado');
    addSubject(SCI.id);
    choose('Ana Cruz');
    fireEvent.click(screen.getByRole('button', { name: /^Grade 8/ }));
    save();
    await waitFor(() => expect(h.ctx.addLoadEntries).toHaveBeenCalledWith([
      { teacher_id: 'ramon', subject_id: 'sci', grade_level: 'Grade 7' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 8' },
    ]));
  });

  it('a department that matches no subject shows the note and locks nothing', () => {
    h.ctx = ctx({ teachers: [{ ...ANA, department: 'Languages' }] });
    render(<TeachingLoadTab />);
    choose('Ana Cruz');
    expect(screen.getByText("Department 'Languages' does not match a subject, so no subject is locked.")).toBeTruthy();
    expect(screen.queryByRole('group', { name: /department subject, locked/ })).toBeNull();
    expect(screen.getByText('No subjects assigned yet.')).toBeTruthy();
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('an empty department shows no note', () => {
    h.ctx = ctx({ teachers: [{ ...ANA, department: '' }] });
    render(<TeachingLoadTab />);
    choose('Ana Cruz');
    expect(screen.queryByText(/does not match a subject/)).toBeNull();
  });
});
