// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { archiveAiWeeklyCollection, deleteAiWeeklyCollection,
  updateAiWeeklyCollection } from './aiWeeklyWorksheetManageClient';

const auth = vi.hoisted(() => ({ session: { access_token: 'synthetic-token' }, getSession: vi.fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { auth: { getSession: auth.getSession } } }));

const collectionId = '11111111-1111-4111-8111-111111111111';
const collection = { collectionId, worksheets: [] };
const params = { collectionId, expectedRevision: 2, collection, archived: true, extra: 'omit me' };
const worksheets = [1, 2, 3, 4, 5].map(day => ({ day,
  id: `33333333-3333-4333-8333-33333333333${day}`, items: 20 }));
const updateReceipt = { ok: true, durable: true, collectionId, revision: 3, worksheets };
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

it('sends update to the manage URL with the bearer token and only allowed body fields', async () => {
  const fetchMock = stubReply(200, updateReceipt);
  const result = await updateAiWeeklyCollection('http://localhost:3001', params);
  expect(result).toEqual({ status: 'saved', code: null, message: '', receipt: {
    collectionId, revision: 3, worksheets, lockedDays: [] }, detail: null });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('http://localhost:3001/api/weekly-worksheets/manage/update');
  expect(options.method).toBe('POST');
  expect(options.headers).toEqual({ Authorization: 'Bearer synthetic-token',
    'Content-Type': 'application/json' });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body)).toEqual({ collectionId, expectedRevision: 2, collection });
});

it('sends archive and delete with exact bodies and sanitizes their receipts', async () => {
  const fetchMock = stubReply(200, { ok: true, durable: true, collectionId,
    revision: 3, archived: true, ignored: 'synthetic-token' });
  expect(await archiveAiWeeklyCollection('http://localhost:3001', params)).toEqual({
    status: 'saved', code: null, message: '',
    receipt: { collectionId, revision: 3, archived: true }, detail: null,
  });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3001/api/weekly-worksheets/manage/archive');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ collectionId,
    expectedRevision: 2, archived: true });
  fetchMock.mockResolvedValue(reply(200, { ok: true, durable: true, collectionId,
    deleted: true, ignored: 'synthetic-token' }));
  expect(await deleteAiWeeklyCollection('http://localhost:3001', params)).toEqual({
    status: 'saved', code: null, message: '', receipt: { collectionId, deleted: true }, detail: null,
  });
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3001/api/weekly-worksheets/manage/delete');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ collectionId, expectedRevision: 2 });
});

it('drops extra fields from a successful update receipt', async () => {
  stubReply(200, { ...updateReceipt, ignored: 'synthetic-token',
    worksheets: worksheets.map(item => ({ ...item, ignored: 'synthetic-token' })) });
  const result = await updateAiWeeklyCollection('', params);
  expect(result.receipt).toEqual({ collectionId, revision: 3, worksheets, lockedDays: [] });
  expect(JSON.stringify(result)).not.toContain('synthetic-token');
});

it('treats stale revisions, duplicate days and malformed worksheet IDs as unknown', async () => {
  const fetchMock = stubReply(200, { ...updateReceipt, revision: 2 });
  for (const body of [{ ...updateReceipt, revision: 2 },
    { ...updateReceipt, worksheets: [worksheets[0], { ...worksheets[1], day: 1 },
      ...worksheets.slice(2)] },
    { ...updateReceipt, worksheets: [{ ...worksheets[0], id: 'bad' }, ...worksheets.slice(1)] }]) {
    fetchMock.mockResolvedValue(reply(200, body));
    const result = await updateAiWeeklyCollection('', params);
    expect(result.status).toBe('unknown');
    expect(result.detail).toBe('malformed_receipt');
  }
});

it('preserves valid lockedDays in an update receipt', async () => {
  stubReply(200, { ...updateReceipt, lockedDays: [1, 3],
    worksheets: worksheets.map(item => item.day === 1 ? { ...item, items: 2 } : item) });
  const result = await updateAiWeeklyCollection('', params);
  expect(result.status).toBe('saved');
  expect(result.receipt).toEqual({ collectionId, revision: 3, lockedDays: [1, 3],
    worksheets: worksheets.map(item => item.day === 1 ? { ...item, items: 2 } : item) });
});

it('treats malformed lockedDays as an unknown update receipt', async () => {
  const fetchMock = stubReply(200, updateReceipt);
  for (const lockedDays of [[1, 1], [2, 1], [0], [6], [1, 2, 3, 4, 5], '1', [1.5]]) {
    fetchMock.mockResolvedValue(reply(200, { ...updateReceipt, lockedDays }));
    const result = await updateAiWeeklyCollection('', params);
    expect(result.status).toBe('unknown');
    expect(result.detail).toBe('malformed_receipt');
  }
  fetchMock.mockResolvedValue(reply(200, { ...updateReceipt, lockedDays: [1],
    worksheets: worksheets.map(item => item.day === 1 ? { ...item, day: 6 } : item) }));
  expect((await updateAiWeeklyCollection('', params)).detail).toBe('malformed_receipt');
});

it('maps every definite refusal to a fixed local message without server text', async () => {
  const expected = {
    not_authenticated: 'Sign in again before saving.',
    inactive_teacher: 'This account cannot change worksheets.',
    not_found: 'This collection was not found.',
    invalid_document: 'Review the weekly worksheets before saving.',
    mcq_options_not_distinct: 'Each multiple-choice option must be different.',
    unsafe_markup: 'Remove HTML or unsafe markup from the worksheet text.',
    payload_too_large: 'The weekly worksheets are too large to save.',
    revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
    student_work_exists: 'This collection already has student work and cannot be changed.',
    collection_archived: 'Restore this collection before editing it.',
    invalid_state: 'This collection cannot be changed in its current state.',
    integration_blocked: 'Permanent worksheet changes are unavailable.',
  };
  const fetchMock = stubReply(409, null);
  for (const [code, message] of Object.entries(expected)) {
    fetchMock.mockResolvedValue(reply(409, { ok: false, code, durable: false,
      error: 'untrusted synthetic-token server text' }));
    const result = await archiveAiWeeklyCollection('', params);
    expect(result).toEqual({ status: 'failed', code, message, receipt: null, detail: null });
    expect(JSON.stringify(result)).not.toContain('synthetic-token');
  }
});

it('treats persistence_failed and unrecognized refusal codes as unknown', async () => {
  const fetchMock = stubReply(503, null);
  for (const code of ['persistence_failed', 'future_code']) {
    fetchMock.mockResolvedValue(reply(503, { ok: false, code, durable: false,
      error: 'untrusted synthetic-token server text' }));
    expect(await deleteAiWeeklyCollection('', params)).toEqual({ status: 'unknown', code: null,
      message: 'Could not confirm the change. Reload the collection before trying again.',
      receipt: null, detail: `http_503:${code}` });
  }
  fetchMock.mockResolvedValue(reply(502, { ok: false, code: 'UNSAFE:synthetic-token',
    error: 'untrusted synthetic-token server text' }));
  const result = await deleteAiWeeklyCollection('', params);
  expect(result.detail).toBe('http_502');
  expect(JSON.stringify(result)).not.toContain('synthetic-token');
});

it('returns unknown for network, timeout, unreadable and malformed success responses', async () => {
  const fetchMock = stubReply(200, null);
  for (const [error, detail] of [[new TypeError('network'), 'network_error'],
    [new DOMException('timeout', 'TimeoutError'), 'timeout'],
    [new DOMException('aborted', 'AbortError'), 'timeout']]) {
    fetchMock.mockRejectedValue(error);
    expect((await updateAiWeeklyCollection('', params)).detail).toBe(detail);
  }
  fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error('bad JSON'); } });
  expect((await updateAiWeeklyCollection('', params)).detail).toBe('unreadable_response');
  for (const body of [{ ...updateReceipt, durable: false }, { ...updateReceipt, ok: false },
    { ...updateReceipt, worksheets: worksheets.slice(0, 4) }]) {
    fetchMock.mockResolvedValue(reply(200, body));
    expect((await updateAiWeeklyCollection('', params)).detail).toBe('malformed_receipt');
  }
});

it('rejects invalid parameters before session lookup or fetch', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  for (const [fn, bad] of [
    [updateAiWeeklyCollection, { ...params, collectionId: 'bad' }],
    [updateAiWeeklyCollection, { ...params, expectedRevision: 0 }],
    [updateAiWeeklyCollection, { ...params, expectedRevision: 2.5 }],
    [updateAiWeeklyCollection, { ...params, collection: { collectionId: 'bad' } }],
    [archiveAiWeeklyCollection, { ...params, archived: 'true' }],
    [deleteAiWeeklyCollection, null],
  ]) expect(await fn('', bad)).toEqual({ status: 'failed', code: 'invalid_request',
    message: 'The request was not valid.', receipt: null, detail: null });
  expect(auth.getSession).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('blocks all actions before session lookup when the local flag is off', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  for (const fn of [updateAiWeeklyCollection, archiveAiWeeklyCollection, deleteAiWeeklyCollection]) {
    expect(await fn('', params)).toEqual({ status: 'failed', code: 'integration_blocked',
      message: 'Permanent worksheet changes are unavailable.', receipt: null, detail: null });
  }
  expect(auth.getSession).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not fetch without a session token', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  auth.session = null;
  expect(await deleteAiWeeklyCollection('', params)).toEqual({ status: 'failed',
    code: 'not_authenticated', message: 'Sign in again before saving.', receipt: null, detail: null });
  expect(fetchMock).not.toHaveBeenCalled();
});
