// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// rows: section_students rows the class list reads. writeResult: what an update
// or delete returns. insertError: what an insert returns.
const h = vi.hoisted(() => ({ calls: [], rows: [], profiles: [], writeResult: null, insertError: null, activeCount: 0 }));

const query = (table) => {
  const state = { table, method: 'select', payload: null, filters: [], options: null };
  const api = {
    select(_columns, options) { if (state.method === 'select') state.options = options || null; return api; },
    insert(payload) { state.method = 'insert'; state.payload = payload; return api; },
    update(payload) { state.method = 'update'; state.payload = payload; return api; },
    upsert(payload) { state.method = 'upsert'; state.payload = payload; return api; },
    delete() { state.method = 'delete'; return api; },
    eq(column, value) { state.filters.push([column, value]); return api; },
    in(column, value) { state.filters.push([column, value]); return api; },
    order() { return api; },
    then(resolve, reject) {
      h.calls.push({ ...state, filters: [...state.filters] });
      let result = { data: [], error: null };
      if (table === 'section_students' && state.method === 'select' && state.options?.count === 'exact') {
        result = { data: null, count: h.activeCount, error: null };
      } else if (table === 'section_students' && state.method === 'select') {
        result = { data: h.rows, error: null };
      } else if (table === 'profiles') {
        result = { data: h.profiles, error: null };
      } else if (table === 'section_students' && ['update', 'delete'].includes(state.method)) {
        result = h.writeResult;
      } else if (table === 'section_students' && state.method === 'insert') {
        result = { data: null, error: h.insertError };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return api;
};

vi.mock('../../../config/supabase', () => ({ supabase: { from: vi.fn(table => query(table)) } }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: async fn => fn() }));

const { useAcademicLogic } = await import('./useAcademicLogic');

const SECTION = { id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: '2026-2027', capacity: 40 };
const ACTIVE = { id: 'm-ana', section_id: 'rizal', student_id: 'ana', status: 'active', enrollment_date: '2026-06-10' };
const DROPPED = { id: 'm-ben', section_id: 'rizal', student_id: 'ben', status: 'dropped', enrollment_date: '2026-06-11' };
const MOVED = { id: 'm-cy', section_id: 'rizal', student_id: 'cy', status: 'transferred', enrollment_date: '2026-06-12' };
const PROFILES = [
  { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test' },
  { id: 'ben', name: 'Ben Cruz', email: 'ben@example.test' },
  { id: 'cy', name: 'Cy Lim', email: 'cy@example.test' },
  { id: 'dee', name: 'Dee Tan', email: 'dee@example.test' },
];

const setup = async () => {
  const showToast = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, vi.fn()));
  await act(async () => { view.result.current.openClassList(SECTION); });
  await waitFor(() => expect(view.result.current.classListLoading).toBe(false));
  h.calls.length = 0;
  return { ...view, showToast };
};
const writes = method => h.calls.filter(c => c.table === 'section_students' && c.method === method);

beforeEach(() => {
  h.calls.length = 0;
  h.rows = [ACTIVE, DROPPED, MOVED];
  h.profiles = PROFILES;
  h.writeResult = { data: [], error: null };
  h.insertError = null;
  h.activeCount = 1;
});
afterEach(cleanup);

describe('class list keeps former members as read-only history', () => {
  it('lists active members only, and former members separately with their status and date', async () => {
    const { result } = await setup();
    expect(result.current.classList.map(m => m.name)).toEqual(['Ana Reyes']);
    expect(result.current.previousMembers).toEqual([
      { id: 'm-ben', student_id: 'ben', name: 'Ben Cruz', status: 'dropped', enrollment_date: '2026-06-11' },
      { id: 'm-cy', student_id: 'cy', name: 'Cy Lim', status: 'transferred', enrollment_date: '2026-06-12' },
    ]);
    // Former members can be added again; the active one is not offered twice.
    expect(result.current.unassignedStudents.map(s => s.id)).toEqual(['ben', 'cy', 'dee']);
  });
});

describe('removing a student by reason', () => {
  it.each([['dropped', 'Student marked as dropped'], ['transferred', 'Student marked as transferred']])(
    '%s keeps the row and sets its status', async (reason, toast) => {
      h.writeResult = { data: [{ id: 'm-ana' }], error: null };
      const { result, showToast } = await setup();
      let ok;
      await act(async () => { ok = await result.current.removeStudentFromSection('m-ana', reason); });
      expect(ok).toBe(true);
      expect(writes('delete')).toHaveLength(0);
      expect(writes('update')).toHaveLength(1);
      expect(writes('update')[0].payload).toEqual({ status: reason });
      expect(writes('update')[0].filters).toEqual([['id', 'm-ana'], ['section_id', 'rizal']]);
      expect(showToast).toHaveBeenCalledWith(toast);
    });

  it('added by mistake deletes the row, as removal did before', async () => {
    h.writeResult = { data: [{ id: 'm-ana' }], error: null };
    const { result, showToast } = await setup();
    let ok;
    await act(async () => { ok = await result.current.removeStudentFromSection('m-ana', 'mistake'); });
    expect(ok).toBe(true);
    expect(writes('update')).toHaveLength(0);
    expect(writes('delete')).toHaveLength(1);
    expect(writes('delete')[0].filters).toEqual([['id', 'm-ana'], ['section_id', 'rizal']]);
    expect(showToast).toHaveBeenCalledWith('Student removed from section');
  });

  it.each([
    ['an error', { data: null, error: { message: 'denied' } }],
    ['no row changed', { data: [], error: null }],
  ])('a failed status change (%s) changes nothing on screen', async (_label, response) => {
    h.writeResult = response;
    const { result, showToast } = await setup();
    const before = result.current.classList;
    let ok;
    await act(async () => { ok = await result.current.removeStudentFromSection('m-ana', 'dropped'); });
    expect(ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Could not remove the student from this section. Please try again.', 'error');
    expect(result.current.classList).toBe(before);
    expect(h.calls.filter(c => c.table === 'section_students' && c.method === 'select' && !c.options)).toHaveLength(0);
  });
});

describe('adding a student back', () => {
  it('a former member is re-activated, not inserted, and keeps the original enrollment date', async () => {
    h.writeResult = { data: [{ id: 'm-ben' }], error: null };
    const { result } = await setup();
    let ok;
    await act(async () => { ok = await result.current.addStudentToSection('ben'); });
    expect(ok).toBe(true);
    expect(writes('insert')).toHaveLength(0);
    expect(writes('update')).toHaveLength(1);
    expect(writes('update')[0].payload).toEqual({ status: 'active' });
    expect(writes('update')[0].filters).toEqual([['id', 'm-ben'], ['section_id', 'rizal']]);
  });

  it('a new student is inserted exactly as before', async () => {
    const { result } = await setup();
    let ok;
    await act(async () => { ok = await result.current.addStudentToSection('dee'); });
    expect(ok).toBe(true);
    expect(writes('update')).toHaveLength(0);
    expect(writes('insert')[0].payload).toEqual([{ section_id: 'rizal', student_id: 'dee', status: 'active' }]);
  });

  it('capacity counts only active members', async () => {
    const { result } = await setup();
    await act(async () => { await result.current.addStudentToSection('dee'); });
    const count = h.calls.find(c => c.table === 'section_students' && c.options?.count === 'exact');
    expect(count.filters).toEqual([['section_id', 'rizal'], ['status', 'active']]);
  });

  it('an already active student is not added twice', async () => {
    h.insertError = { code: '23505', message: 'duplicate' };
    const { result, showToast } = await setup();
    let ok;
    await act(async () => { ok = await result.current.addStudentToSection('ana'); });
    expect(ok).toBe(false);
    expect(writes('update')).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith('That student is already in this section.', 'error');
  });
});
