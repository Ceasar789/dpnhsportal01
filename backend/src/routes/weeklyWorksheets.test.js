import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWeeklyWorksheetDrafts } from '../lib/weeklyWorksheetGenerator.js';
import { weeklyWorksheetHandler } from './weeklyWorksheets.js';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({ day,
  objective: `Describe ${day} cells`, activity: `Observe ${day} cells`, assessment: `Explain ${day} cells` }));
const plan = { id: 'plan-1', teacher_id: 'teacher-1', ai_generated: true, title: 'Cells',
  objectives: `<p>${days.flatMap(day => [day.objective, day.activity, day.assessment]).join('</p><p>')}</p>` };
const invoke = async ({ body = { lessonPlanId: plan.id, sourceHtml: plan.objectives, days, questionCount: 30 },
  row = plan, loadError, generationError, generate, remoteAddress = '127.0.0.1' } = {}) => {
  const result = { status: 200, body: null };
  const res = { status(code) { result.status = code; return this; }, json(value) { result.body = value; return this; } };
  let generated = 0;
  const logs = [];
  await weeklyWorksheetHandler({ user: { id: 'teacher-1' }, body, socket: { remoteAddress } }, res, {
    loadPlan: async () => { if (loadError) throw loadError; return row; },
    generate: async (_plan, _days, options) => { generated += 1; if (generate) return generate(options);
      const { questionCount } = options;
      if (generationError) throw generationError;
      return days.map(day => ({ day: day.day, questions: Array.from({ length: questionCount }) })); },
    log: { error: message => logs.push(message), info: message => logs.push(message) },
  });
  return { ...result, generated, logs };
};

test('weekly worksheet route reads an owned saved AI row and never writes', async () => {
  const result = await invoke();
  assert.equal(result.status, 200);
  assert.equal(result.generated, 1);
  assert.equal(result.body.saved, false);
  assert.equal(result.body.questionCount, 30);
});

test('production worker gate prevents the long weekly HTTP generation path', async () => {
  const previous = process.env.VERCEL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'development';
  try {
    const result = await invoke();
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'GENERATION_WORKER_DISABLED');
    assert.equal(result.body.diagnostic, undefined);
    assert.equal(result.generated, 0);
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('weekly route reports batch progress and attempted provider calls on success', async () => {
  const result = await invoke({ generate: ({ progress, questionCount }) => {
    for (let calls = 1; calls <= 5 * questionCount / 10; calls += 1) {
      progress({ day: days[Math.floor((calls - 1) / (questionCount / 10))].day,
        batch: (calls - 1) % (questionCount / 10) + 1, completed: true, providerCalls: calls });
    }
    return days.map(day => ({ day: day.day, questions: Array.from({ length: questionCount }) }));
  } });
  assert.equal(result.body.providerCalls, 15);
  assert.equal(result.logs.length, 15);
  assert.match(result.logs.at(-1), /progress=completed providerCalls=15 plannedCalls=15/);
});

test('weekly worksheet route rejects foreign, changed, and incomplete sources before AI', async () => {
  assert.equal((await invoke({ row: { ...plan, teacher_id: 'other' } })).status, 409);
  assert.equal((await invoke({ body: { lessonPlanId: plan.id, sourceHtml: '<p>Different</p>', days } })).status, 409);
  const missing = await invoke({ body: { lessonPlanId: plan.id, sourceHtml: plan.objectives,
    days: days.map((day, index) => index === 1 ? { ...day, objective: '' } : day) } });
  assert.equal(missing.status, 422);
  assert.equal(missing.generated, 0);
  const invented = await invoke({ body: { lessonPlanId: plan.id, sourceHtml: plan.objectives,
    days: days.map((day, index) => index === 1 ? { ...day, objective: 'Invented Tuesday objective' } : day) } });
  assert.equal(invented.status, 422);
  assert.equal(invented.generated, 0);
  const inventedCompetency = await invoke({ body: { lessonPlanId: plan.id, sourceHtml: plan.objectives,
    days: days.map(day => ({ ...day, competency: 'Invented curriculum standard' })) } });
  assert.equal(inventedCompetency.status, 422);
  assert.equal(inventedCompetency.generated, 0);
  const invalidCount = await invoke({ body: { lessonPlanId: plan.id, sourceHtml: plan.objectives, days, questionCount: 4 } });
  assert.equal(invalidCount.status, 400);
  assert.equal(invalidCount.generated, 0);
});

test('weekly route accepts saved instructional text split by harmless inline formatting', async () => {
  const formatted = { ...plan, objectives: plan.objectives.replace('Describe Monday cells',
    'Describe <strong>Monday</strong> cells') };
  const result = await invoke({ row: formatted, body: {
    lessonPlanId: formatted.id, sourceHtml: formatted.objectives, days,
  } });
  assert.equal(result.status, 200);
  assert.equal(result.generated, 1);
});

test('weekly route reports a safe failure stage without exposing source or provider details', async () => {
  const planRead = await invoke({ loadError: new Error('private database detail') });
  assert.equal(planRead.status, 503);
  assert.equal(planRead.body.code, 'PLAN_READ_UNAVAILABLE');
  assert.equal(planRead.generated, 0);
  const truncated = await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_TRUNCATED' }) });
  assert.equal(truncated.status, 502);
  assert.equal(truncated.body.code, 'PROVIDER_TRUNCATED');
  assert.equal(truncated.body.retryable, false);
  assert.match(truncated.body.error, /ended before five worksheets/);
  assert.ok(!JSON.stringify(truncated).includes('private provider response'));
  const unavailable = await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_UNAVAILABLE' }) });
  assert.equal(unavailable.body.retryable, false);
  const rateLimited = await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_RATE_LIMIT' }) });
  assert.equal(rateLimited.status, 429);
  assert.equal(rateLimited.body.retryable, false);
  const daily = await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_DAILY_QUOTA', retryAfterSeconds: 3600, providerCalls: 7 }) });
  assert.equal(daily.status, 429);
  assert.equal(daily.body.retryAfterSeconds, 3600);
  assert.equal(daily.body.providerCalls, 7);
  assert.equal(daily.body.retryable, false);
  assert.equal((await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_OVERLOADED' }) })).status, 503);
  for (const code of ['PROVIDER_AUTH_FAILED', 'PROVIDER_ACCESS_DENIED']) {
    const blocked = await invoke({ generationError: Object.assign(new Error('private provider response'), { code }) });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.code, code);
    assert.doesNotMatch(JSON.stringify(blocked.body), /private provider response/);
  }
  assert.equal((await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_INTERRUPTED' }) })).body.retryable, false);
  const finish = await invoke({ generationError: Object.assign(new Error('private provider response'),
    { code: 'PROVIDER_TRUNCATED', finishReason: 'MAX_TOKENS' }) });
  assert.match(finish.logs[0], /finishReason=MAX_TOKENS/);
});

test('weekly route logs only allowlisted validation diagnostics', async () => {
  const result = await invoke({ generationError: Object.assign(new Error('private answer'), {
    code: 'AI_RESPONSE_INVALID', validation: { category: 'invalid_answer_key', path: 'days[2].questions[0].correct_answer' },
  }) });
  assert.equal(result.status, 502);
  assert.match(result.logs[0], /category=invalid_answer_key path=days\[2\]\.questions\[0\]\.correct_answer/);
  assert.doesNotMatch(JSON.stringify(result), /private answer/);
});

test('local validation response exposes only allowlisted Tuesday batch diagnostics', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const result = await invoke({ generationError: Object.assign(new Error('private answer key'), {
    code: 'AI_RESPONSE_INVALID', providerCalls: 3, finishReason: 'STOP',
    validation: { category: 'invalid_answer_key', path: 'questions[0].correct_answer', day: 'Tuesday',
      batch: 1, requestedCount: 10, receivedCount: 10, answerKey: 'private answer key' },
    }) });
    assert.equal(result.status, 502);
    assert.equal(result.body.code, 'AI_RESPONSE_INVALID');
    assert.equal(result.body.providerCalls, 3);
    assert.match(result.body.operationId, /^[a-f0-9-]+$/);
    assert.deepEqual(result.body.diagnostic, { day: 'Tuesday', batch: 1, category: 'invalid_answer_key',
      path: 'questions[0].correct_answer', requestedCount: 10, receivedCount: 10, finishReason: 'STOP' });
    assert.doesNotMatch(JSON.stringify(result.body), /private answer key/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('synthetic Tuesday batch 2 rejection keeps validation detail through the real generator and local route', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const result = await invoke({ body: { lessonPlanId: plan.id, sourceHtml: plan.objectives, days, questionCount: 20 },
      generate: options => generateWeeklyWorksheetDrafts(plan, days, { ...options,
        generateText: async prompt => {
          const [, day, batchText] = /^Create exactly 10 distinct worksheet questions for (\w+), batch (\d+)\./.exec(prompt);
          const batch = Number(batchText);
          const questions = Array.from({ length: 10 }, (_, index) => {
            const base = { question: `${day} batch ${batch} question ${index}`, points: 1, options: [] };
            if (index < 4) return { ...base, item_type: 'multiple_choice', options: ['A', 'B'], correct_answer: 'A' };
            if (index < 7) return { ...base, item_type: 'true_false', correct_answer: 'True' };
            if (index < 9) return { ...base, item_type: 'enumeration', correct_answer: 'one, two' };
            return { ...base, item_type: 'essay', correct_answer: '', essay: { referenceAnswer: 'Explanation.',
              minWords: 1, maxWords: 10, rubric: [{ criterion: 'Explains', points: 1 }] } };
          });
          if (day === 'Tuesday' && batch === 2) questions[0].question = 'Tuesday batch 1 question 0';
          return JSON.stringify({ title: `${day} worksheet`, directions: 'Answer each question.', questions });
        },
      }) });
    assert.equal(result.status, 502);
    assert.equal(result.body.code, 'AI_RESPONSE_INVALID');
    assert.equal(result.body.providerCalls, 4);
    assert.deepEqual(result.body.diagnostic, { day: 'Tuesday', batch: 2,
      category: 'duplicate_question', path: 'questions', subreason: 'duplicate_prior_batch',
      duplicateCount: 1, duplicates: [{ item_type: 'multiple_choice',
        normalizedLength: 'tuesday batch 1 question 0'.length, batchIndex: 0, priorIndex: 0 }],
      requestedCount: 10, receivedCount: 10 });
    assert.equal(result.body.worksheets, undefined);
    assert.doesNotMatch(JSON.stringify(result.body), /Tuesday batch 1 question 0|correct_answer/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('duplicate scope codes appear only in localhost diagnostics and never expose question text', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousVercel = process.env.VERCEL;
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL; delete process.env.VERCEL_ENV;
  try {
    for (const [subreason, path] of [['duplicate_within_batch', 'questions[1].question'],
      ['duplicate_prior_batch', 'questions'], ['duplicate_cross_day', 'questions']]) {
      const generationError = Object.assign(new Error('private question text'), {
        code: 'AI_RESPONSE_INVALID', validation: { category: 'duplicate_question', path,
          day: 'Tuesday', batch: 2, subreason, question: 'private question text',
          duplicateCount: 1, duplicates: [{ item_type: 'multiple_choice', normalizedLength: 27,
            batchIndex: 1, priorIndex: 0, question: 'private question text' }] },
      });
      const local = await invoke({ generationError });
      assert.equal(local.body.diagnostic.subreason, subreason);
      assert.equal(local.body.diagnostic.path, path);
      if (subreason === 'duplicate_cross_day') assert.equal(local.body.diagnostic.duplicates, undefined);
      else assert.deepEqual(local.body.diagnostic.duplicates, [{ item_type: 'multiple_choice',
        normalizedLength: 27, batchIndex: 1, priorIndex: 0 }]);
      assert.doesNotMatch(JSON.stringify(local), /private question text/);
      const lan = await invoke({ generationError, remoteAddress: '192.168.1.10' });
      assert.equal(lan.body.diagnostic, undefined);
      assert.doesNotMatch(JSON.stringify(lan), /private question text/);
    }
    const malformed = await invoke({ generationError: Object.assign(new Error('private question text'), {
      code: 'AI_RESPONSE_INVALID', validation: { category: 'duplicate_question', path: 'questions',
        day: 'Tuesday', batch: 2, subreason: 'duplicate_prior_batch', duplicateCount: 1,
        duplicates: [{ item_type: 'private question text', normalizedLength: 27,
          batchIndex: 1, priorIndex: 0 }] },
    }) });
    assert.equal(malformed.body.diagnostic.duplicates, undefined);
    assert.equal(malformed.body.diagnostic.duplicateCount, undefined);
    assert.doesNotMatch(JSON.stringify(malformed), /private question text/);
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await invoke()).body.diagnostic, undefined);
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    assert.equal((await invoke()).body.diagnostic, undefined);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
  }
});

test('capture permission uses the localhost diagnostics gate', async () => {
  const previous = { node: process.env.NODE_ENV, vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV, capture: process.env.WEEKLY_DEBUG_CAPTURE };
  process.env.NODE_ENV = 'development';
  process.env.WEEKLY_DEBUG_CAPTURE = '1';
  delete process.env.VERCEL; delete process.env.VERCEL_ENV;
  const observed = [];
  const generate = options => {
    observed.push(options.debugCapture);
    return days.map(day => ({ day: day.day, questions: Array.from({ length: options.questionCount }) }));
  };
  try {
    await invoke({ generate });
    await invoke({ generate, remoteAddress: '192.168.1.10' });
    process.env.VERCEL_ENV = 'preview';
    const hosted = await invoke({ generate });
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    const production = await invoke({ generate });
    assert.deepEqual(observed, [true, false]);
    assert.equal(hosted.body.diagnostic, undefined);
    assert.equal(production.body.diagnostic, undefined);
  } finally {
    for (const [name, value] of Object.entries({ NODE_ENV: previous.node, VERCEL: previous.vercel,
      VERCEL_ENV: previous.vercelEnv, WEEKLY_DEBUG_CAPTURE: previous.capture })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('local diagnostics are withheld from LAN clients and hosted preview environments', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL_ENV;
  const failure = Object.assign(new Error('private answer'), { code: 'AI_RESPONSE_INVALID',
    validation: { category: 'invalid_field', path: 'questions[5].enumeration', day: 'Tuesday', batch: 2 } });
  try {
    const lan = await invoke({ generationError: failure, remoteAddress: '192.168.1.10' });
    assert.equal(lan.status, 502);
    assert.equal(lan.body.diagnostic, undefined);
    process.env.VERCEL_ENV = 'preview';
    const hosted = await invoke({ generationError: failure });
    assert.equal(hosted.status, 503);
    assert.equal(hosted.body.code, 'GENERATION_WORKER_DISABLED');
    assert.equal(hosted.body.diagnostic, undefined);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});

test('local validation response redacts unknown paths, categories, and finish reasons', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const result = await invoke({ generationError: Object.assign(new Error('private answer key'), {
      code: 'AI_RESPONSE_INVALID', finishReason: 'private answer key',
      validation: { category: 'private answer key', path: 'questions[0].private_answer_key',
        day: 'private answer key', batch: 99, requestedCount: -1, receivedCount: 1000 },
    }) });
    assert.equal(result.body.code, 'AI_RESPONSE_INVALID');
    assert.deepEqual(result.body.diagnostic, { category: 'unknown', path: 'unknown' });
    assert.doesNotMatch(JSON.stringify(result.body), /private answer key|private_answer_key/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('local enumeration subreason is allowlisted and production response omits it', async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    const failure = subreason => Object.assign(new Error('private answer key'), {
      code: 'AI_RESPONSE_INVALID', validation: { category: 'invalid_field', path: 'questions[5].enumeration',
        day: 'Monday', batch: 1, subreason },
    });
    const local = await invoke({ generationError: failure('alternative_answer_count') });
    assert.equal(local.body.diagnostic.subreason, 'alternative_answer_count');
    assert.match(local.logs[0], /subreason=alternative_answer_count/);
    const unsafe = await invoke({ generationError: failure('private answer key') });
    assert.equal(unsafe.body.diagnostic.subreason, undefined);
    assert.doesNotMatch(JSON.stringify(unsafe), /private answer key/);
    process.env.NODE_ENV = 'production';
    const production = await invoke({ generationError: failure('alternative_answer_count') });
    assert.equal(production.body.diagnostic, undefined);
    assert.doesNotMatch(JSON.stringify(production.body), /alternative_answer_count|private answer key/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('empty enumeration answer subreason is visible only in localhost development diagnostics', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const failure = Object.assign(new Error('private answer key'), { code: 'AI_RESPONSE_INVALID',
    validation: { category: 'invalid_answer_key', path: 'questions[2].correct_answer',
      day: 'Monday', batch: 1, subreason: 'enumeration_answer_missing' } });
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL_ENV;
    const local = await invoke({ generationError: failure });
    assert.equal(local.body.diagnostic.path, 'questions[2].correct_answer');
    assert.equal(local.body.diagnostic.subreason, 'enumeration_answer_missing');
    assert.match(local.logs[0], /subreason=enumeration_answer_missing/);
    const lan = await invoke({ generationError: failure, remoteAddress: '192.168.1.10' });
    assert.equal(lan.body.diagnostic, undefined);
    process.env.VERCEL_ENV = 'preview';
    const hosted = await invoke({ generationError: failure });
    assert.equal(hosted.body.diagnostic, undefined);
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'production';
    const production = await invoke({ generationError: failure });
    assert.equal(production.body.diagnostic, undefined);
    assert.doesNotMatch(JSON.stringify(production.body), /enumeration_answer_missing|private answer key/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
});

test('pacing deadline diagnostic is localhost-only and contains no provider content', async () => {
  const previous = process.env.NODE_ENV;
  const failure = Object.assign(new Error('private provider content'), { code: 'PROVIDER_TIMEOUT',
    validation: { category: 'pacing_deadline', path: '$', day: 'Monday', batch: 2 } });
  try {
    process.env.NODE_ENV = 'development';
    const local = await invoke({ generationError: failure });
    assert.equal(local.status, 504);
    assert.deepEqual(local.body.diagnostic, { day: 'Monday', batch: 2, category: 'pacing_deadline', path: '$' });
    assert.doesNotMatch(JSON.stringify(local.body), /private provider content/);
    assert.equal((await invoke({ generationError: failure, remoteAddress: '192.168.1.2' })).body.diagnostic, undefined);
    process.env.NODE_ENV = 'production';
    assert.equal((await invoke({ generationError: failure })).body.diagnostic, undefined);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('production gate never returns validation diagnostics', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const result = await invoke({ generationError: Object.assign(new Error('private answer key'), {
      code: 'AI_RESPONSE_INVALID', validation: { category: 'invalid_answer_key', path: 'questions[0].correct_answer' },
    }) });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'GENERATION_WORKER_DISABLED');
    assert.equal(result.body.diagnostic, undefined);
    assert.equal(result.generated, 0);
    assert.doesNotMatch(JSON.stringify(result.body), /private answer key|correct_answer/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('unset backend environment does not expose validation diagnostics', async () => {
  const previous = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  try {
    const result = await invoke({ generationError: Object.assign(new Error('private answer key'), {
      code: 'AI_RESPONSE_INVALID', validation: { category: 'invalid_answer_key', path: 'questions[0].correct_answer' },
    }) });
    assert.equal(result.status, 502);
    assert.equal(result.body.code, 'AI_RESPONSE_INVALID');
    assert.equal(result.body.diagnostic, undefined);
  } finally {
    if (previous !== undefined) process.env.NODE_ENV = previous;
  }
});

test('Friday failure reports batch without exposing private content or returning a collection', async () => {
  const result = await invoke({ generationError: Object.assign(new Error('private answer'), {
    code: 'AI_RESPONSE_INVALID', validation: { category: 'invalid_answer_key', path: 'questions[0].correct_answer',
      day: 'Friday', batch: 3, requestedCount: 10, receivedCount: 10, validatedCount: 0,
      questionType: 'multiple_choice' },
  }) });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /Friday.*batch 3/);
  assert.equal(result.body.worksheets, undefined);
  assert.match(result.logs[0], /operation=[a-f0-9-]+.*day=Friday.*requested=10.*batch=3 received=10 validated=0 questionType=multiple_choice/);
  assert.doesNotMatch(JSON.stringify(result), /private answer/);
});

test('same Teacher and plan cannot start duplicate concurrent generation', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } });
  const request = { user: { id: 'teacher-1' }, body: { lessonPlanId: plan.id, sourceHtml: plan.objectives, days, questionCount: 20 } };
  const dependencies = { loadPlan: async () => plan, generate: async () => { await pending; return days.map(day => ({ day: day.day,
    questions: Array.from({ length: 20 }) })); }, log: { error() {} } };
  const firstResponse = response();
  const first = weeklyWorksheetHandler(request, firstResponse, dependencies);
  await new Promise(resolve => setImmediate(resolve));
  const secondResponse = response();
  await weeklyWorksheetHandler(request, secondResponse, dependencies);
  assert.equal(secondResponse.statusCode, 409);
  assert.equal(secondResponse.body.code, 'GENERATION_IN_PROGRESS');
  release();
  await first;
  assert.equal(firstResponse.body.saved, false);
});
