import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createAiLessonPlanSave, sanitizeAiLessonPlanHtml } from './aiLessonPlanSave.js';
import { aiSaveLocallyEnabled, aiSaveProductionEnabled, aiSavePostHandler,
  createAiLessonPlanSaveRouter, logAiLessonSaveDiagnostic } from '../routes/aiLessonPlanSave.js';

const owner = 'teacher-synthetic';
const planId = '22222222-2222-4222-8222-222222222222';
const command = () => ({ requestId: 'attempt-1', title: '[G7] English',
  html: '<p class="ilaw-field" onclick="bad()">Synthetic plan</p><script>bad()</script>' });
const saved = args => ({ ok: true, durable: true, record: { id: planId, teacher_id: owner,
  title: args.p_title, subject_id: null, subject: 'English', grade_level: 'Grade 7',
  academic_year: null, objectives: args.p_html, ai_generated: true, status: 'draft',
  file_url: null, file_name: null, file_path: null, updated_at: '2026-01-01T00:00:00Z' } });

test('forged owner and classification are ignored; HTML is sanitized before one RPC', async () => {
  const calls = [];
  const service = createAiLessonPlanSave({ invokeRpc: async (name, args, token) => {
    calls.push({ name, args, token }); return { data: saved(args), error: null };
  } });
  const result = await service.save('synthetic-token', { ...command(), teacher_id: 'forged',
    ai_generated: false, status: 'published', academic_year: '1900-1901', file_url: 'https://bad.invalid',
    assignment: { subjectId: 'forged', gradeLevel: 'forged' } }, owner);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'eduscribe_ai_html_save_v1');
  assert.equal(calls[0].token, 'synthetic-token');
  assert.deepEqual(Object.keys(calls[0].args).sort(),
    ['p_html', 'p_request_id', 'p_title']);
  assert.equal(calls[0].args.p_html, '<p class="ilaw-field">Synthetic plan</p>');
  assert.equal(await sanitizeAiLessonPlanHtml('<script>bad()</script><p>Safe</p>'), '<p>Safe</p>');
});

test('server sanitizer keeps the ILAW weekday table and approved classes needed by saved readers', async () => {
  const html = '<div class="ilaw-week-table unknown"><table><tbody><tr><th>Monday</th>'
    + '<td><span class="ilaw-label">Objective</span></td></tr></tbody></table></div>';
  const safe = await sanitizeAiLessonPlanHtml(html);
  assert.match(safe, /class="ilaw-week-table"/);
  assert.match(safe, /<th>Monday<\/th>/);
  assert.match(safe, /class="ilaw-label"/);
  assert.doesNotMatch(safe, /unknown/);
});

test('non-Teacher fails closed without a write', async () => {
  let calls = 0;
  const service = createAiLessonPlanSave({ invokeRpc: async () => {
    calls++; return { data: null, error: { message: 'assignment_denied' } };
  } });
  const result = await aiSavePostHandler({ user: { id: owner, role: 'student' },
    get: () => 'Bearer synthetic-token', body: command() },
  { status(code) { assert.equal(code, 403); return this; }, json(value) { return value; } }, service);
  assert.equal(result.code, 'inactive_teacher');
  assert.equal(calls, 0);
  assert.equal(calls, 0);
});

test('oversized HTML and blank title make no RPC call', async () => {
  let calls = 0;
  const service = createAiLessonPlanSave({ invokeRpc: async () => { calls++; return {}; } });
  assert.equal((await service.save('synthetic-token', { ...command(), html: 'x'.repeat(131073) }, owner)).code,
    'payload_too_large');
  assert.equal((await service.save('synthetic-token', { ...command(), title: ' ' }, owner)).code,
    'invalid_document');
  assert.equal(calls, 0);
});

test('availability succeeds without teaching assignments', async () => {
  const service = createAiLessonPlanSave({ invokeRpc: async name => {
    assert.equal(name, 'eduscribe_ai_save_assignments_v1');
    return { data: { ok: true, version: 2 }, error: null };
  } });
  assert.deepEqual(await service.availability('synthetic-token'), { ok: true });
  const oldService = createAiLessonPlanSave({ invokeRpc: async () => ({
    data: { ok: true, assignments: [] }, error: null,
  }) });
  assert.equal((await oldService.availability('synthetic-token')).code, 'persistence_failed');
});

test('same idempotency key returns the same confirmed plan and changed content conflicts', async () => {
  const receipts = new Map();
  const service = createAiLessonPlanSave({ invokeRpc: async (_name, args) => {
    const prior = receipts.get(args.p_request_id);
    if (prior && prior.p_html !== args.p_html) return { error: { message: 'idempotency_conflict' } };
    if (!prior) receipts.set(args.p_request_id, args);
    return { data: saved(args), error: null };
  } });
  const first = await service.save('synthetic-token', command(), owner);
  const second = await service.save('synthetic-token', command(), owner);
  assert.equal(first.record.id, second.record.id);
  assert.equal(receipts.size, 1);
  assert.equal((await service.save('synthetic-token', { ...command(), html: '<p>Changed</p>' }, owner)).code,
    'idempotency_conflict');
});

test('local route gate rejects production, hosted preview, LAN, off flag and production project', () => {
  const env = { NODE_ENV: 'development', AI_LESSON_PLAN_SAVE_ENABLED: '1',
    SUPABASE_URL: 'http://127.0.0.1:54321' };
  const req = { socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(aiSaveLocallyEnabled(req, env), true);
  assert.equal(aiSaveLocallyEnabled(req, { ...env, NODE_ENV: 'production' }), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...env, VERCEL_ENV: 'preview' }), false);
  assert.equal(aiSaveLocallyEnabled({ socket: { remoteAddress: '192.168.1.2' } }, env), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...env, AI_LESSON_PLAN_SAVE_ENABLED: '0' }), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...env, SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    AI_SAVE_DEV_PROJECT_REF: 'abcdefghijklmnopqrst' }), true);
  assert.equal(aiSaveLocallyEnabled(req, { ...env, SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co',
    AI_SAVE_DEV_PROJECT_REF: 'jllstakxiamxiycnwrbd' }), false);
  const testDataProject = { ...env, SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co',
    AI_SAVE_DEV_PROJECT_REF: 'jllstakxiamxiycnwrbd', AI_SAVE_ALLOW_TEST_DATA_PROJECT: '1' };
  assert.equal(aiSaveLocallyEnabled(req, testDataProject), true);
  assert.equal(aiSaveLocallyEnabled(req, { ...testDataProject, AI_SAVE_ALLOW_TEST_DATA_PROJECT: 'true' }), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...testDataProject, NODE_ENV: 'production' }), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...testDataProject, VERCEL: '1' }), false);
  assert.equal(aiSaveLocallyEnabled({ socket: { remoteAddress: '192.168.1.2' } }, testDataProject), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...testDataProject, AI_LESSON_PLAN_SAVE_ENABLED: '0' }), false);
  assert.equal(aiSaveLocallyEnabled(req, { ...testDataProject,
    AI_SAVE_DEV_PROJECT_REF: 'abcdefghijklmnopqrst' }), false);
});

test('production lesson save requires its own flag and exact approved target', () => {
  const env = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
    SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co',
    AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED: '1',
    AI_LESSON_PLAN_SAVE_PRODUCTION_PROJECT_REF: 'jllstakxiamxiycnwrbd' };
  assert.equal(aiSaveProductionEnabled(env), true);
  for (const change of [
    { AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED: undefined },
    { AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED: 'true' },
    { AI_LESSON_PLAN_SAVE_PRODUCTION_PROJECT_REF: undefined },
    { AI_LESSON_PLAN_SAVE_PRODUCTION_PROJECT_REF: 'abcdefghijklmnopqrst' },
    { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
    { NODE_ENV: 'development' }, { VERCEL: undefined }, { VERCEL_ENV: 'preview' },
  ]) assert.equal(aiSaveProductionEnabled({ ...env, ...change }), false);
  assert.equal(aiSaveProductionEnabled({ ...env, AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED: undefined,
    AI_SAVE_ALLOW_TEST_DATA_PROJECT: '1' }), false);
});

test('missing bearer token and wrong role cannot reach the lesson save RPC', async () => {
  let calls = 0;
  const service = createAiLessonPlanSave({ invokeRpc: async () => { calls++; return {}; } });
  const response = () => ({ status(code) { this.statusCode = code; return this; },
    json(value) { return { statusCode: this.statusCode, ...value }; } });
  const missing = await aiSavePostHandler({ user: { id: owner, role: 'teacher' },
    get: () => '', body: command() }, response(), service);
  const wrongRole = await aiSavePostHandler({ user: { id: owner, role: 'student' },
    get: () => 'Bearer synthetic-token', body: command() }, response(), service);
  assert.deepEqual([missing.statusCode, missing.code, wrongRole.statusCode, wrongRole.code],
    [401, 'not_authenticated', 403, 'inactive_teacher']);
  assert.equal(calls, 0);
});

const captureDiagnostics = async run => {
  const warnings = [];
  const previous = console.warn;
  console.warn = (...entry) => warnings.push(entry);
  try { await run(warnings); } finally { console.warn = previous; }
  return warnings;
};
const postHandlers = router => router.stack.find(layer => layer.route?.methods.post).route.stack.map(layer => layer.handle);
const response = () => {
  const events = new EventEmitter();
  return { statusCode: 200, once: events.once.bind(events),
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; events.emit('finish'); return value; } };
};

test('POST route gate and authenticated role guard report only fixed categories', async () => {
  const warnings = await captureDiagnostics(async () => {
    const [gate, auth] = postHandlers(createAiLessonPlanSaveRouter({ env: {},
      auth: (_req, res) => res.status(403).json({ error: 'private-profile-detail' }) }));
    const gateResponse = response();
    gate({ method: 'POST', socket: { remoteAddress: '127.0.0.1' } }, gateResponse, () => assert.fail('gate opened'));
    assert.equal(gateResponse.statusCode, 503);
    assert.equal(gateResponse.body.code, 'integration_blocked');
    auth({ method: 'POST' }, response(), () => assert.fail('auth opened'));
    await aiSavePostHandler({ user: { id: owner, role: 'student' }, get: () => 'Bearer secret-jwt',
      body: command() }, response(), { save: () => assert.fail('save called') });
  });
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'route_gate', category: 'blocked' },
    { stage: 'auth_guard', category: 'forbidden' },
    { stage: 'role_guard', category: 'forbidden' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /private-profile-detail|secret-jwt|teacher-synthetic/);
});

test('transport configuration failure is classified without exposing configuration or payload', async () => {
  const warnings = await captureDiagnostics(async () => {
    const [, , post] = postHandlers(createAiLessonPlanSaveRouter({ env: {
      NODE_ENV: 'development', AI_LESSON_PLAN_SAVE_ENABLED: '1', SUPABASE_URL: 'http://127.0.0.1:54321',
    }, auth: (_req, _res, next) => next() }));
    const res = response();
    await post({ user: { id: owner, role: 'teacher' }, get: () => 'Bearer secret-jwt',
      body: { ...command(), requestId: 'secret-request', title: 'secret-title', html: '<p>secret-html</p>' } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'integration_blocked');
    assert.equal(res.body.error, 'Permanent Save is unavailable. Your draft remains open.');
  });
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'rpc_request', category: 'attempted' },
    { stage: 'transport_config', category: 'blocked' },
    { stage: 'rpc_request', category: 'exception' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret-jwt|secret-request|secret-title|secret-html|127\.0\.0\.1/);
});

test('RPC rejection logs only a safe PostgREST code and a fixed category', async () => {
  const warnings = await captureDiagnostics(async () => {
    const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
      invokeRpc: async () => ({ data: null, error: { message: 'secret-db-message',
        details: 'secret-details', hint: 'secret-hint', code: 'PGRST202' } }) });
    const res = response();
    await aiSavePostHandler({ user: { id: owner, role: 'teacher' }, get: () => 'Bearer secret-jwt',
      body: command() }, res, service);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'persistence_failed');
    assert.equal(res.body.error, 'Permanent Save is unavailable. Your draft remains open.');
    logAiLessonSaveDiagnostic('rpc_rejection', 'unexpected', 'secret-code');
    logAiLessonSaveDiagnostic('secret-stage', 'secret-category', '23505');
  });
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'rpc_request', category: 'attempted' },
    { stage: 'rpc_rejection', category: 'unexpected', postgrestCode: 'PGRST202' },
    { stage: 'rpc_rejection', category: 'unexpected' },
    { stage: 'unknown', category: 'unexpected', postgrestCode: '23505' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret-jwt|secret-db-message|secret-details|secret-hint|secret-code|secret-stage|secret-category|attempt-1|Synthetic plan/);
});

test('invalid save receipt is classified after one RPC without changing the failure result', async () => {
  const warnings = await captureDiagnostics(async () => {
    const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
      invokeRpc: async (_name, args) => ({ data: { ...saved(args), record: { ...saved(args).record,
        teacher_id: 'secret-other-teacher' } }, error: null }) });
    assert.equal((await service.save('secret-jwt', command(), owner)).code, 'persistence_failed');
  });
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'rpc_request', category: 'attempted' },
    { stage: 'receipt_validation', category: 'invalid' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret-jwt|secret-other-teacher|attempt-1|Synthetic plan/);
});

test('a thrown RPC request is classified without logging its exception text', async () => {
  const warnings = await captureDiagnostics(async () => {
    const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
      invokeRpc: async () => { throw new Error('secret-transport-detail'); } });
    assert.equal((await service.save('secret-jwt', command(), owner)).code, 'persistence_failed');
  });
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'rpc_request', category: 'attempted' },
    { stage: 'rpc_request', category: 'exception' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret-jwt|secret-transport-detail|attempt-1|Synthetic plan/);
});

test('title validation failure is classified before any RPC without logging input', async () => {
  let calls = 0;
  const warnings = await captureDiagnostics(async () => {
    const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
      invokeRpc: async () => { calls++; return {}; } });
    const result = await service.save('secret-jwt', { ...command(), title: { toString: null } }, owner);
    assert.equal(result.code, 'persistence_failed');
  });
  assert.equal(calls, 0);
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'title_validation', category: 'unexpected' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret-jwt|attempt-1|Synthetic plan/);
});

test('HTML sanitization failure is classified before any RPC without logging input', async () => {
  let calls = 0;
  const previous = Buffer.byteLength;
  let warnings;
  try {
    Buffer.byteLength = () => { throw new Error('secret-sanitizer-detail'); };
    warnings = await captureDiagnostics(async () => {
      const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
        invokeRpc: async () => { calls++; return {}; } });
      const result = await service.save('secret-jwt', command(), owner);
      assert.equal(result.code, 'persistence_failed');
    });
  } finally { Buffer.byteLength = previous; }
  assert.equal(calls, 0);
  assert.deepEqual(warnings.map(([, detail]) => detail), [
    { stage: 'html_sanitization', category: 'unexpected' },
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret-jwt|secret-sanitizer-detail|attempt-1|Synthetic plan/);
});

test('a diagnostic logging failure does not block the save or change its receipt', async () => {
  const previous = console.warn;
  console.warn = () => { throw new Error('Synthetic logging failure'); };
  try {
    const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
      invokeRpc: async (_name, args) => ({ data: saved(args), error: null }) });
    const result = await service.save('synthetic-token', command(), owner);
    assert.equal(result.ok, true);
    assert.equal(result.record.id, planId);
  } finally { console.warn = previous; }
});
