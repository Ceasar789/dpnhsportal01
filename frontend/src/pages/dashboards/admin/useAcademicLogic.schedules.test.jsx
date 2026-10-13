// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  calls: [],
  subjects: [],
  teachers: [],
  teachingLoad: [],
  sections: [],
  schedules: [],
  writeError: null,
  throwWrite: null,
  deleteData: null,
  pendingWrite: null,
}));

const responseFor = (state) => {
  if (state.method !== 'select') {
    if (h.throwWrite) throw h.throwWrite;
    if (h.pendingWrite) return h.pendingWrite;
    if (state.table === 'schedules' && state.method === 'delete') {
      return { data: h.deleteData, error: h.writeError };
    }
    return { data: null, error: h.writeError };
  }
  if (state.table === 'subjects') return { data: h.subjects, error: null };
  if (state.table === 'profiles') return { data: h.teachers, error: null };
  if (state.table === 'teacher_subjects') return { data: h.teachingLoad, error: null };
  if (state.table === 'sections') return { data: h.sections, error: null };
  if (state.table === 'schedules') return { data: h.schedules, error: null };
  return { data: [], error: null };
};

const query = (table) => {
  const state = { table, method: 'select', payload: null, filters: [], returning: false };
  const api = {
    select() { state.returning = state.method !== 'select'; return api; },
    insert(payload) { state.method = 'insert'; state.payload = payload; return api; },
    update(payload) { state.method = 'update'; state.payload = payload; return api; },
    upsert(payload) { state.method = 'upsert'; state.payload = payload; return api; },
    delete() { state.method = 'delete'; return api; },
    eq(column, value) { state.filters.push([column, value]); return api; },
    in(column, value) { state.filters.push([column, value]); return api; },
    order() { return api; },
    then(resolve, reject) {
      h.calls.push({ ...state, filters: [...state.filters] });
      return Promise.resolve().then(() => responseFor(state)).then(resolve, reject);
    },
  };
  return api;
};

vi.mock('../../../config/supabase', () => ({
  supabase: { from: vi.fn((table) => query(table)) },
}));

vi.mock('../../../lib/supabaseRetry', () => ({
  withRetry: async (fn) => {
    try { return await fn(); }
    catch (error) { return { data: null, error }; }
  },
}));

const { useAcademicLogic } = await import('./useAcademicLogic');

const YEAR = '2026-2027';
const SUBJECT = { id: 'subject-one', name: 'Mathematics', code: 'MATH', is_active: true };
const TEACHER = { id: 'teacher-one', name: 'Synthetic Teacher', role: 'teacher', status: 'active' };
const SECTION = { id: 'section-one', name: '7-Rizal', grade_level: 'Grade 7', school_year: YEAR };
const LOAD = { id: 'load-one', teacher_id: TEACHER.id, subject_id: SUBJECT.id, grade_level: 'Grade 7', school_year: YEAR };
const SCHEDULE = { id: 'schedule-one', teacher_id: TEACHER.id, subject_id: SUBJECT.id, section_id: SECTION.id, school_year: YEAR };

const setup = async () => {
  const showToast = vi.fn();
  const setDeleteConfirm = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, setDeleteConfirm));
  await waitFor(() => {
    expect(view.result.current.subjectsLoading).toBe(false);
    expect(view.result.current.teachersLoading).toBe(false);
    expect(view.result.current.teachingLoadLoading).toBe(false);
    expect(view.result.current.sectionsLoading).toBe(false);
    expect(view.result.current.schedulesLoading).toBe(false);
  });
  h.calls.length = 0;
  return { ...view, showToast, setDeleteConfirm };
};

const prepareCreate = (result) => act(() => {
  result.current.openCreateSchedule({ sectionId: SECTION.id, subjectId: SUBJECT.id });
  result.current.setSchedTeacher(TEACHER.id);
  result.current.setSchedDay('Wednesday');
  result.current.setSchedStart('08:30');
  result.current.setSchedEnd('09:30');
  result.current.setSchedRoom(' Room 201 ');
});

beforeEach(() => {
  h.calls.length = 0;
  h.subjects = [SUBJECT];
  h.teachers = [TEACHER];
  h.teachingLoad = [LOAD];
  h.sections = [SECTION];
  h.schedules = [SCHEDULE];
  h.writeError = null;
  h.throwWrite = null;
  h.deleteData = [{ id: SCHEDULE.id }];
  h.pendingWrite = null;
});

afterEach(cleanup);

describe('Schedules create boundary', () => {
  it('preserves the approved payload and calculated school year', async () => {
    const { result } = await setup();
    prepareCreate(result);
    let completed;
    await act(async () => { completed = await result.current.saveSchedule(); });
    const write = h.calls.find(call => call.table === 'schedules' && call.method === 'insert');
    expect(completed).toBe(true);
    expect(write.payload).toEqual([{
      section_id: SECTION.id, teacher_id: TEACHER.id, subject_id: SUBJECT.id,
      day_of_week: 'Wednesday', start_time: '08:30', end_time: '09:30',
      room_number: 'Room 201', school_year: YEAR,
    }]);
  });

  it.each([
    [{ message: 'relation internals should stay private' }, null],
    [null, new Error('socket internals should stay private')],
  ])('recovers from create failures without exposing raw details', async (writeError, thrown) => {
    h.writeError = writeError;
    h.throwWrite = thrown;
    const { result, showToast } = await setup();
    prepareCreate(result);
    let completed;
    await act(async () => { completed = await result.current.saveSchedule(); });
    expect(completed).toBe(false);
    expect(result.current.schedSaving).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Could not create the schedule/i), 'error');
    expect(showToast.mock.calls.flat().join(' ')).not.toMatch(/relation internals|socket internals/);
  });

  it('blocks inactive subjects even when invoked outside the UI', async () => {
    h.subjects = [{ ...SUBJECT, is_active: false }];
    const { result, showToast } = await setup();
    let opened;
    act(() => { opened = result.current.openCreateSchedule({ sectionId: SECTION.id, subjectId: SUBJECT.id }); });
    expect(opened).toBe(false);
    expect(result.current.scheduleModal).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/inactive subject/i), 'error');
  });
});

describe('Schedules delete boundary', () => {
  const confirmationFor = async () => {
    const harness = await setup();
    act(() => harness.result.current.deleteSchedule(SCHEDULE.id, vi.fn()));
    return { ...harness, confirmation: harness.setDeleteConfirm.mock.calls.at(-1)[0] };
  };

  it('returns true only for the requested returned row and refreshes', async () => {
    const { confirmation, showToast } = await confirmationFor();
    let completed;
    await act(async () => { completed = await confirmation.onConfirm(); });
    expect(completed).toBe(true);
    const write = h.calls.find(call => call.table === 'schedules' && call.method === 'delete');
    expect(write.filters).toContainEqual(['id', SCHEDULE.id]);
    expect(write.returning).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Schedule deleted');
    expect(h.calls.some(call => call.table === 'schedules' && call.method === 'select')).toBe(true);
  });

  it.each([
    [[], /could not be confirmed/i],
    [[{ id: 'different-schedule' }], /could not be confirmed/i],
  ])('treats an unconfirmed returned row as failure', async (data, message) => {
    h.deleteData = data;
    const { confirmation, showToast } = await confirmationFor();
    let completed;
    await act(async () => { completed = await confirmation.onConfirm(); });
    expect(completed).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(message), 'error');
    expect(h.calls.filter(call => call.table === 'schedules' && call.method === 'select')).toHaveLength(0);
  });

  it.each([
    [{ message: 'policy internals should stay private' }, null],
    [null, new Error('network internals should stay private')],
  ])('returns false and recovers from delete errors and thrown requests', async (writeError, thrown) => {
    h.writeError = writeError;
    h.throwWrite = thrown;
    const { confirmation, showToast } = await confirmationFor();
    let completed;
    await act(async () => { completed = await confirmation.onConfirm(); });
    expect(completed).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Could not delete the schedule/i), 'error');
    expect(showToast.mock.calls.flat().join(' ')).not.toMatch(/policy internals|network internals/);
  });
});
