// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';
const officialYear = '2030-2031';

const { responses, calls, filters, authUser } = vi.hoisted(() => ({ responses: { school_settings: { data: { school_year: '2030-2031' }, error: null } }, calls: [], filters: [], authUser: { uid: 'teacher-1' } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: authUser }) }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from: (table) => {
    calls.push(table);
    const query = {
      select: () => query, eq: (column, value) => { filters.push([table, column, value]); return query; }, range: () => query, in: () => query,
      single: () => Promise.resolve(responses[table] || { data: null, error: null }),
      then: (resolve) => Promise.resolve(responses[table] || { data: [], error: null }).then(resolve),
    };
    return query;
  } },
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: (query) => query() }));

afterEach(() => { cleanup(); authUser.uid = 'teacher-1'; calls.length = 0; filters.length = 0; Object.keys(responses).forEach(key => delete responses[key]); responses.school_settings = { data: { school_year: officialYear }, error: null }; });

describe('worksheet teaching-load options', () => {
  it('auto-selects one subject and preserves its assigned grade', async () => {
    responses.teacher_subjects = { data: [
      { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
    ], error: null };
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    expect(result.current.mySubjects).toEqual([{ id: 'math', name: 'Mathematics', grades: ['Grade 7'] }]);
    expect(result.current.mySubject?.id).toBe('math');
    expect(filters).toContainEqual(['teacher_subjects', 'teacher_id', 'teacher-1']);
    expect(filters).toContainEqual(['teacher_subjects', 'school_year', officialYear]);
    expect(calls).toContain('school_settings');
    expect(result.current.schoolYear).toBe(officialYear);
  });

  it('fails closed when Settings has no valid academic year', async () => {
    responses.school_settings = { data: null, error: null };
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    expect(result.current.subjectError).toBe(true);
    expect(result.current.schoolYear).toBeNull();
    expect(calls).not.toContain('teacher_subjects');
  });

  it('drops old authoring choices when Settings year changes on refresh', async () => {
    responses.teacher_subjects = { data: [
      { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
    ], error: null };
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.mySubjects).toHaveLength(1));
    responses.school_settings = { data: { school_year: '2031-2032' }, error: null };
    responses.teacher_subjects = { data: [], error: null };
    await act(async () => { await result.current.fetchMySubject(); });
    expect(result.current.schoolYear).toBe('2031-2032');
    expect(result.current.mySubjects).toEqual([]);
    expect(filters).toContainEqual(['teacher_subjects', 'school_year', '2031-2032']);
  });

  it('refuses legacy distribution without a trusted writer', async () => {
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    const before = calls.length;
    const response = await result.current.distributeTask('worksheet-1', 'section-1', ['student-1'], '2030-11-01T00:00:00Z');
    expect(response.ok).toBe(false);
    expect(response.message).toContain('unavailable');
    expect(calls).toHaveLength(before);
  });

  it('groups duplicate subject rows by ID while retaining grade choices', async () => {
    responses.teacher_subjects = { data: [
      { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
      { subject_id: 'math', grade_level: 'Grade 8', subjects: { id: 'math', name: 'Mathematics' } },
      { subject_id: 'english', grade_level: 'Grade 7', subjects: { id: 'english', name: 'English' } },
    ], error: null };
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    expect(result.current.mySubjects).toEqual([
      { id: 'english', name: 'English', grades: ['Grade 7'] },
      { id: 'math', name: 'Mathematics', grades: ['Grade 7', 'Grade 8'] },
    ]);
    expect(result.current.mySubject).toBeNull();
    expect(calls).toContain('teacher_subjects');
  });

  it('does not turn an advised section into a teaching-load subject', async () => {
    responses.sections = { data: [{ id: 'section-1', name: 'Advisory', grade_level: 'Grade 7' }], error: null };
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    expect(result.current.mySubjects).toEqual([]);
  });

  it('fails closed when the teaching-load read fails', async () => {
    responses.teacher_subjects = { data: null, error: { message: 'offline' } };
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    expect(result.current.subjectError).toBe(true);
    expect(result.current.mySubjects).toEqual([]);
  });

  it('ignores an older read that finishes after a newer refresh', async () => {
    let finishOld;
    responses.teacher_subjects = new Promise(resolve => { finishOld = resolve; });
    const { result } = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(calls.filter(table => table === 'teacher_subjects')).toHaveLength(1));
    responses.teacher_subjects = { data: [
      { subject_id: 'english', grade_level: 'Grade 9', subjects: { id: 'english', name: 'English' } },
    ], error: null };
    await act(async () => { await result.current.fetchMySubject(); });
    await act(async () => { finishOld({ data: [
      { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
    ], error: null }); });
    expect(result.current.mySubjects.map(subject => subject.id)).toEqual(['english']);
  });

  it('never exposes the previous Teacher’s subjects during an auth identity change', async () => {
    responses.teacher_subjects = { data: [
      { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
    ], error: null };
    const view = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(view.result.current.mySubjects).toHaveLength(1));
    responses.teacher_subjects = { data: [
      { subject_id: 'english', grade_level: 'Grade 8', subjects: { id: 'english', name: 'English' } },
    ], error: null };
    authUser.uid = 'teacher-2';
    view.rerender();
    expect(view.result.current.mySubjects).toEqual([]);
    await waitFor(() => expect(view.result.current.mySubjects.map(subject => subject.id)).toEqual(['english']));
    expect(filters).toContainEqual(['teacher_subjects', 'teacher_id', 'teacher-2']);
  });
});

describe('production score write gate', () => {
  it('blocks result release and paper scoring before any database write', async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useWorksheetAssessment(showToast));
    await waitFor(() => expect(result.current.subjectLoading).toBe(false));
    const before = calls.length;
    const released = await result.current.releaseScore('submission-1', 'worksheet-1', 4, 5, []);
    const paper = await result.current.encodeManualScore('worksheet-1', 'section-1', 'student-1', 4, 5);
    expect(released).toBe(false);
    expect(paper).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('No score was saved or released'), 'error');
    expect(calls).toHaveLength(before);
  });
});
