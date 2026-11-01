// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveAiWeeklyWorksheets, weeklyWorksheetSaveFlagEnabled } from './aiWeeklyWorksheetSaveClient';

const auth = vi.hoisted(() => ({ session: { access_token: 'synthetic-token' } }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: auth.session } }) },
} }));

const collection = { collectionId: '11111111-1111-4111-8111-111111111111',
  worksheets: [{ day: 'Monday', questions: [{}] }, { day: 'Tuesday', questions: [{}, {}] }] };
const command = { requestId: collection.collectionId, collection };
const receipt = { ok: true, durable: true, collectionId: '22222222-2222-4222-8222-222222222222',
  worksheets: [{ day: 1, id: '33333333-3333-4333-8333-333333333333', items: 1 },
    { day: 2, id: '44444444-4444-4444-8444-444444444444', items: 2 }] };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body });

beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  auth.session = { access_token: 'synthetic-token' };
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('requires its own local flag and never sends when disabled', async () => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  expect(weeklyWorksheetSaveFlagEnabled()).toBe(false);
  expect((await saveAiWeeklyWorksheets('', command)).code).toBe('integration_blocked');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('sends the bearer token and confirms only a complete durable receipt without storing drafts', async () => {
  const fetchMock = vi.fn(async () => reply(200, receipt)); vi.stubGlobal('fetch', fetchMock);
  const localWrite = vi.spyOn(Storage.prototype, 'setItem');
  const result = await saveAiWeeklyWorksheets('http://localhost:3001', command);
  expect(result).toEqual({ status: 'saved', code: null, message: '',
    receipt: { collectionId: receipt.collectionId, worksheets: receipt.worksheets } });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-token');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(command);
  expect(localWrite).not.toHaveBeenCalled();
  localWrite.mockRestore();
});

it('accepts real v4 UUIDs in the collection and worksheet receipt ids', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(200, receipt)));
  expect((await saveAiWeeklyWorksheets('', command)).status).toBe('saved');
});

it.each([
  ['8-4-4-12 collection id', { ...receipt, collectionId: '22222222-2222-4222-222222222222' }],
  ['8-4-4-12 worksheet id', { ...receipt, worksheets: [
    { ...receipt.worksheets[0], id: '33333333-3333-4333-333333333333' }, receipt.worksheets[1]] }],
  ['non-UUID collection id', { ...receipt, collectionId: 'not-a-uuid' }],
  ['non-UUID worksheet id', { ...receipt, worksheets: [
    { ...receipt.worksheets[0], id: 'not-a-uuid' }, receipt.worksheets[1]] }],
])('treats a %s as unknown', async (_case, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(200, body)));
  expect((await saveAiWeeklyWorksheets('', command)).status).toBe('unknown');
});

it.each(['not_authenticated', 'inactive_teacher', 'source_plan_denied', 'invalid_document',
  'mcq_options_not_distinct', 'unsafe_markup', 'payload_too_large', 'idempotency_conflict',
  'invalid_state', 'integration_blocked', 'persistence_failed'])(
  'keeps safe backend error text for %s', async code => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(422, { ok: false, durable: false,
      code, error: 'Safe backend message.' })));
    expect(await saveAiWeeklyWorksheets('', command)).toEqual({ status: 'failed', code,
      message: 'Safe backend message.', receipt: null });
  });

it('marks malformed 200, unreadable, network, timeout, and future errors as unknown', async () => {
  for (const body of [{ ...receipt, durable: false }, { ...receipt, worksheets: receipt.worksheets.slice(0, 1) },
    { ...receipt, worksheets: [{ ...receipt.worksheets[0], id: 'bad' }, receipt.worksheets[1]] }]) {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, body)));
    expect((await saveAiWeeklyWorksheets('', command)).status).toBe('unknown');
  }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } })));
  expect((await saveAiWeeklyWorksheets('', command)).status).toBe('unknown');
  for (const error of [new TypeError('network'), new DOMException('timeout', 'TimeoutError')]) {
    vi.stubGlobal('fetch', vi.fn(async () => { throw error; }));
    expect((await saveAiWeeklyWorksheets('', command)).status).toBe('unknown');
  }
  vi.stubGlobal('fetch', vi.fn(async () => reply(500, { ok: false, durable: false,
    code: 'future_code', error: 'untrusted content' })));
  const future = await saveAiWeeklyWorksheets('', command);
  expect(future.status).toBe('unknown');
  expect(future.message).not.toContain('untrusted content');
});
