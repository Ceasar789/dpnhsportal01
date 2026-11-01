import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiWeeklyWorksheetDistributeRouter,
  weeklyDistributePostHandler } from './aiWeeklyWorksheetDistribute.js';

const collectionId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const local = { NODE_ENV: 'development', AI_WEEKLY_WORKSHEET_SAVE_ENABLED: '1',
  SUPABASE_URL: 'http://127.0.0.1:54321' };
const body = { collectionId, expectedRevision: 1, sectionId,
  days: [1], studentIds: [studentId], dueAt: null };
const receipt = { ok: true, durable: true, collectionId, sectionId, days: [1],
  requested: 1, inserted: 1, alreadyAssigned: 0, assignedElsewhere: 0 };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return value; } });
const request = () => ({ body, user: { role: 'teacher' },
  socket: { remoteAddress: '127.0.0.1' }, get: () => 'Bearer synthetic-token' });
const auth = (_req, _res, next) => next();

async function dispatch(router, req = request()) {
  const res = response();
  const route = router.stack.find(layer => layer.route?.path === '/')?.route;
  assert.ok(route);
  let passed = false;
  route.stack[0].handle(req, res, () => { passed = true; });
  if (!passed) return res;
  passed = false;
  await route.stack[1].handle(req, res, () => { passed = true; });
  if (passed) await route.stack[2].handle(req, res);
  return res;
}

test('each known code gets its fixed HTTP status and no database text leaks', async () => {
  const cases = [['not_authenticated', 401], ['inactive_teacher', 403],
    ['section_not_allowed', 403], ['student_not_in_section', 422],
    ['invalid_document', 422], ['invalid_due_date', 422], ['not_found', 404],
    ['revision_conflict', 409], ['collection_archived', 409],
    ['integration_blocked', 503], ['persistence_failed', 503]];
  const shared = { not_authenticated: 'Sign in again before saving.',
    inactive_teacher: 'This account cannot save worksheets.',
    not_found: 'This collection was not found.',
    invalid_document: 'Review the weekly worksheets before saving.',
    revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
    collection_archived: 'Restore this collection before editing it.' };
  for (const [code, status] of cases) {
    const res = response();
    await weeklyDistributePostHandler(request(), res, () => ({ distribute: async () => ({
      ok: false, code, durable: false, raw: 'secret student name and token' }) }));
    assert.equal(res.statusCode, status);
    assert.deepEqual(res.body, { ok: false, code, durable: false, error: res.body.error });
    assert.equal(typeof res.body.error, 'string');
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
    if (shared[code]) assert.equal(res.body.error, shared[code]);
  }
});

test('unknown service code and thrown service become persistence_failed', async () => {
  for (const getService of [() => ({ distribute: async () => ({ ok: false,
    code: 'secret database message' }) }),
  () => ({ distribute: async () => { throw new Error('secret token'); } })]) {
    const res = response();
    await weeklyDistributePostHandler(request(), res, getService);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'persistence_failed');
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
  }
});

test('gate rejects before auth and RPC when disabled', async () => {
  let authCalls = 0;
  let rpcCalls = 0;
  const router = createAiWeeklyWorksheetDistributeRouter({ env: { ...local,
    AI_WEEKLY_WORKSHEET_SAVE_ENABLED: undefined },
  auth: (_req, _res, next) => { authCalls++; next(); },
  invokeRpc: async () => { rpcCalls++; } });
  const res = await dispatch(router);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'integration_blocked');
  assert.equal(authCalls, 0);
  assert.equal(rpcCalls, 0);
});

test('non-teacher, absent bearer and throwing transport are rejected before RPC', async () => {
  let calls = 0;
  const router = createAiWeeklyWorksheetDistributeRouter({ env: local, auth,
    invokeRpc: async () => { calls++; } });
  const other = request(); other.user.role = 'student';
  assert.equal((await dispatch(router, other)).body.code, 'inactive_teacher');
  const missing = request(); missing.get = () => '';
  assert.equal((await dispatch(router, missing)).body.code, 'not_authenticated');
  assert.equal(calls, 0);
  const broken = createAiWeeklyWorksheetDistributeRouter({ env: local, auth });
  const res = await dispatch(broken);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'integration_blocked');
});

test('mounted route passes a valid command to only the mocked RPC', async () => {
  const calls = [];
  const router = createAiWeeklyWorksheetDistributeRouter({ env: local, auth,
    invokeRpc: async (...args) => { calls.push(args); return { data: receipt, error: null }; } });
  const res = await dispatch(router);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, receipt);
  assert.deepEqual(calls, [['eduscribe_ai_weekly_worksheets_distribute_v1', {
    p_collection_id: collectionId, p_expected_revision: 1, p_section_id: sectionId,
    p_days: [1], p_student_ids: [studentId], p_due_at: null }, 'synthetic-token']]);
});
