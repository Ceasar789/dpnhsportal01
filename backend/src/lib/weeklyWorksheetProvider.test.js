import test from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSE_SCHEMA, generateWeeklyWorksheetDrafts } from './weeklyWorksheetGenerator.js';
import { parseWeeklyWorksheetProviders, requestOpenAICompatibleWorksheetJson,
  requestWeeklyWorksheetJson, requestWorksheetJsonFromGroq, weeklyProviderTimeoutMs } from './weeklyWorksheetProvider.js';

test('worksheet chain accepts registered Groq, Mistral and NVIDIA models but never Gemini', () => {
  assert.deepEqual(parseWeeklyWorksheetProviders('groq:openai/gpt-oss-120b,groq:llama-3.3-70b-versatile,mistral:mistral-small-latest,nvidia:nvidia/nemotron-3-ultra-550b-a55b')
    .map(entry => [entry.name, entry.model]), [
    ['groq', 'openai/gpt-oss-120b'], ['groq', 'llama-3.3-70b-versatile'], ['mistral', 'mistral-small-latest'],
    ['nvidia', 'nvidia/nemotron-3-ultra-550b-a55b'],
  ]);
  for (const value of ['gemini:gemini-2.5-flash', 'groq:gemini-2.5-flash', 'mistral:gemini-2.5-flash',
    'nvidia:gemini-2.5-flash', 'constructor:some-model', 'unknown:some-model', 'groq:', ''])
    assert.throws(() => parseWeeklyWorksheetProviders(value));
});

test('worksheet chain accepts Cloudflare model IDs with @ and / after the first colon', () => {
  assert.deepEqual(parseWeeklyWorksheetProviders('cloudflare:@cf/openai/gpt-oss-120b'),
    [{ name: 'cloudflare', model: '@cf/openai/gpt-oss-120b' }]);
  assert.throws(() => parseWeeklyWorksheetProviders('cloudflare:@cf/openai:gpt-oss-120b'));
});

test('Cloudflare uses the account URL and content only, without unverified request parameters', async () => {
  const previous = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousMax = process.env.CLOUDFLARE_MAX_TOKENS;
  const accountId = '0123456789abcdef0123456789abcdef';
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  delete process.env.CLOUDFLARE_MAX_TOKENS;
  try {
    const content = fixture('Monday', 1);
    const result = await requestOpenAICompatibleWorksheetJson('synthetic prompt', {
      provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', apiKey: 'synthetic-cloudflare-token',
      responseSchema: RESPONSE_SCHEMA, maxOutputTokens: 8192, fetchImpl: async (url, options) => {
        assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`);
        assert.equal(options.headers.Authorization, 'Bearer synthetic-cloudflare-token');
        assert.deepEqual(JSON.parse(options.body), { model: '@cf/openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'synthetic prompt' }], max_tokens: 4096 });
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content, reasoning_content: 'PRIVATE_REASONING' } }],
        }) };
      },
    });
    assert.equal(result, content);
    for (const empty of [null, '', '   ']) {
      await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
        provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', apiKey: 'synthetic-cloudflare-token',
        fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({
          choices: [{ finish_reason: 'stop', message: { content: empty, reasoning_content: 'PRIVATE_REASONING' } }],
        }) }),
      }), error => error.code === 'PROVIDER_INVALID_RESPONSE'
        && !JSON.stringify(error).includes('PRIVATE_REASONING'));
    }
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previous;
    if (previousMax === undefined) delete process.env.CLOUDFLARE_MAX_TOKENS;
    else process.env.CLOUDFLARE_MAX_TOKENS = previousMax;
  }
});

test('Cloudflare max_tokens accepts bounded integer overrides and warns safely on invalid values', async () => {
  const previous = { account: process.env.CLOUDFLARE_ACCOUNT_ID,
    max: process.env.CLOUDFLARE_MAX_TOKENS };
  process.env.CLOUDFLARE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
  try {
    for (const [setting, expected, warning] of [
      ['512', 512, false], ['16384', 16384, false],
      ['511', 4096, true], ['16385', 4096, true], ['512.5', 4096, true],
      ['secret-invalid-setting', 4096, true], ['', 4096, true],
    ]) {
      process.env.CLOUDFLARE_MAX_TOKENS = setting;
      const warnings = [];
      await requestOpenAICompatibleWorksheetJson('synthetic prompt', {
        provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', apiKey: 'synthetic-token',
        log: { warn: line => warnings.push(line) }, operationId: 'synthetic-operation',
        fetchImpl: async (_url, options) => {
          const body = JSON.parse(options.body);
          assert.equal(body.max_tokens, expected);
          assert.equal(Object.hasOwn(body, 'max_completion_tokens'), false);
          assert.equal(Object.hasOwn(body, 'response_format'), false);
          return groqResponse(fixture('Monday', 1));
        },
      });
      assert.equal(warnings.length, warning ? 1 : 0);
      assert.ok(warnings.every(line => line.includes('code=invalid_cloudflare_max_tokens')
        && (!setting || !line.includes(setting)) && !line.includes('synthetic-token')));
    }
  } finally {
    if (previous.account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previous.account;
    if (previous.max === undefined) delete process.env.CLOUDFLARE_MAX_TOKENS;
    else process.env.CLOUDFLARE_MAX_TOKENS = previous.max;
  }
});

test('generic adapter reports only allowlisted finish reasons before rejecting truncated or empty content', async () => {
  const previous = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
  try {
    for (const [finish, content, code, expected] of [
      ['length', 'incomplete', 'PROVIDER_TRUNCATED', 'LENGTH'],
      ['stop', null, 'PROVIDER_INVALID_RESPONSE', 'STOP'],
      ['private-reason-text', null, 'PROVIDER_INVALID_RESPONSE', 'UNKNOWN'],
    ]) {
      let loggedFinish;
      await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
        provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', apiKey: 'synthetic-token',
        onFinishReason: value => { loggedFinish = value; },
        fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({
          choices: [{ finish_reason: finish, message: { content } }],
        }) }),
      }), error => error.code === code && !error.message.includes(content || 'private-reason-text'));
      assert.equal(loggedFinish, expected);
    }
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previous;
  }
});

test('Cloudflare errors never expose account ID, URL, or token', async () => {
  const previous = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accountId = '0123456789abcdef0123456789abcdef';
  const token = 'synthetic-cloudflare-token';
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  try {
    for (const [fetchImpl, expectedCode] of [
      [async url => { throw new Error(`request failed for ${url} with ${token}`); }, 'PROVIDER_INTERRUPTED'],
      [async () => ({ ok: false, status: 400, headers: new Headers(), json: async () => ({
        error: { code: accountId, type: 'invalid_request_error', message: `account ${accountId} rejected` },
      }) }), 'PROVIDER_REJECTED'],
    ]) {
      await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
        provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', apiKey: token,
        fetchImpl,
      }), error => {
        assert.equal(error.code, expectedCode);
        const exposed = `${error.message} ${JSON.stringify(error)}`;
        assert.doesNotMatch(exposed, new RegExp(`${accountId}|${token}|api\\.cloudflare\\.com`));
        return true;
      });
    }
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previous;
  }
});

test('Cloudflare rejects an invalid account ID before transport without exposing it', async () => {
  const previous = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'invalid-account-id';
  try {
    await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
      provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b', apiKey: 'synthetic-cloudflare-token',
      fetchImpl: async () => { assert.fail('transport must not run'); },
    }), error => error.code === 'PROVIDER_NOT_CONFIGURED'
      && !error.message.includes('invalid-account-id'));
  } finally {
    if (previous === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previous;
  }
});

test('generic worksheet adapter uses each provider endpoint and strongest documented JSON mode', async () => {
  for (const [provider, model, expectedUrl, format] of [
    ['groq', 'openai/gpt-oss-120b', 'https://api.groq.com/openai/v1/chat/completions', 'json_schema'],
    ['groq', 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1/chat/completions', 'json_object'],
    ['mistral', 'mistral-small-latest', 'https://api.mistral.ai/v1/chat/completions', 'json_schema'],
    ['nvidia', 'nvidia/nemotron-3-ultra-550b-a55b', 'https://integrate.api.nvidia.com/v1/chat/completions', 'json_object'],
  ]) {
    const raw = fixture('Monday', 1);
    let status;
    const result = await requestOpenAICompatibleWorksheetJson('synthetic worksheet prompt', {
      provider, model, apiKey: 'synthetic-key', responseSchema: RESPONSE_SCHEMA,
      onHttpStatus: value => { status = value; },
      fetchImpl: async (url, options) => {
        assert.equal(url, expectedUrl);
        const body = JSON.parse(options.body);
        assert.equal(body.model, model);
        assert.equal(body.response_format.type, format);
        assert.equal(body.messages[0].content, 'synthetic worksheet prompt');
        assert.equal(body[provider === 'groq' ? 'max_completion_tokens' : 'max_tokens'], 4096);
        if (provider === 'nvidia') assert.equal(body.stream, false);
        return { ...groqResponse(raw), status: 200 };
      },
    });
    assert.equal(result, raw);
    assert.equal(status, 200);
  }
});

test('NVIDIA thinking control is optional and only accepts 0 or 1', async () => {
  const previous = process.env.NVIDIA_ENABLE_THINKING;
  try {
    for (const [setting, expected] of [[undefined, undefined], ['0', false], ['1', true], ['invalid', undefined]]) {
      if (setting === undefined) delete process.env.NVIDIA_ENABLE_THINKING;
      else process.env.NVIDIA_ENABLE_THINKING = setting;
      let thinking;
      await requestOpenAICompatibleWorksheetJson('synthetic prompt', {
        provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b', apiKey: 'synthetic-key',
        responseSchema: RESPONSE_SCHEMA, onRequestMetadata: value => { thinking = value.thinking; },
        fetchImpl: async (_url, options) => {
          const body = JSON.parse(options.body);
          assert.equal(body.stream, false);
          assert.equal(body.chat_template_kwargs?.enable_thinking, expected);
          assert.equal(Object.hasOwn(body, 'extra_body'), false);
          return groqResponse(fixture('Monday', 1));
        },
      });
      assert.equal(thinking, expected === undefined ? 'unset' : String(expected));
    }
  } finally {
    if (previous === undefined) delete process.env.NVIDIA_ENABLE_THINKING;
    else process.env.NVIDIA_ENABLE_THINKING = previous;
  }
});

test('worksheet provider timeout defaults to 90000 ms and accepts bounded integer configuration', () => {
  const previous = process.env.WEEKLY_WORKSHEET_PROVIDER_TIMEOUT_MS;
  try {
    for (const [setting, expected] of [[undefined, 90000], ['120000', 120000],
      ['0', 90000], ['900000', 90000], ['invalid', 90000]]) {
      if (setting === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER_TIMEOUT_MS;
      else process.env.WEEKLY_WORKSHEET_PROVIDER_TIMEOUT_MS = setting;
      assert.equal(weeklyProviderTimeoutMs(), expected);
    }
  } finally {
    if (previous === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER_TIMEOUT_MS;
    else process.env.WEEKLY_WORKSHEET_PROVIDER_TIMEOUT_MS = previous;
  }
});

test('generic adapter reports a transport timeout without an HTTP status', async () => {
  await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
    provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b', apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => {
      throw new DOMException('synthetic timeout', 'TimeoutError');
    },
  }), error => error.code === 'PROVIDER_TIMEOUT' && error.httpStatus === undefined
    && !JSON.stringify(error).includes('synthetic timeout'));
});

test('generic adapter forwards only numeric usage and never reasoning content', async () => {
  let usage;
  const content = fixture('Monday', 1);
  const result = await requestOpenAICompatibleWorksheetJson('synthetic prompt', {
    provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b', apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, onGroqUsage: value => { usage = value; },
    fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(),
      json: async () => ({ choices: [{ finish_reason: 'stop', message: {
        content, reasoning_content: 'synthetic private reasoning',
      } }], usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165,
        completion_tokens_details: { reasoning_tokens: 30 } } }),
    }),
  });
  assert.equal(result, content);
  assert.deepEqual([usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.reasoningTokens],
    [120, 45, 165, 30]);
  assert.ok(!JSON.stringify(usage).includes('synthetic private reasoning'));
});

test('NVIDIA never substitutes reasoning content for an empty answer', async () => {
  for (const content of [null, '', '   ']) {
    await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
      provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b', apiKey: 'synthetic-key',
      responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => ({ ok: true, status: 200,
        json: async () => ({ choices: [{ finish_reason: 'stop', message: {
          content, reasoning_content: 'synthetic private reasoning',
        } }] }) }),
    }), error => error.code === 'PROVIDER_INVALID_RESPONSE'
      && !JSON.stringify(error).includes('synthetic private reasoning'));
  }
});

test('generic adapter preserves sanitized 429 code and numeric reset hints', async () => {
  await assert.rejects(requestOpenAICompatibleWorksheetJson('synthetic prompt', {
    provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b', apiKey: 'synthetic-key',
    responseSchema: RESPONSE_SCHEMA, fetchImpl: async () => ({ ok: false, status: 429,
      headers: new Headers({ 'retry-after': '7', 'x-ratelimit-reset-tokens': '250ms',
        'x-ratelimit-reset-requests': '2m59.56s' }),
      json: async () => ({ error: { code: 'rate_limit', type: 'quota', message: 'synthetic prompt' } }),
    }),
  }), error => error.code === 'PROVIDER_RATE_LIMIT' && error.httpStatus === 429
    && error.providerErrorCode === 'rate_limit/quota' && error.providerErrorReason === undefined
    && error.retryAfterSeconds === 7 && error.resetTokensMs === 250 && error.resetRequestsMs === 179560);
});

const groqResponse = (content, finish_reason = 'stop') => ({ ok: true,
  json: async () => ({ choices: [{ finish_reason, message: { content } }] }) });
const topics = { Monday: 'metapora', Tuesday: 'simile', Wednesday: 'tugma', Thursday: 'sukat', Friday: 'persona' };
const fixture = (day, batch) => JSON.stringify({ title: `${day} worksheet`, directions: 'Answer the questions.',
  coverageLimitation: '', questions: Array.from({ length: 10 }, (_, index) => {
    const base = { question: `${day} ${topics[day]} batch ${batch} item ${index}`, points: 1, options: [], correct_answer: '' };
    if (index < 4) return { ...base, item_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correct_answer: 'A',
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
    for (const [change, expectedCalls] of [
      [value => { value.questions[7].enumeration.alternatives = ['one']; }, 2],
      [value => { value.questions[1].question = value.questions[0].question; }, 2],
      [value => { value.questions[0].correct_answer = 'missing'; }, 2]]) {
      let calls = 0;
      await assert.rejects(generateWeeklyWorksheetDrafts(plan, sources, { questionCount: 20, log: { info() {} },
        generateText: (prompt, options) => requestWeeklyWorksheetJson(prompt, { ...options, apiKey: 'synthetic-key',
          fetchImpl: async () => { calls += 1; const value = JSON.parse(fixture('Monday', 1));
            change(value); return groqResponse(JSON.stringify(value)); } }),
      }), error => error.code === 'AI_RESPONSE_INVALID' && error.providerCalls === expectedCalls);
      assert.equal(calls, expectedCalls);
    }
  } finally {
    if (previous.provider === undefined) delete process.env.WEEKLY_WORKSHEET_PROVIDER;
    else process.env.WEEKLY_WORKSHEET_PROVIDER = previous.provider;
    if (previous.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.node;
  }
});
