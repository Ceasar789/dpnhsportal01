// 4m: the "fails while empty" family (audit §8.1-8.4).
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fail: new Set(), calls: [] }));
vi.mock('../config/supabase', () => {
  const rows = {
    section_students: [{ section_id: 's1', sections: { name: 'Rizal', grade_level: 'Grade 8', school_year: '2026-2027' } }],
    task_assignees: [{ task_id: 'w1', section_id: 's1', due_at: null, assigned_at: '2026-11-20T08:00:00' }],
    schedules: [], worksheets: [{ id: 'w1', title: 'Cells', subject_id: null }],
    worksheet_submissions: [], students: { student_number: 'S-1', lrn: '123' }, attendance: [{ status: 'Present' }], subjects: [],
  };
  const from = (table) => {
    const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
      ? (ok, bad) => Promise.resolve(h.fail.has(table)
        ? { data: null, error: { message: `permission denied for table ${table}`, code: '42501' }, status: 403 }
        : { data: rows[table], error: null, status: 200 }).then(ok, bad)
      : () => { if (prop === 'select') h.calls.push(table); return q; }) });
    return q;
  };
  return { supabase: { from } };
});

import { fetchStudentTaskGraph } from './studentTaskGraph';
import { isPermanentFailure, withRetry } from './supabaseRetry';
import { localNowTimestamp } from './taskFormatting';

afterEach(() => { h.fail.clear(); h.calls = []; vi.restoreAllMocks(); });

describe('studentTaskGraph: side reads are soft (4m)', () => {
  it('a hidden attendance table keeps the tasks and marks only attendance as unknown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.fail.add('attendance');
    const graph = await fetchStudentTaskGraph('stu-1');
    expect(graph.fatalError).toBe(null);
    expect(graph.attendanceError).toBeTruthy();
    expect(graph.attendance).toEqual([]);
    expect(graph.sheetById.get('w1').title).toBe('Cells');
    expect(graph.studentRecord).toEqual({ student_number: 'S-1', lrn: '123' });
  });

  it('a hidden students row keeps the tasks and marks only the student number as unknown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.fail.add('students');
    const graph = await fetchStudentTaskGraph('stu-1');
    expect(graph.fatalError).toBe(null);
    expect(graph.studentRecordError).toBeTruthy();
    expect(graph.studentRecord).toBe(null);
    expect(graph.attendance).toEqual([{ status: 'Present' }]);
  });

  it('a failed worksheets or submissions read is still fatal', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.fail.add('worksheet_submissions');
    expect((await fetchStudentTaskGraph('stu-1')).fatalError).toBeTruthy();
  });

  it('everything readable: no soft errors', async () => {
    const graph = await fetchStudentTaskGraph('stu-1');
    expect([graph.fatalError, graph.attendanceError, graph.studentRecordError]).toEqual([null, null, null]);
  });
});

describe('withRetry: a permanent refusal is not retried (4m)', () => {
  it.each([
    [{ data: null, error: { message: 'x' }, status: 403 }],
    [{ data: null, error: { message: 'x' }, status: 400 }],
    [{ data: null, error: { message: 'x', code: '42501' } }],
    [{ data: null, error: { message: 'x', code: '23505' } }],
  ])('%o: one call, no sleep', async (reply) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sleep = vi.fn(async () => {});
    const queryFn = vi.fn(async () => reply);
    expect(await withRetry(queryFn, { sleep })).toBe(reply);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([[503], [500], [429], [408]])('status %i is still retried once', async (status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sleep = vi.fn(async () => {});
    const queryFn = vi.fn(async () => ({ data: null, error: { message: 'busy' }, status }));
    await withRetry(queryFn, { sleep });
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('a network failure (no status, no code) is still retried', () => {
    expect(isPermanentFailure({ error: { message: 'Failed to fetch', offline: true } })).toBe(false);
    expect(isPermanentFailure({ error: { message: 'x', code: 'PGRST301' }, status: 503 })).toBe(false);
  });
});

describe('localNowTimestamp: the school clock, not the device clock (4m)', () => {
  it('is Manila wall-clock time (UTC+8) with no offset suffix', () => {
    expect(localNowTimestamp(new Date('2026-11-24T16:30:05Z'))).toBe('2026-11-25T00:30:05');
    expect(localNowTimestamp(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T08:00:00');
  });
  it('has the PostgREST-friendly shape', () => {
    expect(localNowTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});
