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
  if (index < 4) return { ...base, item_type: 'multiple_choice', options: ['Tula', 'Awit', 'Dula', 'Alamat'], correct_answer: 'Tula' };
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

const withProviderChain = run => withLocalGroq(async () => {
  const previous = { chain: process.env.WEEKLY_WORKSHEET_PROVIDERS,
    groq: process.env.GROQ_API_KEY, mistral: process.env.MISTRAL_API_KEY };
  process.env.WEEKLY_WORKSHEET_PROVIDERS = 'groq:openai/gpt-oss-120b,groq:llama-3.3-70b-versatile,mistral:mistral-small-latest';
  process.env.GROQ_API_KEY = 'synthetic-groq-key';
  process.env.MISTRAL_API_KEY = 'synthetic-mistral-key';
  try { return await run(); } finally {
    for (const [name, value] of [['WEEKLY_WORKSHEET_PROVIDERS', previous.chain],
      ['GROQ_API_KEY', previous.groq], ['MISTRAL_API_KEY', previous.mistral]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

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

test('local Groq logs only sanitized 429 code and numeric reset hints before a successful retry', async () => withLocalGroq(async () => {
  const clock = fakeClock(); const logs = []; let calls = 0;
  const drafts = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('synthetic prompt and secret'), {
        code: 'PROVIDER_RATE_LIMIT', httpStatus: 429, providerErrorCode: 'rate_limit',
        retryAfterSeconds: 1, resetTokensMs: 250, resetRequestsMs: 500 });
      return fakeProvider(prompt, options);
    } }), clock);
  assert.equal(drafts.length, 5);
  assert.equal(calls, 11);
  assert.ok(logs.some(value => /status=429 providerErrorCode=rate_limit retryAfterSeconds=1 resetTokensMs=250 resetRequestsMs=500/.test(value)));
  assert.ok(logs.every(value => !/synthetic prompt and secret|panitikan|taludtod/.test(value)));
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

test('Gemini does not regenerate an invalid true/false batch', async () => {
  const previous = process.env.WEEKLY_WORKSHEET_PROVIDER; let calls = 0;
  process.env.WEEKLY_WORKSHEET_PROVIDER = 'gemini';
  try {
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      generateText: async (prompt, options) => {
        calls += 1;
        const value = JSON.parse(await fakeProvider(prompt, options));
        value.questions[4].correct_answer = 'Tama';
        return JSON.stringify(value);
      },
    }), error => error.code === 'AI_RESPONSE_INVALID' && error.providerCalls === 1
      && error.validation?.subreason === 'true_false_answer_invalid');
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
  for (const phrase of ['non-empty, comma-separated', 'first item, second item',
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

test('weekly prompt states quality rules while retaining count, mix, coverage and enumeration instructions', () => {
  const prompt = buildWeeklyWorksheetPrompt(plan, sources[0]);
  const languageRule = prompt.split('\n').find(line => line.startsWith('Determine output language'));
  assert.ok(languageRule);
  for (const phrase of ['lesson title and daily source (objective, activity, assessment, competency)',
    'worksheet title', 'directions', 'questions', 'options', 'correct answers', 'model answers',
    'essay rubric criteria', 'any coverage note', 'English source means English only',
    'Filipino source means Filipino only', 'technical terms and proper nouns that appear in the source',
    'JSON keys, question type names, and True/False answer values stay exactly as the schema requires',
    'never translate them']) assert.ok(languageRule.includes(phrase), `Missing language instruction: ${phrase}`);
  assert.ok(!prompt.includes('katapatan'));
  for (const phrase of [
    'multiple_choice=1, true_false=1, enumeration=2, essay=5',
    'each essay rubric must sum to 5',
    'minWords=80 and maxWords=150',
    'unless the source requires otherwise',
    'referenceAnswer concise and within those bounds',
    'include its full text in the question',
    'Never ask students to analyze a text that is not provided',
    'consistent with that text and other items',
    'Use only this day\'s objective, activity, assessment, and relevant weekly competency.',
    'Return {"title":"...","directions":"...","questions":[...],"coverageLimitation":""}.',
    'True/false needs True or False as correct_answer.',
    'Multiple choice needs exactly 4 distinct, non-blank plain-text options and an exact matching correct_answer.',
    'plausible multiple-choice distractors',
    'exactly one defensible correct option',
    'Never include a question\'s own answer',
    'reveal another item\'s answer',
    'different source concepts or tasks',
    'do not reword earlier questions from the same day',
    'Create exactly 10 distinct worksheet questions',
    'Aim for 4 multiple_choice, 3 true_false, 2 enumeration, 1 essay per 10',
    'return fewer with a brief coverageLimitation',
    'enumeration.alternatives: []',
    'orderSensitive is true only when order matters',
  ]) assert.ok(prompt.includes(phrase), `Missing weekly prompt instruction: ${phrase}`);
});

test('weekly batch rejects three-option multiple choice at the options path', () => {
  const entry = JSON.parse(response('Monday', 1));
  entry.questions[0].options.pop();
  assert.throws(() => parseDailyBatch(JSON.stringify(entry), plan, sources[0], 10, 1), error =>
    error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'invalid_field'
    && error.validation.path === 'questions[0].options' && error.validation.day === 'Monday');
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
  options.onHttpStatus?.(200);
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

test('chain falls from a primary 429 to the second Groq model and skips cooldown later', async () => withProviderChain(async () => {
  const models = []; const logs = []; const progress = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, progress: value => progress.push(value),
    generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      if (options.providerConfig.model === 'openai/gpt-oss-120b')
        throw Object.assign(new Error('synthetic rate limit'), { code: 'PROVIDER_RATE_LIMIT',
          httpStatus: 429, retryAfterSeconds: 60, resetTokensMs: 12000, resetRequestsMs: 3000,
          providerErrorCode: 'rate_limit' });
      return fakeProvider(prompt, options);
    } });
  assert.equal(drafts.length, 5);
  assert.deepEqual(models.slice(0, 2), ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
  assert.equal(models.filter(model => model === 'openai/gpt-oss-120b').length, 1);
  assert.equal(progress.at(-1).providerCalls, 11);
  assert.ok(logs.some(value => /provider=groq model=openai\/gpt-oss-120b .*status=429/.test(value)));
  assert.ok(logs.some(value => /status=429 .*providerErrorCode=rate_limit retryAfterSeconds=60 resetTokensMs=12000 resetRequestsMs=3000/.test(value)));
  assert.ok(logs.some(value => /provider=groq model=llama-3\.3-70b-versatile .*status=200/.test(value)));
  assert.ok(logs.every(value => !/synthetic-groq-key|synthetic-mistral-key|panitikan|taludtod/.test(value)));
}));

test('provider timeout fails over for one batch without disabling that entry', async () => withProviderChain(async () => {
  const models = []; const logs = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      if (models.length === 1) throw Object.assign(new Error('synthetic timeout'), { code: 'PROVIDER_TIMEOUT' });
      return fakeProvider(prompt, options);
    } });
  assert.equal(drafts.length, 5);
  assert.deepEqual(models.slice(0, 3), ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b']);
  assert.equal(models.length, 11);
  assert.ok(logs.some(value => /model=openai\/gpt-oss-120b .*status=unknown .*code=PROVIDER_TIMEOUT/.test(value)));
  assert.ok(logs.every(value => !/synthetic timeout|synthetic-groq-key|panitikan/.test(value)));
}));

test('multiple-choice invalid key retries the same model then fails over with a fresh prompt', async () => withProviderChain(async () => {
  const models = []; const prompts = []; const logs = []; const progress = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, progress: value => progress.push(value),
    generateText: async (prompt, options) => {
      models.push(options.providerConfig.model); prompts.push(prompt);
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (models.length <= 2) value.questions[0].correct_answer = 'A';
      return JSON.stringify(value);
    } });
  assert.equal(drafts.length, 5);
  assert.deepEqual(models.slice(0, 3), ['openai/gpt-oss-120b', 'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile']);
  assert.match(prompts[1], /correct_answer must exactly match one option text/);
  assert.doesNotMatch(prompts[2], /Retry this batch:/);
  assert.equal(progress.at(-1).providerCalls, 12);
  assert.equal(logs.filter(value => /stage=answer-key-shape/.test(value)).length, 2);
  assert.ok(logs.some(value => /answerType=string answerLength=1 singleLetterAD=true matchesOptionText=false/.test(value)));
  assert.ok(logs.every(value => !/synthetic-groq-key|panitikan|taludtod|correct_answer":"A"/.test(value)));
}));

test('invalid_field gets one same-model retry before another chain entry', async () => withProviderChain(async () => {
  const models = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (models.length === 1) value.questions[0].points = 0;
      return JSON.stringify(value);
    } });
  assert.equal(drafts.length, 5);
  assert.deepEqual(models.slice(0, 2), ['openai/gpt-oss-120b', 'openai/gpt-oss-120b']);
  assert.equal(models.length, 11);
}));

test('invalid options retry once on the same model and then succeed', async () => withProviderChain(async () => {
  const models = []; const prompts = []; const logs = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model); prompts.push(prompt);
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (models.length === 1) value.questions[3].options[1] = null;
      return JSON.stringify(value);
    } });
  assert.equal(drafts.length, 5);
  assert.equal(models.length, 11);
  assert.deepEqual(models.slice(0, 2), ['openai/gpt-oss-120b', 'openai/gpt-oss-120b']);
  assert.ok(prompts[1].startsWith(prompts[0]));
  assert.ok(prompts[1].includes('Retry this batch: options must be arrays'));
  assert.ok(logs.some(value => /stage=options-shape .*questionIndex=3 optionsType=object optionsIsArray=true arrayLength=4/.test(value)));
}));

test('invalid options retry once then fail over with a fresh prompt', async () => withProviderChain(async () => {
  const models = []; const prompts = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model); prompts.push(prompt);
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (models.length <= 2) value.questions[3].options[1] = null;
      return JSON.stringify(value);
    } });
  assert.equal(drafts.length, 5);
  assert.equal(models.length, 12);
  assert.deepEqual(models.slice(0, 3), ['openai/gpt-oss-120b', 'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile']);
  assert.ok(prompts[1].includes('Retry this batch: options must be arrays'));
  assert.ok(!prompts[2].includes('Retry this batch:'));
}));

test('invalid options log only bounded shape, including the failed element index', async () => withLocalGroq(async () => {
  const logs = []; let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      value.questions[3].options = calls === 1
        ? ['A. PRIVATE_OPTION', 'A. PRIVATE_OPTION', '', 'B) medium text', `C) ${'x'.repeat(100)}`, 42]
        : null;
      return JSON.stringify(value);
    } }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation.category === 'invalid_field'
      && error.validation.path === 'questions[3].options' && error.providerCalls === 2);
  assert.ok(logs.some(value => /questionIndex=3 optionsType=object optionsIsArray=true arrayLength=6 elementTypes=string,string,string,string,string,number lengthBuckets=10-99,10-99,0,10-99,100\+,na letterLabels=true,true,false,true,true,false duplicateExact=true invalidOptionIndex=2 shapeTruncated=false/.test(value)));
  assert.ok(logs.some(value => /questionIndex=3 optionsType=object optionsIsArray=false elementTypes=none lengthBuckets=none letterLabels=none duplicateExact=false invalidOptionIndex=none/.test(value)));
  assert.ok(logs.every(value => !/PRIVATE_OPTION|B\) medium text|Tula|Awit|Dula|panitikan|taludtod/.test(value)));
}));

test('multiple-choice validation exhausts the chain after at most two calls per entry', async () => withProviderChain(async () => {
  const models = [];
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      const value = JSON.parse(await fakeProvider(prompt, options));
      value.questions[0].correct_answer = 'A';
      return JSON.stringify(value);
    } }), error => error.code === 'AI_RESPONSE_INVALID'
      && error.validation.category === 'invalid_answer_key'
      && error.validation.questionType === 'multiple_choice' && error.providerCalls === 6);
  assert.deepEqual(models, ['openai/gpt-oss-120b', 'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile', 'llama-3.3-70b-versatile', 'mistral-small-latest', 'mistral-small-latest']);
}));

test('chain exhaustion preserves the validation error when the next entry has no key', async () => withProviderChain(async () => {
  const previousChain = process.env.WEEKLY_WORKSHEET_PROVIDERS;
  const previousKey = process.env.MISTRAL_API_KEY;
  process.env.WEEKLY_WORKSHEET_PROVIDERS = 'groq:openai/gpt-oss-120b,mistral:mistral-small-latest';
  delete process.env.MISTRAL_API_KEY;
  try {
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info() {} }, generateText: async (prompt, options) => {
        const value = JSON.parse(await fakeProvider(prompt, options));
        value.questions[0].correct_answer = 'A';
        return JSON.stringify(value);
      } }), error => error.code === 'AI_RESPONSE_INVALID'
        && error.validation.category === 'invalid_answer_key' && error.providerCalls === 2);
  } finally {
    process.env.WEEKLY_WORKSHEET_PROVIDERS = previousChain;
    if (previousKey === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = previousKey;
  }
}));

test('answer-key shape logs distinguish an option match from a non-string without exposing either', async () => withLocalGroq(async () => {
  const logs = []; let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (calls === 1) value.questions[0].options[1] = value.questions[0].options[0];
      else value.questions[0].correct_answer = 7;
      return JSON.stringify(value);
    } }), error => error.code === 'AI_RESPONSE_INVALID' && error.providerCalls === 2);
  assert.ok(logs.some(value => /answerType=string answerLength=4 singleLetterAD=false matchesOptionText=true/.test(value)));
  assert.ok(logs.some(value => /answerType=number singleLetterAD=false matchesOptionText=false/.test(value)));
  assert.ok(logs.every(value => !/Tula|Awit|Dula|panitikan|taludtod/.test(value)));
}));

test('chain reaches Mistral after both Groq entries fail', async () => withProviderChain(async () => {
  const models = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      const { model, name } = options.providerConfig;
      models.push(`${name}:${model}`);
      if (prompt.includes('Monday, batch 1.') && name === 'groq')
        throw Object.assign(new Error('synthetic rejection'), { code: 'PROVIDER_REJECTED', httpStatus: 400 });
      return fakeProvider(prompt, options);
    } });
  assert.equal(drafts.length, 5);
  assert.deepEqual(models.slice(0, 3), ['groq:openai/gpt-oss-120b',
    'groq:llama-3.3-70b-versatile', 'mistral:mistral-small-latest']);
}));

test('chain falls through 5xx and disables both Groq models after authentication fails', async () => withProviderChain(async () => {
  const models = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      if (models.length === 1) throw Object.assign(new Error('synthetic server error'), {
        code: 'PROVIDER_UNAVAILABLE', httpStatus: 500 });
      if (models.length === 2) throw Object.assign(new Error('synthetic auth error'), {
        code: 'PROVIDER_AUTH_FAILED', httpStatus: 401 });
      return fakeProvider(prompt, options);
    } });
  assert.equal(drafts.length, 5);
  assert.deepEqual(models.slice(0, 3), ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'mistral-small-latest']);
  assert.ok(models.slice(2).every(model => model === 'mistral-small-latest'));
}));

test('chain paces only the entry whose reported token budget is low', async () => withProviderChain(async () => {
  const clock = fakeClock(); const models = [];
  const drafts = await settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      if (options.providerConfig.name === 'groq') throw Object.assign(new Error('synthetic rate limit'), {
        code: 'PROVIDER_RATE_LIMIT', httpStatus: 429, retryAfterSeconds: 60 });
      options.onGroqUsage?.({ remainingTokens: models.length === 3 ? 100 : 8000,
        resetTokensMs: 10_000, totalTokens: 2000 });
      return fakeProvider(prompt, options);
    } }), clock);
  assert.equal(drafts.length, 5);
  assert.equal(clock.now(), 10_000);
  assert.equal(models.length, 12);
  assert.deepEqual(models.slice(0, 3), ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'mistral-small-latest']);
}));

test('chain keeps fallbacks idle when primary succeeds and retries validation on that provider', async () => withProviderChain(async () => {
  const models = []; let calls = 0;
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      calls += 1;
      models.push(options.providerConfig.model);
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (calls === 1) value.questions[4].correct_answer = 'Tama';
      return JSON.stringify(value);
    } });
  assert.equal(drafts.length, 5);
  assert.equal(calls, 11);
  assert.ok(models.every(model => model === 'openai/gpt-oss-120b'));
}));

test('chain fails closed after all providers fail and skips missing keys by name', async () => withProviderChain(async () => {
  const logs = []; const models = [];
  const generateText = async (_prompt, options) => {
    models.push(options.providerConfig.model);
    throw Object.assign(new Error('synthetic failure'), { code: 'PROVIDER_REJECTED', httpStatus: 400 });
  };
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, generateText }), error =>
    error.providerChainExhausted === true && error.providerCalls === 3 && error.code === 'PROVIDER_REJECTED');
  assert.equal(models.length, 3);
  delete process.env.MISTRAL_API_KEY;
  models.length = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: value => logs.push(value) }, generateText }), error =>
    error.providerChainExhausted === true && error.providerCalls === 2);
  assert.equal(models.length, 2);
  assert.ok(logs.some(value => /provider=mistral model=mistral-small-latest skip=key_not_set/.test(value)));
}));

test('chain skips NVIDIA with no key and uses the next configured entry', async () => withProviderChain(async () => {
  const previousChain = process.env.WEEKLY_WORKSHEET_PROVIDERS;
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.WEEKLY_WORKSHEET_PROVIDERS = 'nvidia:nvidia/nemotron-3-ultra-550b-a55b,groq:openai/gpt-oss-120b';
  delete process.env.NVIDIA_API_KEY;
  try {
    const logs = []; const models = [];
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
        models.push(options.providerConfig.model);
        return fakeProvider(prompt, options);
      } });
    assert.equal(drafts.length, 5);
    assert.ok(models.every(model => model === 'openai/gpt-oss-120b'));
    assert.ok(logs.some(value => /provider=nvidia .*skip=key_not_set/.test(value)));
    assert.ok(logs.every(value => !/synthetic-groq-key|synthetic-mistral-key|panitikan|taludtod/.test(value)));
    process.env.WEEKLY_WORKSHEET_PROVIDERS = 'nvidia:nvidia/nemotron-3-ultra-550b-a55b';
    await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info() {} }, generateText: async () => { throw new Error('must not call provider'); } }),
    error => error.code === 'PROVIDER_NOT_CONFIGURED' && error.providerCalls === 0);
  } finally {
    process.env.WEEKLY_WORKSHEET_PROVIDERS = previousChain;
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
  }
}));

test('chain skips Cloudflare if token or account ID is missing or the account ID is invalid', async () => withProviderChain(async () => {
  const previous = { chain: process.env.WEEKLY_WORKSHEET_PROVIDERS,
    token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID };
  const accountId = '0123456789abcdef0123456789abcdef';
  const token = 'synthetic-cloudflare-token';
  process.env.WEEKLY_WORKSHEET_PROVIDERS = 'cloudflare:@cf/openai/gpt-oss-120b,groq:openai/gpt-oss-120b';
  try {
    for (const [setToken, account, skip] of [
      [false, accountId, 'key_not_set'], [true, undefined, 'key_not_set'],
      [true, 'invalid-account-id', 'invalid_account_id'],
    ]) {
      if (setToken) process.env.CLOUDFLARE_API_TOKEN = token;
      else delete process.env.CLOUDFLARE_API_TOKEN;
      if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = account;
      const logs = []; const models = [];
      const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
        log: { info: line => logs.push(line) }, generateText: async (prompt, options) => {
          models.push(options.providerConfig.model);
          return fakeProvider(prompt, options);
        } });
      assert.equal(drafts.length, 5);
      assert.ok(models.every(model => model === 'openai/gpt-oss-120b'));
      assert.ok(logs.some(line => line.includes(`provider=cloudflare model=@cf/openai/gpt-oss-120b skip=${skip}`)));
      assert.ok(logs.every(line => !line.includes(token) && !line.includes(accountId)
        && !line.includes('invalid-account-id') && !line.includes('api.cloudflare.com')));
    }
    process.env.CLOUDFLARE_API_TOKEN = token;
    process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
    const models = [];
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info() {} }, generateText: async (prompt, options) => {
        models.push(options.providerConfig.model);
        return fakeProvider(prompt, options);
      } });
    assert.equal(drafts.length, 5);
    assert.ok(models.every(model => model === '@cf/openai/gpt-oss-120b'));
  } finally {
    for (const [name, value] of [['WEEKLY_WORKSHEET_PROVIDERS', previous.chain],
      ['CLOUDFLARE_API_TOKEN', previous.token], ['CLOUDFLARE_ACCOUNT_ID', previous.account]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}));

test('Cloudflare call logs cannot echo account ID or token through model or error metadata', async () => withProviderChain(async () => {
  const previous = { chain: process.env.WEEKLY_WORKSHEET_PROVIDERS,
    token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID };
  const accountId = 'abcdef0123456789abcdef0123456789';
  const token = 'synthetic-cloudflare-token';
  process.env.WEEKLY_WORKSHEET_PROVIDERS = `cloudflare:${accountId},groq:openai/gpt-oss-120b`;
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  process.env.CLOUDFLARE_API_TOKEN = token;
  try {
    const logs = [];
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info: line => logs.push(line) }, generateText: async (prompt, options) => {
        if (options.provider === 'cloudflare') throw Object.assign(new Error('synthetic failure'), {
          code: 'PROVIDER_REJECTED', httpStatus: 400, providerErrorCode: accountId,
        });
        return fakeProvider(prompt, options);
      } });
    assert.equal(drafts.length, 5);
    assert.ok(logs.some(line => /provider=cloudflare model=redacted .*status=400/.test(line)));
    assert.ok(logs.every(line => !line.includes(accountId) && !line.includes(token)
      && !line.includes('api.cloudflare.com')));
  } finally {
    for (const [name, value] of [['WEEKLY_WORKSHEET_PROVIDERS', previous.chain],
      ['CLOUDFLARE_API_TOKEN', previous.token], ['CLOUDFLARE_ACCOUNT_ID', previous.account]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}));

test('truncated and empty provider responses fail over directly and log safe finish reasons', async () => withProviderChain(async () => {
  for (const [code, reportedReason, loggedReason] of [
    ['PROVIDER_TRUNCATED', 'LENGTH', 'LENGTH'], ['PROVIDER_INVALID_RESPONSE', 'STOP', 'STOP'],
    ['PROVIDER_INVALID_RESPONSE', 'PRIVATE_REASON', 'UNKNOWN'],
  ]) {
    const models = []; const logs = [];
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info: line => logs.push(line) }, generateText: async (prompt, options) => {
        models.push(options.providerConfig.model);
        options.onHttpStatus?.(200);
        options.onFinishReason?.(models.length === 1 ? reportedReason : 'STOP');
        if (models.length === 1) throw Object.assign(new Error('synthetic response failure'), { code });
        return fakeProvider(prompt, options);
      } });
    assert.equal(drafts.length, 5);
    assert.deepEqual(models.slice(0, 3), ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b']);
    assert.equal(models.length, 11);
    assert.ok(logs.some(line => line.includes(`finishReason=${loggedReason}`)
      && line.includes(`code=${code}`)));
    assert.equal(logs.filter(line => /provider=.*finishReason=/.test(line)).length, 11);
    assert.ok(logs.every(line => !line.includes('synthetic response failure')
      && !line.includes('PRIVATE_REASON')));
  }
}));

test('truncation exhausts the chain without same-model retries or partial drafts', async () => withProviderChain(async () => {
  const models = []; const logs = [];
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info: line => logs.push(line) }, generateText: async (_prompt, options) => {
      models.push(options.providerConfig.model);
      options.onHttpStatus?.(200);
      options.onFinishReason?.('LENGTH');
      throw Object.assign(new Error('synthetic truncation'), { code: 'PROVIDER_TRUNCATED',
        finishReason: 'LENGTH' });
    } }), error => error.code === 'PROVIDER_TRUNCATED' && error.providerChainExhausted === true
      && error.providerCalls === 3);
  assert.deepEqual(models, ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'mistral-small-latest']);
  assert.equal(logs.filter(line => /provider=.*finishReason=LENGTH/.test(line)).length, 3);
}));

test('chain selects NVIDIA when its key is configured', async () => withProviderChain(async () => {
  const previousChain = process.env.WEEKLY_WORKSHEET_PROVIDERS;
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.WEEKLY_WORKSHEET_PROVIDERS = 'nvidia:nvidia/nemotron-3-ultra-550b-a55b,groq:openai/gpt-oss-120b';
  process.env.NVIDIA_API_KEY = 'synthetic-nvidia-key';
  try {
    const models = []; const logs = [];
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
        models.push(options.providerConfig.model);
        return fakeProvider(prompt, options);
      } });
    assert.equal(drafts.length, 5);
    assert.equal(models.length, 10);
    assert.ok(models.every(model => model === 'nvidia/nemotron-3-ultra-550b-a55b'));
    assert.ok(logs.every(value => !/synthetic-nvidia-key|panitikan|taludtod/.test(value)));
  } finally {
    process.env.WEEKLY_WORKSHEET_PROVIDERS = previousChain;
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
  }
}));

test('NVIDIA call log includes thinking state and numeric usage without content', async () => withProviderChain(async () => {
  const previousChain = process.env.WEEKLY_WORKSHEET_PROVIDERS;
  const previousKey = process.env.NVIDIA_API_KEY;
  process.env.WEEKLY_WORKSHEET_PROVIDERS = 'nvidia:nvidia/nemotron-3-ultra-550b-a55b';
  process.env.NVIDIA_API_KEY = 'synthetic-nvidia-key';
  try {
    const logs = [];
    const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
      log: { info: value => logs.push(value) }, generateText: async (prompt, options) => {
        options.onRequestMetadata?.({ thinking: 'false' });
        options.onGroqUsage?.({ promptTokens: 120, completionTokens: 45, totalTokens: 165,
          reasoningTokens: 30 });
        return fakeProvider(prompt, options);
      } });
    assert.equal(drafts.length, 5);
    assert.equal(logs.filter(value => /provider=nvidia .*thinking=false promptTokens=120 completionTokens=45 totalTokens=165 reasoningTokens=30/.test(value)).length, 10);
    assert.ok(logs.every(value => !/synthetic-nvidia-key|panitikan|taludtod|synthetic private reasoning/.test(value)));
  } finally {
    process.env.WEEKLY_WORKSHEET_PROVIDERS = previousChain;
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
  }
}));

test('short batch retries once on the same model with the exact count instruction', async () => withProviderChain(async () => {
  const models = []; const prompts = []; const progress = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, progress: value => progress.push(value), generateText: async (prompt, options) => {
      models.push(options.providerConfig.model); prompts.push(prompt);
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (models.length === 1) value.questions.pop();
      return JSON.stringify(value);
    } });
  assert.equal(drafts.length, 5);
  assert.equal(progress.at(-1).providerCalls, 11);
  assert.ok(models.every(model => model === 'openai/gpt-oss-120b'));
  assert.match(prompts[1], /Retry this batch: return exactly 10 questions/);
}));

test('extra questions are not truncated and a second count failure returns no drafts', async () => withProviderChain(async () => {
  const models = [];
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    log: { info() {} }, generateText: async (prompt, options) => {
      models.push(options.providerConfig.model);
      const value = JSON.parse(await fakeProvider(prompt, options));
      value.questions.push({ ...value.questions[0], question: 'Synthetic extra question.' });
      return JSON.stringify(value);
    } }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation.category === 'question_count'
      && error.providerCalls === 6 && error.validation.receivedCount === 11);
  assert.deepEqual(models, ['openai/gpt-oss-120b', 'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile', 'llama-3.3-70b-versatile', 'mistral-small-latest', 'mistral-small-latest']);
}));

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

test('local Groq regenerates one duplicate batch with rejected questions excluded', async () => withLocalGroq(async () => {
  let calls = 0; let retryPrompt;
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (prompt.includes('Monday, batch 2.')) {
        if (retryPrompt === undefined && calls === 2) value.questions[0].question = item('Monday', 1, 0).question;
        else retryPrompt = prompt;
      }
      return JSON.stringify(value);
    },
  });
  assert.equal(calls, 11);
  assert.equal(drafts.length, 5);
  assert.match(retryPrompt, /Rejected batch questions \(do not repeat these\):/);
  assert.ok(retryPrompt.includes(JSON.stringify(item('Monday', 1, 0).question)));
}));

test('local Groq stops after a second duplicate without returning partial worksheets', async () => withLocalGroq(async () => {
  let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (prompt.includes('Monday, batch 2.')) value.questions[0].question = item('Monday', 1, 0).question;
      return JSON.stringify(value);
    },
  }), error => error.code === 'AI_RESPONSE_INVALID' && error.validation?.subreason === 'duplicate_prior_batch'
    && error.validation.path === 'questions' && error.providerCalls === 3);
  assert.equal(calls, 3);
}));

test('local Groq regenerates one invalid true/false batch and counts the retry', async () => withLocalGroq(async () => {
  let calls = 0; const progress = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    progress: event => progress.push(event), generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (calls === 1) value.questions[4].correct_answer = 'Tama';
      return JSON.stringify(value);
    },
  });
  assert.equal(calls, 11);
  assert.equal(progress.at(-1).providerCalls, 11);
  assert.equal(drafts.length, 5);
}));

test('local Groq retries a three-option MCQ batch and accepts four options', async () => withLocalGroq(async () => {
  let calls = 0; const optionCounts = [];
  const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      if (calls === 1) value.questions[0].options.pop();
      optionCounts.push(value.questions[0].options.length);
      return JSON.stringify(value);
    },
  });
  assert.deepEqual(optionCounts.slice(0, 2), [3, 4]);
  assert.equal(calls, 11);
  assert.equal(drafts.length, 5);
  assert.equal(drafts[0].questions[0].options.length, 4);
}));

test('local Groq rejects a second invalid true/false answer with its safe subreason', async () => withLocalGroq(async () => {
  let calls = 0;
  await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    generateText: async (prompt, options) => {
      calls += 1;
      const value = JSON.parse(await fakeProvider(prompt, options));
      value.questions[4].correct_answer = 'Tama';
      return JSON.stringify(value);
    },
  }), error => error.code === 'AI_RESPONSE_INVALID' && error.providerCalls === 2
    && error.validation?.path === 'questions[4].correct_answer'
    && error.validation.subreason === 'true_false_answer_invalid');
  assert.equal(calls, 2);
}));

test('a 429 retry uses the same batch retry budget as answer-key regeneration', async () => withLocalGroq(async () => {
  const clock = fakeClock(); let calls = 0;
  await assert.rejects(settleWithClock(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20,
    pacingClock: clock, log: { info() {} }, generateText: async (prompt, options) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('rate limit'),
        { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds: 1 });
      const value = JSON.parse(await fakeProvider(prompt, options));
      value.questions[4].correct_answer = 'Tama';
      return JSON.stringify(value);
    },
  }), clock), error => error.code === 'AI_RESPONSE_INVALID' && error.providerCalls === 2
    && error.validation?.subreason === 'true_false_answer_invalid');
  assert.equal(calls, 2);
}));

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
    value.questions[0].options = [' Tula ', 'Awit', 'Dula', 'Alamat'];
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
    assert.deepEqual(draft.questions[0].options, ['Tula', 'Awit', 'Dula', 'Alamat']);
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
      options: ['A', 'B', 'C', 'D'], correct_answer: 'A', essay: undefined, enumeration: undefined,
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
