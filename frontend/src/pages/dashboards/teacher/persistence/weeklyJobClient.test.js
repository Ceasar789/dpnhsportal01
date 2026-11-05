// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createWeeklyJobClient } from './weeklyJobClient';

vi.mock('../../../../config/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

const PLAN_ID = 'c137877f-b729-4e7e-b258-c6cbb18cced1';
const JOB_ID = '823ebbd4-1bfe-459c-97e6-0200e738a5cb';
const TEACHER_ID = 'de0eb356-120c-4a10-a3b2-b730912f1f35';
const summary = (status = 'QUEUED') => ({ id: JOB_ID, status, plannedCalls: 15,
  attemptedCalls: status === 'COMPLETED' ? 15 : 0,
  completedBatches: status === 'COMPLETED' ? 15 : 0, failureCategory: null });
const response = (data, status = 200, wakeStatus) => ({ ok: status < 400, status,
  headers: { get: name => name === 'X-Weekly-Workflow-Wake' ? wakeStatus : null },
  text: async () => JSON.stringify(data) });
const draft = () => ({ kind: 'weekly-worksheet-collection', status: 'local-draft', saved: false,
  teacherId: TEACHER_ID, sourceLessonPlan: { id: PLAN_ID, title: 'Synthetic plan' },
  worksheets: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({
    day, title: `${day} worksheet`, instructions: 'Answer the questions.',
    status: 'generated-draft', saved: false, sourceLessonPlan: { id: PLAN_ID },
    questions: Array.from({ length: 30 }, (_, index) => ({
      localId: `draft-${index + 1}`, question: `Synthetic ${day} ${index + 1}`,
      item_type: index === 0 ? 'multiple_choice' : 'essay' })),
    answerKey: [{ localId: 'draft-1', correctAnswer: 'A' }],
  })) });
const setup = fetchImpl => {
  const getSession = vi.fn(async () => ({ data: { session: { access_token: 'synthetic-token' } } }));
  return { client: createWeeklyJobClient({ enabled: true, apiBase: 'https://example.invalid',
    getSession, fetchImpl }), getSession };
};

describe('weekly draft job client', () => {
  it.each([
    ['absent', undefined, false],
    ['false', 'false', false],
    ['nonexact', 'TRUE', false],
    ['true', 'true', true],
  ])('enables the exported client only for exact true (%s)', async (_label, value, expected) => {
    vi.stubEnv('VITE_WEEKLY_DRAFT_GENERATION_ENABLED', value);
    vi.resetModules();
    try {
      const { WEEKLY_JOBS_ENABLED, weeklyJobClient } = await import('./weeklyJobClient');
      expect(WEEKLY_JOBS_ENABLED).toBe(expected);
      expect(weeklyJobClient.enabled).toBe(expected);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('remains inert and disabled until an operation is explicitly enabled', async () => {
    const fetchImpl = vi.fn();
    const getSession = vi.fn();
    const client = createWeeklyJobClient({ fetchImpl, getSession });
    expect(getSession).not.toHaveBeenCalled();
    await expect(client.status(JOB_ID)).rejects.toMatchObject({ code: 'job_unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('submits only the three allowed fields with the same caller request ID on explicit repeat', async () => {
    const fetchImpl = vi.fn(async () => response(summary()));
    const { client } = setup(fetchImpl);
    const input = { sourceLessonPlanId: PLAN_ID, questionCount: 30, requestId: 'same-request' };
    await client.submit(input);
    await client.submit(input);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchImpl.mock.calls) {
      expect(url).toBe('https://example.invalid/api/ai/weekly-draft-jobs/');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer synthetic-token');
      expect(JSON.parse(options.body)).toEqual({ lessonPlanId: PLAN_ID,
        questionCount: 30, requestId: 'same-request' });
    }
  });

  it('accepts only bounded wake-up status on submit, never on job status', async () => {
    const input = { sourceLessonPlanId: PLAN_ID, questionCount: 30, requestId: 'same-request' };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response(summary(), 202, 'unconfirmed'))
      .mockResolvedValueOnce(response({ ...summary(), checkpoints: ['private'] }, 202, 'accepted'))
      .mockResolvedValueOnce(response(summary('QUEUED'), 200, 'accepted'));
    const { client } = setup(fetchImpl);
    expect(await client.submit(input)).toEqual({ ...summary(), wakeStatus: 'unconfirmed' });
    await expect(client.submit(input)).rejects.toMatchObject({ code: 'malformed_response' });
    expect(await client.status(JOB_ID)).toEqual(summary());
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('reads status before fetching the authorized completed draft and makes no submit request', async () => {
    const finalDraft = draft();
    const fetchImpl = vi.fn(async url => response(url.endsWith('/result') ? finalDraft : summary('COMPLETED')));
    const { client } = setup(fetchImpl);
    expect(await client.result(JOB_ID)).toEqual(finalDraft);
    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      [`https://example.invalid/api/ai/weekly-draft-jobs/${JOB_ID}`, 'GET'],
      [`https://example.invalid/api/ai/weekly-draft-jobs/${JOB_ID}/result`, 'GET'],
    ]);
  });

  it.each(['FAILED', 'CANCELED', 'INTERRUPTED_UNKNOWN_OUTCOME', 'QUEUED'])(
    'does not request a result for %s after the authoritative status read', async status => {
      const fetchImpl = vi.fn(async () => response(summary(status)));
      const { client } = setup(fetchImpl);
      await expect(client.result(JOB_ID)).rejects.toMatchObject({ code: 'not_ready' });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
    });

  it('uses a distinct authenticated Cancel request and requires its confirmed receipt', async () => {
    const fetchImpl = vi.fn(async () => response({ id: JOB_ID, status: 'CANCELED' }));
    const { client } = setup(fetchImpl);
    expect(await client.cancel(JOB_ID)).toEqual({ id: JOB_ID, status: 'CANCELED' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://example.invalid/api/ai/weekly-draft-jobs/${JOB_ID}/cancel`);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'POST',
      headers: { Authorization: 'Bearer synthetic-token' } });
  });

  it.each(['CANCELED', 'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME'])(
    'returns the actual %s Cancel receipt without another request', async status => {
      const fetchImpl = vi.fn(async () => response({ id: JOB_ID, status }));
      const { client } = setup(fetchImpl);
      expect(await client.cancel(JOB_ID)).toEqual({ id: JOB_ID, status });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

  it.each([
    { id: JOB_ID, status: 'RUNNING' },
    { id: 'wrong-id', status: 'FAILED' },
    { id: JOB_ID, status: 'FAILED', checkpoints: ['private'] },
    null,
  ])('rejects malformed or private Cancel receipts', async receipt => {
    const fetchImpl = vi.fn(async () => response(receipt));
    const { client } = setup(fetchImpl);
    await expect(client.cancel(JOB_ID)).rejects.toMatchObject({ code: 'cancel_unconfirmed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [async () => { throw new Error('private transport detail'); }],
    [async () => response({ code: 'job_unavailable' }, 503)],
    [async () => response({ status: 'RUNNING', id: JOB_ID })],
  ])('reports an unconfirmed Cancel without claiming it succeeded', async fetcher => {
    const fetchImpl = vi.fn(fetcher);
    const { client } = setup(fetchImpl);
    await expect(client.cancel(JOB_ID)).rejects.toMatchObject({ code: 'cancel_unconfirmed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed/private receipts and never returns raw backend error text', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ ...summary(), checkpoints: ['private'] }))
      .mockResolvedValueOnce(response({ code: 'unknown', error: 'private database detail' }, 503))
      .mockResolvedValueOnce(response(summary('COMPLETED')))
      .mockResolvedValueOnce(response({ ...draft(), checkpoints: ['private'] }));
    const { client } = setup(fetchImpl);
    await expect(client.status(JOB_ID)).rejects.toMatchObject({ code: 'malformed_response' });
    await expect(client.status(JOB_ID)).rejects.toMatchObject({ code: 'status_unconfirmed' });
    await expect(client.result(JOB_ID)).rejects.toMatchObject({ code: 'malformed_response' });
  });

  it('rejects invalid input or missing session before network access', async () => {
    const fetchImpl = vi.fn();
    const client = createWeeklyJobClient({ enabled: true, getSession: async () => ({ data: { session: null } }), fetchImpl });
    await expect(client.submit({ sourceLessonPlanId: PLAN_ID, questionCount: 10,
      requestId: 'bad' })).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(client.status(JOB_ID)).rejects.toMatchObject({ code: 'not_authenticated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
