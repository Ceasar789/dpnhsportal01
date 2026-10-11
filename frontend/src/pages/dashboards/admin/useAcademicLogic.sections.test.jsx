// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  calls: [],
  teachers: [],
  sections: [],
  sectionStudents: [],
  students: [],
  enrollmentCount: 0,
  countError: null,
  writeError: null,
}));

const responseFor = (query) => {
  if (query.table === 'profiles' && query.filters.some(([column, value]) => column === 'role' && value === 'teacher')) {
    return { data: h.teachers, error: null };
  }
  if (query.table === 'profiles' && query.filters.some(([column, value]) => column === 'role' && value === 'student')) {
    return { data: h.students, error: null };
  }
  if (query.table === 'sections' && query.operation === 'select') return { data: h.sections, error: null };
  if (query.table === 'section_students' && query.operation === 'select' && query.options?.count === 'exact') {
    return { data: null, count: h.enrollmentCount, error: h.countError };
  }
  if (query.table === 'section_students' && query.operation === 'select') {
    return { data: h.sectionStudents, error: null };
  }
  if (query.operation !== 'select') return { data: null, error: h.writeError };
  return { data: [], error: null };
};

const query = (table, operation = 'select', payload = null, options = null) => {
  const state = { table, operation, payload, options, filters: [] };
  const api = {
    select(_columns, selectOptions) { state.operation = 'select'; state.options = selectOptions; return api; },
    insert(value) { state.operation = 'insert'; state.payload = value; return api; },
    update(value) { state.operation = 'update'; state.payload = value; return api; },
    upsert(value) { state.operation = 'upsert'; state.payload = value; return api; },
    delete() { state.operation = 'delete'; return api; },
    eq(column, value) { state.filters.push([column, value]); return api; },
    in(column, value) { state.filters.push([column, value]); return api; },
    order() { return api; },
    then(resolve, reject) {
      h.calls.push({ ...state, filters: [...state.filters] });
      return Promise.resolve(responseFor(state)).then(resolve, reject);
    },
  };
  return api;
};

vi.mock('../../../config/supabase', () => ({
  supabase: { from: vi.fn((table) => query(table)) },
}));

const { useAcademicLogic } = await import('./useAcademicLogic');

const ACTIVE = { id: 'teacher-active', name: 'Active Teacher', email: 'active@example.test', role: 'teacher', status: 'active' };
const INACTIVE = { id: 'teacher-inactive', name: 'Inactive Teacher', email: 'inactive@example.test', role: 'teacher', status: 'inactive' };
const SECTION = { id: 'section-one', name: '7-Rizal', grade_level: 'Grade 7', adviser_id: INACTIVE.id, school_year: '2026-2027', capacity: 40 };

const setup = async () => {
  const showToast = vi.fn();
  const setDeleteConfirm = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, setDeleteConfirm));
  await waitFor(() => expect(view.result.current.sectionsLoading).toBe(false));
  h.calls.length = 0;
  return { ...view, showToast, setDeleteConfirm };
};

const prepareCreate = (result, capacity = '40', adviser = ACTIVE.id) => act(() => {
  result.current.openCreateSection();
  result.current.setSecName('7-Synthetic');
  result.current.setSecGrade('Grade 7');
  result.current.setSecCapacity(capacity);
  result.current.setSecAdviser(adviser);
});

beforeEach(() => {
  h.calls.length = 0;
  h.teachers = [ACTIVE, INACTIVE];
  h.sections = [SECTION];
  h.sectionStudents = [];
  h.students = [{ id: 'student-one', name: 'Synthetic Student', email: 'student@example.test' }];
  h.enrollmentCount = 0;
  h.countError = null;
  h.writeError = null;
});

afterEach(cleanup);

describe('Sections save boundary', () => {
  it.each(['', '0', '-1', '1.5', '61', '12abc'])('blocks invalid capacity %j before a write', async (capacity) => {
    const { result } = await setup();
    prepareCreate(result, capacity);
    await act(() => result.current.saveSection());
    expect(h.calls.some((call) => call.table === 'sections' && call.operation === 'insert')).toBe(false);
    expect(result.current.secCapacityError).toBeTruthy();
  });

  it.each([1, 40, 60])('preserves valid capacity %i in the create payload', async (capacity) => {
    const { result } = await setup();
    prepareCreate(result, String(capacity));
    await act(() => result.current.saveSection());
    const write = h.calls.find((call) => call.table === 'sections' && call.operation === 'insert');
    expect(write.payload[0]).toMatchObject({ capacity, adviser_id: ACTIVE.id, name: '7-Synthetic', grade_level: 'Grade 7' });
  });

  it('revalidates a newly selected adviser before writing', async () => {
    const { result, showToast } = await setup();
    prepareCreate(result, '40', INACTIVE.id);
    await act(() => result.current.saveSection());
    expect(h.calls.some((call) => call.table === 'sections' && call.operation === 'insert')).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/active teacher/i), 'error');
  });

  it('preserves an unchanged inactive adviser during an unrelated edit', async () => {
    const { result } = await setup();
    act(() => result.current.openEditSection(SECTION));
    act(() => result.current.setSecName('7-Rizal Updated'));
    await act(() => result.current.saveSection());
    const write = h.calls.find((call) => call.table === 'sections' && call.operation === 'update');
    expect(write.payload).toMatchObject({ adviser_id: INACTIVE.id, capacity: 40, name: '7-Rizal Updated' });
    expect(h.calls.some((call) => call.table === 'section_students' && call.options?.count === 'exact')).toBe(false);
  });

  it('blocks a changed capacity below a fresh enrollment count', async () => {
    h.enrollmentCount = 35;
    const { result } = await setup();
    act(() => result.current.openEditSection(SECTION));
    act(() => result.current.setSecCapacity('30'));
    await act(() => result.current.saveSection());
    expect(h.calls.some((call) => call.table === 'sections' && call.operation === 'update')).toBe(false);
    expect(result.current.secCapacityError).toContain('35');
  });

  it.each([35, 40])('allows changed capacity %i when enrollment is 35', async (capacity) => {
    h.enrollmentCount = 35;
    const { result } = await setup();
    act(() => result.current.openEditSection(SECTION));
    act(() => result.current.setSecCapacity(String(capacity)));
    await act(() => result.current.saveSection());
    expect(h.calls.find((call) => call.table === 'sections' && call.operation === 'update')?.payload.capacity).toBe(capacity);
  });

  it('fails closed when a changed capacity cannot obtain a count', async () => {
    h.countError = new Error('synthetic count failure');
    const { result } = await setup();
    act(() => result.current.openEditSection(SECTION));
    act(() => result.current.setSecCapacity('35'));
    await act(() => result.current.saveSection());
    expect(h.calls.some((call) => call.table === 'sections' && call.operation === 'update')).toBe(false);
    expect(result.current.secCapacityError).toMatch(/could not verify/i);
  });
});

describe('Sections enrollment boundary', () => {
  const open = async (result, section = SECTION) => {
    await act(() => result.current.openClassList(section));
    await waitFor(() => expect(result.current.classListLoading).toBe(false));
    h.calls.length = 0;
  };

  it.each([[40, 40], [40, 41], [1, 1], [60, 60]])('blocks capacity %i at enrollment %i before either write', async (capacity, count) => {
    h.enrollmentCount = count;
    const { result } = await setup();
    await open(result, { ...SECTION, capacity });
    let added;
    await act(async () => { added = await result.current.addStudentToSection('student-one'); });
    expect(added).toBe(false);
    expect(h.calls.some((call) => call.table === 'students' && call.operation === 'upsert')).toBe(false);
    expect(h.calls.some((call) => call.table === 'section_students' && call.operation === 'insert')).toBe(false);
  });

  it('fails closed on a count error before either write', async () => {
    h.countError = new Error('synthetic count failure');
    const { result } = await setup();
    await open(result);
    let added;
    await act(async () => { added = await result.current.addStudentToSection('student-one'); });
    expect(added).toBe(false);
    expect(h.calls.filter((call) => ['upsert', 'insert'].includes(call.operation))).toEqual([]);
  });

  it.each([[1, 0], [40, 39], [60, 59]])('allows one student when capacity %i has enrollment %i', async (capacity, count) => {
    h.enrollmentCount = count;
    const { result } = await setup();
    await open(result, { ...SECTION, capacity });
    let added;
    await act(async () => { added = await result.current.addStudentToSection('student-one'); });
    expect(added).toBe(true);
    expect(h.calls.find((call) => call.table === 'students' && call.operation === 'upsert')?.payload).toEqual([{ id: 'student-one' }]);
    expect(h.calls.find((call) => call.table === 'section_students' && call.operation === 'insert')?.payload[0]).toMatchObject({ section_id: SECTION.id, student_id: 'student-one' });
  });
});
