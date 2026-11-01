import assert from 'node:assert/strict';
import test from 'node:test';
import { weeklySaveLocallyEnabled, weeklySavePostHandler } from './aiWeeklyWorksheetSave.js';

const local = { NODE_ENV: 'development', AI_WEEKLY_WORKSHEET_SAVE_ENABLED: '1',
  SUPABASE_URL: 'http://127.0.0.1:54321' };
const request = { socket: { remoteAddress: '127.0.0.1' } };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return body; } });

test('weekly gate is independent and rejects off, production, Vercel, and LAN', () => {
  assert.equal(weeklySaveLocallyEnabled(request, local), true);
  assert.equal(weeklySaveLocallyEnabled(request, { ...local, AI_WEEKLY_WORKSHEET_SAVE_ENABLED: undefined,
    AI_LESSON_PLAN_SAVE_ENABLED: '1' }), false);
  assert.equal(weeklySaveLocallyEnabled(request, { ...local, NODE_ENV: 'production' }), false);
  assert.equal(weeklySaveLocallyEnabled(request, { ...local, VERCEL: '1' }), false);
  assert.equal(weeklySaveLocallyEnabled(request, { ...local, VERCEL_ENV: 'preview' }), false);
  assert.equal(weeklySaveLocallyEnabled({ socket: { remoteAddress: '192.168.1.4' } }, local), false);
  const hosted = { ...local, SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    AI_SAVE_DEV_PROJECT_REF: 'abcdefghijklmnopqrst' };
  assert.equal(weeklySaveLocallyEnabled(request, hosted), true);
  assert.equal(weeklySaveLocallyEnabled(request, { ...hosted,
    SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co',
    AI_SAVE_DEV_PROJECT_REF: 'jllstakxiamxiycnwrbd' }), false);
  assert.equal(weeklySaveLocallyEnabled(request, { ...hosted,
    SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co',
    AI_SAVE_DEV_PROJECT_REF: 'jllstakxiamxiycnwrbd',
    AI_SAVE_ALLOW_TEST_DATA_PROJECT: '1' }), true);
});

test('non-teacher and missing bearer credential are rejected without a write', async () => {
  let calls = 0;
  const service = { async save(token) { calls++; return token
    ? { ok: true, durable: true, collectionId: 'id', worksheets: [] }
    : { ok: false, durable: false, code: 'not_authenticated' }; } };
  const forbidden = response();
  await weeklySavePostHandler({ user: { role: 'student' }, get: () => 'Bearer synthetic-token' },
    forbidden, service);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.body.code, 'inactive_teacher');
  assert.equal(forbidden.body.durable, false);
  assert.equal(calls, 0);
  const missing = response();
  await weeklySavePostHandler({ user: { role: 'teacher' }, get: () => '' }, missing, service);
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.body.code, 'not_authenticated');
});

test('all RPC failures map to safe HTTP statuses and never echo raw messages', async () => {
  const cases = [
    ['not_authenticated', 401], ['inactive_teacher', 403], ['source_plan_denied', 403],
    ['invalid_document', 422], ['mcq_options_not_distinct', 422], ['unsafe_markup', 422],
    ['payload_too_large', 413], ['idempotency_conflict', 409],
    ['invalid_state', 503], ['persistence_failed', 503],
  ];
  for (const [code, status] of cases) {
    const res = response();
    await weeklySavePostHandler({ user: { role: 'teacher' }, body: {},
      get: () => 'Bearer synthetic-token' }, res, {
      save: async () => ({ ok: false, code, durable: false, raw: 'secret question and token' }),
    });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.code, code);
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
    if (code === 'unsafe_markup') {
      assert.equal(res.body.error,
        'Remove < symbols or HTML tags from the worksheet text, for example write x < y with spaces.');
    }
  }
  const unknown = response();
  await weeklySavePostHandler({ user: { role: 'teacher' }, body: {},
    get: () => 'Bearer synthetic-token' }, unknown, {
    save: async () => ({ ok: false, code: 'raw database question', durable: false }),
  });
  assert.equal(unknown.body.code, 'persistence_failed');
  assert.equal(JSON.stringify(unknown.body).includes('raw database'), false);
});
