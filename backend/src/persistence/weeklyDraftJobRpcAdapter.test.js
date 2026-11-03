import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeeklyDraftJobRpcAdapter, WeeklyDraftJobRpcError } from './weeklyDraftJobRpcAdapter.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const leaseToken = '44444444-4444-4444-8444-444444444444';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const sourceDays = days.map(day => ({ day }));
const plan = { id: planId, title: 'Synthetic plan', subject: 'Mathematics',
  grade_level: 'Grade 7', subject_id: null, academic_year: '2026-2027' };
const expectedSource = { title: plan.title, objectives: '<p>Synthetic lesson content</p>',
  subject: plan.subject, grade_level: plan.grade_level, subject_id: plan.subject_id,
  academic_year: plan.academic_year, ai_generated: true };
const claimReceipt = (batchIndex = 0, questionCount = 20, priorQuestions = []) =>
  ({ id: jobId, leaseToken, batchIndex, questionCount,
    sourceLessonPlanId: planId, sourceDays, plan, priorQuestions });
const draft = { kind: 'weekly-worksheet-collection', status: 'local-draft', saved: false,
  teacherId, sourceLessonPlan: { id: planId }, worksheets: days.map(day => ({ day })) };
const queued = { id: jobId, status: 'QUEUED', plannedCalls: 10,
  attemptedCalls: 0, completedBatches: 0 };
const runningWorkerStatus = { id: jobId, status: 'RUNNING', cancelRequested: false };
const checkpointReceipt = () => ({ id: jobId, teacherId, sourceLessonPlanId: planId,
  sourceDays, plan, questionCount: 20, plannedCalls: 10,
  checkpoints: Array.from({ length: 10 }, (_, batchIndex) => ({
    batchIndex, validatedResponse: { questions: [] },
  })) });

const errorCode = async (promise, expected) => {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof WeeklyDraftJobRpcError);
    assert.equal(error.code, expected);
    assert.equal(error.message, expected);
    return true;
  });
};

test('existing internal actions use only the service-role client and exact RPC arguments', async () => {
  const calls = [];
  const serviceRoleClient = { rpc: async (name, args) => {
    calls.push([name, args]);
    const responses = {
      weekly_draft_job_submit_v1: queued,
      weekly_draft_job_worker_status_v1: runningWorkerStatus,
      weekly_draft_job_claim_v1: claimReceipt(),
      weekly_draft_job_reserve_dispatch_v1: true,
      weekly_draft_job_finish_batch_v1: true,
      weekly_draft_job_read_checkpoints_v1: checkpointReceipt(),
      weekly_draft_job_fail_finalization_v1: true,
      weekly_draft_job_complete_v1: true,
      weekly_draft_job_purge_v1: 1,
    };
    assert.ok(Object.hasOwn(responses, name), `unexpected RPC: ${name}`);
    return { data: responses[name], error: null };
  } };
  const adapter = createWeeklyDraftJobRpcAdapter({ serviceRoleClient,
    teacherClientForJwt: () => { throw new Error('teacher client must not be used'); } });

  assert.deepEqual(await adapter.submit({ teacherId, requestId: 'synthetic-request',
    sourceLessonPlanId: planId, questionCount: 20, sourceDays, expectedSource }),
  { ...queued, failureCategory: null });
  assert.deepEqual(await adapter.workerStatus(jobId), runningWorkerStatus);
  assert.deepEqual(await adapter.claim(jobId), claimReceipt());
  assert.equal(await adapter.reserveDispatch(jobId, leaseToken), true);
  assert.equal(await adapter.finishBatch(jobId, leaseToken, { questions: [] }), true);
  assert.deepEqual(await adapter.readCheckpoints(jobId), checkpointReceipt());
  assert.equal(await adapter.failFinalization(jobId, 'validation'), true);
  assert.equal(await adapter.complete(jobId, draft), true);
  assert.equal(await adapter.purge(), 1);
  assert.deepEqual(calls, [
    ['weekly_draft_job_submit_v1', { p_teacher_id: teacherId,
      p_request_id: 'synthetic-request', p_source_lesson_plan_id: planId,
      p_question_count: 20, p_source_days: sourceDays,
      p_expected_source: expectedSource }],
    ['weekly_draft_job_worker_status_v1', { p_job_id: jobId }],
    ['weekly_draft_job_claim_v1', { p_job_id: jobId }],
    ['weekly_draft_job_reserve_dispatch_v1', { p_job_id: jobId, p_lease_token: leaseToken }],
    ['weekly_draft_job_finish_batch_v1', { p_job_id: jobId, p_lease_token: leaseToken,
      p_checkpoint: { questions: [] }, p_failure_category: null }],
    ['weekly_draft_job_read_checkpoints_v1', { p_job_id: jobId }],
    ['weekly_draft_job_fail_finalization_v1', { p_job_id: jobId,
      p_failure_category: 'validation' }],
    ['weekly_draft_job_complete_v1', { p_job_id: jobId, p_draft: draft }],
    ['weekly_draft_job_purge_v1', {}],
  ]);
  assert.ok(calls.every(([name]) => name.startsWith('weekly_draft_job_')));
});

test('submit requires an exact bounded saved-plan snapshot before its service-role RPC', async () => {
  let calls = 0;
  let response = { data: queued, error: null };
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async () => { calls++; return response; } },
    teacherClientForJwt: () => { throw new Error('submit must not use a Teacher client'); },
  });
  const submit = snapshot => adapter.submit({ teacherId, requestId: 'synthetic-request',
    sourceLessonPlanId: planId, questionCount: 20, sourceDays, expectedSource: snapshot });
  for (const invalid of [undefined, null, {}, { ...expectedSource, extra: 'private' },
    { ...expectedSource, objectives: undefined }, { ...expectedSource, objectives: '' },
    { ...expectedSource, objectives: 'x'.repeat(262145) },
    { ...expectedSource, subject_id: 'not-a-uuid' },
    { ...expectedSource, academic_year: 2026 },
    { ...expectedSource, ai_generated: 'true' }]) {
    await errorCode(submit(invalid), 'invalid_request');
  }
  assert.equal(calls, 0);
  response = { data: null, error: { message: 'source_changed', details: 'private source' } };
  await errorCode(submit(expectedSource), 'source_changed');
  assert.equal(calls, 1);
});

test('worker status is service-role-only and returns only a bounded state', async () => {
  let receipt = { ...runningWorkerStatus, status: 'CANCELED', cancelRequested: true };
  const calls = [];
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async (name, args) => {
      calls.push([name, args]); return { data: receipt, error: null };
    } },
    teacherClientForJwt: () => { throw new Error('Teacher client must not be used'); },
  });
  assert.deepEqual(await adapter.workerStatus(jobId), receipt);
  await errorCode(adapter.workerStatus('invalid-id'), 'invalid_request');
  for (const invalid of [null, { ...runningWorkerStatus, id: teacherId },
    { ...runningWorkerStatus, status: 'UNKNOWN' },
    { ...runningWorkerStatus, cancelRequested: true },
    { ...runningWorkerStatus, cancelRequested: 'false' },
    { ...runningWorkerStatus, checkpoints: [{ answerKey: 'private' }] },
    { ...runningWorkerStatus, answerKey: 'private' },
    { id: jobId, status: 'RUNNING' }]) {
    receipt = invalid;
    await errorCode(adapter.workerStatus(jobId), 'malformed_receipt');
  }
  assert.equal(calls.length, 9);
  assert.ok(calls.every(([name, args]) => name === 'weekly_draft_job_worker_status_v1'
    && args.p_job_id === jobId));
});

test('discovery accepts only the three bounded service-role actions or null', async () => {
  const calls = [];
  let receipt = null;
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async (name, args) => {
      calls.push([name, args]); return { data: receipt, error: null };
    } },
    teacherClientForJwt: () => { throw new Error('discovery must not use a Teacher client'); },
  });
  assert.equal(await adapter.discoverWork(), null);
  for (const action of ['claim', 'recover', 'assemble']) {
    receipt = { jobId, action };
    assert.deepEqual(await adapter.discoverWork(), receipt);
  }
  assert.deepEqual(calls, Array(4).fill(['weekly_draft_job_discover_work_v1', {}]));
});

test('discovery rejects malformed receipts and private fields', async () => {
  let receipt = { jobId, action: 'claim' };
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async () => ({ data: receipt, error: null }) },
    teacherClientForJwt: () => { throw new Error('discovery must not use a Teacher client'); },
  });
  for (const invalid of [undefined, false, [], { jobId: 'not-a-uuid', action: 'claim' },
    { jobId, action: 'dispatch' }, { jobId, action: 'claim', teacherId },
    { jobId, action: 'assemble', checkpoints: [] }, { jobId, action: 'recover', draft }]) {
    receipt = invalid;
    await errorCode(adapter.discoverWork(), 'malformed_receipt');
  }
});

test('finalization failure accepts only fixed categories and a boolean service-role result', async () => {
  const calls = [];
  let response = { data: false, error: null };
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async (name, args) => {
      calls.push([name, args]); return response;
    } },
    teacherClientForJwt: () => { throw new Error('Teacher client must not be used'); },
  });
  assert.equal(await adapter.failFinalization(jobId, 'source_changed'), false);
  await errorCode(adapter.failFinalization(jobId, 'timeout'), 'invalid_request');
  await errorCode(adapter.failFinalization(jobId, 'validation '), 'invalid_request');
  await errorCode(adapter.failFinalization('bad-id', 'validation'), 'invalid_request');
  response = { data: null, error: null };
  await errorCode(adapter.failFinalization(jobId, 'validation'), 'malformed_receipt');
  assert.deepEqual(calls, [
    ['weekly_draft_job_fail_finalization_v1', { p_job_id: jobId,
      p_failure_category: 'source_changed' }],
    ['weekly_draft_job_fail_finalization_v1', { p_job_id: jobId,
      p_failure_category: 'validation' }],
  ]);
});

test('status, Cancel and result use the verified-JWT client, never the service-role client', async () => {
  const calls = [];
  const credential = 'synthetic-verified-jwt';
  const serviceRoleClient = { rpc: () => { throw new Error('service-role client must not be used'); } };
  const teacherClient = { rpc: async (name, args) => {
    calls.push([name, args]);
    return { data: name === 'weekly_draft_job_status_v1' ? queued
      : name === 'weekly_draft_job_cancel_v1' ? { id: jobId, status: 'CANCELED' }
        : draft, error: null };
  } };
  const credentials = [];
  const adapter = createWeeklyDraftJobRpcAdapter({ serviceRoleClient,
    teacherClientForJwt: token => { credentials.push(token); return teacherClient; } });

  assert.deepEqual(await adapter.status(credential, jobId), { ...queued, failureCategory: null });
  assert.deepEqual(await adapter.cancel(credential, jobId), { id: jobId, status: 'CANCELED' });
  assert.deepEqual(await adapter.result(credential, jobId), draft);
  assert.deepEqual(credentials, [credential, credential, credential]);
  assert.deepEqual(calls, [
    ['weekly_draft_job_status_v1', { p_job_id: jobId }],
    ['weekly_draft_job_cancel_v1', { p_job_id: jobId }],
    ['weekly_draft_job_result_v1', { p_job_id: jobId }],
  ]);
});

test('Cancel preserves each SQL terminal status and rejects malformed or private receipts', async () => {
  let receipt = { id: jobId, status: 'CANCELED' };
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc() { throw new Error('service-role client must not be used'); } },
    teacherClientForJwt: () => ({ rpc: async () => ({ data: receipt, error: null }) }),
  });
  for (const status of ['CANCELED', 'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME']) {
    receipt = { id: jobId, status };
    assert.deepEqual(await adapter.cancel('synthetic-jwt', jobId), receipt);
  }
  for (const invalid of [
    { id: jobId, status: 'RUNNING' },
    { id: 'wrong-id', status: 'FAILED' },
    { id: jobId, status: 'FAILED', checkpoints: ['private'] },
    null,
  ]) {
    receipt = invalid;
    await errorCode(adapter.cancel('synthetic-jwt', jobId), 'malformed_receipt');
  }
});

test('teacher status after finalization failure omits private checkpoints', async () => {
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc() { throw new Error('service-role client must not be used'); } },
    teacherClientForJwt: () => ({ rpc: async () => ({ data: {
      ...queued, status: 'FAILED', failureCategory: 'validation',
      checkpoints: [{ validatedResponse: { answerKey: { private: true } } }],
    }, error: null }) }),
  });
  assert.deepEqual(await adapter.status('synthetic-jwt', jobId), {
    ...queued, status: 'FAILED', failureCategory: 'validation',
  });
});

test('missing JWT and a factory returning the service-role client are blocked before owner RPCs', async () => {
  let calls = 0;
  const serviceRoleClient = { rpc: async () => { calls++; return { data: queued, error: null }; } };
  const adapter = createWeeklyDraftJobRpcAdapter({ serviceRoleClient,
    teacherClientForJwt: () => serviceRoleClient });
  await errorCode(adapter.status('', jobId), 'not_authenticated');
  await errorCode(adapter.cancel('synthetic-jwt', jobId), 'integration_blocked');
  await errorCode(adapter.result('synthetic-jwt', jobId), 'integration_blocked');
  assert.equal(calls, 0);
});

test('false and null reservation fail closed; malformed and rejected reservations never return true', async () => {
  let response = { data: false, error: null };
  let calls = 0;
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async () => { calls++; return response; } },
    teacherClientForJwt: () => ({ rpc() {} }),
  });
  assert.equal(await adapter.reserveDispatch(jobId, leaseToken), false);
  response = { data: null, error: null };
  assert.equal(await adapter.reserveDispatch(jobId, leaseToken), false);
  response = { data: 'true', error: null };
  await errorCode(adapter.reserveDispatch(jobId, leaseToken), 'malformed_receipt');
  response = { data: null, error: { message: 'not_found' } };
  await errorCode(adapter.reserveDispatch(jobId, leaseToken), 'not_found');
  assert.equal(calls, 4);
});

test('claim carries ordered same-day questions, resetting at the first batch of a new day', async () => {
  let receipt = claimReceipt(1, 20, Array.from({ length: 10 }, (_, i) => `Prior ${i + 1}`));
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async name => {
      assert.equal(name, 'weekly_draft_job_claim_v1');
      return { data: receipt, error: null };
    } },
    teacherClientForJwt: () => { throw new Error('claim must not use teacher client'); },
  });
  assert.deepEqual((await adapter.claim(jobId)).priorQuestions, receipt.priorQuestions);
  receipt = claimReceipt(2, 20);
  assert.deepEqual((await adapter.claim(jobId)).priorQuestions, []);
  receipt = { ...claimReceipt(3, 40, Array.from({ length: 30 }, (_, i) => `Prior ${i + 1}`)),
    plan: { ...plan, subject_id: teacherId } };
  assert.deepEqual(await adapter.claim(jobId), receipt);
});

test('claim rejects malformed, missing, and oversized plan or prior-question context', async () => {
  let receipt = claimReceipt();
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async () => ({ data: receipt, error: null }) },
    teacherClientForJwt: () => { throw new Error('claim must not use teacher client'); },
  });
  const invalid = [
    { ...claimReceipt(), plan: { ...plan, id: jobId } },
    { ...claimReceipt(), plan: { ...plan, subject_id: 'bad-id' } },
    { ...claimReceipt(), plan: { ...plan, title: '' } },
    { ...claimReceipt(), priorQuestions: ['unexpected'] },
    claimReceipt(1, 20, Array(9).fill('prior')),
    claimReceipt(1, 20, Array(10).fill('')),
    claimReceipt(1, 20, Array(10).fill('x'.repeat(2001))),
    { ...claimReceipt(), sourceDays: Array(5).fill({ value: 'x'.repeat(65536) }) },
  ];
  for (receipt of invalid) await errorCode(adapter.claim(jobId), 'malformed_receipt');
});

test('a changed source yields no claim or dispatch reservation', async () => {
  const calls = [];
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async name => {
      calls.push(name);
      return { data: name === 'weekly_draft_job_claim_v1' ? null : false, error: null };
    } },
    teacherClientForJwt: () => { throw new Error('claim must not use teacher client'); },
  });
  assert.equal(await adapter.claim(jobId), null);
  assert.equal(await adapter.reserveDispatch(jobId, leaseToken), false);
  assert.deepEqual(calls, ['weekly_draft_job_claim_v1', 'weekly_draft_job_reserve_dispatch_v1']);
});

test('a failed batch uses the fixed category and stale completion stays false', async () => {
  const calls = [];
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async (name, args) => {
      calls.push([name, args]); return { data: false, error: null };
    } },
    teacherClientForJwt: () => ({ rpc() {} }),
  });
  assert.equal(await adapter.finishBatch(jobId, leaseToken, null, 'timeout'), false);
  assert.equal(await adapter.complete(jobId, draft), false);
  assert.deepEqual(calls, [
    ['weekly_draft_job_finish_batch_v1', { p_job_id: jobId, p_lease_token: leaseToken,
      p_checkpoint: null, p_failure_category: 'timeout' }],
    ['weekly_draft_job_complete_v1', { p_job_id: jobId, p_draft: draft }],
  ]);
});

test('incomplete and canceled checkpoint reads refuse without using a Teacher client', async () => {
  let refusal = 'not_ready';
  let calls = 0;
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async name => {
      calls++;
      assert.equal(name, 'weekly_draft_job_read_checkpoints_v1');
      return { data: null, error: { message: refusal, details: 'private checkpoint' } };
    } },
    teacherClientForJwt: () => { throw new Error('Teacher client must not be used'); },
  });
  await errorCode(adapter.readCheckpoints(jobId), 'not_ready');
  refusal = 'invalid_state';
  await errorCode(adapter.readCheckpoints(jobId), 'invalid_state');
  assert.equal(calls, 2);
});

test('checkpoint read requires bounded verified saved-plan metadata', async () => {
  let receipt = checkpointReceipt();
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async name => {
      assert.equal(name, 'weekly_draft_job_read_checkpoints_v1');
      return { data: receipt, error: null };
    } },
    teacherClientForJwt: () => { throw new Error('Teacher client must not be used'); },
  });
  assert.deepEqual((await adapter.readCheckpoints(jobId)).plan, plan);
  for (const invalidPlan of [undefined, null, { ...plan, id: teacherId },
    { ...plan, title: '' }, { ...plan, academic_year: undefined },
    { ...plan, academic_year: 2026 }, { ...plan, academic_year: 'x'.repeat(21) },
    { ...plan, subject: 'x'.repeat(101) }, { ...plan, extra: 'x'.repeat(4096) }]) {
    receipt = { ...checkpointReceipt(), plan: invalidPlan };
    await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  }
});

test('changed saved source refuses private checkpoint read without exposing metadata', async () => {
  const serviceRoleClient = { rpc: async name => {
    assert.equal(name, 'weekly_draft_job_read_checkpoints_v1');
    return { data: null, error: { message: 'source_changed', details: 'private source' } };
  } };
  const adapter = createWeeklyDraftJobRpcAdapter({ serviceRoleClient,
    teacherClientForJwt: () => { throw new Error('Teacher client must not be used'); } });
  await errorCode(adapter.readCheckpoints(jobId), 'source_changed');
});

test('checkpoint read rejects missing, duplicate, out-of-order, extra and unbounded entries', async () => {
  let receipt = checkpointReceipt();
  let calls = 0;
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async name => {
      calls++;
      assert.equal(name, 'weekly_draft_job_read_checkpoints_v1');
      return { data: receipt, error: null };
    } },
    teacherClientForJwt: () => { throw new Error('Teacher client must not be used'); },
  });
  receipt = { ...checkpointReceipt(), checkpoints: checkpointReceipt().checkpoints.slice(0, 9) };
  await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  receipt = checkpointReceipt(); receipt.checkpoints[1].batchIndex = 0;
  await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  receipt = checkpointReceipt();
  [receipt.checkpoints[0], receipt.checkpoints[1]] =
    [receipt.checkpoints[1], receipt.checkpoints[0]];
  await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  receipt = checkpointReceipt();
  receipt.checkpoints.push({ batchIndex: 10, validatedResponse: { questions: [] } });
  await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  receipt = checkpointReceipt(); receipt.checkpoints[0].validatedResponse = null;
  await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  receipt = checkpointReceipt();
  receipt.checkpoints[0].validatedResponse = { payload: 'x'.repeat(1048576) };
  await errorCode(adapter.readCheckpoints(jobId), 'malformed_receipt');
  assert.equal(calls, 6);
});

test('known database errors map to fixed categories and private diagnostics never appear in errors or logs', async () => {
  const raw = 'private-html-token-and-answer';
  const logged = [];
  const original = [console.log, console.warn, console.error];
  console.log = (...args) => logged.push(args);
  console.warn = (...args) => logged.push(args);
  console.error = (...args) => logged.push(args);
  try {
    let response = { data: null, error: { message: 'idempotency_conflict', details: raw } };
    const serviceRoleClient = { rpc: async () => response };
    const teacherClient = { rpc: async () => response };
    const adapter = createWeeklyDraftJobRpcAdapter({ serviceRoleClient,
      teacherClientForJwt: () => teacherClient });
    await errorCode(adapter.submit({ teacherId, requestId: 'synthetic',
      sourceLessonPlanId: planId, questionCount: 20, sourceDays, expectedSource }),
    'idempotency_conflict');
    response = { data: null, error: { message: raw, details: raw } };
    await errorCode(adapter.status('synthetic-jwt', jobId), 'persistence_failed');
    response = { data: null, error: { message: 'not_ready', details: raw } };
    await errorCode(adapter.result('synthetic-jwt', jobId), 'not_ready');
    response = { data: null, error: { message: 'source_changed', details: raw } };
    await errorCode(adapter.complete(jobId, draft), 'source_changed');
    response = { data: null, error: { message: raw } };
    await errorCode(adapter.cancel('synthetic-jwt', jobId), 'persistence_failed');
    assert.deepEqual(logged, []);
  } finally {
    [console.log, console.warn, console.error] = original;
  }
});

test('malformed receipts and input fail without leaking data or granting dispatch', async () => {
  let calls = 0;
  let data = { ...queued, attemptedCalls: '0' };
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async () => { calls++; return { data, error: null }; } },
    teacherClientForJwt: () => ({ rpc: async () => ({ data, error: null }) }),
  });
  await errorCode(adapter.submit({ teacherId, requestId: 'synthetic',
    sourceLessonPlanId: planId, questionCount: 20, sourceDays, expectedSource }),
  'malformed_receipt');
  data = { id: jobId, leaseToken: 'invalid', batchIndex: 0, questionCount: 20,
    sourceLessonPlanId: planId, sourceDays };
  await errorCode(adapter.claim(jobId), 'malformed_receipt');
  data = null;
  assert.equal(await adapter.claim(jobId), null);
  data = 101;
  await errorCode(adapter.purge(), 'malformed_receipt');
  await errorCode(adapter.finishBatch(jobId, leaseToken, null, null), 'invalid_request');
  await errorCode(adapter.submit({ teacherId, requestId: 'synthetic',
    sourceLessonPlanId: planId, questionCount: 15, sourceDays, expectedSource }),
  'invalid_request');
  assert.equal(calls, 4);
});

test('network exceptions become fixed failures without a retry', async () => {
  let calls = 0;
  const adapter = createWeeklyDraftJobRpcAdapter({
    serviceRoleClient: { rpc: async () => { calls++; throw new Error('private-html-token'); } },
    teacherClientForJwt: () => ({ rpc() {} }),
  });
  await errorCode(adapter.reserveDispatch(jobId, leaseToken), 'persistence_failed');
  await errorCode(adapter.workerStatus(jobId), 'persistence_failed');
  assert.equal(calls, 2);
});
