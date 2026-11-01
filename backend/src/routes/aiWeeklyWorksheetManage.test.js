import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiWeeklyWorksheetManageRouter,
  weeklyManagePostHandler } from './aiWeeklyWorksheetManage.js';

const collectionId = '11111111-1111-4111-8111-111111111111';
const worksheetId = '33333333-3333-4333-8333-333333333333';
const local = { NODE_ENV: 'development', AI_WEEKLY_WORKSHEET_SAVE_ENABLED: '1',
  SUPABASE_URL: 'http://127.0.0.1:54321' };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return body; } });
const request = (body = {}) => ({ body, user: { role: 'teacher' },
  socket: { remoteAddress: '127.0.0.1' }, get: () => 'Bearer synthetic-token' });
const auth = (_req, _res, next) => next();

async function dispatch(router, path, req) {
  const res = response();
  const route = router.stack.find(layer => layer.route?.path === path)?.route;
  assert.ok(route, `missing ${path}`);
  let passed = false;
  route.stack[0].handle(req, res, () => { passed = true; });
  if (!passed) return res;
  passed = false;
  await route.stack[1].handle(req, res, () => { passed = true; });
  if (passed) await route.stack[2].handle(req, res);
  return res;
}

test('all known error codes map to fixed HTTP responses without raw text', async () => {
  const cases = [
    ['not_authenticated', 401], ['inactive_teacher', 403], ['source_plan_denied', 403],
    ['not_found', 404], ['invalid_document', 422], ['mcq_options_not_distinct', 422],
    ['unsafe_markup', 422], ['payload_too_large', 413], ['revision_conflict', 409],
    ['student_work_exists', 409], ['collection_archived', 409], ['idempotency_conflict', 409],
    ['invalid_state', 409], ['integration_blocked', 503], ['persistence_failed', 503],
  ];
  const fixed = { student_work_exists: 'This collection already has student work and cannot be changed.',
    revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
    not_found: 'This collection was not found.',
    collection_archived: 'Restore this collection before editing it.' };
  for (const [code, status] of cases) {
    const res = response();
    await weeklyManagePostHandler(request(), res, () => ({
      update: async () => ({ ok: false, code, durable: false, raw: 'secret question and token' }),
    }), 'update');
    assert.equal(res.statusCode, status);
    assert.deepEqual(res.body, { ok: false, code, durable: false, error: res.body.error });
    assert.equal(typeof res.body.error, 'string');
    assert.equal(JSON.stringify(res.body).includes('secret'), false);
    if (fixed[code]) assert.equal(res.body.error, fixed[code]);
  }
  const unknown = response();
  await weeklyManagePostHandler(request(), unknown, () => ({
    update: async () => ({ ok: false, code: 'raw database question', durable: false }),
  }), 'update');
  assert.equal(unknown.statusCode, 503);
  assert.equal(unknown.body.code, 'persistence_failed');
  assert.equal(JSON.stringify(unknown.body).includes('raw database'), false);
});

test('gate off returns 503 before authentication or RPC construction', async () => {
  let authCalls = 0;
  let rpcCalls = 0;
  const router = createAiWeeklyWorksheetManageRouter({ env: { ...local,
    AI_WEEKLY_WORKSHEET_SAVE_ENABLED: undefined },
  auth: (_req, _res, next) => { authCalls++; next(); },
  invokeRpc: async () => { rpcCalls++; } });
  const res = await dispatch(router, '/archive', request({ collectionId,
    expectedRevision: 1, archived: true }));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'integration_blocked');
  assert.equal(authCalls, 0);
  assert.equal(rpcCalls, 0);
});

test('non-teacher and missing bearer are rejected before RPC', async () => {
  let calls = 0;
  const router = createAiWeeklyWorksheetManageRouter({ env: local, auth,
    invokeRpc: async () => { calls++; } });
  const other = request({ collectionId, expectedRevision: 1 });
  other.user.role = 'student';
  const forbidden = await dispatch(router, '/delete', other);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.body.code, 'inactive_teacher');
  const noToken = request({ collectionId, expectedRevision: 1 });
  noToken.get = () => '';
  const missing = await dispatch(router, '/delete', noToken);
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.body.code, 'not_authenticated');
  assert.equal(calls, 0);
});

test('throwing lazy transport constructor returns 503 integration_blocked', async () => {
  const router = createAiWeeklyWorksheetManageRouter({ env: local, auth });
  const res = await dispatch(router, '/archive', request({ collectionId,
    expectedRevision: 1, archived: true }));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'integration_blocked');
  assert.equal(res.body.durable, false);
});

test('mounted archive and delete routes call only mocked RPCs', async () => {
  const calls = [];
  const router = createAiWeeklyWorksheetManageRouter({ env: local, auth,
    invokeRpc: async (name, args, token) => {
      calls.push({ name, args, token });
      return { data: name.endsWith('_archive_v1')
        ? { ok: true, durable: true, collectionId, revision: 2, archived: true }
        : { ok: true, durable: true, collectionId, deleted: true }, error: null };
    } });
  const archived = await dispatch(router, '/archive', request({ collectionId,
    expectedRevision: 1, archived: true }));
  const deleted = await dispatch(router, '/delete', request({ collectionId,
    expectedRevision: 1 }));
  assert.equal(archived.statusCode, 200);
  assert.equal(archived.body.archived, true);
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.body.deleted, true);
  assert.deepEqual(calls.map(call => call.name), [
    'eduscribe_ai_weekly_worksheets_archive_v1',
    'eduscribe_ai_weekly_worksheets_delete_v1',
  ]);
  assert.ok(calls.every(call => call.token === 'synthetic-token'));
});

test('mounted update route validates and returns a mocked receipt', async () => {
  const collection = { collectionId, title: 'Synthetic week',
    sourceLessonPlan: { id: '22222222-2222-4222-8222-222222222222' },
    worksheets: [{ day: 'Monday', title: 'Synthetic day', instructions: '',
      checkingMode: 'manual', sections: [{ id: 'main', title: 'Questions', directions: '' }],
      questions: [{ localId: 'mc', sectionId: 'main', question: 'Choose one.',
        item_type: 'multiple_choice', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], points: 1 }],
      answerKey: [{ localId: 'mc', correct_answer: 'Alpha' }] }] };
  let args;
  const router = createAiWeeklyWorksheetManageRouter({ env: local, auth,
    invokeRpc: async (_name, sent) => {
      args = sent;
      return { data: { ok: true, durable: true, collectionId, revision: 2,
        worksheets: [{ day: 1, id: worksheetId, items: 1 }] }, error: null };
    } });
  const res = await dispatch(router, '/update', request({ collectionId,
    expectedRevision: 1, collection }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.revision, 2);
  assert.deepEqual(Object.keys(args.p_payload), ['title', 'worksheets']);
});
