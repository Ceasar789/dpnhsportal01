import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWeeklyWorksheetPrompt, generateWeeklyWorksheetDrafts, parseDailyBatch, RESPONSE_SCHEMA, validateWeeklySources } from './weeklyWorksheetGenerator.js';
import { requestWeeklyWorksheetJson } from './weeklyWorksheetProvider.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const plan = { id: 'plan-1', title: 'Filipino 7 Lesson Plan', subject: 'Filipino', grade_level: 'Grade 7' };
const sources = days.map(day => ({ day, competency: 'Analyze Filipino poetry', objective: `Analyze ${day} panitikan`,
  activity: `Read ${day} tula`, assessment: `Discuss ${day} taludtod` }));
const topics = { Monday: 'metapora', Tuesday: 'simile', Wednesday: 'tugma', Thursday: 'sukat', Friday: 'persona' };
const item = (day, batch, index) => {
  const base = { question: `${day} batch ${batch} item ${index}: Discuss ${topics[day]} in the taludtod.`, points: 1, options: [], correct_answer: '' };
  if (index < 4) return { ...base, item_type: 'multiple_choice', options: ['Tula', 'Awit', 'Dula'], correct_answer: 'Tula' };
  if (index < 7) return { ...base, item_type: 'true_false', correct_answer: index % 2 ? 'True' : 'False' };
  if (index < 9) return { ...base, item_type: 'enumeration', correct_answer: 'taludtod, saknong',
    enumeration: { alternatives: ['linya, saknong'], orderSensitive: false } };
  return { ...base, item_type: 'essay', essay: { referenceAnswer: 'The taludtod develops the central idea.',
    minWords: 20, maxWords: 100, rubric: [{ criterion: 'Explains the taludtod', points: 1 }] } };
};
const response = (day, batch) => JSON.stringify({ title: `${day} panitikan`, directions: 'Answer the questions.',
  questions: Array.from({ length: 10 }, (_, index) => item(day, batch, index)) });

const withLocalGroq = async run => {
  const previous = { provider: process.env.WEEKLY_WORKSHEET_PROVIDER, node: process.env.NODE_ENV,
    vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV };
  Object.assign(process.env, { WEEKLY_WORKSHEET_PROVIDER: 'groq', NODE_ENV: 'development' });
  delete process.env.VERCEL; delete process.env.VERCEL_ENV;
  try { return await run(); } finally {
    for (const [name, value] of Object.entries({ WEEKLY_WORKSHEET_PROVIDER: previous.provider,
      NODE_ENV: previous.node, VERCEL: previous.vercel, VERCEL_ENV: previous.vercelEnv })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
};

const fakeClock = (initialNow = 0) => {
  let now = initialNow; let nextId = 0;
  const timers = new Map();
  const delays = [];
  return { now: () => now, delays,
    setTimeout: (fn, ms) => { const id = ++nextId; delays.push(ms); timers.set(id, { at: now + ms, ms, fn }); return id; },
    clearTimeout: id => timers.delete(id), tick: ms => {
      const end = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      now = end;
    }, next: () => Math.min(...[...timers.values()].filter(timer => timer.ms < 600_000).map(timer => timer.at - now)) };
};

const settleWithClock = async (promise, clock) => {
  let settled = false; let value; let failure;
  promise.then(result => { settled = true; value = result; }, error => { settled = true; failure = error; });
  for (let index = 0; index < 1000 && !settled; index += 1) {
    await Promise.resolve();
    if (index % 20 === 19 && !settled && Number.isFinite(clock.next())) clock.tick(clock.next());
  }
  assert.equal(settled, true, 'operation did not settle with fake time');
  if (failure) throw failure;
  return value;
};

test('local Groq waits on low tokens and retries one 429 while counting both attempts', async () => withLocalGroq(async () => {
  const clock = fakeClock(); let calls = 0; const progress = []; const logs = [];
  const result = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info: value => logs.push(value) }, progress: event => progress.push(event),
    generateText: async (prompt, options) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('rate limit'), { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds: 7 });
      options.onGroqUsage?.({ remainingTokens: calls === 1 ? 100 : 7000, resetTokensMs: 12000,
        promptTokens: 900, completionTokens: 1100, totalTokens: 2000 });
      return fakeProvider(prompt, options);
    },
  }), clock);
  assert.equal(clock.now(), 19000);
  assert.equal(calls, 11);
  assert.equal(progress.at(-1).providerCalls, 11);
  assert.equal(result.length, 5);
  assert.ok(logs.some(value => /waitMs=7000 .*retry=yes/.test(value)));
  assert.ok(logs.some(value => /promptTokens=900 completionTokens=1100 totalTokens=2000/.test(value)));
  assert.ok(logs.every(value => !/Filipino|panitikan|taludtod|answer/i.test(value)));
}));

test('local Groq call and request timing logs contain only safe numbers and an operation ID', async () => withLocalGroq(async () => {
  const clock = fakeClock(); const logs = []; let calls = 0;
  const drafts = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    operationId: 'synthetic-operation', pacingClock: clock, log: { info: value => logs.push(value) },
    generateText: async (prompt, options) => {
      calls += 1;
      clock.tick(25);
      if (calls === 1) throw Object.assign(new Error('rate limit'),
        { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds: 5 });
      options.onGroqUsage?.({ remainingTokens: 7000, resetTokensMs: 12000,
        promptTokens: 900, completionTokens: 1100, totalTokens: 2000, reasoningTokens: 125 });
      return fakeProvider(prompt, options);
    },
  }), clock);
  assert.equal(drafts.length, 5);
  assert.equal(calls, 11);
  assert.equal(logs.length, 12);
  assert.ok(logs.every(value => value.includes('operation=synthetic-operation')));
  assert.match(logs[0], /day=Monday batch=1 durationMs=25 waitMs=0/);
  assert.match(logs[1], /day=Monday batch=1 durationMs=25 waitMs=5000.*reasoningTokens=125 retry=yes/);
  assert.match(logs.at(-1), /stage=summary outcome=success elapsedMs=5275 totalWaitMs=5000 providerCalls=11 pacedCalls=1/);
  assert.ok(logs.every(value => !/Filipino|panitikan|taludtod|Answer the questions|synthetic prompt/i.test(value)));
}));

test('local Groq failure also emits a final timing summary', async () => withLocalGroq(async () => {
  const clock = fakeClock(); const logs = [];
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    operationId: 'synthetic-operation', pacingClock: clock, log: { info: value => logs.push(value) },
    generateText: async () => { clock.tick(12); throw Object.assign(new Error('rate limit'),
      { code: 'PROVIDER_RATE_LIMIT' }); },
  }), error => error.code === 'PROVIDER_RATE_LIMIT' && error.providerCalls === 1);
  assert.match(logs.at(-1), /operation=synthetic-operation stage=summary outcome=failure elapsedMs=12 totalWaitMs=0 providerCalls=1 pacedCalls=0/);
}));

test('generator retry uses the same Groq adapter and prompt with mocked HTTP responses', async () => withLocalGroq(async () => {
  const clock = fakeClock(); let calls = 0; let firstBody;
  const progress = [];
  const drafts = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info() {} }, progress: event => progress.push(event),
    generateText: (prompt, options) => requestWeeklyWorksheetJson(prompt, { ...options, apiKey: 'synthetic-key',
      fetchImpl: async (_url, request) => {
        calls += 1;
        if (calls === 1) { firstBody = request.body; return { ok: false, status: 429,
          headers: { get: name => name === 'retry-after' ? '7' : null } }; }
        if (calls === 2) assert.equal(request.body, firstBody);
        const [, day, batch] = /for (\w+), batch (\d+)\./.exec(prompt);
        return { ok: true, headers: { get: name => ({ 'x-ratelimit-remaining-tokens': '6000',
          'x-ratelimit-reset-tokens': '12s' })[name] }, json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: response(day, Number(batch)) } }],
          usage: { prompt_tokens: 1000, completion_tokens: 1500, total_tokens: 2500 },
        }) };
      },
    }),
  }), clock);
  assert.equal(calls, 11);
  assert.equal(progress.at(-1).providerCalls, 11);
  assert.equal(clock.now(), 7000);
  assert.equal(drafts.length, 5);
}));

for (const [resetHeader, expectedWait] of [['7.66s', 7660], ['2m59.56s', 179560], ['250ms', 250],
  ['malformed', undefined]]) test(`fractional clock handles Groq reset header ${resetHeader}`, async () => withLocalGroq(async () => {
  const clock = fakeClock(0.25); let calls = 0;
  const drafts = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => {
      const result = await requestWeeklyWorksheetJson(prompt, { ...options, apiKey: 'synthetic-key',
        fetchImpl: async () => {
          calls += 1;
          const [, day, batch] = /for (\w+), batch (\d+)\./.exec(prompt);
          return { ok: true, headers: { get: name => ({ 'x-ratelimit-remaining-tokens': calls === 1 ? '0' : '7000',
            'x-ratelimit-reset-tokens': resetHeader })[name] }, json: async () => ({
            choices: [{ finish_reason: 'stop', message: { content: response(day, Number(batch)) } }],
            usage: { prompt_tokens: 1000, completion_tokens: 1500, total_tokens: 2500 },
          }) };
        },
      });
      clock.tick(0.125);
      return result;
    },
  }), clock);
  assert.equal(calls, 10);
  assert.equal(drafts.length, 5);
  assert.deepEqual(clock.delays.filter(milliseconds => milliseconds !== 600_000),
    expectedWait === undefined ? [] : [expectedWait]);
  assert.ok(clock.delays.every(Number.isSafeInteger));
}));

test('local Groq rejects missing, invalid, and over-cap retry-after without another call', async () => withLocalGroq(async () => {
  for (const retryAfterSeconds of [undefined, 0, '7', 61]) {
    let calls = 0;
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info() {} }, generateText: async () => { calls += 1;
        throw Object.assign(new Error('rate limit'), { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds }); },
    }), error => error.code === 'PROVIDER_RATE_LIMIT' && error.providerCalls === 1);
    assert.equal(calls, 1);
  }
}));

test('a second Groq 429 fails closed after one retry', async () => withLocalGroq(async () => {
  const clock = fakeClock(); let calls = 0;
  await assert.rejects(settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info() {} }, generateText: async () => { calls += 1;
      throw Object.assign(new Error('rate limit'), { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds: 7 }); },
  }), clock), error => error.code === 'PROVIDER_RATE_LIMIT' && error.providerCalls === 2);
  assert.equal(calls, 2);
  assert.equal(clock.now(), 7000);
}));

test('cumulative Groq wait cap rejects without returning partial days', async () => withLocalGroq(async () => {
  const clock = fakeClock(); let calls = 0;
  await assert.rejects(settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 40,
    pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => { calls += 1;
      options.onGroqUsage?.({ remainingTokens: 0, resetTokensMs: 60_000, totalTokens: 2500 });
      return fakeProvider(prompt, options); },
  }), clock), error => error.code === 'PROVIDER_TIMEOUT' && error.validation?.category === 'pacing_deadline'
    && error.providerCalls === 8);
  assert.equal(calls, 8);
  assert.equal(clock.now(), 420_000);
}));

test('rounded waits that reach either cap still fail closed', async () => withLocalGroq(async () => {
  for (const [advance, resetTokensMs] of [[0, 480_000], [300_000, 300_000]]) {
    const clock = fakeClock(0.25); let calls = 0;
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => {
        calls += 1;
        clock.tick(advance);
        options.onGroqUsage?.({ remainingTokens: 0, resetTokensMs, totalTokens: 2500 });
        clock.tick(0.125);
        return fakeProvider(prompt, options);
      },
    }), error => error.code === 'PROVIDER_TIMEOUT' && error.validation?.category === 'pacing_deadline'
      && error.providerCalls === 1);
    assert.equal(calls, 1);
  }
}));

test('ten-minute Groq deadline aborts an active fetch', async () => withLocalGroq(async () => {
  const clock = fakeClock(); let calls = 0;
  const pending = generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info() {} }, generateText: (_prompt, options) => { calls += 1;
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); },
  });
  await new Promise(resolve => setImmediate(resolve));
  clock.tick(600_000);
  await assert.rejects(pending, error => error.code === 'PROVIDER_TIMEOUT'
    && error.validation?.category === 'pacing_deadline' && error.providerCalls === 1);
  assert.equal(calls, 1);
}));

test('Groq cancellation interrupts a wait and an active fetch', async () => withLocalGroq(async () => {
  for (const duringFetch of [false, true]) {
    const clock = fakeClock(0.25); const controller = new AbortController(); let calls = 0;
    const pending = generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      signal: controller.signal, pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => {
        calls += 1;
        if (duringFetch) return new Promise((_resolve, reject) => options.signal.addEventListener('abort',
          () => reject(new Error('aborted')), { once: true }));
        options.onGroqUsage?.({ remainingTokens: 0, resetTokensMs: 60_000, totalTokens: 2500 });
        clock.tick(0.125);
        return fakeProvider(prompt, options);
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(pending, error => error.code === 'GENERATION_CANCELLED'
      && error.providerCalls === 1);
    assert.equal(calls, 1);
  }
}));

for (const questionCount of [20, 30, 40]) test(`${questionCount} daily questions fit a simulated 8000 TPM window`, async () => withLocalGroq(async () => {
  const clock = fakeClock(0.25); let calls = 0; let remaining = 8000; let window = 0;
  const drafts = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount,
    pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => {
      if (clock.now() >= window + 60_000) { window = clock.now(); remaining = 8000; }
      assert.ok(remaining >= 2500, 'TPM would have been exceeded');
      calls += 1; remaining -= 2500;
      options.onGroqUsage?.({ remainingTokens: remaining, resetTokensMs: Math.ceil(window + 60_000 - clock.now()),
        promptTokens: 1000, completionTokens: 1500, totalTokens: 2500 });
      clock.tick(0.125);
      return fakeProvider(prompt, options);
    },
  }), clock);
  assert.equal(calls, questionCount / 10 * 5);
  assert.equal(drafts.length, 5);
  assert.ok(drafts.every(draft => draft.questions.length === questionCount));
  assert.ok(clock.now() <= 420_000);
}));

test('Gemini selection keeps the original one-call fail-closed path', async () => {
  const previous = process.env.WEEKLY_WORKSHEET_PROVIDER; let calls = 0;
  process.env.WEEKLY_WORKSHEET_PROVIDER = 'gemini';
  try {
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      generateText: async (_prompt, options) => { calls += 1; assert.equal(options.onGroqUsage, undefined);
        throw Object.assign(new Error('rate limit'), { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds: 7 }); },
    }), error => error.code === 'PROVIDER_RATE_LIMIT' && error.providerCalls === 1);
    assert.equal(calls, 1);
  } finally { if (previous === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER;
    else process.env.WEEKLY_WORKSHEET_PROVIDER = previous; }
});

test('enumeration metadata keeps the schema contract and optional non-enumeration fields do not affect parsing', () => {
  const schema = RESPONSE_SCHEMA.properties.questions.items.properties.enumeration;
  assert.deepEqual(schema.required, ['alternatives', 'orderSensitive']);
  assert.equal(schema.properties.alternatives.type, 'ARRAY');
  assert.equal(schema.properties.orderSensitive.type, 'BOOLEAN');
  const prompt = buildWeeklyWorksheetPrompt(plan, sources[0]);
  for (const phrase of ['non-empty, comma-separated', 'katapatan, pagtutulungan',
    'enumeration.alternatives: []', 'same comma-separated item count',
    'Never put individual expected items', 'orderSensitive is true only when order matters']) {
    assert.ok(prompt.includes(phrase), `Missing enumeration instruction: ${phrase}`);
  }
  const entry = JSON.parse(response('Monday', 1));
  entry.questions[5].enumeration = null;
  entry.questions[6].enumeration = {};
  entry.questions[7].enumeration = { alternatives: ['linya, saknong'], orderSensitive: true };
  entry.questions[8].enumeration = { alternatives: [], orderSensitive: false };
  const draft = parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1);
  assert.equal(draft.questions[5].enumeration, undefined);
  assert.deepEqual(draft.questions[7].enumeration, entry.questions[7].enumeration);
  assert.deepEqual(draft.questions[8].enumeration, entry.questions[8].enumeration);
  assert.equal(draft.answerKey.find(key => key.localId === 'draft-8').correct_answer, 'taludtod, saknong');
  entry.questions[8].enumeration = null;
  const nullable = parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1);
  assert.deepEqual(nullable.questions[8].enumeration, { alternatives: [], orderSensitive: false });
  delete entry.questions[8].enumeration;
  const omitted = parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1);
  assert.deepEqual(omitted.questions[8].enumeration, { alternatives: [], orderSensitive: false });
});

test('enumeration rejection records only an allowlisted structural subreason', () => {
  const cases = [
    [[], 'metadata_shape'],
    [{}, 'alternatives_shape'],
    [{ alternatives: null, orderSensitive: false }, 'alternatives_shape'],
    [{ alternatives: [], orderSensitive: null }, 'order_sensitive_type'],
    [{ alternatives: ['<private answer>, saknong'], orderSensitive: false }, 'alternative_text'],
    [{ alternatives: ['linya'], orderSensitive: false }, 'alternative_answer_count'],
  ];
  for (const [config, subreason] of cases) {
    const entry = JSON.parse(response('Monday', 1));
    entry.questions[7].enumeration = config;
    assert.throws(() => parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1), error =>
      error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'invalid_field'
      && error.validation.path === 'questions[7].enumeration'
      && error.validation.subreason === subreason
      && !JSON.stringify(error.validation).includes('private answer'));
  }
});

test('essay metadata reports missing and rubric-sum failures without exposing content', () => {
  for (const [change, subreason] of [
    [item => { item.essay = null; }, 'essay_missing'],
    [item => { delete item.essay; }, 'essay_missing'],
    [item => { item.essay.rubric[0].points = 2; }, 'rubric_sum_mismatch'],
  ]) {
    const entry = JSON.parse(response('Monday', 1));
    change(entry.questions[9]);
    assert.throws(() => parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1), error =>
      error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'invalid_essay'
      && error.validation.path === 'questions[9].essay' && error.validation.subreason === subreason
      && !JSON.stringify(error.validation).includes('taludtod'));
  }
});

test('invalid and ambiguous enumeration answer keys still fail before metadata validation', () => {
  for (const answer of [',', 'taludtod, ', null]) {
    const entry = JSON.parse(response('Monday', 1));
    entry.questions[7].correct_answer = answer;
    assert.throws(() => parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1), error =>
      error.validation?.category === 'invalid_answer_key'
      && error.validation.path === 'questions[7].correct_answer');
  }
});
const fakeProvider = async (prompt, options) => {
  assert.equal(options.maxOutputTokens, 8192);
  assert.equal(options.responseSchema.properties.questions.maxItems, 10);
  const day = days.find(value => prompt.includes(`Daily source: {"day":"${value}"`));
  const batch = Number(prompt.match(/batch (\d+)/)[1]);
  assert.ok(day);
  assert.ok(prompt.includes(`Analyze ${day} panitikan`));
  assert.ok(prompt.includes('Analyze Filipino poetry'));
  assert.ok(days.filter(other => other !== day).every(other => !prompt.includes(`Analyze ${other} panitikan`)));
  return response(day, batch);
};

const fridayFailure = async (batch, change, questionCount = 20) => {
  const calls = [];
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount, generateText: async (prompt, options) => {
    const day = days.find(value => prompt.includes(`Daily source: {"day":"${value}"`));
    const number = Number(prompt.match(/batch (\d+)/)[1]);
    calls.push(`${day}-${number}`);
    const value = JSON.parse(await fakeProvider(prompt, options));
    return day === 'Friday' && number === batch ? change(value) : JSON.stringify(value);
  } }), error => error.validation?.day === 'Friday' && error.validation?.batch === batch);
  assert.equal(calls.at(-1), `Friday-${batch}`);
  assert.equal(calls.length, 4 * questionCount / 10 + batch);
};

test('Friday first and final batches reject incomplete output with exact metadata and no extra calls', async () => {
  await fridayFailure(1, value => JSON.stringify({ ...value, questions: value.questions.slice(0, 9) }));
  await fridayFailure(4, value => JSON.stringify({ ...value, questions: value.questions.slice(0, 9) }), 40);
});

test('Friday invalid keys, missing essay rubric, truncated JSON, and valid count with invalid item fail closed', async () => {
  await fridayFailure(1, value => { value.questions[0].correct_answer = 'Wrong'; return JSON.stringify(value); });
  await fridayFailure(1, value => { value.questions[7].correct_answer = ','; return JSON.stringify(value); });
  await fridayFailure(1, value => { delete value.questions[9].essay.rubric; return JSON.stringify(value); });
  await fridayFailure(1, () => '{"title":');
  await fridayFailure(1, value => { value.questions[0].points = 0; return JSON.stringify(value); });
});

test('Friday duplicate question and private batch answer keys are preserved only for complete drafts', async () => {
  await fridayFailure(2, value => {
    value.questions[0].question = item('Friday', 1, 0).question;
    return JSON.stringify(value);
  });
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: fakeProvider });
  assert.equal(drafts[4].answerKey.length, 18);
  assert.deepEqual(drafts[4].answerKey.slice(0, 2).map(key => key.localId), ['draft-1', 'draft-2']);
  assert.equal(drafts[4].questions[0].correct_answer, undefined);
});

test('later batches receive the complete prior question text within the parser limit', () => {
  const longQuestion = `${'A'.repeat(310)} unique ending`;
  const prompt = buildWeeklyWorksheetPrompt(plan, sources[0], 10, 2, [longQuestion]);
  assert.ok(prompt.includes(JSON.stringify(longQuestion)));
});

test('within-batch duplicates in batches 1 and 2 fail at the question path', async () => {
  for (const failingBatch of [1, 2]) {
    let calls = 0;
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      generateText: async (prompt, options) => {
        calls += 1;
        const value = JSON.parse(await fakeProvider(prompt, options));
        if (prompt.includes('"day":"Monday"') && prompt.includes(`batch ${failingBatch}`)) {
          value.questions[1].question = `  ${value.questions[0].question.toUpperCase()}  `;
          value.questions[3].question = value.questions[2].question;
        }
        return JSON.stringify(value);
      } }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'duplicate_question'
        && error.validation.path === 'questions[1].question' && error.validation.batch === failingBatch
        && error.validation.subreason === 'duplicate_within_batch'
        && error.providerCalls === failingBatch && error.validation.duplicateCount === 2
        && error.validation.duplicates?.[0]?.batchIndex === 1
        && error.validation.duplicates?.[0]?.priorIndex === 0
        && error.validation.duplicates?.[0]?.item_type === 'multiple_choice'
        && error.validation.duplicates?.[0]?.normalizedLength === item('Monday', failingBatch, 0).question.length
        && error.validation.duplicates?.[1]?.batchIndex === 3
        && error.validation.duplicates?.[1]?.priorIndex === 2
        && !JSON.stringify(error.validation).includes('taludtod'));
    assert.equal(calls, failingBatch);
  }
});

test('cross-batch duplicate fails at collection path after preserving the first batch', async () => {
  let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      calls += 1;
      if (prompt.includes('"day":"Monday"') && prompt.includes('batch 2')) {
        assert.ok(prompt.includes(JSON.stringify(item('Monday', 1, 0).question)));
        assert.ok(prompt.includes(JSON.stringify(item('Monday', 1, 9).question)));
      }
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (prompt.includes('"day":"Monday"') && prompt.includes('batch 2')) {
        value.questions[0].question = ` ${item('Monday', 1, 0).question.toUpperCase()} `;
        value.questions[1].question = item('Monday', 1, 1).question;
      }
      return JSON.stringify(value);
    } }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'duplicate_question'
      && error.validation.path === 'questions' && error.validation.subreason === 'duplicate_prior_batch'
      && error.validation.day === 'Monday'
      && error.validation.batch === 2 && error.validation.receivedCount === 10
      && error.validation.validatedCount === 10 && error.providerCalls === 2
      && error.validation.duplicateCount === 2
      && error.validation.duplicates?.[0]?.batchIndex === 0
      && error.validation.duplicates?.[0]?.priorIndex === 0
      && error.validation.duplicates?.[1]?.batchIndex === 1
      && error.validation.duplicates?.[1]?.priorIndex === 1);
  assert.equal(calls, 2);
});

test('duplicate capture is off by default and records one local Groq failure only when enabled', async () => withLocalGroq(async () => {
  const previous = process.env.WEEKLY_DEBUG_CAPTURE;
  const operationId = randomUUID();
  const filePath = join(fileURLToPath(new URL('../../node_modules/.cache/', import.meta.url)),
    `weekly-duplicate-${operationId}.json`);
  const logs = []; let rejectedRaw;
  const generateText = async (prompt, options) => {
    const value = JSON.parse(await fakeProvider(prompt, options));
    if (prompt.startsWith('Create exactly 10 distinct worksheet questions for Monday, batch 2.')) {
      value.questions[0].question = item('Monday', 1, 0).question;
      rejectedRaw = JSON.stringify(value);
      return rejectedRaw;
    }
    return JSON.stringify(value);
  };
  try {
    delete process.env.WEEKLY_DEBUG_CAPTURE;
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      operationId, debugCapture: true, log: { info: value => logs.push(value) }, generateText }),
    error => error.validation?.subreason === 'duplicate_prior_batch');
    await assert.rejects(access(filePath), error => error.code === 'ENOENT');
    process.env.WEEKLY_DEBUG_CAPTURE = 'yes';
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      operationId, debugCapture: true, log: { info: value => logs.push(value) }, generateText }),
    error => error.validation?.subreason === 'duplicate_prior_batch');
    await assert.rejects(access(filePath), error => error.code === 'ENOENT');
    process.env.WEEKLY_DEBUG_CAPTURE = 'true';
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      operationId, debugCapture: false, log: { info: value => logs.push(value) }, generateText }),
    error => error.validation?.subreason === 'duplicate_prior_batch');
    await assert.rejects(access(filePath), error => error.code === 'ENOENT');
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      operationId, debugCapture: true, log: { info: value => logs.push(value) }, generateText }),
    error => error.validation?.subreason === 'duplicate_prior_batch');
    const captured = JSON.parse(await readFile(filePath, 'utf8'));
    assert.deepEqual(Object.keys(captured).sort(), ['batch', 'day', 'priorQuestions', 'rawResponse', 'subreason']);
    assert.equal(captured.day, 'Monday');
    assert.equal(captured.batch, 2);
    assert.equal(captured.subreason, 'duplicate_prior_batch');
    assert.equal(captured.rawResponse === rejectedRaw, true);
    assert.equal(JSON.stringify(captured.priorQuestions) === JSON.stringify(
      Array.from({ length: 10 }, (_, index) => item('Monday', 1, index).question)), true);
    assert.equal(JSON.stringify(captured).includes('synthetic-key'), false);
    assert.deepEqual(logs.filter(value => value.includes('capturePath=')),
      [`[weekly-worksheets] operation=${operationId} capturePath=${filePath}`]);
    assert.ok(logs.every(value => !/taludtod|panitikan|answer the questions/i.test(value)));
  } finally {
    await unlink(filePath).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (previous === undefined) delete process.env.WEEKLY_DEBUG_CAPTURE;
    else process.env.WEEKLY_DEBUG_CAPTURE = previous;
  }
}));

test('opt-in capture selects the rejected batch for within-batch and cross-day duplicates', async () => withLocalGroq(async () => {
  const previous = process.env.WEEKLY_DEBUG_CAPTURE;
  process.env.WEEKLY_DEBUG_CAPTURE = '1';
  try {
    for (const scope of ['duplicate_within_batch', 'duplicate_cross_day']) {
      const operationId = randomUUID();
      const filePath = join(fileURLToPath(new URL('../../node_modules/.cache/', import.meta.url)),
        `weekly-duplicate-${operationId}.json`);
      let expectedRaw;
      try {
        await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
          operationId, debugCapture: true, log: { info() {} },
          generateText: async (prompt, options) => {
            const value = JSON.parse(await fakeProvider(prompt, options));
            if (scope === 'duplicate_within_batch' && prompt.startsWith(
              'Create exactly 10 distinct worksheet questions for Monday, batch 1.')) {
              value.questions[1].question = value.questions[0].question;
              expectedRaw = JSON.stringify(value);
              return expectedRaw;
            }
            if (scope === 'duplicate_cross_day' && prompt.startsWith(
              'Create exactly 10 distinct worksheet questions for Tuesday, batch 1.')) {
              value.questions[0].question = item('Monday', 1, 0).question.replace('Monday', 'Tuesday');
              expectedRaw = JSON.stringify(value);
              return expectedRaw;
            }
            return JSON.stringify(value);
          },
        }), error => error.validation?.subreason === scope);
        const captured = JSON.parse(await readFile(filePath, 'utf8'));
        assert.equal(captured.subreason, scope);
        assert.equal(captured.batch, 1);
        assert.equal(captured.day, scope === 'duplicate_within_batch' ? 'Monday' : 'Tuesday');
        assert.equal(captured.rawResponse === expectedRaw, true);
        assert.deepEqual(captured.priorQuestions, []);
      } finally { await unlink(filePath).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }
  } finally {
    if (previous === undefined) delete process.env.WEEKLY_DEBUG_CAPTURE;
    else process.env.WEEKLY_DEBUG_CAPTURE = previous;
  }
}));

test('opt-in capture remains disabled on the Gemini path', async () => {
  const previous = { provider: process.env.WEEKLY_WORKSHEET_PROVIDER,
    capture: process.env.WEEKLY_DEBUG_CAPTURE };
  const operationId = randomUUID();
  const filePath = join(fileURLToPath(new URL('../../node_modules/.cache/', import.meta.url)),
    `weekly-duplicate-${operationId}.json`);
  process.env.WEEKLY_WORKSHEET_PROVIDER = 'gemini';
  process.env.WEEKLY_DEBUG_CAPTURE = '1';
  try {
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      operationId, debugCapture: true, generateText: async (prompt, options) => {
        const value = JSON.parse(await fakeProvider(prompt, options));
        value.questions[1].question = value.questions[0].question;
        return JSON.stringify(value);
      } }), error => error.validation?.subreason === 'duplicate_within_batch');
    await assert.rejects(access(filePath), error => error.code === 'ENOENT');
  } finally {
    if (previous.provider === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER;
    else process.env.WEEKLY_WORKSHEET_PROVIDER = previous.provider;
    if (previous.capture === undefined) delete process.env.WEEKLY_DEBUG_CAPTURE;
    else process.env.WEEKLY_DEBUG_CAPTURE = previous.capture;
  }
});

test('cross-day duplicate fails only after all days; punctuation and shared topic alone remain distinct', async () => {
  let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (prompt.startsWith('Create exactly 10 distinct worksheet questions for Tuesday, batch 1.')) {
        value.questions[0].question = item('Monday', 1, 0).question.replace('Monday', 'Tuesday');
      }
      return JSON.stringify(value);
    } }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'duplicate_question'
      && error.validation.path === 'questions' && error.validation.day === 'Tuesday'
      && error.validation.batch === undefined && error.validation.subreason === 'duplicate_cross_day'
      && error.providerCalls === 10);
  assert.equal(calls, 10);

  for (const questionCount of [20, 30, 40]) {
    let providerCalls = 0;
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount,
      generateText: async (prompt, options) => {
        providerCalls += 1;
        const value = JSON.parse(await fakeProvider(prompt, options));
        if (prompt.startsWith('Create exactly 10 distinct worksheet questions for Monday, batch 2.')) {
          value.questions[0].question = item('Monday', 1, 0).question.replace(/\.$/, '?');
        }
        return JSON.stringify(value);
      } });
    assert.equal(providerCalls, questionCount / 10 * 5);
    assert.ok(drafts.every(draft => draft.questions.length === questionCount && draft.saved === false));
    assert.ok(drafts.every(draft => draft.answerKey.length === questionCount - questionCount / 10));
  }
});

test('cancel during Friday stops further batches and never returns a late collection', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 30, signal: controller.signal,
    generateText: async (prompt, options) => {
      calls += 1;
      const result = await fakeProvider(prompt, options);
      if (prompt.includes('Daily source: {"day":"Friday"')) controller.abort();
      return result;
    },
  }), error => error.code === 'GENERATION_CANCELLED');
  assert.equal(calls, 13);
});

for (const questionCount of [20, 30, 40]) test(`${questionCount} questions per day: five private, mixed, aligned drafts`, async () => {
  let calls = 0;
  const progress = [];
  const result = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount, generateText: async (...args) => {
    calls += 1; return fakeProvider(...args);
  }, progress: event => progress.push(event) });
  assert.equal(calls, questionCount / 10 * 5);
  assert.equal(progress.length, calls * 2);
  assert.equal(progress.at(-1).providerCalls, calls);
  assert.equal(progress.filter(event => event.completed).length, calls);
  assert.deepEqual(result.map(draft => draft.day), days);
  assert.ok(result.every(draft => draft.questions.length === questionCount && draft.saved === false));
  assert.ok(result.every(draft => new Set(draft.questions.map(item => item.localId)).size === questionCount));
  assert.ok(result.every(draft => new Set(draft.questions.map(item => item.item_type)).size === 4));
  assert.ok(result.every(draft => draft.questions.every(item => item.question.includes(draft.day))));
  assert.ok(result.every(draft => draft.answerKey.length === questionCount - questionCount / 10));
  assert.ok(result.every(draft => draft.questions.filter(item => item.item_type === 'essay').every(item =>
    item.essay.referenceAnswer && item.essay.rubric[0].points === item.points)));
  assert.ok(result.every(draft => draft.questions.filter(item => item.item_type === 'enumeration').every(item =>
    item.enumeration.alternatives[0] === 'linya, saknong' && item.enumeration.orderSensitive === false)));
  assert.ok(result.every(draft => draft.answerKey.every(key => draft.questions.some(item => item.localId === key.localId))));
});

for (const questionCount of [20, 30, 40]) test(`${questionCount} questions per day accepts unambiguous provider formatting`, async () => {
  let calls = 0;
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount, generateText: async (prompt, options) => {
    calls += 1;
    const value = JSON.parse(await fakeProvider(prompt, options));
    value.questions[0].options = [' Tula ', 'Awit', 'Dula'];
    value.questions[0].correct_answer = ' tula ';
    value.questions[4].correct_answer = ' true ';
    value.questions[7].options = null;
    value.questions[9].options = null;
    value.questions[9].correct_answer = null;
    return JSON.stringify(value);
  } });
  assert.equal(calls, questionCount / 10 * 5);
  assert.deepEqual(drafts.map(draft => draft.day), days);
  for (const draft of drafts) {
    assert.equal(draft.questions.length, questionCount);
    assert.equal(draft.answerKey[0].correct_answer, 'Tula');
    assert.equal(draft.answerKey[4].correct_answer, 'True');
    assert.deepEqual(draft.questions[0].options, ['Tula', 'Awit', 'Dula']);
    assert.deepEqual(draft.questions[7].options, []);
    assert.deepEqual(draft.questions[9].options, []);
    assert.equal(draft.questions[9].essay.referenceAnswer, 'The taludtod develops the central idea.');
    assert.equal(draft.questions[9].essay.rubric[0].points, 1);
  }
});

test('ambiguous and missing answer keys still reject one batch without a partial collection', async () => {
  for (const change of [
    value => { value.questions[0].correct_answer = 'Tula or Awit'; },
    value => { value.questions[0].options = [' Tula ', 'tula', 'Dula']; },
    value => { value.questions[4].correct_answer = null; },
  ]) {
    let calls = 0;
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      generateText: async (prompt, options) => {
        calls += 1;
        const value = JSON.parse(await fakeProvider(prompt, options));
        if (prompt.includes('"day":"Tuesday"') && prompt.includes('batch 1')) change(value);
        return JSON.stringify(value);
      } }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation?.day === 'Tuesday'
        && error.validation?.batch === 1 && error.validation?.category === 'invalid_answer_key'
        && error.providerCalls === 3);
    assert.equal(calls, 3);
  }
});

test('rejects inadequate source, short batches, duplicated questions and malformed keys without filler', async () => {
  assert.throws(() => validateWeeklySources(sources.slice(0, 4)), /five daily/);
  assert.throws(() => validateWeeklySources(sources.map((source, index) => index === 2
    ? { ...source, assessment: '' } : source)), /Wednesday/);
  let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: async (prompt, options) => {
    calls += 1;
    const value = JSON.parse(await fakeProvider(prompt, options));
    if (prompt.includes('"day":"Tuesday"') && prompt.includes('batch 1')) {
      value.questions.pop(); value.coverageLimitation = 'Tuesday source only supports nine distinct items.';
    }
    return JSON.stringify(value);
  } }), error => error.validation?.category === 'content_coverage' && error.validation.day === 'Tuesday');
  assert.equal(calls, 3);
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: async (prompt, options) => {
    const value = JSON.parse(await fakeProvider(prompt, options));
    if (prompt.includes('batch 2')) value.questions[0].question = item('Monday', 1, 0).question;
    return JSON.stringify(value);
  } }), error => error.validation?.category === 'duplicate_question');
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: async (prompt, options) => {
    const value = JSON.parse(await fakeProvider(prompt, options));
    if (prompt.includes('"day":"Tuesday"') && prompt.includes('batch 1')) {
      value.questions[0].question = item('Monday', 1, 0).question.replace('Monday', 'Tuesday');
    }
    return JSON.stringify(value);
  } }), error => error.validation?.category === 'duplicate_question' && error.validation?.day === 'Tuesday');
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: async (prompt, options) => {
    const value = JSON.parse(await fakeProvider(prompt, options));
    value.questions[0].correct_answer = 'Missing option';
    return JSON.stringify(value);
  } }), error => error.validation?.category === 'invalid_answer_key');
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: async (prompt, options) => {
    const value = JSON.parse(await fakeProvider(prompt, options));
    value.questions[7].enumeration.alternatives = ['missing second answer'];
    return JSON.stringify(value);
  } }), error => error.validation?.category === 'invalid_field');
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async () => '{"title":' }), error => error.validation?.category === 'syntax');
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, generateText: async (prompt, options) => {
    const value = JSON.parse(await fakeProvider(prompt, options));
    value.questions = value.questions.map((entry, index) => ({ ...entry, item_type: 'multiple_choice',
      options: ['A', 'B'], correct_answer: 'A', essay: undefined, enumeration: undefined,
      question: `${entry.question} choice ${index}` }));
    return JSON.stringify(value);
  } }), error => error.validation?.category === 'type_distribution');
  assert.match(buildWeeklyWorksheetPrompt(plan, sources[0]), /Never pad/);
});

test('accepts a source-specific three-type mix only with an explanation', async () => {
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      const value = JSON.parse(await fakeProvider(prompt, options));
      value.questions[9] = { ...value.questions[9], item_type: 'true_false', correct_answer: 'True', essay: undefined };
      value.coverageLimitation = 'The short source activity does not support a meaningful essay.';
      return JSON.stringify(value);
    } });
  assert.ok(drafts.every(draft => draft.typeDistribution.essay === 0 && draft.typeDistribution.true_false === 8));
  assert.ok(drafts.every(draft => draft.distributionNote.includes('meaningful essay')));
});
