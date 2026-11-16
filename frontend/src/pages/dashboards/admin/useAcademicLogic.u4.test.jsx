// @vitest-environment jsdom
// U4: useAcademicLogic after the form-kit move.
//   - saveSubject refuses empty fields itself (no write) and returns them to
//     the dialog; a duplicate code/name lands on its field, no toast
//   - the Teaching Load add / read-year / copy errors and a failed subject
//     save show the app's own sentence, never the database text
//   - a duplicate section name (23505) lands on the Name field
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const RAW = 'duplicate key value violates unique constraint "synthetic_raw_key"';
const h = vi.hoisted(() => ({ calls: [], errors: {}, data: {} }));

const query = (table) => {
  const state = { table, operation: 'select', payload: null, options: null };
  const api = {
    select(_c, options) { if (state.operation === 'select') state.options = options; return api; },
    insert(v) { state.operation = 'insert'; state.payload = v; return api; },
    update(v) { state.operation = 'update'; state.payload = v; return api; },
    upsert(v) { state.operation = 'upsert'; state.payload = v; return api; },
    delete() { state.operation = 'delete'; return api; },
    eq() { return api; }, in() { return api; }, order() { return api; },
    then(resolve, reject) {
      h.calls.push({ ...state });
      const error = h.errors[`${table}.${state.operation}`] || null;
      const data = error ? null : (h.data[`${table}.${state.operation}`] ?? []);
      return Promise.resolve({ data, error, count: 0 }).then(resolve, reject);
    },
  };
  return api;
};
vi.mock('../../../config/supabase', () => ({ supabase: { from: vi.fn(table => query(table)) } }));
// No retry wait in these tests.
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => Promise.resolve(fn()) }));

const { useAcademicLogic } = await import('./useAcademicLogic');

const setup = async () => {
  const showToast = vi.fn();
  const view = renderHook(() => useAcademicLogic(showToast, vi.fn(), { schoolYear: '2026-2027', status: 'ready' }));
  await waitFor(() => expect(view.result.current.sectionsLoading).toBe(false));
  h.calls.length = 0;
  showToast.mockClear();
  return { ...view, showToast };
};
const wrote = table => h.calls.some(c => c.table === table && c.operation !== 'select');
const toasts = showToast => showToast.mock.calls.map(([m]) => m);

beforeEach(() => { h.calls = []; h.errors = {}; h.data = {}; });
afterEach(cleanup);

describe('saveSubject', () => {
  it('empty fields: nothing written, the problems come back, no toast', async () => {
    const { result, showToast } = await setup();
    act(() => { result.current.openCreateSubject(); });
    let out;
    await act(async () => { out = await result.current.saveSubject(); });
    expect(out.fieldErrors.map(p => p.fieldId)).toEqual(['subjects-subject-name', 'subjects-code']);
    expect(wrote('subjects')).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a duplicate code lands on Code; no toast', async () => {
    h.errors['subjects.insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "subjects_code_key"' };
    const { result, showToast } = await setup();
    act(() => { result.current.openCreateSubject(); result.current.setSName('Mathematics'); result.current.setSCode('math'); });
    let out;
    await act(async () => { out = await result.current.saveSubject(); });
    expect(out).toEqual({ ok: false, fieldErrors: [{ fieldId: 'subjects-code', message: 'Another subject already uses this code.' }] });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('any other error: one friendly toast, never the raw text', async () => {
    h.errors['subjects.insert'] = { code: 'XX000', message: RAW };
    const { result, showToast } = await setup();
    act(() => { result.current.openCreateSubject(); result.current.setSName('Mathematics'); result.current.setSCode('MATH'); });
    await act(async () => { await result.current.saveSubject(); });
    expect(toasts(showToast)).toEqual(['The subject could not be saved. Please try again.']);
  });
});

describe('Teaching Load errors', () => {
  it('add', async () => {
    h.errors['teacher_subjects.upsert'] = { code: 'XX000', message: RAW };
    const { result, showToast } = await setup();
    await act(async () => { await result.current.addLoadEntries([{ teacher_id: 't', subject_id: 's', grade_level: 'Grade 7' }]); });
    expect(toasts(showToast)).toEqual(['The teaching load could not be saved. Please try again.']);
  });

  it('read the previous year', async () => {
    h.errors['teacher_subjects.select'] = { code: 'XX000', message: RAW };
    const { result, showToast } = await setup();
    await act(async () => { await result.current.copyLoadFromYear('2025-2026'); });
    expect(toasts(showToast)).toEqual(['The teaching load for 2025-2026 could not be read. Please try again.']);
  });

  it('copy', async () => {
    h.data['teacher_subjects.select'] = [{ teacher_id: 't', subject_id: 's', grade_level: 'Grade 7' }];
    h.errors['teacher_subjects.upsert'] = { code: 'XX000', message: RAW };
    const { result, showToast } = await setup();
    await act(async () => { await result.current.copyLoadFromYear('2025-2026'); });
    expect(toasts(showToast)).toEqual(['The teaching load from 2025-2026 could not be copied. Please try again.']);
  });
});

describe('saveSection', () => {
  it('a duplicate name (23505) lands on the Name field; no toast', async () => {
    h.errors['sections.insert'] = { code: '23505', message: RAW };
    const { result, showToast } = await setup();
    act(() => {
      result.current.openCreateSection();
      result.current.setSecName('7-Rizal'); result.current.setSecGrade('Grade 7'); result.current.setSecCapacity('40');
    });
    let out;
    await act(async () => { out = await result.current.saveSection(); });
    expect(out).toEqual({ ok: false, fieldErrors: [{ fieldId: 'sections-section-name', message: 'A section named "7-Rizal" already exists for 2026-2027.' }] });
    expect(showToast).not.toHaveBeenCalled();
  });
});
