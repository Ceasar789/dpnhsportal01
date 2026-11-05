import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeeklyDraftBatchService } from './weeklyDraftBatchService.js';
import { parseDailyBatch } from './weeklyWorksheetGenerator.js';
import { requestOpenAICompatibleWorksheetJson } from './weeklyWorksheetProvider.js';

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
  reserveDelayMs = 0, invocationElapsedMs = 0,
  parseBatch, providerNameForBatch = () => 'cloudflare', finishDelayMs = 0 } = {}) {
  const calls = { claim: 0, workerStatus: 0, reserve: 0, provider: 0, finish: [] };
  const diagnostics = [];
  const timings = [];
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
      advance(finishDelayMs);
      if (finish instanceof Error) throw finish;
      return finish;
    },
  };
  const rawService = createWeeklyDraftBatchService({ jobAdapter: adapter,
    providerBatch: (...args) => { calls.provider++; return provider(...args); },
    providerNameForBatch, parseBatch,
    log: { warn: value => {
      if (JSON.parse(value).event === 'weekly_draft_provider_timing') timings.push(value);
      else diagnostics.push(value);
    } }, deadlineMs, statusPollMs, clock });
  const service = { processOneBatch: id => rawService.processOneBatch(id, INVOCATION_START) };
  return { service, rawService, calls, diagnostics, timings, advance };
}

test('successful batch records only bounded monotonic phase durations', async () => {
  let advanceTime;
  const secret = 'SYNTHETIC_PRIVATE_WORKSHEET_AND_KEY';
  const run = setup({ finishDelayMs: 70,
    provider: async (_prompt, options) => {
      advanceTime(1_200);
      options.onTiming('headers_received');
      advanceTime(3_800);
      options.onTiming('body_parsed');
      options.onTiming(secret);
      return response();
    },
    parseBatch: (...args) => { advanceTime(130); return parseDailyBatch(...args); },
  });
  advanceTime = run.advance;
  assert.deepEqual(await run.service.processOneBatch(jobId),
    { status: 'checkpointed', batchIndex: 0 });
  assert.equal(run.calls.provider, 1);
  assert.deepEqual(run.timings.map(JSON.parse), [{ event: 'weekly_draft_provider_timing',
    provider: 'cloudflare', batchIndex: 0, outcome: 'checkpointed',
    providerStartMs: 0, headersMs: 1_200, bodyMs: 5_000, validationMs: 100,
    finishRpcMs: 100, providerToFinishMs: 5_200 }]);
  for (const privateValue of [secret, jobId, planId, response()])
    assert.equal(JSON.stringify(run.timings).includes(privateValue), false);
});

test('timing durations are capped and never expose fake provider fields', async () => {
  let advanceTime;
  const run = setup({ provider: async (_prompt, options) => {
    advanceTime(150_000);
    options.onTiming('headers_received');
    options.onTiming({ privateResponse: 'SYNTHETIC_PRIVATE_CONTENT' });
    return response();
  } });
  advanceTime = run.advance;
  assert.deepEqual(await run.service.processOneBatch(jobId),
    { status: 'checkpointed', batchIndex: 0 });
  assert.deepEqual(run.timings.map(JSON.parse), [{ event: 'weekly_draft_provider_timing',
    provider: 'cloudflare', batchIndex: 0, outcome: 'checkpointed',
    providerStartMs: 0, headersMs: 120_000, validationMs: 0,
    finishRpcMs: 0, providerToFinishMs: 120_000 }]);
  assert.equal(JSON.stringify(run.timings).includes('SYNTHETIC_PRIVATE_CONTENT'), false);
});

test('provider timeout and batch deadline omit unavailable transport phases', async () => {
  const timedOut = setup({ claimed: { ...claim, batchIndex: 2 },
    providerNameForBatch: () => 'nvidia', provider: async (_prompt, options) => {
      options.onTiming('headers_received');
      throw Object.assign(new Error('SYNTHETIC_PRIVATE_KEY'), { code: 'PROVIDER_TIMEOUT' });
    } });
  assert.deepEqual(await timedOut.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'timeout' });
  assert.deepEqual(timedOut.timings.map(JSON.parse), [{ event: 'weekly_draft_provider_timing',
    provider: 'nvidia', batchIndex: 2, outcome: 'failed',
    providerStartMs: 0, headersMs: 0, finishRpcMs: 0, providerToFinishMs: 0 }]);
  assert.equal(timedOut.calls.provider, 1);

  const deadline = setup({ deadlineMs: 15, provider: async () => new Promise(() => {}) });
  assert.deepEqual(await deadline.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'timeout' });
  assert.deepEqual(deadline.timings.map(JSON.parse), [{ event: 'weekly_draft_provider_timing',
    provider: 'cloudflare', batchIndex: 0, outcome: 'failed', providerStartMs: 0,
    finishRpcMs: 0, providerToFinishMs: 0 }]);
  assert.equal(deadline.calls.provider, 1);
});

test('Groq provider failures keep fixed transport codes and bounded HTTP statuses after finish', async () => {
  const secret = 'SYNTHETIC_PRIVATE_PROVIDER_BODY_AND_KEY';
  const cases = [
    [400, 'PROVIDER_REJECTED'], [401, 'PROVIDER_AUTH_FAILED'],
    [403, 'PROVIDER_ACCESS_DENIED'], [500, 'PROVIDER_UNAVAILABLE'],
    [200, 'PROVIDER_TRUNCATED'], [201, 'PROVIDER_INVALID_RESPONSE'],
  ];
  for (const [status, code] of cases) {
    let requests = 0;
    const run = setup({ claimed: { ...claim, batchIndex: 1 },
      providerNameForBatch: () => 'groq',
      provider: (prompt, options) => requestOpenAICompatibleWorksheetJson(prompt, {
        ...options, provider: 'groq', model: 'openai/gpt-oss-120b', apiKey: secret,
        fetchImpl: async () => {
          requests++;
          return { ok: status < 300, status, headers: new Headers(),
            json: async () => status >= 400 ? { error: { message: secret } }
              : { choices: status === 200
                ? [{ finish_reason: 'length', message: { content: secret } }] : [] } };
        },
      }),
    });
    assert.deepEqual(await run.service.processOneBatch(jobId),
      { status: 'failed', failureCategory: 'provider' });
    assert.equal(requests, 1);
    assert.equal(run.calls.provider, 1);
    assert.deepEqual(run.calls.finish, [{ checkpoint: null, failureCategory: 'provider' }]);
    assert.deepEqual(run.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_provider_failure',
      provider: 'groq', batchIndex: 1, failureCategory: 'provider', code,
      ...(status >= 400 ? { httpStatus: status } : {}) }]);
    assert.equal(JSON.stringify(run.diagnostics).includes(secret), false);
    assert.equal(JSON.stringify(run.diagnostics).includes(jobId), false);
    assert.equal(JSON.stringify(run.diagnostics).includes(planId), false);
  }
});

test('unrecognized provider errors and refused finishes cannot leak private error fields', async () => {
  const secret = 'SYNTHETIC_PRIVATE_ERROR_AND_QUESTION';
  const provider = async () => { throw Object.assign(new Error(secret), {
    code: secret, httpStatus: 999, responseBody: secret,
  }); };
  const failed = setup({ providerNameForBatch: () => `groq-${secret}`, provider });
  assert.deepEqual(await failed.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'provider' });
  assert.deepEqual(failed.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_provider_failure',
    provider: 'unknown', batchIndex: 0, failureCategory: 'provider', code: 'other' }]);
  assert.equal(JSON.stringify(failed.diagnostics).includes(secret), false);
  assert.equal(failed.calls.provider, 1);

  const deceptiveError = new Error(secret);
  let codeReads = 0;
  Object.defineProperty(deceptiveError, 'code', { get: () => ++codeReads <= 4
    ? 'PROVIDER_REJECTED' : secret });
  deceptiveError.httpStatus = 400;
  const deceptive = setup({ provider: async () => { throw deceptiveError; } });
  assert.deepEqual(await deceptive.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'provider' });
  assert.deepEqual(deceptive.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_provider_failure',
    provider: 'cloudflare', batchIndex: 0, failureCategory: 'provider',
    code: 'PROVIDER_REJECTED', httpStatus: 400 }]);
  assert.equal(JSON.stringify(deceptive.diagnostics).includes(secret), false);

  const stale = setup({ finish: false, providerNameForBatch: () => 'groq', provider });
  assert.deepEqual(await stale.service.processOneBatch(jobId), { status: 'stale' });
  assert.deepEqual(stale.diagnostics, []);
  assert.equal(stale.calls.provider, 1);
});

test('refused finish records a fixed outcome without a timeout success diagnostic', async () => {
  const run = setup({ finish: false, providerNameForBatch: () => 'private-provider',
    provider: async () => response() });
  assert.deepEqual(await run.service.processOneBatch(jobId), { status: 'stale' });
  assert.equal(run.calls.provider, 1);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.timings.map(JSON.parse), [{ event: 'weekly_draft_provider_timing',
    provider: 'unknown', batchIndex: 0, outcome: 'finish_refused',
    providerStartMs: 0, validationMs: 0, finishRpcMs: 0, providerToFinishMs: 0 }]);
});

test('unconfirmed finish keeps its persistence error and logs no private detail', async () => {
  const secret = 'SYNTHETIC_PRIVATE_PERSISTENCE_DETAIL';
  const failure = new Error(secret);
  const run = setup({ finish: failure, provider: async () => response() });
  await assert.rejects(run.service.processOneBatch(jobId), error => error === failure);
  assert.equal(run.calls.provider, 1);
  assert.equal(run.calls.finish.length, 1);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.timings.map(JSON.parse), [{ event: 'weekly_draft_provider_timing',
    provider: 'cloudflare', batchIndex: 0, outcome: 'finish_unconfirmed',
    providerStartMs: 0, validationMs: 0, finishRpcMs: 0, providerToFinishMs: 0 }]);
  assert.equal(JSON.stringify(run.timings).includes(secret), false);
});

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
    assert.equal(options.batchIndex, 0);
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
    provider: async (prompt, options) => {
      assert.equal(options.batchIndex, 1);
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

test('validation diagnostics classify only fixed parser and provider reasons', async () => {
  const cases = [
    ['malformed_json', () => '{invalid json', 'daily_parser'],
    ['wrong_question_count', () => {
      const entry = JSON.parse(response()); entry.questions.pop(); return JSON.stringify(entry);
    }, 'daily_parser'],
    ['invalid_question_structure', () => {
      const entry = JSON.parse(response()); entry.questions[0].points = -1; return JSON.stringify(entry);
    }, 'daily_parser'],
    ['invalid_answer_key', () => {
      const entry = JSON.parse(response()); entry.questions[0].correct_answer = 'Neither';
      return JSON.stringify(entry);
    }, 'daily_parser'],
    ['duplicate_question', () => {
      const entry = JSON.parse(response()); entry.questions[1].question = entry.questions[0].question;
      return JSON.stringify(entry);
    }, 'daily_parser'],
  ];
  for (const [subreason, makeResponse, stage] of cases) {
    const { service, calls, diagnostics } = setup({ claimed: { ...claim, batchIndex: 6 },
      provider: async () => makeResponse() });
    assert.deepEqual(await service.processOneBatch(jobId),
      { status: 'failed', failureCategory: 'validation' });
    assert.equal(calls.provider, 1);
    assert.equal(calls.reserve, 1);
    assert.deepEqual(calls.finish, [{ checkpoint: null, failureCategory: 'validation' }]);
    assert.deepEqual(diagnostics.map(JSON.parse), [{ event: 'weekly_draft_validation',
      provider: 'cloudflare', batchIndex: 6, stage, subreason }]);
  }

  const providerInvalid = setup({ provider: async () => {
    throw Object.assign(new Error('synthetic private provider detail'), { code: 'AI_RESPONSE_INVALID' });
  } });
  assert.deepEqual(await providerInvalid.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'validation' });
  assert.equal(providerInvalid.calls.provider, 1);
  assert.deepEqual(providerInvalid.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_validation',
    provider: 'cloudflare', batchIndex: 0, stage: 'provider_request',
    subreason: 'provider_ai_response_invalid' }]);
});

test('same-day duplicate and unexpected parser exception have distinct safe diagnostics', async () => {
  const prior = Array.from({ length: 10 }, (_, index) => `Synthetic prior item ${index + 1}.`);
  const duplicate = setup({ claimed: { ...claim, batchIndex: 1, priorQuestions: prior },
    provider: async () => {
      const entry = JSON.parse(response()); entry.questions[0].question = prior[0];
      return JSON.stringify(entry);
    } });
  assert.deepEqual(await duplicate.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'validation' });
  assert.deepEqual(duplicate.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_validation',
    provider: 'cloudflare', batchIndex: 1, stage: 'same_day_duplicate_check',
    subreason: 'duplicate_question' }]);

  const sentinel = 'SYNTHETIC_PRIVATE_EXCEPTION_TEXT';
  const unexpected = setup({ parseBatch: () => { throw new Error(sentinel); } });
  await assert.rejects(unexpected.service.processOneBatch(jobId), error => error.message === sentinel);
  assert.equal(unexpected.calls.provider, 1);
  assert.deepEqual(unexpected.calls.finish, []);
  assert.deepEqual(unexpected.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_validation',
    provider: 'cloudflare', batchIndex: 0, stage: 'daily_parser',
    subreason: 'unexpected_parser_exception' }]);
  assert.equal(JSON.stringify(unexpected.diagnostics).includes(sentinel), false);
});

test('diagnostics redact synthetic secrets, content, and untrusted validation labels', async () => {
  const sentinels = ['SYNTHETIC_API_KEY', 'SYNTHETIC_QUESTION_CONTENT',
    'SYNTHETIC_ANSWER_CONTENT', 'SYNTHETIC_PROVIDER_MESSAGE'];
  const invalid = setup({ providerNameForBatch: () => `cloudflare-${sentinels[0]}`,
    parseBatch: () => { throw Object.assign(new Error(sentinels[3]), {
      code: 'AI_RESPONSE_INVALID', validation: { category: sentinels[1], subreason: sentinels[2] },
    }); } });
  assert.deepEqual(await invalid.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'validation' });
  assert.equal(invalid.calls.provider, 1);
  assert.deepEqual(invalid.calls.finish, [{ checkpoint: null, failureCategory: 'validation' }]);
  assert.deepEqual(invalid.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_validation',
    provider: 'unknown', batchIndex: 0, stage: 'daily_parser', subreason: 'other_validation' }]);
  for (const sentinel of sentinels) assert.equal(JSON.stringify(invalid.diagnostics).includes(sentinel), false);

  const malformed = setup({ provider: async () =>
    `{${sentinels[0]} ${sentinels[1]} ${sentinels[2]} ${sentinels[3]}` });
  assert.deepEqual(await malformed.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'validation' });
  assert.equal(malformed.calls.provider, 1);
  assert.deepEqual(malformed.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_validation',
    provider: 'cloudflare', batchIndex: 0, stage: 'daily_parser', subreason: 'malformed_json' }]);
  for (const sentinel of sentinels) assert.equal(JSON.stringify(malformed.diagnostics).includes(sentinel), false);
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
  const { service, calls, diagnostics } = setup({ deadlineMs: 15,
    provider: async (_prompt, options) => {
      signal = options.signal;
      return new Promise(() => {});
    } });
  assert.deepEqual(await service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'timeout' });
  assert.equal(signal.aborted, true);
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.finish, [{ checkpoint: null, failureCategory: 'timeout' }]);
  assert.deepEqual(diagnostics.map(JSON.parse), [{ event: 'weekly_draft_timeout',
    provider: 'cloudflare', batchIndex: 0, failureCategory: 'timeout',
    timeoutOrigin: 'batch_deadline' }]);
});

test('provider timeout logs only after the terminal failure is recorded, without retry or private data', async () => {
  const secret = 'SYNTHETIC_PRIVATE_KEY_AND_WORKSHEET_CONTENT';
  const timedOut = setup({ claimed: { ...claim, batchIndex: 2 },
    providerNameForBatch: () => 'nvidia', provider: async () => {
      throw Object.assign(new Error(secret), { code: 'PROVIDER_TIMEOUT', privateResponse: secret });
    } });
  assert.deepEqual(await timedOut.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'timeout' });
  assert.equal(timedOut.calls.provider, 1);
  assert.deepEqual(timedOut.calls.finish, [{ checkpoint: null, failureCategory: 'timeout' }]);
  assert.deepEqual(timedOut.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_timeout',
    provider: 'nvidia', batchIndex: 2, failureCategory: 'timeout',
    timeoutOrigin: 'provider_timeout' }]);
  assert.equal(JSON.stringify(timedOut.diagnostics).includes(secret), false);

  const redacted = setup({ providerNameForBatch: () => `nvidia-${secret}`,
    provider: async () => { throw Object.assign(new Error(secret), { code: 'PROVIDER_TIMEOUT' }); } });
  assert.deepEqual(await redacted.service.processOneBatch(jobId),
    { status: 'failed', failureCategory: 'timeout' });
  assert.equal(redacted.calls.provider, 1);
  assert.deepEqual(redacted.diagnostics.map(JSON.parse), [{ event: 'weekly_draft_timeout',
    provider: 'unknown', batchIndex: 0, failureCategory: 'timeout',
    timeoutOrigin: 'provider_timeout' }]);
  assert.equal(JSON.stringify(redacted.diagnostics).includes(secret), false);

  const stale = setup({ finish: false, providerNameForBatch: () => secret,
    provider: async () => { throw Object.assign(new Error(secret), { code: 'PROVIDER_TIMEOUT' }); } });
  assert.deepEqual(await stale.service.processOneBatch(jobId), { status: 'stale' });
  assert.equal(stale.calls.provider, 1);
  assert.deepEqual(stale.diagnostics, []);
});

test('a false finish result discards a valid response as stale', async () => {
  const { service, calls } = setup({ finish: false });
  assert.deepEqual(await service.processOneBatch(jobId), { status: 'stale' });
  assert.equal(calls.provider, 1);
  assert.equal(calls.finish.length, 1);
});
