import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiLessonPlanSave, sanitizeAiLessonPlanHtml } from './aiLessonPlanSave.js';
import { aiSaveLocallyEnabled, aiSavePostHandler } from '../routes/aiLessonPlanSave.js';

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
