// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// failCheck: the clash-check read of schedules fails ('error') or throws ('throw').
const h = vi.hoisted(() => ({
  calls: [], subjects: [], teachers: [], teachingLoad: [], sections: [], schedules: [], failCheck: null,
}));

const query = (table) => {
  const state = { table, method: 'select', payload: null, filters: [], columns: '' };
  const api = {
    select(columns) { if (state.method === 'select') state.columns = columns || ''; return api; },
    insert(payload) { state.method = 'insert'; state.payload = payload; return api; },
    delete() { state.method = 'delete'; return api; },
    eq(column, value) { state.filters.push([column, value]); return api; },
    in(column, value) { state.filters.push([column, value]); return api; },
    order() { return api; },
    then(resolve, reject) {
      h.calls.push({ ...state, filters: [...state.filters] });
      const isCheck = table === 'schedules' && state.method === 'select' && state.columns.includes('room_number');
      if (isCheck && h.failCheck === 'throw') return Promise.reject(new Error('offline')).then(resolve, reject);
      if (isCheck && h.failCheck === 'error') return Promise.resolve({ data: null, error: { message: 'denied' } }).then(resolve, reject);
      const rows = { subjects: h.subjects, profiles: h.teachers, teacher_subjects: h.teachingLoad, sections: h.sections, schedules: h.schedules };
      const result = state.method === 'select' ? { data: rows[table] || [], error: null } : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return api;
};

vi.mock('../../../config/supabase', () => ({ supabase: { from: vi.fn(table => query(table)) } }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: async (fn) => fn() }));

const { useAcademicLogic } = await import('./useAcademicLogic');

const YEAR = '2026-2027';
const MATH = { id: 'math', name: 'Mathematics', code: 'MATH', is_active: true };
const SCI = { id: 'sci', name: 'Science', code: 'SCI', is_active: true };
const ANA = { id: 'ana', name: 'Ana Reyes', role: 'teacher', status: 'active' };
const RIZAL = { id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: YEAR };
const MADRID = { id: 'madrid', name: '7-Madrid', grade_level: 'Grade 7', school_year: YEAR };
const LOAD = { id: 'l1', teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7', school_year: YEAR };
// Ana already teaches Science in 7-Madrid on Monday 08:00-09:00.
const BUSY = { id: 'busy', section_id: 'madrid', teacher_id: 'ana', subject_id: 'sci', day_of_week: 'Monday',
  start_time: '08:00:00', end_time: '09:00:00', room_number: 'Room 101', school_year: YEAR };

const setup = async () => {
  const showToast = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, vi.fn(), { status: 'ready', year: YEAR }));
  await waitFor(() => {
    expect(view.result.current.teachersLoading).toBe(false);
    expect(view.result.current.teachingLoadLoading).toBe(false);
    expect(view.result.current.sectionsLoading).toBe(false);
    expect(view.result.current.schedulesLoading).toBe(false);
  });
  h.calls.length = 0;
  return { ...view, showToast };
};
const fill = (result, { start = '08:30', end = '09:30', room = '' } = {}) => act(() => {
  result.current.openCreateSchedule({ sectionId: 'rizal', subjectId: 'math' });
  result.current.setSchedTeacher('ana');
  result.current.setSchedDay('Monday');
  result.current.setSchedStart(start);
  result.current.setSchedEnd(end);
  result.current.setSchedRoom(room);
});
const inserts = () => h.calls.filter(c => c.table === 'schedules' && c.method === 'insert');

beforeEach(() => {
  h.calls.length = 0;
  h.subjects = [MATH, SCI];
  h.teachers = [ANA];
  h.teachingLoad = [LOAD];
  h.sections = [RIZAL, MADRID];
  h.schedules = [];
  h.failCheck = null;
});
afterEach(cleanup);

describe('saveSchedule clash check', () => {
  it('a clash blocks the save, names the other class, and writes nothing', async () => {
    const { result } = await setup();
    h.schedules = [BUSY]; // appears only in the fresh read, not the list loaded on screen
    fill(result, { room: ' room 101' });
    let saved;
    await act(async () => { saved = await result.current.saveSchedule(); });
    expect(saved).toBe(false);
    expect(inserts()).toHaveLength(0);
    expect(result.current.scheduleConflicts).toEqual([
      'Teacher Ana Reyes already teaches Science in 7-Madrid on Monday 08:00–09:00.',
      'Room 101 is already used by 7-Madrid (Science) on Monday 08:00–09:00.',
    ]);
    const check = h.calls.find(c => c.table === 'schedules' && c.method === 'select');
    expect(check.filters).toEqual([['school_year', YEAR]]);
  });

  it('changing the form hides the old clash messages', async () => {
    const { result } = await setup();
    h.schedules = [BUSY];
    fill(result);
    await act(async () => { await result.current.saveSchedule(); });
    expect(result.current.scheduleConflicts).toHaveLength(1);
    act(() => result.current.setSchedStart('09:00'));
    expect(result.current.scheduleConflicts).toEqual([]);
  });

  it('no clash saves with the unchanged payload', async () => {
    const { result } = await setup();
    h.schedules = [BUSY];
    fill(result, { start: '09:00', end: '10:00', room: ' Room 101 ' }); // touches, does not overlap
    let saved;
    await act(async () => { saved = await result.current.saveSchedule(); });
    expect(saved).toBe(true);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).toEqual([{
      section_id: 'rizal', teacher_id: 'ana', subject_id: 'math', day_of_week: 'Monday',
      start_time: '09:00', end_time: '10:00', room_number: 'Room 101', school_year: YEAR,
    }]);
    expect(result.current.scheduleConflicts).toEqual([]);
    expect(result.current.scheduleCheckError).toBe('');
  });

  it.each(['error', 'throw'])('a failed clash-check read (%s) blocks with an error and writes nothing', async (mode) => {
    const { result, showToast } = await setup();
    h.failCheck = mode;
    fill(result);
    let saved;
    await act(async () => { saved = await result.current.saveSchedule(); });
    expect(saved).toBe(false);
    expect(inserts()).toHaveLength(0);
    expect(result.current.scheduleCheckError).toBe('Could not check for schedule conflicts. Try again.');
    expect(showToast).toHaveBeenCalledWith('Could not check for schedule conflicts. Try again.', 'error');
  });
});
