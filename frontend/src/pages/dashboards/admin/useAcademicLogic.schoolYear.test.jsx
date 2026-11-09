// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every read and write the hook makes, with its school_year filter or payload.
const h = vi.hoisted(() => ({ calls: [] }));

const queryFor = (table) => {
  const state = { table, operation: 'read', filters: [], payload: null };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => {
          h.calls.push({ ...state, filters: [...state.filters] });
          return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
        };
      }
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(property)) {
          state.operation = property;
          state.payload = args[0];
        }
        if (property === 'eq') state.filters.push([args[0], args[1]]);
        return query;
      };
    },
  });
  return query;
};

vi.mock('../../../config/supabase', () => ({ supabase: { from: vi.fn(table => queryFor(table)) } }));

const { useAcademicLogic } = await import('./useAcademicLogic');

const READY = { status: 'ready', year: '2026-2027' };
const yearReads = table => h.calls.filter(c => c.table === table && c.operation === 'read')
  .map(c => c.filters.find(([column]) => column === 'school_year')?.[1]).filter(Boolean);
const writes = table => h.calls.filter(c => c.table === table && c.operation !== 'read');

const mount = (settings) => {
  const showToast = vi.fn();
  const view = renderHook(({ s }) => useAcademicLogic(showToast, vi.fn(), s), { initialProps: { s: settings } });
  return { ...view, showToast };
};

beforeEach(() => {
  h.calls = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-08-01T00:00:00Z')); // the calendar says 2030-2031
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('admin academic school year', () => {
  it('(a) starts on the System Settings year, not the calendar year', async () => {
    const { result } = mount(READY);
    expect(result.current.schoolYear).toBe('2026-2027');
    expect(result.current.schoolYearSource).toBe('settings');
    expect(result.current.settingsSchoolYear).toBe('2026-2027');
    await waitFor(() => expect(yearReads('sections')).toContain('2026-2027'));
    expect(yearReads('sections')).not.toContain('2030-2031');
    expect(yearReads('teacher_subjects')).not.toContain('2030-2031');
    expect(yearReads('schedules')).not.toContain('2030-2031');
  });

  it('(b) a different working year still writes, with the same payload as before', async () => {
    const { result } = mount(READY);
    act(() => result.current.setSchoolYear('2027-2028'));
    expect(result.current.schoolYear).toBe('2027-2028');
    expect(result.current.settingsSchoolYear).toBe('2026-2027');
    act(() => { result.current.setSecName('7-Planning'); result.current.setSecGrade('Grade 7'); result.current.setSecCapacity('40'); });
    let saved;
    await act(async () => { saved = await result.current.saveSection(); });
    expect(saved).toBe(true);
    const insert = writes('sections').find(c => c.operation === 'insert');
    expect(Object.keys(insert.payload[0]).sort()).toEqual(['adviser_id', 'capacity', 'grade_level', 'name', 'school_year', 'updated_at']);
    expect(insert.payload[0]).toMatchObject({ name: '7-Planning', grade_level: 'Grade 7', school_year: '2027-2028', capacity: 40 });
  });

  it('(c) a failed or empty settings read falls back to the calendar year, marked as fallback', () => {
    for (const settings of [{ status: 'error', year: null }, { status: 'missing', year: null }, { status: 'ready', year: '' }]) {
      const { result, unmount } = mount(settings);
      expect(result.current.schoolYear).toBe('2030-2031');
      expect(result.current.schoolYearSource).toBe('fallback');
      expect(result.current.settingsSchoolYear).toBeNull();
      unmount();
    }
  });

  it('(d) while settings load, nothing is read or written with the calendar year', async () => {
    const { result, showToast } = mount({ status: 'loading', year: null });
    expect(result.current.schoolYear).toBeNull();
    expect(result.current.schoolYearSource).toBe('loading');
    act(() => { result.current.setSecName('7-Early'); result.current.setSecGrade('Grade 7'); result.current.setSecCapacity('40'); });
    let saved;
    await act(async () => { saved = await result.current.saveSection(); });
    expect(saved).toBe(false);
    let added;
    await act(async () => { added = await result.current.addLoadEntries([{ teacher_id: 't', subject_id: 's', grade_level: 'Grade 7' }]); });
    expect(added).toBeNull();
    expect(showToast).toHaveBeenCalledWith('The school year is still loading. Try again in a moment.', 'error');
    expect(writes('sections')).toHaveLength(0);
    expect(writes('teacher_subjects')).toHaveLength(0);
    await act(async () => { await Promise.resolve(); });
    expect(yearReads('sections')).toEqual([]);
    expect(yearReads('teacher_subjects')).toEqual([]);
    expect(yearReads('schedules')).toEqual([]);
    expect(result.current.sectionsLoading).toBe(true);
  });

  it('(e) loading, then a saved change in System Settings, moves the tabs without a reload', async () => {
    const { result, rerender } = mount({ status: 'loading', year: null });
    rerender({ s: READY });
    expect(result.current.schoolYear).toBe('2026-2027');
    await waitFor(() => expect(yearReads('sections')).toContain('2026-2027'));
    rerender({ s: { status: 'ready', year: '2027-2028' } });
    expect(result.current.schoolYear).toBe('2027-2028');
    expect(result.current.settingsSchoolYear).toBe('2027-2028');
    await waitFor(() => expect(yearReads('sections')).toContain('2027-2028'));
  });

  it('without a settings argument the hook keeps its original calendar behavior', () => {
    const { result } = mount(undefined);
    expect(result.current.schoolYear).toBe('2030-2031');
    expect(result.current.schoolYearSource).toBe('calendar');
  });
});
