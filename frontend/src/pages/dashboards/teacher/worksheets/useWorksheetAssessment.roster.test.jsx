// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

// assignees: all task_assignees rows (served by .range); fail: 'assignees' | 'names' with the page to fail on.
const db = vi.hoisted(() => ({ calls: [], assignees: [], fail: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from: table => {
      const call = { table, eq: {} };
      const query = {
        select: fields => { call.select = fields; return query; },
        eq: (column, value) => { call.eq[column] = value; return query; },
        order: column => { call.order = column; return query; }, limit: () => query, neq: () => query,
        range: (from, to) => { call.range = [from, to]; return query; },
        in: (column, values) => { call.in = values; return query; },
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: (resolve, reject) => {
          db.calls.push(call);
          const fail = { data: null, error: { message: 'denied' } };
          let result = { data: [], error: null };
          if (table === 'task_assignees' && call.range) {
            const page = call.range[0] / 500 + 1;
            result = db.fail?.kind === 'assignees' && db.fail.page === page ? fail
              : { data: db.assignees.slice(call.range[0], call.range[1] + 1), error: null };
          }
          if (table === 'profiles') {
            const page = db.calls.filter(c => c.table === 'profiles').length;
            result = db.fail?.kind === 'names' && db.fail.page === page ? fail
              : { data: call.in.map(id => ({ id, name: `Name ${id}` })), error: null };
          }
          if (table === 'worksheet_submissions') {
            result = { data: [{ id: 'sub-1', student_id: 's1', section_id: 'x', status: 'submitted', released: false, score: null,
              total_points: null, source: 'online', is_late: true, submitted_at: '2030-03-10T14:05:00' }], error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

const mount = async () => {
  const view = renderHook(() => useWorksheetAssessment(vi.fn()));
  await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
  db.calls = [];
  return view.result.current;
};
const rows = n => Array.from({ length: n }, (_, i) => ({ student_id: `s${i}`, section_id: 'sec', due_at: null }));

beforeEach(() => { Object.assign(db, { calls: [], assignees: [], fail: null }); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('loadSubmissions', () => {
  it('reads is_late and submitted_at too, and passes them through unchanged', async () => {
    const { loadSubmissions } = await mount();
    const [first] = await loadSubmissions('w1');
    expect(db.calls.find(c => c.table === 'worksheet_submissions').select)
      .toBe('id, student_id, section_id, status, released, score, total_points, source, is_late, submitted_at');
    expect(first).toMatchObject({ id: 'sub-1', status: 'submitted', is_late: true, submitted_at: '2030-03-10T14:05:00', name: 'Name s1' });
  });
});

describe('loadAssigneeRoster', () => {
  it('pages by 500 with one name read per page and returns everyone with a name', async () => {
    db.assignees = rows(502);
    const { loadAssigneeRoster } = await mount();
    const roster = await loadAssigneeRoster('w1');
    expect(roster).toHaveLength(502);
    expect(roster[501]).toEqual({ student_id: 's501', section_id: 'sec', due_at: null, name: 'Name s501' });
    const pages = db.calls.filter(c => c.table === 'task_assignees');
    expect(pages.map(c => c.range)).toEqual([[0, 499], [500, 999]]);
    expect(pages.every(c => c.eq.task_id === 'w1' && c.order === 'student_id')).toBe(true);
    expect(db.calls.filter(c => c.table === 'profiles').map(c => c.in.length)).toEqual([500, 2]);
  });

  it('an empty roster is an empty list, with no name read', async () => {
    const { loadAssigneeRoster } = await mount();
    expect(await loadAssigneeRoster('w1')).toEqual([]);
    expect(db.calls.some(c => c.table === 'profiles')).toBe(false);
  });

  it.each([['an assignee page', 'assignees', 2], ['a name read', 'names', 1], ['a later name read', 'names', 2]])(
    'throws when %s fails, never returning part of the list', async (_name, kind, page) => {
      db.assignees = rows(700);
      db.fail = { kind, page };
      const { loadAssigneeRoster } = await mount();
      await expect(loadAssigneeRoster('w1')).rejects.toThrow('assignee_roster_failed');
    });
});
