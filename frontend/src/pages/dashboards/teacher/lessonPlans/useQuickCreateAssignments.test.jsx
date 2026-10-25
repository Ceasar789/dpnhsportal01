// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useQuickCreateAssignments from './useQuickCreateAssignments';

const { queries, responses } = vi.hoisted(() => ({ queries: [], responses: [] }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from(table) {
      const query = { table, filters: [], columns: '' };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        then(resolve) { return Promise.resolve(responses.shift() ?? { data: [], error: null }).then(resolve); },
      };
      return builder;
    },
  },
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));

const math = { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } };
afterEach(() => { cleanup(); queries.length = 0; responses.length = 0; });

describe('Lesson Plan assignment read adapter', () => {
  it('uses only the authenticated Teacher and current-year SELECT contract', async () => {
    responses.push({ data: [math], error: null });
    const { result } = renderHook(() => useQuickCreateAssignments('teacher-a', '2026-2027'));
    expect(result.current.assignmentRows).toEqual([]);
    await waitFor(() => expect(result.current.loadState).toBe('ready'));
    expect(result.current.assignmentRows).toEqual([math]);
    expect(result.current.sourceTeacherId).toBe('teacher-a');
    expect(result.current.sourceSchoolYear).toBe('2026-2027');
    expect(queries).toEqual([{ table: 'teacher_subjects', columns: 'subject_id, grade_level, subjects(id, name)',
      filters: [['teacher_id', 'teacher-a'], ['school_year', '2026-2027']] }]);
  });

  it('keeps confirmed empty distinct from a read error and clears rows on Retry', async () => {
    responses.push({ data: null, error: { message: 'Synthetic offline' } });
    const view = renderHook(() => useQuickCreateAssignments('teacher-a', '2026-2027'));
    await waitFor(() => expect(view.result.current.loadState).toBe('error'));
    expect(view.result.current.assignmentRows).toEqual([]);
    responses.push({ data: [], error: null });
    act(() => view.result.current.retry());
    expect(view.result.current.loadState).toBe('loading');
    await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
    expect(view.result.current.assignmentRows).toEqual([]);
  });

  it('clears ready options on Teacher and school-year changes before replacement reads finish', async () => {
    responses.push({ data: [math], error: null });
    const view = renderHook(({ teacherId, year }) => useQuickCreateAssignments(teacherId, year),
      { initialProps: { teacherId: 'teacher-a', year: '2025-2026' } });
    await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
    expect(view.result.current.assignmentRows).toEqual([math]);

    let finishTeacher;
    responses.push(new Promise(resolve => { finishTeacher = resolve; }));
    view.rerender({ teacherId: 'teacher-b', year: '2025-2026' });
    expect(view.result.current.loadState).toBe('loading');
    expect(view.result.current.assignmentRows).toEqual([]);
    await waitFor(() => expect(queries).toHaveLength(2));
    await act(async () => finishTeacher({ data: [math], error: null }));
    expect(view.result.current.sourceTeacherId).toBe('teacher-b');

    let finishYear;
    responses.push(new Promise(resolve => { finishYear = resolve; }));
    view.rerender({ teacherId: 'teacher-b', year: '2026-2027' });
    expect(view.result.current.loadState).toBe('loading');
    expect(view.result.current.assignmentRows).toEqual([]);
    await waitFor(() => expect(queries).toHaveLength(3));
    await act(async () => finishYear({ data: [], error: null }));
    expect(view.result.current.sourceSchoolYear).toBe('2026-2027');
    expect(view.result.current.assignmentRows).toEqual([]);
  });

  it('hides another Teacher’s rows immediately and ignores a late prior response', async () => {
    let finishOld;
    responses.push(new Promise(resolve => { finishOld = resolve; }));
    const view = renderHook(({ teacherId }) => useQuickCreateAssignments(teacherId, '2026-2027'),
      { initialProps: { teacherId: 'teacher-a' } });
    await waitFor(() => expect(queries).toHaveLength(1));
    responses.push({ data: [math], error: null });
    view.rerender({ teacherId: 'teacher-b' });
    expect(view.result.current.assignmentRows).toEqual([]);
    await waitFor(() => expect(view.result.current.sourceTeacherId).toBe('teacher-b'));
    await act(async () => finishOld({ data: [{ ...math, subject_id: 'old' }], error: null }));
    expect(view.result.current.assignmentRows).toEqual([math]);
  });

  it('invalidates prior-year rows immediately and rejects their late result', async () => {
    let finishOld;
    responses.push(new Promise(resolve => { finishOld = resolve; }));
    const view = renderHook(({ year }) => useQuickCreateAssignments('teacher-a', year),
      { initialProps: { year: '2025-2026' } });
    await waitFor(() => expect(queries).toHaveLength(1));
    responses.push({ data: [math], error: null });
    view.rerender({ year: '2026-2027' });
    expect(view.result.current.assignmentRows).toEqual([]);
    await waitFor(() => expect(view.result.current.sourceSchoolYear).toBe('2026-2027'));
    await act(async () => finishOld({ data: [{ ...math, grade_level: 'Grade 8' }], error: null }));
    expect(view.result.current.assignmentRows).toEqual([math]);
    expect(queries[1].filters).toContainEqual(['school_year', '2026-2027']);
  });

  it('does not query without a Teacher identity', async () => {
    const { result } = renderHook(() => useQuickCreateAssignments(null, '2026-2027'));
    expect(result.current.loadState).toBe('unavailable');
    expect(result.current.assignmentRows).toEqual([]);
    await act(async () => Promise.resolve());
    expect(queries).toEqual([]);
  });
});
