// @vitest-environment jsdom
// The browser zone is set far from Manila, so a missing UTC reading shows up.
globalThis.process.env.TZ = 'America/New_York';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

const db = vi.hoisted(() => ({ assignees: [], assigneesError: null, selects: [] }));
const client = vi.hoisted(() => ({ distributeDayTask: vi.fn() }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('./dayTaskDistributeClient', () => ({ distributeDayTask: client.distributeDayTask }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from: table => {
      const query = {
        select: columns => { if (table === 'task_assignees') db.selects.push(columns); return query; },
        eq: () => query, in: () => query, range: () => query,
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        maybeSingle: () => Promise.resolve({ data: { title: 'Task', task_type: 'worksheet', checking_mode: 'manual' }, error: null }),
        then: resolve => Promise.resolve(table === 'task_assignees'
          ? { data: db.assigneesError ? null : db.assignees, error: db.assigneesError }
          : { data: [], error: null }).then(resolve),
      };
      return query;
    },
  },
}));

beforeEach(() => {
  db.assignees = [];
  db.assigneesError = null;
  db.selects = [];
  client.distributeDayTask.mockReset();
});
afterEach(() => cleanup());

const mount = async (options) => {
  const view = renderHook(() => useWorksheetAssessment(vi.fn(), options));
  await waitFor(() => expect(view.result.current.assigneeCountsLoading).toBe(false));
  return view;
};

describe('first assigned date', () => {
  it('reads assigned_at with the counts', async () => {
    await mount();
    expect(db.selects).toContain('task_id, student_id, assigned_at');
  });

  it('keeps the earliest assigned_at per task, read as UTC', async () => {
    db.assignees = [
      { task_id: 't1', student_id: 's1', assigned_at: '2026-03-05T08:00:00' },
      { task_id: 't1', student_id: 's2', assigned_at: '2026-03-01T17:30:00' },
      { task_id: 't1', student_id: 's3', assigned_at: '2026-03-03T08:00:00' },
      { task_id: 't2', student_id: 's1', assigned_at: '2026-04-01 02:00:00.123' },
    ];
    const { result } = await mount();
    expect(new Date(2026, 2, 1, 12).getTimezoneOffset()).toBe(300);
    expect(result.current.firstAssignedAt).toEqual({
      t1: Date.UTC(2026, 2, 1, 17, 30), t2: Date.UTC(2026, 3, 1, 2, 0, 0, 123) });
    expect(result.current.assigneeCounts).toEqual({ t1: 3, t2: 1 });
  });

  it('respects an explicit offset and skips a missing or bad value', async () => {
    db.assignees = [
      { task_id: 't1', student_id: 's1', assigned_at: '2026-03-02T01:30:00+08:00' },
      { task_id: 't2', student_id: 's1', assigned_at: null },
      { task_id: 't2', student_id: 's2', assigned_at: 'not a date' },
    ];
    const { result } = await mount();
    expect(result.current.firstAssignedAt).toEqual({ t1: Date.UTC(2026, 2, 1, 17, 30) });
    expect(result.current.assigneeCounts.t2).toBe(2);
  });

  it('a failed read reports the error', async () => {
    db.assigneesError = { message: 'down' };
    const { result } = await mount();
    expect(result.current.assigneeCountsError).toBe(true);
  });
});

describe('after a successful distribution', () => {
  it('refreshes the counts and the first assigned date', async () => {
    const { result } = await mount({ distributionEnabled: true });
    expect(result.current.firstAssignedAt).toEqual({});
    client.distributeDayTask.mockResolvedValue({ ok: true, receipt: { added: [], alreadyAssigned: ['s1'], assignedElsewhere: [] } });
    db.assignees = [{ task_id: 't1', student_id: 's1', assigned_at: '2026-03-01T17:30:00' }];
    await act(async () => {
      expect((await result.current.distributeTask('t1', 'sec-1', ['s1'], '2026-03-09T17:00', 'manual')).ok).toBe(true);
    });
    await waitFor(() => expect(result.current.firstAssignedAt).toEqual({ t1: Date.UTC(2026, 2, 1, 17, 30) }));
    expect(result.current.assigneeCounts).toEqual({ t1: 1 });
  });

  it('the default stays off: nothing is sent', async () => {
    const { result } = await mount();
    expect((await result.current.distributeTask('t1', 'sec-1', ['s1'], '2026-03-09T17:00', 'manual')).ok).toBe(false);
    expect(client.distributeDayTask).not.toHaveBeenCalled();
  });
});
