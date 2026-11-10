// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// reads: rows each table read returns (by table, and by school_year for teacher_subjects).
const h = vi.hoisted(() => ({ calls: [], reads: {}, previousYear: [] }));

const queryFor = (table) => {
  const state = { table, operation: 'read', filters: [], payload: null };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => {
          h.calls.push({ ...state, filters: [...state.filters] });
          let data = h.reads[table] || [];
          if (table === 'teacher_subjects' && state.filters.some(([c, , v]) => c === 'school_year' && v === '2025-2026')) data = h.previousYear;
          if (state.operation === 'delete') data = state.filters.flatMap(([, , v]) => [].concat(v)).map(id => ({ id }));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        };
      }
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(property)) {
          state.operation = property;
          state.payload = args[0];
        }
        if (property === 'eq' || property === 'in') state.filters.push([args[0], property, args[1]]);
        return query;
      };
    },
  });
  return query;
};

vi.mock('../../../config/supabase', () => ({ supabase: { from: vi.fn(table => queryFor(table)) } }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: async fn => fn() }));

const { useAcademicLogic } = await import('./useAcademicLogic');

const ENG = { id: 'eng', name: 'English', code: 'ENG' };
const MATH = { id: 'math', name: 'Mathematics', code: 'MATH' };
const ANA = { id: 'ana', name: 'Ana Cruz', role: 'teacher', status: 'active', department: 'english' };
const BEN = { id: 'ben', name: 'Ben Reyes', role: 'teacher', status: 'active', department: '' };
const LOCKED_ROW = { id: 'l-eng', teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 7', school_year: '2026-2027' };
const OTHER_ROW = { id: 'l-math', teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7', school_year: '2026-2027' };

const setup = async () => {
  const showToast = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, vi.fn(), { status: 'ready', year: '2026-2027' }));
  await waitFor(() => {
    expect(view.result.current.teachers).toHaveLength(2);
    expect(view.result.current.subjects).toHaveLength(2);
    expect(view.result.current.teachingLoad).toHaveLength(2);
  });
  h.calls.length = 0;
  return { ...view, showToast };
};
const writes = op => h.calls.filter(c => c.table === 'teacher_subjects' && c.operation === op);

beforeEach(() => {
  h.calls.length = 0;
  h.reads = { subjects: [ENG, MATH], profiles: [ANA, BEN], teacher_subjects: [LOCKED_ROW, OTHER_ROW] };
  h.previousYear = [];
});
afterEach(cleanup);

describe('department subject lock in the teaching-load writes', () => {
  it('refuses to remove the department subject, without any database call', async () => {
    const { result, showToast } = await setup();
    let removed;
    await act(async () => { removed = await result.current.removeLoad(['l-eng', 'l-math'], { refresh: false }); });
    expect(removed).toBe(false);
    expect(writes('delete')).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith("This subject comes from the teacher's department and cannot be removed here.", 'error');
  });

  it('still removes other subjects as before', async () => {
    const { result } = await setup();
    let removed;
    await act(async () => { removed = await result.current.removeLoad(['l-math'], { refresh: false }); });
    expect(removed).toBe(true);
    expect(writes('delete')).toHaveLength(1);
  });

  it('copy from the previous year keeps the department subject in each grade the teacher is copied into', async () => {
    h.previousYear = [
      { teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 8' },
      { teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 9' },
      { teacher_id: 'ben', subject_id: 'math', grade_level: 'Grade 7' },
    ];
    const { result } = await setup();
    await act(async () => { await result.current.copyLoadFromYear('2025-2026'); });
    const upsert = writes('upsert')[0];
    expect(upsert.payload).toEqual([
      { teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7', school_year: '2026-2027' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 8', school_year: '2026-2027' },
      { teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 9', school_year: '2026-2027' },
      { teacher_id: 'ben', subject_id: 'math', grade_level: 'Grade 7', school_year: '2026-2027' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 7', school_year: '2026-2027' },
      { teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 9', school_year: '2026-2027' },
    ]);
  });
});
