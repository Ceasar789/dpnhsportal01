import test from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSE_SCHEMA, generateWeeklyWorksheetDrafts } from './weeklyWorksheetGenerator.js';
import { requestWeeklyWorksheetJson, requestWorksheetJsonFromGroq } from './weeklyWorksheetProvider.js';

const groqResponse = (content, finish_reason = 'stop') => ({ ok: true,
  json: async () => ({ choices: [{ finish_reason, message: { content } }] }) });
const topics = { Monday: 'metapora', Tuesday: 'simile', Wednesday: 'tugma', Thursday: 'sukat', Friday: 'persona' };
const fixture = (day, batch) => JSON.stringify({ title: `${day} worksheet`, directions: 'Answer the questions.',
  coverageLimitation: '', questions: Array.from({ length: 10 }, (_, index) => {
    const base = { question: `${day} ${topics[day]} batch ${batch} item ${index}`, points: 1, options: [], correct_answer: '' };
    if (index < 4) return { ...base, item_type: 'multiple_choice', options: ['A', 'B'], correct_answer: 'A',
      enumeration: null, essay: null };
    if (index < 7) return { ...base, item_type: 'true_false', correct_answer: 'True', enumeration: null, essay: null };
    if (index < 9) return { ...base, item_type: 'enumeration', correct_answer: 'one, two',
      enumeration: { alternatives: ['first, second'], orderSensitive: false }, essay: null };
    return { ...base, item_type: 'essay', enumeration: null, essay: { referenceAnswer: 'The lesson supports this answer.',
      minWords: 10, maxWords: 40, rubric: [{ criterion: 'Uses lesson evidence', points: 1 }] } };
  }) });

test('Groq uses strict schema and the configured model without sending Gemini fields', async () => {
  let request;
  const raw = fixture('Monday', 1);
  const result = await requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 8192,
    fetchImpl: async (url, options) => { request = { url, options }; return groqResponse(raw); } });
  assert.equal(result, raw);
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer synthetic-key');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, 'openai/gpt-oss-120b');
  assert.equal(payload.max_completion_tokens, 8192);
  assert.deepEqual(payload.messages, [{ role: 'user', content: 'synthetic prompt' }]);
  assert.equal(payload.generationConfig, undefined);
  const format = payload.response_format;
  assert.equal(format.type, 'json_schema');
  assert.equal(format.json_schema.strict, true);
  const schema = format.json_schema.schema;
  const checkObjects = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(checkObjects);
      else checkObjects(value);
    }
  };
  checkObjects(schema);
  assert.deepEqual(schema.properties.coverageLimitation.anyOf.map(value => value.type), ['string', 'null']);
  assert.deepEqual(schema.properties.questions.items.properties.enumeration.anyOf.map(value => value.type), ['object', 'null']);
  assert.deepEqual(schema.properties.questions.items.properties.essay.anyOf.map(value => value.type), ['object', 'null']);
  assert.equal(schema.properties.questions.items.properties.item_type.enum.length, 4);
  assert.equal(schema.properties.questions.maxItems, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /synthetic-key/);
  await requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key', model: 'openai/gpt-oss-20b',
    responseSchema: RESPONSE_SCHEMA, fetchImpl: async (_url, options) => {
      assert.equal(JSON.parse(options.body).model, 'openai/gpt-oss-20b');
      return groqResponse(raw);
    } });
});

test('Groq reports only numeric token metadata while preserving the string result', async () => {
  let usage;
  const raw = fixture('Monday', 1);
  const result = await requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, onGroqUsage: value => { usage = value; }, fetchImpl: async () => ({
      ...groqResponse(raw), headers: { get: name => ({
        'x-ratelimit-remaining-tokens': '1200', 'x-ratelimit-reset-tokens': '12.5s',
      })[name] }, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: raw } }],
        usage: { prompt_tokens: 900, completion_tokens: 1100, total_tokens: 2000,
          completion_tokens_details: { reasoning_tokens: 400 } } }),
    }) });
  assert.equal(result, raw);
  assert.deepEqual(usage, { remainingTokens: 1200, resetTokensMs: 12500,
    promptTokens: 900, completionTokens: 1100, totalTokens: 2000, reasoningTokens: 400 });
  await requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, onGroqUsage: value => { usage = value; }, fetchImpl: async () => ({
      ...groqResponse(raw), headers: { get: () => 'private malformed value' },
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: raw } }],
        usage: { prompt_tokens: -1, completion_tokens: '1100', total_tokens: 2.5 } }),
    }) });
  assert.deepEqual(usage, { remainingTokens: undefined, resetTokensMs: undefined,
    promptTokens: undefined, completionTokens: undefined, totalTokens: undefined, reasoningTokens: undefined });
});

test('Groq reasoning effort is optional, normalized and invalid values warn once without exposure', async () => {
  const previous = process.env.GROQ_REASONING_EFFORT;
  const payloads = []; const warnings = [];
  const send = () => requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, operationId: 'synthetic-operation', log: { warn: value => warnings.push(value) },
    fetchImpl: async (_url, options) => { payloads.push(JSON.parse(options.body)); return groqResponse(fixture('Monday', 1)); } });
  try {
    delete process.env.GROQ_REASONING_EFFORT;
    await send();
    process.env.GROQ_REASONING_EFFORT = '';
    await send();
    for (const value of ['LOW', ' medium ', 'High']) {
      process.env.GROQ_REASONING_EFFORT = value;
      await send();
    }
    process.env.GROQ_REASONING_EFFORT = 'invalid-secret-like-value';
    await send(); await send();
    assert.deepEqual(payloads.map(value => value.reasoning_effort),
      [undefined, undefined, 'low', 'medium', 'high', undefined, undefined]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /operation=synthetic-operation code=invalid_groq_reasoning_effort/);
    assert.doesNotMatch(warnings[0], /invalid-secret-like-value|synthetic prompt/);
  } finally {
    if (previous === undefined) delete process.env.GROQ_REASONING_EFFORT;
    else process.env.GROQ_REASONING_EFFORT = previous;
  }
});

test('setting Groq reasoning effort does not change the Gemini request body', async () => {
  const previous = { effort: process.env.GROQ_REASONING_EFFORT,
    provider: process.env.WEEKLY_WORKSHEET_PROVIDER };
  const bodies = [];
  try {
    process.env.WEEKLY_WORKSHEET_PROVIDER = 'gemini';
    for (const effort of [undefined, 'high']) {
      if (effort === undefined) delete process.env.GROQ_REASONING_EFFORT;
      else process.env.GROQ_REASONING_EFFORT = effort;
      await requestWeeklyWorksheetJson('synthetic prompt', { apiKey: 'synthetic-key',
        responseSchema: RESPONSE_SCHEMA, fetchImpl: async (_url, options) => {
          bodies.push(options.body);
          return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP',
            content: { parts: [{ text: fixture('Monday', 1) }] } }] }) };
        } });
    }
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.doesNotMatch(bodies[1], /reasoning_effort/);
  } finally {
    if (previous.effort === undefined) delete process.env.GROQ_REASONING_EFFORT;
    else process.env.GROQ_REASONING_EFFORT = previous.effort;
    if (previous.provider === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER;
    else process.env.WEEKLY_WORKSHEET_PROVIDER = previous.provider;
  }
});

test('Groq token reset headers accept seconds, minutes and milliseconds but ignore malformed values', async () => {
  for (const [header, expected] of [['7.66s', 7660], ['2m59.56s', 179560], ['250ms', 250],
    ['not-a-duration', undefined], ['-250ms', undefined], ['0ms', undefined]]) {
    let metadata;
    await requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
      onGroqUsage: value => { metadata = value; }, fetchImpl: async () => ({
        ...groqResponse(fixture('Monday', 1)), headers: { get: name => name === 'x-ratelimit-reset-tokens' ? header : null },
      }) });
    assert.equal(metadata.resetTokensMs, expected, header);
  }
});

test('Groq Retry-After still accepts integer seconds and HTTP dates only', async () => {
  for (const [value, check] of [['7', seconds => seconds === 7],
    [new Date(Date.now() + 45_000).toUTCString(), seconds => seconds >= 44 && seconds <= 45],
    ['7.66s', seconds => seconds === undefined]]) {
    await assert.rejects(requestWorksheetJsonFromGroq('synthetic prompt', { apiKey: 'synthetic-key',
      responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => ({ ok: false, status: 429,
        headers: { get: name => name === 'retry-after' ? value : null } }) }),
    error => error.code === 'PROVIDER_RATE_LIMIT' && check(error.retryAfterSeconds));
  }
});

test('Gemini remains the default and Groq requires explicit local development selection', async () => {
  const previous = { provider: process.env.WEEKLY_WORKSHEET_PROVIDER, node: process.env.NODE_ENV,
    vercel: process.env.VERCEL, vercelEnv: process.env.VERCEL_ENV };
  let geminiCalls = 0;
  let groqCalls = 0;
  try {
    delete process.env.WEEKLY_WORKSHEET_PROVIDER;
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    await requestWeeklyWorksheetJson('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
      fetchImpl: async url => {
        if (url.includes('generativelanguage.googleapis.com')) {
          geminiCalls += 1;
          return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP',
            content: { parts: [{ text: fixture('Monday', 1) }] } }] }) };
        }
        groqCalls += 1;
        return groqResponse(fixture('Monday', 1));
      } });
    assert.deepEqual([geminiCalls, groqCalls], [1, 0]);
    process.env.WEEKLY_WORKSHEET_PROVIDER = 'groq';
    await requestWeeklyWorksheetJson('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
      fetchImpl: async url => { assert.match(url, /api\.groq\.com/); groqCalls += 1;
        return groqResponse(fixture('Monday', 1)); } });
    assert.deepEqual([geminiCalls, groqCalls], [1, 1]);
    await assert.rejects(requestWeeklyWorksheetJson('prompt', { apiKey: 'synthetic-key',
      responseSchema: RESPONSE_SCHEMA, fetchImpl: async url => {
        assert.match(url, /api\.groq\.com/);
        groqCalls += 1;
        return { ok: false, status: 429, headers: { get: () => '60' } };
      } }), error => error.code === 'PROVIDER_RATE_LIMIT' && error.retryAfterSeconds === 60);
    assert.deepEqual([geminiCalls, groqCalls], [1, 2]);
    process.env.VERCEL_ENV = 'preview';
    await assert.rejects(requestWeeklyWorksheetJson('prompt', { apiKey: 'synthetic-key',
      responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => { throw new Error('must not call provider'); } }),
    error => error.code === 'PROVIDER_NOT_CONFIGURED');
  } finally {
    for (const [key, value] of [['WEEKLY_WORKSHEET_PROVIDER', previous.provider], ['NODE_ENV', previous.node],
      ['VERCEL', previous.vercel], ['VERCEL_ENV', previous.vercelEnv]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Groq failures preserve safe codes, retry guidance and one-request behavior', async () => {
  await assert.rejects(requestWorksheetJsonFromGroq('prompt', { apiKey: '', responseSchema: RESPONSE_SCHEMA }),
    error => error.code === 'PROVIDER_NOT_CONFIGURED');
  for (const [status, code] of [[400, 'PROVIDER_REJECTED'], [401, 'PROVIDER_AUTH_FAILED'],
    [403, 'PROVIDER_ACCESS_DENIED'], [429, 'PROVIDER_RATE_LIMIT'], [503, 'PROVIDER_OVERLOADED'],
    [500, 'PROVIDER_UNAVAILABLE']]) {
    let calls = 0;
    await assert.rejects(requestWorksheetJsonFromGroq('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
      fetchImpl: async () => { calls += 1; return { ok: false, status,
        headers: { get: () => '45' }, json: async () => ({ error: { message: '"private provider detail"' } }) }; } }),
    error => error.code === code && error.retryAfterSeconds === 45
      && error.httpStatus === status && !error.message.includes('private provider detail')
      && !JSON.stringify(error).includes('private provider detail'));
    assert.equal(calls, 1);
  }
  await assert.rejects(requestWorksheetJsonFromGroq('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
    fetchImpl: async () => { throw Object.assign(new Error('private timeout'), { name: 'TimeoutError' }); } }),
  error => error.code === 'PROVIDER_TIMEOUT' && !error.message.includes('private timeout'));
  await assert.rejects(requestWorksheetJsonFromGroq('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
    fetchImpl: async () => { throw new TypeError('private network detail'); } }),
  error => error.code === 'PROVIDER_INTERRUPTED' && !error.message.includes('private network detail'));
  const controller = new AbortController();
  await assert.rejects(requestWorksheetJsonFromGroq('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
    signal: controller.signal, fetchImpl: async () => { controller.abort(); throw new Error('aborted'); } }),
  error => error.code === 'GENERATION_CANCELLED');
  await assert.rejects(requestWorksheetJsonFromGroq('prompt', { apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
    fetchImpl: async () => groqResponse('{', 'length') }),
  error => error.code === 'PROVIDER_TRUNCATED' && error.finishReason === 'LENGTH');
});

test('Groq 400 keeps safe code, type and a 200-character reason without request content', async () => {
  const message = `Unable to complete structured output. ${'Try again. '.repeat(30)}`;
  let failure;
  try {
    await requestWorksheetJsonFromGroq('private lesson prompt', { apiKey: 'synthetic-key',
      responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => ({ ok: false, status: 400,
        headers: { get: () => null }, json: async () => ({ error: {
          code: 'json_validate_failed', type: 'invalid_request_error', message } }) }) });
  } catch (error) { failure = error; }
  assert.equal(failure?.code, 'PROVIDER_REJECTED');
  assert.equal(failure.httpStatus, 400);
  assert.equal(failure.providerErrorCode, 'json_validate_failed/invalid_request_error');
  assert.equal(failure.providerErrorReason, message.slice(0, 200));
  assert.doesNotMatch(JSON.stringify(failure), /private lesson prompt|synthetic-key/);
});

test('Groq 400 suppresses quoted prompt content and ignores unreadable error bodies', async () => {
  const failures = [];
  for (const json of [async () => ({ error: { code: 'invalid_request_error',
    type: 'invalid_request_error', message: 'Rejected "private lesson prompt" from synthetic-key' } }),
  async () => { throw new SyntaxError('private non-JSON body'); }]) {
    try {
      await requestWorksheetJsonFromGroq('private lesson prompt', { apiKey: 'synthetic-key',
        responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => ({ ok: false, status: 400,
          headers: { get: () => null }, json }) });
    } catch (error) { failures.push(error); }
  }
  assert.equal(failures[0].providerErrorCode, 'invalid_request_error');
  assert.equal(failures[0].providerErrorReason, undefined);
  assert.equal(failures[1].httpStatus, 400);
  assert.equal(failures[1].providerErrorCode, undefined);
  assert.equal(failures[1].providerErrorReason, undefined);
  assert.ok(failures.every(error => !JSON.stringify(error).includes('private lesson prompt')
    && !JSON.stringify(error).includes('synthetic-key')));
});

test('Groq error code and type cannot echo the prompt or API key', async () => {
  for (const echoedCode of ['private_lesson_prompt', 'synthetic-key']) {
    let failure;
    try {
      await requestWorksheetJsonFromGroq('private lesson prompt', { apiKey: 'synthetic-key',
        responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => ({ ok: false, status: 400,
          headers: { get: () => null }, json: async () => ({ error: {
            code: echoedCode, type: 'invalid_request_error', message: 'Unable to complete structured output.' } }) }) });
    } catch (error) { failure = error; }
    assert.equal(failure.providerErrorCode, 'invalid_request_error');
    assert.doesNotMatch(JSON.stringify(failure), /private_lesson_prompt|synthetic-key/);
  }
});

test('Groq mocked transport preserves five-day 20/30/40 validation and rejects bad content', async () => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const plan = { id: 'plan-1', title: 'Synthetic Filipino 7', subject: 'Filipino', grade_level: '7' };
  const sources = days.map(day => ({ day, objective: `Study ${day} poems`, activity: `Read ${day} poems`,
    assessment: `Discuss ${day} poems` }));
  const previous = { provider: process.env.WEEKLY_WORKSHEET_PROVIDER, node: process.env.NODE_ENV };
  process.env.WEEKLY_WORKSHEET_PROVIDER = 'groq';
  process.env.NODE_ENV = 'development';
  try {
    for (const questionCount of [20, 30, 40]) {
      let calls = 0;
      const drafts = await generateWeeklyWorksheetDrafts(plan, sources, { questionCount, log: { info() {} },
        generateText: (prompt, options) => requestWeeklyWorksheetJson(prompt, { ...options, apiKey: 'synthetic-key',
          fetchImpl: async () => {
            calls += 1;
            const [, day, batch] = /for (\w+), batch (\d+)\./.exec(prompt);
            return groqResponse(fixture(day, Number(batch)));
          } }),
      });
      assert.equal(calls, questionCount / 10 * 5);
      assert.equal(drafts.length, 5);
      assert.ok(drafts.every(draft => draft.questions.length === questionCount && draft.saved === false));
      assert.ok(drafts.every(draft => draft.answerKey.length === questionCount - questionCount / 10));
      assert.ok(drafts.every(draft => draft.questions.filter(item => item.item_type === 'essay')
        .every(item => item.essay.referenceAnswer && item.essay.rubric[0].points === item.points)));
    }
    for (const change of [value => { value.questions[7].enumeration.alternatives = ['one']; },
      value => { value.questions[1].question = value.questions[0].question; },
      value => { value.questions[0].correct_answer = 'missing'; }]) {
      let calls = 0;
      await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, log: { info() {} },
        generateText: (prompt, options) => requestWeeklyWorksheetJson(prompt, { ...options, apiKey: 'synthetic-key',
          fetchImpl: async () => { calls += 1; const value = JSON.parse(fixture('Monday', 1));
            change(value); return groqResponse(JSON.stringify(value)); } }),
      }), error => error.code === 'AI_RESPONSE_INVALID' && error.providerCalls === 1);
      assert.equal(calls, 1);
    }
  } finally {
    if (previous.provider === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER;
    else process.env.WEEKLY_WORKSHEET_PROVIDER = previous.provider;
    if (previous.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.node;
  }
});
