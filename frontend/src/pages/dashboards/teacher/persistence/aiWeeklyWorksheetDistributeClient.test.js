// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { distributeAiWeeklyCollection } from './aiWeeklyWorksheetDistributeClient';

const auth = vi.hoisted(() => ({ session: { access_token: 'synthetic-token' }, getSession: vi.fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { auth: { getSession: auth.getSession } } }));

const collectionId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const studentA = '33333333-3333-4333-8333-333333333333';
const studentB = '44444444-4444-4444-8444-444444444444';
const params = { collectionId, expectedRevision: 2, sectionId,
  days: [1, 3], studentIds: [studentA, studentB], dueAt: null, extra: 'secret student name' };
const receipt = { ok: true, durable: true, collectionId, sectionId, days: [1, 3],
  requested: 4, inserted: 3, alreadyAssigned: 1, assignedElsewhere: 1 };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body });
const stubReply = (status, body) => {
  const fetchMock = vi.fn(async () => reply(status, body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  auth.session = { access_token: 'synthetic-token' };
  auth.getSession.mockReset();
  auth.getSession.mockImplementation(async () => ({ data: { session: auth.session } }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('sends exactly six command fields and returns only receipt IDs and counts', async () => {
  const fetchMock = stubReply(200, { ...receipt, ignored: 'secret student name and token' });
  const result = await distributeAiWeeklyCollection('http://localhost:3001', params);
  expect(result).toEqual({ status: 'saved', code: null, message: '', receipt: {
    collectionId, sectionId, days: [1, 3], requested: 4, inserted: 3,
    alreadyAssigned: 1, assignedElsewhere: 1 }, detail: null });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('http://localhost:3001/api/weekly-worksheets/distribute');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ Authorization: 'Bearer synthetic-token',
    'Content-Type': 'application/json' });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body)).toEqual({ collectionId, expectedRevision: 2, sectionId,
    days: [1, 3], studentIds: [studentA, studentB], dueAt: null });
});

it('validates locally before session lookup and allows a valid past ISO due date', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  for (const bad of [null, { ...params, collectionId: 'bad' },
    { ...params, sectionId: 'bad' }, { ...params, expectedRevision: 0 },
    { ...params, days: [] }, { ...params, days: [1, 1] },
    { ...params, days: [6] }, { ...params, studentIds: [] },
    { ...params, studentIds: [studentA, studentA] },
    { ...params, studentIds: Array(201).fill(studentA) },
    { ...params, dueAt: 'tomorrow' }, { ...params, dueAt: '2026-02-30T00:00:00Z' },
    { ...params, dueAt: undefined }]) {
    expect(await distributeAiWeeklyCollection('', bad)).toEqual({ status: 'failed',
      code: 'invalid_request', message: 'The request was not valid.', receipt: null, detail: null });
  }
  expect(auth.getSession).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(reply(200, receipt));
  expect((await distributeAiWeeklyCollection('', { ...params,
    dueAt: '2020-01-01T00:00:00Z' })).status).toBe('saved');
});

it('maps definite refusals to fixed messages only with their expected HTTP status', async () => {
  const expected = [
    ['not_authenticated', 401, 'Sign in again before saving.'],
    ['inactive_teacher', 403, 'This account cannot change worksheets.'],
    ['not_found', 404, 'This collection was not found.'],
    ['invalid_document', 422, 'Review the weekly worksheets before saving.'],
    ['revision_conflict', 409, 'This collection changed in the meantime. Reload it before saving.'],
    ['collection_archived', 409, 'Restore this collection before editing it.'],
    ['section_not_allowed', 403, 'You cannot distribute to this section.'],
    ['student_not_in_section', 422, 'One or more students are not active members of this section.'],
    ['invalid_due_date', 422, 'Choose a valid future due date.'],
    ['integration_blocked', 503, 'Permanent worksheet changes are unavailable.'],
  ];
  const fetchMock = stubReply(503, null);
  for (const [code, status, message] of expected) {
    fetchMock.mockResolvedValue(reply(status, { ok: false, durable: false, code,
      error: 'secret student name and token' }));
    expect(await distributeAiWeeklyCollection('', params)).toEqual({ status: 'failed',
      code, message, receipt: null, detail: null });
  }
});

it('returns unknown for persistence_failed, unknown codes and unexpected HTTP statuses', async () => {
  const fetchMock = stubReply(503, null);
  for (const [status, code, durable] of [[503, 'persistence_failed', false],
    [503, 'new_code', false], [418, 'invalid_due_date', false],
    [422, 'invalid_due_date', true]]) {
    fetchMock.mockResolvedValue(reply(status, { ok: false, durable, code,
      error: 'secret student name and token' }));
    expect(await distributeAiWeeklyCollection('', params)).toEqual({ status: 'unknown',
      code: null, message: 'Could not confirm the change. Reload the collection before trying again.',
      receipt: null, detail: `http_${status}:${code}` });
  }
  fetchMock.mockResolvedValue(reply(201, receipt));
  expect((await distributeAiWeeklyCollection('', params)).detail).toBe('http_201');
});

it('returns unknown for network, timeout, unreadable and malformed receipts', async () => {
  const fetchMock = stubReply(200, null);
  for (const [error, detail] of [[new TypeError('secret network'), 'network_error'],
    [new DOMException('secret timeout', 'TimeoutError'), 'timeout'],
    [new DOMException('secret aborted', 'AbortError'), 'timeout']]) {
    fetchMock.mockRejectedValue(error);
    expect((await distributeAiWeeklyCollection('', params)).detail).toBe(detail);
  }
  fetchMock.mockResolvedValue({ ok: true, status: 200,
    json: async () => { throw new Error('secret JSON'); } });
  expect((await distributeAiWeeklyCollection('', params)).detail).toBe('unreadable_response');
  for (const data of [{ ...receipt, days: [3, 1] },
    { ...receipt, requested: 5 }, { ...receipt, inserted: 4 },
    { ...receipt, assignedElsewhere: 2 }, { ...receipt, sectionId: studentA }]) {
    fetchMock.mockResolvedValue(reply(200, data));
    expect((await distributeAiWeeklyCollection('', params)).detail).toBe('malformed_receipt');
  }
});

it('blocks before session when the flag is off and before fetch without a token', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  expect(await distributeAiWeeklyCollection('', params)).toEqual({ status: 'failed',
    code: 'integration_blocked', message: 'Permanent worksheet changes are unavailable.',
    receipt: null, detail: null });
  expect(auth.getSession).not.toHaveBeenCalled();
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  auth.session = null;
  expect(await distributeAiWeeklyCollection('', params)).toEqual({ status: 'failed',
    code: 'not_authenticated', message: 'Sign in again before saving.',
    receipt: null, detail: null });
  expect(fetchMock).not.toHaveBeenCalled();
});
