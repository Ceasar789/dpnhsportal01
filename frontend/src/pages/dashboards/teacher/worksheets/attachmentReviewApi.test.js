// @vitest-environment jsdom
// S4: the review dialog's reads and the grade RPC, against a recording fake client.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVIEW_ATTACHMENT_COLUMNS, REVIEW_SUBMISSION_COLUMNS, gradeSubmission, loadReview } from './attachmentReviewApi';
import { NETWORK, UNCONFIRMED } from './attachmentReviewRules';

const sleep = () => Promise.resolve();
// tables: { name: (call) => ({ data, error }) }
const fakeClient = (tables = {}, rpc = null) => {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, filters: [], ins: [], range: null };
      calls.push(call);
      const q = {
        select(cols) { call.select = cols; return q; },
        eq(col, val) { call.filters.push([col, val]); return q; },
        in(col, vals) { call.ins.push([col, vals]); return q; },
        order() { return q; },
        range(from, to) { call.range = [from, to]; return q; },
        then(resolve, reject) { return Promise.resolve((tables[table] || (() => ({ data: [], error: null })))(call)).then(resolve, reject); },
      };
      return q;
    },
    rpc: vi.fn(rpc || (async () => ({ data: null, error: null }))),
  };
  return client;
};
const ids = n => Array.from({ length: n }, (_, i) => `s${String(i).padStart(4, '0')}`);

afterEach(() => vi.restoreAllMocks());

describe('loadReview', () => {
  it('four batched reads, each limited to this task, and the merged pieces', async () => {
    const client = fakeClient({
      task_assignees: () => ({ data: [{ student_id: 's1', section_id: 'a' }, { student_id: 's2', section_id: 'a' }], error: null }),
      worksheet_submissions: () => ({ data: [{ id: 'sub-1', student_id: 's1', status: 'submitted' }, { id: 'sub-2', student_id: 's2', status: 'in_progress' }], error: null }),
      profiles: () => ({ data: [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Ben' }], error: null }),
      worksheet_submission_attachments: () => ({ data: [{ submission_id: 'sub-1', kind: 'link' }], error: null }),
    });
    const result = await loadReview({ taskId: 'task-1', client, sleep });
    expect(client.calls.map(c => c.table)).toEqual(['task_assignees', 'worksheet_submissions', 'profiles', 'worksheet_submission_attachments']);
    expect(client.calls[0].filters).toEqual([['task_id', 'task-1']]);
    expect(client.calls[1].filters).toEqual([['worksheet_id', 'task-1']]);
    expect(client.calls[1].select).toBe(REVIEW_SUBMISSION_COLUMNS);
    expect(client.calls[3].select).toBe(REVIEW_ATTACHMENT_COLUMNS);
    expect(result.names.get('s1')).toBe('Ana');
    expect(result.attachments).toHaveLength(1);
  });

  it('never asks for the attachment of a draft (in progress)', async () => {
    const client = fakeClient({
      worksheet_submissions: () => ({ data: [{ id: 'draft', student_id: 's1', status: 'in_progress' }, { id: 'done', student_id: 's2', status: 'checked' }], error: null }),
    });
    await loadReview({ taskId: 'task-1', client, sleep });
    const att = client.calls.filter(c => c.table === 'worksheet_submission_attachments');
    expect(att.flatMap(c => c.ins.flatMap(([, v]) => v))).toEqual(['done']);
  });

  it('no turned-in work: no attachments read at all', async () => {
    const client = fakeClient({ worksheet_submissions: () => ({ data: [{ id: 'd', student_id: 's1', status: 'in_progress' }], error: null }) });
    await loadReview({ taskId: 'task-1', client, sleep });
    expect(client.calls.some(c => c.table === 'worksheet_submission_attachments')).toBe(false);
  });

  it('pages the roster by 500 and reads names in chunks of 200 (no N+1)', async () => {
    const roster = ids(650).map(id => ({ student_id: id, section_id: 'a' }));
    const client = fakeClient({ task_assignees: call => ({ data: roster.slice(call.range[0], call.range[1] + 1), error: null }) });
    await loadReview({ taskId: 'task-1', client, sleep });
    expect(client.calls.filter(c => c.table === 'task_assignees').map(c => c.range)).toEqual([[0, 499], [500, 999]]);
    const nameCalls = client.calls.filter(c => c.table === 'profiles');
    expect(nameCalls.map(c => c.ins[0][1].length)).toEqual([200, 200, 200, 50]);
  });

  it('any failed read returns null (never an empty list), after one retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const table of ['task_assignees', 'worksheet_submissions', 'profiles', 'worksheet_submission_attachments']) {
      const client = fakeClient({
        task_assignees: () => ({ data: [{ student_id: 's1' }], error: null }),
        worksheet_submissions: () => ({ data: [{ id: 'sub-1', student_id: 's1', status: 'submitted' }], error: null }),
        [table]: () => ({ data: null, error: { message: 'down' } }),
      });
      expect(await loadReview({ taskId: 'task-1', client, sleep }), table).toBeNull();
      expect(client.calls.filter(c => c.table === table), table).toHaveLength(2);
    }
  });
});

describe('gradeSubmission', () => {
  const ok = (over = {}) => async () => ({ data: { ok: true, submissionId: 'SUB-1', score: 8.5, totalPoints: 10, released: false, ...over }, error: null });

  it('sends the four RPC arguments (score as a number, feedback trimmed) and returns the server values', async () => {
    const client = fakeClient({}, ok());
    const result = await gradeSubmission({ submissionId: 'sub-1', score: ' 8.5 ', feedback: '  Good work. ', release: false, max: 10, client });
    expect(client.rpc).toHaveBeenCalledWith('eduscribe_task_attachment_grade_v1',
      { p_submission_id: 'sub-1', p_score: 8.5, p_feedback: 'Good work.', p_release: false });
    expect(result).toEqual({ ok: true, submission: { score: 8.5, total_points: 10, released: false, status: 'checked', remarks: 'Good work.' } });
  });

  it('Return sends p_release true; empty feedback is null', async () => {
    const client = fakeClient({}, ok({ released: true }));
    const result = await gradeSubmission({ submissionId: 'sub-1', score: '10', feedback: '  ', release: true, max: 10, client });
    expect(client.rpc.mock.calls[0][1]).toMatchObject({ p_release: true, p_feedback: null, p_score: 10 });
    expect(result.submission.released).toBe(true);
  });

  it.each([
    ['not_authenticated', 'Your session has ended. Sign in again, then save the score.'],
    ['not_found', 'This submission is no longer available to you. Refresh and try again.'],
    ['not_attachment_task', 'This task no longer takes files or links. Refresh the page.'],
    ['invalid_state', "This student's work is not turned in (they may have unsubmitted it). Refresh to see the latest."],
    ['invalid_score', 'Enter a score from 0 to 10 with at most 2 decimals.'],
    ['invalid_feedback', 'Keep the feedback to 2,000 characters.'],
    ['invalid_release', UNCONFIRMED],
    ['duplicate key value violates unique constraint', UNCONFIRMED],
    ['TypeError: Failed to fetch', NETWORK],
  ])('RPC error %s is shown as a friendly message, and is never retried', async (code, message) => {
    const client = fakeClient({}, async () => ({ data: null, error: { message: code } }));
    expect(await gradeSubmission({ submissionId: 'sub-1', score: '5', feedback: '', release: false, max: 10, client }))
      .toEqual({ ok: false, error: message });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('a thrown call is a network failure, not retried', async () => {
    const client = fakeClient({}, async () => { throw new Error('offline'); });
    expect(await gradeSubmission({ submissionId: 'sub-1', score: '5', feedback: '', release: false, max: 10, client }))
      .toEqual({ ok: false, error: NETWORK });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no ok', { submissionId: 'sub-1', score: 5, totalPoints: 10, released: false }],
    ['another submission', { ok: true, submissionId: 'sub-2', score: 5, totalPoints: 10, released: false }],
    ['no score', { ok: true, submissionId: 'sub-1', totalPoints: 10, released: false }],
    ['no released flag', { ok: true, submissionId: 'sub-1', score: 5, totalPoints: 10 }],
  ])('an unconfirmed response (%s) changes nothing', async (_name, data) => {
    const client = fakeClient({}, async () => ({ data, error: null }));
    expect(await gradeSubmission({ submissionId: 'sub-1', score: '5', feedback: '', release: false, max: 10, client }))
      .toEqual({ ok: false, error: UNCONFIRMED });
  });
});
