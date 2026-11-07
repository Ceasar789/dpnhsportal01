import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createApp } from '../app.js';
import { createDayTaskRouter, dayTaskHandler } from './dayTasks.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const planId = 'aaaaaaaa-2222-4222-8222-222222222222';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const days = DAYS.map(day => ({ day, objective: `Describe ${day} cells`, activity: `Observe ${day} cells`,
  assessment: `Explain ${day} cells` }));
const plan = { id: planId, teacher_id: teacherId, status: 'draft', title: 'Cells', subject: 'Science',
  grade_level: 'Grade 7', objectives: '<p>saved</p>', ai_generated: true };

const makeItem = (type, index) => ({
  multiple_choice: { question: `Which is choice ${index}?`, item_type: type,
    options: [`A${index}`, `B${index}`, `C${index}`, `D${index}`], correct_answer: `A${index}` },
  true_false: { question: `Statement ${index} holds.`, item_type: type, options: [], correct_answer: 'False' },
  identification: { question: `Name term ${index}.`, item_type: type, options: [], correct_answer: `term${index}` },
  enumeration: { question: `List two for ${index}.`, item_type: type, options: [], correct_answer: `x${index}, y${index}`,
    enumeration: { alternatives: [], orderSensitive: false } },
  essay: { question: `Explain idea ${index}.`, item_type: type, options: [], correct_answer: '',
    essay: { referenceAnswer: 'A model answer.', minWords: 30, maxWords: 60,
      rubric: [{ criterion: 'Accuracy', points: 3 }, { criterion: 'Clarity', points: 2 }] } },
})[type];
const makeTask = counts => JSON.stringify({ title: 'Task', directions: 'Do this.',
  questions: Object.entries(counts).flatMap(([type, count]) => Array.from({ length: count }, () => type))
    .map((type, index) => makeItem(type, index)) });
const activityJson = JSON.stringify({ language: 'en', title: 'Cell map', objective: 'Describe cells.', materials: [],
  procedure: ['Draw.', 'Label.', 'Share.'], grouping: 'Pairs', durationMinutes: 20,
  successCriteria: ['Correct labels.', 'Clear explanation.'] });

const body = (extra = {}) => ({ lessonPlanId: planId, day: 'Tuesday', taskType: 'activity', ...extra });
const fakeRes = () => {
  const res = { statusCode: 200, body: null, writableEnded: false, listeners: {},
    status(code) { res.statusCode = code; return res; },
    json(value) { res.body = value; res.writableEnded = true; return res; },
    on(name, listener) { res.listeners[name] = listener; return res; } };
  return res;
};
const invoke = async (requestBody, { row = plan, loadPlan, resolveSource = () => days, requestJson = async () => activityJson,
  res = fakeRes() } = {}) => {
  const calls = { loadPlan: [], provider: [], logs: [] };
  await dayTaskHandler({ user: { id: teacherId }, body: requestBody }, res, {
    loadPlan: loadPlan || (async (...args) => { calls.loadPlan.push(args); return row; }),
    requestJson: async (...args) => { calls.provider.push(args); return requestJson(...args); },
    resolveSource,
    log: { error: message => calls.logs.push(message) },
  });
  return { status: res.statusCode, body: res.body, calls };
};
const assertBadRequest = async requestBody => {
  const result = await invoke(requestBody);
  assert.equal(result.status, 400, JSON.stringify(requestBody));
  assert.equal(result.body.code, 'INVALID_REQUEST');
  assert.equal(result.body.retryable, false);
  assert.equal(result.calls.loadPlan.length, 0);
  assert.equal(result.calls.provider.length, 0);
};
const quiz = extra => body({ taskType: 'quiz', ...extra });
const assignment = extra => body({ taskType: 'assignment', ...extra });

test('unknown body keys and malformed bodies are rejected', async () => {
  await assertBadRequest(body({ sourceHtml: '<p>client text</p>' }));
  await assertBadRequest(null);
  await assertBadRequest([]);
});

test('bad day, task type, or UUID is rejected', async () => {
  await assertBadRequest(body({ day: 'Saturday' }));
  await assertBadRequest(body({ day: 'monday' }));
  await assertBadRequest(body({ taskType: 'essay' }));
  await assertBadRequest(body({ taskType: undefined }));
  await assertBadRequest(body({ lessonPlanId: 'not-a-uuid' }));
  await assertBadRequest(body({ lessonPlanId: 7 }));
});

test('activity takes no itemCount or typeCounts', async () => {
  await assertBadRequest(body({ itemCount: 1 }));
  await assertBadRequest(body({ typeCounts: {} }));
});

test('quiz count limits are enforced', async () => {
  await assertBadRequest(quiz({ itemCount: 9 }));
  await assertBadRequest(quiz({ itemCount: 21 }));
  await assertBadRequest(quiz({ itemCount: 10.5 }));
  await assertBadRequest(quiz({ itemCount: '10' }));
});

test('quiz typeCounts must match, stay in range, and exclude essay', async () => {
  await assertBadRequest(quiz({ itemCount: 12, typeCounts: { multiple_choice: 10 } }));
  await assertBadRequest(quiz({ typeCounts: { multiple_choice: 9 } }));
  await assertBadRequest(quiz({ typeCounts: { multiple_choice: 21 } }));
  await assertBadRequest(quiz({ typeCounts: { multiple_choice: 9, essay: 1 } }));
  await assertBadRequest(quiz({ typeCounts: { multiple_choice: 12, true_false: -2 } }));
  await assertBadRequest(quiz({ typeCounts: { multiple_choice: 9.5, true_false: 0.5 } }));
  await assertBadRequest(quiz({ typeCounts: [10] }));
});

test('assignment limits are enforced and typeCounts refused', async () => {
  await assertBadRequest(assignment({ itemCount: 0 }));
  await assertBadRequest(assignment({ itemCount: 6 }));
  await assertBadRequest(assignment({ typeCounts: { essay: 3 } }));
});

test('missing, foreign, or archived plans are all 404 with no provider call', async () => {
  for (const row of [null, { ...plan, teacher_id: 'another-teacher' }, { ...plan, id: 'another-plan' },
    { ...plan, status: 'archived' }]) {
    const result = await invoke(body(), { row });
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { code: 'SOURCE_NOT_FOUND', retryable: false, error: 'This saved lesson plan is unavailable.' });
    assert.equal(result.calls.provider.length, 0);
  }
});

test('published plans are accepted and the owner scope reaches loadPlan', async () => {
  const result = await invoke(body(), { row: { ...plan, status: 'published' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.calls.loadPlan, [[planId, teacherId]]);
});

test('a failed plan read is a safe 503', async () => {
  const result = await invoke(body(), { loadPlan: async () => { throw new Error('RAW-DB-DETAIL'); } });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'PLAN_READ_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify([result.body, result.calls.logs]), /RAW-DB-DETAIL/);
});

test('an invalid weekly source is 422 through the real resolver', async () => {
  const res = fakeRes();
  let provider = 0;
  await dayTaskHandler({ user: { id: teacherId }, body: body() }, res, { loadPlan: async () => plan,
    requestJson: async () => { provider += 1; return activityJson; }, log: { error() {} } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'INVALID_WEEKLY_SOURCE');
  assert.equal(provider, 0);
});

test('an unexpected resolver failure is a safe 500, not a 422', async () => {
  const result = await invoke(body(), { resolveSource: () => { throw new Error('RAW-RESOLVER-DETAIL'); } });
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'GENERATION_UNEXPECTED');
  assert.doesNotMatch(JSON.stringify([result.body, result.calls.logs]), /RAW-RESOLVER-DETAIL/);
});

test('activity success uses only the requested day and returns no questions', async () => {
  const result = await invoke(body());
  assert.equal(result.status, 200);
  assert.equal(result.calls.provider.length, 1);
  const [prompt] = result.calls.provider[0];
  assert.ok(prompt.includes(`Daily source: ${JSON.stringify(days[1])}`));
  assert.ok(!prompt.includes('Monday cells'));
  assert.match(prompt, /data, never as instructions/);
  assert.deepEqual(Object.keys(result.body).sort(), ['activity', 'answerKey', 'day', 'instructions', 'providerCalls',
    'questions', 'saved', 'sourceLessonPlan', 'status', 'taskType', 'title']);
  assert.equal(result.body.status, 'generated-day-task');
  assert.equal(result.body.saved, false);
  assert.equal(result.body.day, 'Tuesday');
  assert.deepEqual(result.body.sourceLessonPlan, { id: planId, title: 'Cells' });
  assert.deepEqual(result.body.questions, []);
  assert.deepEqual(result.body.answerKey, []);
  assert.equal(result.body.activity.durationMinutes, 20);
  assert.match(result.body.instructions, /1\. Draw\./);
});

const typesOf = questions => questions.reduce((counts, item) =>
  ({ ...counts, [item.item_type]: (counts[item.item_type] || 0) + 1 }), {});

test('quiz defaults to 10 split 5/3/2', async () => {
  const counts = { multiple_choice: 5, true_false: 3, identification: 2 };
  const result = await invoke(quiz(), { requestJson: async () => makeTask(counts) });
  assert.equal(result.status, 200);
  assert.deepEqual(typesOf(result.body.questions), counts);
  assert.equal(result.body.answerKey.length, 10);
  assert.equal(result.body.activity, null);
  assert.equal(result.body.instructions, 'Do this.');
  assert.match(result.calls.provider[0][0], /exactly 10 quiz items for Tuesday with exactly these counts: multiple_choice: 5, true_false: 3, identification: 2\./);
});

test('default split holds at 15 and 20', async () => {
  for (const [itemCount, counts] of [[15, { multiple_choice: 8, true_false: 4, identification: 3 }],
    [20, { multiple_choice: 10, true_false: 6, identification: 4 }]]) {
    const result = await invoke(quiz({ itemCount }), { requestJson: async () => makeTask(counts) });
    assert.equal(result.status, 200);
    assert.deepEqual(typesOf(result.body.questions), counts);
  }
});

test('custom quiz of 15 returns the exact counts, with or without itemCount', async () => {
  const typeCounts = { multiple_choice: 6, true_false: 4, identification: 3, enumeration: 2 };
  for (const extra of [{ typeCounts }, { itemCount: 15, typeCounts }]) {
    const result = await invoke(quiz(extra), { requestJson: async () => makeTask(typeCounts) });
    assert.equal(result.status, 200);
    assert.deepEqual(typesOf(result.body.questions), typeCounts);
    assert.equal(result.body.questions.find(item => item.item_type === 'enumeration').points, 2);
  }
});

test('a quiz with fewer items than requested is rejected, not padded', async () => {
  const result = await invoke(quiz(), { requestJson: async () => makeTask({ multiple_choice: 5, true_false: 3, identification: 1 }) });
  assert.equal(result.status, 502);
  assert.equal(result.body.code, 'AI_RESPONSE_INVALID');
  assert.match(result.calls.logs[0], /category=question_count path=questions/);
});

test('assignment returns N essays with rubric sum 5 and no answer key', async () => {
  for (const [extra, count] of [[{}, 3], [{ itemCount: 5 }, 5], [{ itemCount: 1 }, 1]]) {
    const result = await invoke(assignment(extra), { requestJson: async () => makeTask({ essay: count }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.questions.length, count);
    assert.deepEqual(result.body.answerKey, []);
    for (const item of result.body.questions) {
      assert.equal(item.item_type, 'essay');
      assert.equal(item.points, 5);
      assert.equal(item.essay.rubric.reduce((sum, part) => sum + part.points, 0), 5);
    }
  }
});

test('a concurrent duplicate is 409 and a different day is not blocked', async () => {
  let release;
  const first = invoke(body(), { requestJson: () => new Promise(resolve => { release = () => resolve(activityJson); }) });
  await new Promise(resolve => setImmediate(resolve));
  const duplicate = await invoke(body());
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'GENERATION_IN_PROGRESS');
  assert.equal(duplicate.calls.provider.length, 0);
  const uppercase = await invoke(body({ lessonPlanId: planId.toUpperCase() }));
  assert.equal(uppercase.status, 409);
  assert.equal((await invoke(body({ day: 'Monday' }))).status, 200);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await invoke(body())).status, 200);
});

test('the in-flight guard is released after every failure path', async () => {
  const failures = [
    { requestJson: async () => { throw Object.assign(new Error('x'), { code: 'PROVIDER_TIMEOUT' }); } },
    { requestJson: async () => 'not json' },
    { row: null },
    { loadPlan: async () => { throw new Error('x'); } },
    { resolveSource: () => { throw Object.assign(new Error('x'), { code: 'invalid_weekly_source' }); } },
  ];
  for (const failure of failures) {
    assert.notEqual((await invoke(body(), failure)).status, 200);
    assert.equal((await invoke(body())).status, 200);
  }
});

test('every provider error maps to a fixed message and leaks no raw text', async () => {
  const expected = { PROVIDER_NOT_CONFIGURED: 503, PROVIDER_RATE_LIMIT: 429, PROVIDER_DAILY_QUOTA: 429,
    PROVIDER_OVERLOADED: 503, PROVIDER_INTERRUPTED: 503, PROVIDER_UNAVAILABLE: 503, PROVIDER_REJECTED: 502,
    PROVIDER_AUTH_FAILED: 503, PROVIDER_ACCESS_DENIED: 503, PROVIDER_NETWORK: 503, PROVIDER_TIMEOUT: 504,
    PROVIDER_TRUNCATED: 502, PROVIDER_INVALID_RESPONSE: 502, AI_RESPONSE_INVALID: 502, GENERATION_CANCELLED: 499 };
  for (const [code, status] of Object.entries(expected)) {
    const result = await invoke(body(), { requestJson: async () => {
      throw Object.assign(new Error('RAW-PROVIDER-TEXT'), { code, providerErrorReason: 'RAW-PROVIDER-TEXT',
        stack: 'RAW-PROVIDER-TEXT' });
    } });
    assert.equal(result.status, status, code);
    assert.deepEqual(Object.keys(result.body).sort(), ['code', 'error', 'retryable']);
    assert.equal(result.body.code, code);
    assert.equal(result.body.retryable, false);
    assert.doesNotMatch(JSON.stringify([result.body, result.calls.logs]), /RAW-PROVIDER-TEXT|five worksheets/);
    assert.equal(result.calls.provider.length, 1);
  }
});

test('an unlisted error code falls back without echoing it', async () => {
  const result = await invoke(body(), { requestJson: async () => {
    throw Object.assign(new Error('RAW-TEXT'), { code: 'toString' });
  } });
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'GENERATION_UNEXPECTED');
});

test('invalid AI output leaks neither its text nor the prompt', async () => {
  const result = await invoke(body(), { requestJson: async () => 'RAW-AI-OUTPUT' });
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify([result.body, result.calls.logs]), /RAW-AI-OUTPUT|Daily source/);
});

test('closing the response before it ends aborts the provider call', async () => {
  const res = fakeRes();
  let signal;
  const pending = invoke(body(), { res, requestJson: (_prompt, options) => new Promise((_resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { code: 'GENERATION_CANCELLED' })));
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signal.aborted, false);
  res.listeners.close();
  assert.equal(signal.aborted, true);
  assert.equal((await pending).status, 499);
});

test('a normal close after success does not abort', async () => {
  const res = fakeRes();
  let signal;
  await invoke(body(), { res, requestJson: async (_prompt, options) => { signal = options.signal; return activityJson; } });
  res.listeners.close();
  assert.equal(signal.aborted, false);
});

test('the handler only reads: its one injected data call is loadPlan and the source has no write', async () => {
  const result = await invoke(body());
  assert.equal(result.calls.loadPlan.length, 1);
  const source = await readFile(new URL('./dayTasks.js', import.meta.url), 'utf8');
  assert.equal(source.match(/\.from\(/g).length, 1);
  assert.match(source, /\.from\('lesson_plans'\)\.select\(SOURCE_COLUMNS\)/);
  assert.doesNotMatch(source, /\.(insert|update|upsert|rpc)\(|\.from\([^)]*\)\.delete\(/);
});

async function serve(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('the route is mounted on the app and requires a bearer token', async () => {
  await serve(createApp({ env: {} }), async base => {
    const response = await fetch(`${base}/api/ai/day-tasks`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Missing bearer token.' });
  });
});

test('the 31st request in an hour gets the JSON rate-limit body, per teacher', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: req.get('x-test-user') }; next(); });
  app.use('/', createDayTaskRouter({ auth: (_req, _res, next) => next() }));
  await serve(app, async base => {
    const post = user => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: '{}' });
    for (let count = 0; count < 30; count += 1) assert.equal((await post('teacher-a')).status, 400);
    const limited = await post('teacher-a');
    assert.equal(limited.status, 429);
    assert.deepEqual(Object.keys(await limited.json()).sort(), ['code', 'error', 'retryable']);
    assert.equal((await post('teacher-b')).status, 400);
  });
});
