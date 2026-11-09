// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// counts: table -> number | 'error' | 'throw' for head-only count reads.
const h = vi.hoisted(() => ({ counts: {}, schedules: [], calls: [] }));

const readRows = () => ({
  subjects: [], profiles: [], teacher_subjects: [],
  sections: [{ id: 'section-1', name: '7-Rizal', capacity: 40, school_year: '2026-2027' }],
  schedules: h.schedules,
});

const queryFor = (table) => {
  const state = { table, operation: 'read', head: false };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => {
          h.calls.push({ ...state });
          if (state.head) {
            const value = h.counts[table];
            if (value === 'throw') return Promise.reject(new Error('offline')).then(resolve, reject);
            const result = value === 'error' || value === undefined
              ? { count: null, error: { message: 'denied' } } : { count: value, error: null };
            return Promise.resolve(result).then(resolve, reject);
          }
          const result = state.operation === 'delete'
            ? { data: [{ id: 'section-1' }], error: null }
            : { data: readRows()[table] || [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        };
      }
      return (...args) => {
        if (property === 'delete') state.operation = 'delete';
        if (property === 'select' && args[1]?.head) state.head = true;
        return query;
      };
    },
  });
  return query;
};

vi.mock('../../../config/supabase', () => ({ supabase: { from: vi.fn(table => queryFor(table)) } }));

const { useAcademicLogic } = await import('./useAcademicLogic');

// The real admin state: a useState setter, so functional updates behave as in the app.
const useHarness = () => {
  const [confirm, setConfirm] = useState(null);
  const logic = useAcademicLogic(vi.fn(), setConfirm);
  return { confirm, setConfirm, logic };
};
const setup = async () => {
  const view = renderHook(() => useHarness());
  await waitFor(() => expect(view.result.current.logic.schedulesLoading).toBe(false));
  await waitFor(() => expect(view.result.current.logic.sections).toHaveLength(1));
  return view;
};
const countsOf = confirm => Object.fromEntries(confirm.counts.map(c => [c.label, c.value]));

beforeEach(() => { h.counts = {}; h.schedules = []; h.calls = []; });
afterEach(cleanup);

describe('deleteSection confirmation', () => {
  it('lists everything the delete removes and says it cannot be undone', async () => {
    const { result } = await setup();
    act(() => result.current.logic.deleteSection('section-1'));
    const confirm = result.current.confirm;
    expect(confirm.title).toBe('Delete Section?');
    expect(confirm.label).toBe('7-Rizal');
    expect(confirm.details.join(' | ')).toMatch(/class list/);
    expect(confirm.details.join(' | ')).toMatch(/schedules/);
    expect(confirm.details.join(' | ')).toMatch(/attendance records/);
    expect(confirm.details.join(' | ')).toMatch(/submissions and scores/);
    expect(confirm.details.join(' | ')).toMatch(/task assignments/);
    expect(confirm.details.join(' | ')).toMatch(/grade records/);
    expect(confirm.warning).toBe('This cannot be undone.');
    expect(confirm.recommendation).toBe('To keep records, remove students and schedules first, or keep the section.');
    expect(confirm.requireConfirmedResult).toBe(true);
  });

  it('an empty section keeps the simple confirm once the counts arrive', async () => {
    h.counts = { section_students: 0, schedules: 0, attendance: 0, worksheet_submissions: 0, task_assignees: 0 };
    const { result } = await setup();
    act(() => result.current.logic.deleteSection('section-1'));
    expect(result.current.confirm.confirmName).toBe('7-Rizal'); // unknown while counting
    expect(countsOf(result.current.confirm)['Students in the class list']).toBe('Counting…');
    await waitFor(() => expect(result.current.confirm.confirmName).toBeNull());
    expect(countsOf(result.current.confirm)).toEqual({
      'Students in the class list': 0, Schedules: 0, 'Attendance records': 0, 'Student submissions': 0, 'Task assignments': 0,
    });
  });

  it('a section with students or schedules requires typing its name', async () => {
    h.counts = { section_students: 3, schedules: 1, attendance: 40, worksheet_submissions: 6, task_assignees: 9 };
    const { result } = await setup();
    act(() => result.current.logic.deleteSection('section-1'));
    await waitFor(() => expect(countsOf(result.current.confirm)['Students in the class list']).toBe(3));
    expect(result.current.confirm.confirmName).toBe('7-Rizal');
    expect(countsOf(result.current.confirm)).toEqual({
      'Students in the class list': 3, Schedules: 1, 'Attendance records': 40, 'Student submissions': 6, 'Task assignments': 9,
    });
  });

  it('a failed count does not block the dialog and says it could not be counted', async () => {
    h.counts = { section_students: 0, schedules: 0, attendance: 'error', worksheet_submissions: 'throw', task_assignees: 0 };
    const { result } = await setup();
    act(() => result.current.logic.deleteSection('section-1'));
    await waitFor(() => expect(countsOf(result.current.confirm)['Attendance records']).toBe('Could not be counted'));
    expect(countsOf(result.current.confirm)['Student submissions']).toBe('Could not be counted');
    // Students and schedules are known to be zero, so the simple confirm stays.
    expect(result.current.confirm.confirmName).toBeNull();
    let completed;
    await act(async () => { completed = await result.current.confirm.onConfirm(); });
    expect(completed).toBe(true);
  });

  it('a failed students count keeps the type-the-name step', async () => {
    h.counts = { section_students: 'error', schedules: 0, attendance: 0, worksheet_submissions: 0, task_assignees: 0 };
    const { result } = await setup();
    act(() => result.current.logic.deleteSection('section-1'));
    await waitFor(() => expect(countsOf(result.current.confirm)['Students in the class list']).toBe('Could not be counted'));
    expect(result.current.confirm.confirmName).toBe('7-Rizal');
  });

  it('a dialog that was cancelled is not reopened when the counts arrive', async () => {
    let release;
    h.counts = { section_students: 0, schedules: 0, attendance: 0, worksheet_submissions: 0, task_assignees: 0 };
    const { result } = await setup();
    const { supabase } = await import('../../../config/supabase');
    const original = supabase.from.getMockImplementation();
    const gate = new Promise(resolve => { release = resolve; });
    supabase.from.mockImplementation(table => {
      const query = original(table);
      return new Proxy(query, { get: (t, p) => (p === 'then' ? (res, rej) => gate.then(() => t.then(res, rej)) : t[p]) });
    });
    act(() => result.current.logic.deleteSection('section-1'));
    act(() => result.current.setConfirm(null));
    await act(async () => { release(); await gate; await new Promise(r => setTimeout(r, 0)); });
    expect(result.current.confirm).toBeNull();
    supabase.from.mockImplementation(original);
  });
});
