// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [],
  deleteResults: {},
}));

const readRows = {
  subjects: [{ id: 'subject-1', code: 'MATH', name: 'Mathematics' }],
  profiles: [],
  teacher_subjects: [],
  sections: [{ id: 'section-1', name: '7-Rizal', capacity: 40 }],
  section_students: [{ id: 'membership-1', student_id: 'student-1', status: 'active', profiles: { id: 'student-1', name: 'Student One' } }],
};

const queryFor = (table) => {
  const state = { table, operation: 'read', filters: [] };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => {
          h.calls.push({ ...state, filters: [...state.filters] });
          const result = state.operation === 'delete'
            ? h.deleteResults[table] ?? { data: [], error: null }
            : { data: readRows[table] || [], error: null };
          if (result instanceof Error) return Promise.reject(result).then(resolve, reject);
          return Promise.resolve(result).then(resolve, reject);
        };
      }
      return (...args) => {
        if (property === 'delete') state.operation = 'delete';
        if (property === 'insert') state.operation = 'insert';
        if (property === 'update') state.operation = 'update';
        if (property === 'eq' || property === 'in') state.filters.push([property, ...args]);
        return query;
      };
    },
  });
  return query;
};

vi.mock('../../../config/supabase', () => ({
  supabase: { from: vi.fn(table => queryFor(table)) },
}));

const { useAcademicLogic } = await import('./useAcademicLogic');

const setup = async () => {
  const showToast = vi.fn();
  let confirmation;
  const setDeleteConfirm = vi.fn(value => { confirmation = value; });
  const view = renderHook(() => useAcademicLogic(showToast, setDeleteConfirm));
  await waitFor(() => expect(view.result.current.subjectsLoading).toBe(false));
  return { ...view, showToast, setDeleteConfirm, getConfirmation: () => confirmation };
};

beforeEach(() => {
  h.calls = [];
  h.deleteResults = {};
});
afterEach(cleanup);

describe('academic destructive action verification', () => {
  it.each([
    ['exact row', { data: [{ id: 'subject-1' }], error: null }, true],
    ['zero rows', { data: [], error: null }, false],
    ['wrong id', { data: [{ id: 'subject-2' }], error: null }, false],
    ['returned error', { data: null, error: new Error('synthetic failure') }, false],
    ['thrown error', new Error('synthetic network failure'), false],
  ])('treats a Subject delete %s truthfully', async (_label, response, expected) => {
    h.deleteResults.subjects = response;
    const { result, getConfirmation, showToast } = await setup();
    act(() => result.current.deleteSubject('subject-1'));
    let completed;
    await act(async () => { completed = await getConfirmation().onConfirm(); });
    expect(completed).toBe(expected);
    expect(showToast.mock.calls.some(([message, type]) => type !== 'error' && message === 'Subject deleted')).toBe(expected);
  });

  it('verifies every Teaching Load row and reports a partial batch without clearing it as success', async () => {
    h.deleteResults.teacher_subjects = { data: [{ id: 'load-1' }], error: null };
    const { result } = await setup();
    let response;
    await act(async () => { response = await result.current.removeLoad(['load-1', 'load-2'], { refresh: false }); });
    expect(response).toEqual({ ok: false, deletedIds: ['load-1'] });
    expect(h.calls.find(call => call.table === 'teacher_subjects' && call.operation === 'delete')?.filters)
      .toContainEqual(['in', 'id', ['load-1', 'load-2']]);
  });

  it('accepts only the exact Teaching Load batch', async () => {
    h.deleteResults.teacher_subjects = { data: [{ id: 'load-2' }, { id: 'load-1' }], error: null };
    const { result } = await setup();
    let response;
    await act(async () => { response = await result.current.removeLoad(['load-1', 'load-2'], { refresh: false }); });
    expect(response).toBe(true);
  });

  it('keeps a Section confirmation retryable when no row was deleted', async () => {
    h.deleteResults.sections = { data: [], error: null };
    const { result, getConfirmation } = await setup();
    act(() => result.current.deleteSection('section-1'));
    expect(getConfirmation().requireConfirmedResult).toBe(true);
    await expect(getConfirmation().onConfirm()).resolves.toBe(false);
  });

  it('filters a membership removal by row and parent Section and verifies the result', async () => {
    h.deleteResults.section_students = { data: [{ id: 'membership-1' }], error: null };
    const { result } = await setup();
    await act(async () => result.current.openClassList({ id: 'section-1', name: '7-Rizal', capacity: 40 }));
    let completed;
    await act(async () => { completed = await result.current.removeStudentFromSection('membership-1'); });
    expect(completed).toBe(true);
    const deletion = h.calls.find(call => call.table === 'section_students' && call.operation === 'delete');
    expect(deletion.filters).toEqual(expect.arrayContaining([
      ['eq', 'id', 'membership-1'],
      ['eq', 'section_id', 'section-1'],
    ]));
  });
});
