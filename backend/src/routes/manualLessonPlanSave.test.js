import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createApp } from '../app.js';
import { createManualLessonPlanSaveRouter, manualSaveProductionEnabled } from './manualLessonPlanSave.js';
import { createBlankIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const otherTeacher = '33333333-3333-4333-8333-333333333333';
const planId = '22222222-2222-4222-8222-222222222222';
const subjectId = '44444444-4444-4444-8444-444444444444';
const ON = Object.freeze({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
  MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED: '1',
  SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co', SUPABASE_ANON_KEY: 'synthetic-anon' });

const manualDocument = ({ complete = true } = {}) => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  if (complete) {
    Object.assign(document.info, { nameOfLesson: 'Matter', teachingDate: 'Week 1' });
    document.weekly.learningObjectives.Monday = 'Describe matter';
    document.weekly.flow.Monday = 'Group activity';
    document.weekly.formativeAssessment.Monday = 'Exit ticket';
  }
  return { kind: 'eduscribe.manual-ilaw', version: 2, title: document.info.nameOfLesson,
    assignment: { subjectId, gradeLevel: 'Grade 7', schoolYear: '2026-2027' }, document,
    sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } };
};
const create = () => ({ requestId: 'req-1', id: null, expectedRevision: null, document: manualDocument({ complete: false }) });
const record = (owner = teacherId, extra = {}) => ({ data: { ok: true, durable: true, record: {
  id: planId, ownerId: owner, type: 'manual', revision: 1, teacher_id: owner, status: 'draft',
  ai_generated: false, objectives: '{}', ...extra } }, error: null });

function setup({ env = ON, role = 'teacher', rpc = async () => record() } = {}) {
  const calls = { auth: 0, rpc: [] };
  const auth = (req, _res, next) => { calls.auth++; req.user = { id: teacherId, role }; next(); };
  const app = express();
  app.use(express.json());
  app.use('/m', createManualLessonPlanSaveRouter({ env, auth,
    invokeRpc: async (...args) => { calls.rpc.push(args); return rpc(...args); } }));
  return { app, calls };
}
async function serve(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await callback(async (path, body) => {
      const response = await fetch(`${base}${path}`, { method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-jwt' },
        body: JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) };
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('flags off: the app does not mount the Manual route at all (404, as before P4b)', async () => {
  for (const env of [{}, { ...ON, MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED: undefined }]) {
    const app = createApp({ env });
    await serve(app, async request => {
      assert.equal((await request('/api/lesson-plans/manual/CreateIncompleteDraft', create())).status, 404);
      assert.equal((await request('/api/lesson-plans/ai-save', {})).status, 503);
    });
  }
});

test('the production gate needs every condition', () => {
  assert.equal(manualSaveProductionEnabled(ON), true);
  assert.equal(manualSaveProductionEnabled(undefined), false);
  for (const [key, value] of [['NODE_ENV', 'development'], ['VERCEL', undefined], ['VERCEL_ENV', 'preview'],
    ['MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', 'true'], ['MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', undefined],
    ['SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co'], ['SUPABASE_ANON_KEY', '']]) {
    assert.equal(manualSaveProductionEnabled({ ...ON, [key]: value }), false, key);
  }
});

test('a closed router answers 503 without authenticating or calling the database', async () => {
  const { app, calls } = setup({ env: {} });
  await serve(app, async request => {
    const res = await request('/m/CreateIncompleteDraft', create());
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { ok: false, code: 'integration_blocked', durable: false });
  });
  assert.equal(calls.auth, 0);
  assert.equal(calls.rpc.length, 0);
});

test('only teachers pass, and only the four Manual write operations reach the RPC', async () => {
  const student = setup({ role: 'student' });
  await serve(student.app, async request => assert.equal((await request('/m/CreateIncompleteDraft', create())).status, 403));
  assert.equal(student.calls.rpc.length, 0);
  const { app, calls } = setup();
  await serve(app, async request => {
    for (const op of ['CreatePrivateWorksheetDraft', 'UpdatePrivateWorksheetDraft', 'ReopenOwnedLessonPlan',
      'PrepareNormalizedAssessmentProjection', 'PostLessonPlan', 'constructor']) {
      const res = await request(`/m/${op}`, create());
      assert.equal(res.status, 422, op);
      assert.equal(res.body.code, 'unsupported_operation', op);
    }
  });
  assert.equal(calls.rpc.length, 0);
});

test('a create maps to one user-scoped eduscribe_manual_write_v1 call with no client teacher id', async () => {
  const { app, calls } = setup();
  await serve(app, async request => {
    const res = await request('/m/CreateIncompleteDraft', create());
    assert.equal(res.status, 200);
    assert.equal(res.body.record.id, planId);
  });
  assert.equal(calls.rpc.length, 1);
  const [name, args, credential] = calls.rpc[0];
  assert.equal(name, 'eduscribe_manual_write_v1');
  assert.equal(credential, 'synthetic-jwt');
  assert.deepEqual(Object.keys(args).sort(), ['p_action', 'p_document', 'p_expected_revision', 'p_id', 'p_request_id', 'p_state']);
  assert.equal(args.p_action, 'create');
  assert.equal(args.p_state, 'draft');
  assert.equal(JSON.stringify(args).includes(teacherId), false);
});

test('a forged teacher id or extra field in the document is refused before the RPC', async () => {
  const { app, calls } = setup();
  await serve(app, async request => {
    const forged = create(); forged.document.teacherId = otherTeacher;
    assert.equal((await request('/m/CreateIncompleteDraft', forged)).body.code, 'invalid_document');
    assert.equal((await request('/m/CreateIncompleteDraft', { ...create(), teacherId: otherTeacher })).body.code, 'invalid_document');
  });
  assert.equal(calls.rpc.length, 0);
});

test('save complete sends update/saved with the revision; an incomplete plan never reaches the RPC', async () => {
  const { app, calls } = setup({ rpc: async () => record(teacherId, { revision: 2 }) });
  await serve(app, async request => {
    const incomplete = await request('/m/SaveCompleteLessonPlan',
      { requestId: 'req-2', id: planId, expectedRevision: 1, document: manualDocument({ complete: false }) });
    assert.equal(incomplete.status, 422);
    assert.equal(incomplete.body.code, 'incomplete_lesson_plan');
    assert.equal(calls.rpc.length, 0);
    const res = await request('/m/SaveCompleteLessonPlan',
      { requestId: 'req-3', id: planId, expectedRevision: 1, document: manualDocument() });
    assert.equal(res.status, 200);
  });
  assert.deepEqual([calls.rpc[0][1].p_action, calls.rpc[0][1].p_state, calls.rpc[0][1].p_expected_revision], ['update', 'saved', 1]);
});

test('owner check: a success for another teacher\'s plan is refused', async () => {
  for (const forged of [record(otherTeacher), record(teacherId, { ownerId: otherTeacher }), record(teacherId, { type: 'worksheet' })]) {
    const { app } = setup({ rpc: async () => forged });
    await serve(app, async request => {
      const res = await request('/m/CreateIncompleteDraft', create());
      assert.equal(res.body.ok, false);
      assert.equal(res.body.code, 'persistence_failed');
      assert.equal(res.body.record, undefined);
    });
  }
});

test('database refusals pass through as codes only; raw text never leaves the route', async () => {
  const cases = [['assignment_denied', 422], ['not_found', 404], ['revision_conflict', 409],
    ['invalid_transition', 422], ['duplicate key value violates unique constraint "secret_idx"', 422]];
  for (const [message, status] of cases) {
    const { app } = setup({ rpc: async () => ({ data: null, error: { message, code: '23505' } }) });
    await serve(app, async request => {
      const res = await request('/m/CreateIncompleteDraft', create());
      assert.equal(res.status, status, message);
      assert.equal(res.body.code, message.includes(' ') ? 'persistence_failed' : message);
      assert.equal(JSON.stringify(res.body).includes('secret_idx'), false);
    });
  }
  const { app } = setup({ rpc: async () => ({ data: { ok: true, durable: false, record: {} }, error: null }) });
  await serve(app, async request => assert.equal((await request('/m/CreateIncompleteDraft', create())).status, 503));
});
