// @vitest-environment jsdom
// X2: admin academic logic with the Grade 7-10 list. Copy-load skips Grade
// 11/12 and says how many; old Grade 11/12 rows are not listed; Grade 11/12
// is refused on save. Supabase is a fake query builder (same shape as
// useAcademicLogic.departmentLock.test.jsx).
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
          if (state.operation !== 'read') data = null;
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
const BEN = { id: 'ben', name: 'Ben Reyes', role: 'teacher', status: 'active', department: '' };
const G7 = { id: 'l7', teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 7', school_year: '2026-2027' };
const G12 = { id: 'l12', teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 12', school_year: '2026-2027' };
const S7 = { id: 's7', name: 'Rizal', grade_level: 'Grade 7', school_year: '2026-2027' };
const S11 = { id: 's11', name: 'Old Senior', grade_level: 'Grade 11', school_year: '2026-2027' };

const setup = async () => {
  const showToast = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, vi.fn(), { status: 'ready', year: '2026-2027' }));
  await waitFor(() => {
    expect(view.result.current.teachers).toHaveLength(1);
    expect(view.result.current.teachingLoadLoading).toBe(false);
    expect(view.result.current.sectionsLoading).toBe(false);
  });
  h.calls.length = 0;
  return { ...view, showToast };
};
const writes = (table, op) => h.calls.filter(c => c.table === table && c.operation === op);

beforeEach(() => {
  h.calls.length = 0;
  h.reads = { subjects: [ENG], profiles: [BEN], teacher_subjects: [G7, G12], sections: [S7, S11] };
  h.previousYear = [];
});
afterEach(cleanup);

describe('old Grade 11/12 rows are not listed', () => {
  it('teaching load and sections keep only Grade 7-10, without a crash', async () => {
    const { result } = await setup();
    expect(result.current.teachingLoad.map(r => r.id)).toEqual(['l7']);
    expect(result.current.sections.map(s => s.id)).toEqual(['s7']);
  });
});

describe('copy teaching load from last year', () => {
  it('skips Grade 11/12 rows and tells the admin how many', async () => {
    h.previousYear = [
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 7' },
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 11' },
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 10' },
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 12' },
    ];
    const { result, showToast } = await setup();
    let copied;
    await act(async () => { copied = await result.current.copyLoadFromYear('2025-2026'); });
    expect(copied).toBe(2);
    expect(writes('teacher_subjects', 'upsert')[0].payload).toEqual([
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 7', school_year: '2026-2027' },
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 10', school_year: '2026-2027' },
    ]);
    expect(showToast).toHaveBeenCalledWith(
      'Copied 2 entries from 2025-2026. 2 entries were left out because the school no longer offers that grade.');
  });

  it('one skipped row is reported in the singular', async () => {
    h.previousYear = [
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 8' },
      { teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 12' },
    ];
    const { result, showToast } = await setup();
    await act(async () => { await result.current.copyLoadFromYear('2025-2026'); });
    expect(showToast).toHaveBeenCalledWith(
      'Copied 1 entries from 2025-2026. 1 entry was left out because the school no longer offers that grade.');
  });

  it('only Grade 11/12 last year: nothing is written and the admin is told why', async () => {
    h.previousYear = [{ teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 11' }];
    const { result, showToast } = await setup();
    let copied;
    await act(async () => { copied = await result.current.copyLoadFromYear('2025-2026'); });
    expect(copied).toBe(0);
    expect(writes('teacher_subjects', 'upsert')).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith(
      'Nothing was copied from 2025-2026. 1 entry was left out because the school no longer offers that grade.', 'error');
  });

  it('Grade 7-10 only: the same toast as before', async () => {
    h.previousYear = [{ teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 9' }];
    const { result, showToast } = await setup();
    await act(async () => { await result.current.copyLoadFromYear('2025-2026'); });
    expect(showToast).toHaveBeenCalledWith('Copied 1 entries from 2025-2026');
  });
});

describe('Grade 11/12 is refused on save', () => {
  it('a teaching-load entry is never written', async () => {
    const { result } = await setup();
    await act(async () => { await result.current.addLoadEntries([{ teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 11' }]); });
    expect(writes('teacher_subjects', 'upsert')).toHaveLength(0);
    expect(writes('teacher_subjects', 'insert')).toHaveLength(0);
  });

  it('a section is never saved as Grade 12', async () => {
    const { result, showToast } = await setup();
    act(() => { result.current.setSecName('New'); result.current.setSecGrade('Grade 12'); });
    await act(async () => { await result.current.saveSection(); });
    expect(writes('sections', 'insert')).toHaveLength(0);
    expect(writes('sections', 'update')).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith('Choose a grade level from Grade 7 to Grade 10.', 'error');
  });
});
