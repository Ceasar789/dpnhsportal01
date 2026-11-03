import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeeklyDraftBatchService } from './weeklyDraftBatchService.js';

const jobId = '33333333-3333-4333-8333-333333333333';
const planId = '22222222-2222-4222-8222-222222222222';
const leaseToken = '44444444-4444-4444-8444-444444444444';
const INVOCATION_START = 1_000;
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const sourceDays = days.map(day => ({ day, objective: `Study ${day} fractions`,
  activity: `Compare ${day} fractions`, assessment: `Explain ${day} comparisons` }));
const plan = { id: planId, title: 'Synthetic fractions plan', subject: 'Mathematics',
  grade_level: 'Grade 7', subject_id: null };
const claim = { id: jobId, leaseToken, batchIndex: 0, questionCount: 20,
  sourceLessonPlanId: planId, sourceDays, plan, priorQuestions: [] };
const response = () => JSON.stringify({ title: 'Synthetic Monday worksheet', directions: 'Answer every item.',
  questions: Array.from({ length: 10 }, (_, index) => ({
    question: `Compare fraction pair ${index + 1}.`, item_type: 'true_false',
    points: 1, options: [], correct_answer: 'True',
  })) });

function setup({ claimed = claim, status = () => 'RUNNING', reserve = true,
  finish = true, provider = async () => response(), deadlineMs = 100,
  statusPollMs = 5, claimDelayMs = 0, statusDelayMs = 0,
  reserveDelayMs = 0, invocationElapsedMs = 0 } = {}) {
  const calls = { claim: 0, workerStatus: 0, reserve: 0, provider: 0, finish: [] };
  let now = INVOCATION_START + invocationElapsedMs;
  const advance = ms => { now += ms; };
  const clock = { performance: { now: () => now }, setTimeout, clearTimeout,
    setInterval, clearInterval };
  const adapter = {
    async claim(id) { assert.equal(id, jobId); calls.claim++; advance(claimDelayMs); return claimed; },
    async workerStatus(id) {
      assert.equal(id, jobId);
      calls.workerStatus++;
      advance(statusDelayMs);
      const current = status();
      if (current instanceof Error) throw current;
      return { id, status: current, cancelRequested: current === 'CANCELED' };
    },
    async reserveDispatch(id, token) {
      assert.equal(id, jobId); assert.equal(token, leaseToken);
      calls.reserve++;
      advance(reserveDelayMs);
      if (reserve instanceof Error) throw reserve;
      return reserve;
    },
    async finishBatch(id, token, checkpoint, failureCategory) {
      assert.equal(id, jobId); assert.equal(token, leaseToken);
      calls.finish.push({ checkpoint, failureCategory });
      return finish;
    },
  };
  const rawService = createWeeklyDraftBatchService({ jobAdapter: adapter,
    providerBatch: (...args) => { calls.provider++; return provider(...args); },
    deadlineMs, statusPollMs, clock });
  const service = { processOneBatch: id => rawService.processOneBatch(id, INVOCATION_START) };
  return { service, rawService, calls, advance };
}

test('missing or invalid monotonic invocation start refuses work before claim', async () => {
  const { rawService, calls } = setup();
  for (const startedAt of [undefined, null, NaN, -1, INVOCATION_START + 1]) {
    await assert.rejects(rawService.processOneBatch(jobId, startedAt), TypeError);
  }
  assert.equal(calls.claim, 0);
  assert.equal(calls.provider, 0);
});

test('slow claim and pre-reservation work refuse unreserved dispatch', async () => {
  for (const options of [{ claimDelayMs: 11_000 }, { statusDelayMs: 11_000 }]) {
    const { service, calls } = setup({ ...options, deadlineMs: 85_000 });
    assert.deepEqual(await service.processOneBatch(jobId), { status: 'not_dispatched' });
    assert.equal(calls.claim, 1);
    assert.equal(calls.reserve, 0);
    assert.equal(calls.provider, 0);
    assert.deepEqual(calls.finish, []);
  }
  const aged = setup({ invocationElapsedMs: 21_000, deadlineMs: 85_000 });
  assert.deepEqual(await aged.service.processOneBatch(jobId), { status: 'not_dispatched' });
  assert.equal(aged.calls.claim, 0);
});

test('late successful reservation is unconfirmed and never starts provider work', async () => {
  const { service, calls } = setup({ reserveDelayMs: 11_000, deadlineMs: 85_000 });
  assert.deepEqual(await service.processOneBatch(jobId), { status: 'unconfirmed' });
  assert.equal(calls.reserve, 1);
  assert.equal(calls.provider, 0);
  assert.deepEqual(calls.finish, []);
});

test('lost reservation response remains an error and makes no provider retry', async () => {
  const lost = new Error('synthetic reservation response lost');
  const { service, calls } = setup({ reserve: lost });
  await assert.rejects(service.processOneBatch(jobId), error => error === lost);
  assert.equal(calls.reserve, 1);
  assert.equal(calls.provider, 0);
  assert.deepEqual(calls.finish, []);
});

test('null claim makes no worker status, reservation, provider, or checkpoint call', async () => {
  const { service, calls } = setup({ claimed: null });
  assert.deepEqual(await service.processOneBatch(jobId), { status: 'no_claim' });
  assert.deepEqual(calls, { claim: 1, workerStatus: 0, reserve: 0, provider: 0, finish: [] });
});

test('confirmed Cancel or false reservation prevents provider dispatch', async () => {
  const canceled = setup({ status: () => 'CANCELED' });
  assert.deepEqual(await canceled.service.processOneBatch(jobId), { status: 'canceled' });
  assert.equal(canceled.calls.reserve, 0);
  assert.equal(canceled.calls.provider, 0);
  const refused = setup({ reserve: false });
  assert.deepEqual(await refused.service.processOneBatch(jobId), { status: 'not_dispatched' });
  assert.equal(refused.calls.reserve, 1);
  assert.equal(refused.calls.provider, 0);
});

test('one valid batch uses claimed context and stores one fully parsed checkpoint', async () => {
  let providerSignal;
  const { service, calls } = setup({ provider: async (prompt, options) => {
    assert.match(prompt, /Synthetic fractions plan/);
    assert.match(prompt, /Monday, batch 1/);
    assert.match(prompt, /Study Monday fractions/);
    assert.equal(options.maxOutputTokens, 8192);
    assert.ok(options.responseSchema);
    providerSignal = options.signal;
    return response();
  } });
  assert.deepEqual(await service.processOneBatch(jobId),
    { status: 'checkpointed', batchIndex: 0 });
  assert.equal(calls.claim, 1);
  assert.equal(calls.reserve, 1);
  assert.equal(calls.provider, 1);
  assert.equal(providerSignal.aborted, false);
  assert.equal(calls.finish.length, 1);
  assert.equal(calls.finish[0].failureCategory, null);
  assert.equal(calls.finish[0].checkpoint.questions.length, 10);
  assert.equal(calls.finish[0].checkpoint.answerKey.length, 10);
  assert.equal(calls.finish[0].checkpoint.sourceLessonPlan.id, planId);
});

test('a repeated earlier question rejects the whole batch without a checkpoint or retry', async () => {
  const priorQuestions = Array.from({ length: 10 }, (_, index) => `Prior fraction question ${index + 1}.`);
  const { service, calls } = setup({ claimed: { ...claim, batchIndex: 1, priorQuestions },
    provider: async prompt => {
      assert.match(prompt, /Monday, batch 2/);
      assert.ok(prompt.includes(JSON.stringify(priorQuestions)));
      const value = JSON.parse(response());
      value.questions[0].question = priorQuestions[0].toUpperCase();
      return JSON.stringify(value);
    } });
  assert.deepEqual(await service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'validation' });
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.finish, [{ checkpoint: null, failureCategory: 'validation' }]);
});

test('validated prior-question objects become prompt strings before duplicate validation', async () => {
  const priorQuestions = Array.from({ length: 10 }, (_, index) =>
    ({ question: `Earlier item ${index + 1}.` }));
  const { service, calls } = setup({ claimed: { ...claim, batchIndex: 1, priorQuestions },
    provider: async prompt => {
      assert.ok(prompt.includes(JSON.stringify(priorQuestions.map(item => item.question))));
      assert.ok(!prompt.includes(JSON.stringify(priorQuestions)));
      return response();
    } });
  assert.deepEqual(await service.processOneBatch(jobId),
    { status: 'checkpointed', batchIndex: 1 });
  assert.equal(calls.provider, 1);
  assert.equal(calls.finish.length, 1);
});

test('malformed provider output and provider capacity failure use fixed categories', async () => {
  const invalid = setup({ provider: async () => '{invalid json' });
  assert.deepEqual(await invalid.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'validation' });
  assert.deepEqual(invalid.calls.finish, [{ checkpoint: null, failureCategory: 'validation' }]);
  const capacity = setup({ provider: async () => {
    throw Object.assign(new Error('synthetic provider detail'), { code: 'PROVIDER_RATE_LIMIT' });
  } });
  assert.deepEqual(await capacity.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'capacity' });
  assert.deepEqual(capacity.calls.finish, [{ checkpoint: null, failureCategory: 'capacity' }]);
  assert.equal(capacity.calls.provider, 1);
});

test('Cancel during a pending call aborts locally and discards its late success', async () => {
  let currentStatus = 'RUNNING';
  let resolveProvider;
  let signal;
  const started = new Promise(resolve => { resolveProvider = resolve; });
  let markStarted;
  const providerStarted = new Promise(resolve => { markStarted = resolve; });
  const { service, calls } = setup({ status: () => currentStatus,
    provider: async (_prompt, options) => {
      signal = options.signal;
      markStarted();
      return started;
    } });
  const run = service.processOneBatch(jobId);
  await providerStarted;
  currentStatus = 'CANCELED';
  assert.deepEqual(await run, { status: 'canceled' });
  assert.equal(signal.aborted, true);
  resolveProvider(response());
  await Promise.resolve();
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.finish, []);
});

test('Cancel after a response but before checkpoint prevents finish', async () => {
  let checks = 0;
  const { service, calls } = setup({ status: () => ++checks === 1 ? 'RUNNING' : 'CANCELED' });
  assert.deepEqual(await service.processOneBatch(jobId), { status: 'canceled' });
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.finish, []);
});

test('unconfirmed worker status before reservation or finish fails closed', async () => {
  const readError = Object.assign(new Error('temporary database failure'), { code: 'persistence_failed' });
  const beforeDispatch = setup({ status: () => readError });
  await assert.rejects(beforeDispatch.service.processOneBatch(jobId), error => error === readError);
  assert.equal(beforeDispatch.calls.reserve, 0);
  assert.equal(beforeDispatch.calls.provider, 0);
  assert.deepEqual(beforeDispatch.calls.finish, []);

  let checks = 0;
  const beforeFinish = setup({ status: () => ++checks === 1 ? 'RUNNING' : readError });
  await assert.rejects(beforeFinish.service.processOneBatch(jobId), error => error === readError);
  assert.equal(beforeFinish.calls.reserve, 1);
  assert.equal(beforeFinish.calls.provider, 1);
  assert.deepEqual(beforeFinish.calls.finish, []);
});

test('unconfirmed worker status during a provider call aborts and discards late output', async () => {
  let checks = 0;
  let signal;
  let resolveProvider;
  const pending = new Promise(resolve => { resolveProvider = resolve; });
  const { service, calls } = setup({ status: () => ++checks === 1 ? 'RUNNING'
    : new Error('temporary database failure'), provider: async (_prompt, options) => {
    signal = options.signal;
    return pending;
  } });
  assert.deepEqual(await service.processOneBatch(jobId), { status: 'unconfirmed' });
  assert.equal(signal.aborted, true);
  resolveProvider(response());
  await Promise.resolve();
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.finish, []);
});

test('deadline aborts the provider and checkpoints timeout without another call', async () => {
  let signal;
  const { service, calls } = setup({ deadlineMs: 15,
    provider: async (_prompt, options) => {
      signal = options.signal;
      return new Promise(() => {});
    } });
  assert.deepEqual(await service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'timeout' });
  assert.equal(signal.aborted, true);
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.finish, [{ checkpoint: null, failureCategory: 'timeout' }]);
});

test('a false finish result discards a valid response as stale', async () => {
  const { service, calls } = setup({ finish: false });
  assert.deepEqual(await service.processOneBatch(jobId), { status: 'stale' });
  assert.equal(calls.provider, 1);
  assert.equal(calls.finish.length, 1);
});
