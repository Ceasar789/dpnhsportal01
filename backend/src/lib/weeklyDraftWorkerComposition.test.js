import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createWeeklyDraftWorkerComposition } from './weeklyDraftWorkerComposition.js';

const jobId = '33333333-3333-4333-8333-333333333333';
const env = () => ({ SUPABASE_URL: 'https://synthetic.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
  WEEKLY_DRAFT_WORKER_SECRET: 'synthetic-worker-secret',
  WEEKLY_WORKSHEET_PROVIDERS: 'groq:openai/gpt-oss-120b,nvidia:synthetic-model',
  GROQ_API_KEY: 'synthetic-provider-key', NVIDIA_API_KEY: 'synthetic-nvidia-key' });
const authorization = { authorization: 'Bearer synthetic-worker-secret' };

async function serve(router, callback) {
  const app = express();
  app.use('/worker', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/worker`;
    await callback(headers => fetch(url, { method: 'GET', headers }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('missing service-role, provider, or worker-secret configuration fails before client creation', () => {
  let clientCalls = 0;
  const getServiceRoleClient = () => { clientCalls++; return { rpc: async () => ({ data: null }) }; };
  for (const [field, value] of [
    ['SUPABASE_URL', undefined], ['SUPABASE_SERVICE_ROLE_KEY', undefined],
    ['WEEKLY_DRAFT_WORKER_SECRET', undefined], ['WEEKLY_DRAFT_WORKER_SECRET', '  '],
    ['WEEKLY_WORKSHEET_PROVIDERS', undefined], ['GROQ_API_KEY', undefined],
    ['NVIDIA_API_KEY', undefined],
  ]) {
    assert.throws(() => createWeeklyDraftWorkerComposition({
      env: { ...env(), [field]: value }, getServiceRoleClient,
      providerRequest: async () => '{}',
    }), TypeError);
  }
  assert.equal(clientCalls, 0);
  assert.throws(() => createWeeklyDraftWorkerComposition({ env: env() }), TypeError);
  assert.throws(() => createWeeklyDraftWorkerComposition({ env: env(),
    getServiceRoleClient: () => ({}), providerRequest: async () => '{}',
  }), TypeError);
  assert.throws(() => createWeeklyDraftWorkerComposition({ env: env(),
    getServiceRoleClient, providerRequest: null,
  }), TypeError);
});

test('constructing the real adapter/service stack performs no RPC, provider, or discovery call', async () => {
  const calls = { rpc: 0, provider: 0 };
  const router = createWeeklyDraftWorkerComposition({ env: env(),
    getServiceRoleClient: () => ({ async rpc(name, args) {
      calls.rpc++;
      assert.equal(name, 'weekly_draft_job_discover_work_v1');
      assert.deepEqual(args, {});
      return { data: null, error: null };
    } }),
    providerRequest: async () => { calls.provider++; throw new Error('unexpected provider call'); },
  });
  assert.deepEqual(calls, { rpc: 0, provider: 0 });
  await serve(router, async request => {
    const refused = await request({});
    assert.equal(refused.status, 401);
    assert.deepEqual(calls, { rpc: 0, provider: 0 });
    const accepted = await request(authorization);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { status: 'idle' });
  });
  assert.deepEqual(calls, { rpc: 1, provider: 0 });
});

test('one authorized synthetic tick wires one fixed provider attempt and reveals no private data', async () => {
  const calls = { client: 0, discover: 0, batch: 0, provider: 0, assembly: 0 };
  const serviceRoleClient = { rpc: async () => { throw new Error('unexpected RPC'); } };
  const responseSchema = { type: 'OBJECT' };
  const signal = new AbortController().signal;
  const jobAdapter = { async discoverWork() {
    calls.discover++;
    return { jobId, action: 'claim' };
  } };
  const router = createWeeklyDraftWorkerComposition({ env: env(),
    getServiceRoleClient: () => { calls.client++; return serviceRoleClient; },
    createJobAdapter: ({ serviceRoleClient: client, teacherClientForJwt }) => {
      assert.equal(client, serviceRoleClient);
      assert.throws(() => teacherClientForJwt('synthetic-browser-token'), TypeError);
      return jobAdapter;
    },
    createBatchService: ({ jobAdapter: adapter, providerBatch }) => {
      assert.equal(adapter, jobAdapter);
      return { async processOneBatch(id) {
        calls.batch++;
        assert.equal(id, jobId);
        await providerBatch('Synthetic prompt.', { batchIndex: 0, signal,
          responseSchema, maxOutputTokens: 8192 });
        return { status: 'checkpointed', checkpoint: { answers: 'private' } };
      } };
    },
    createAssemblyService: ({ jobAdapter: adapter }) => {
      assert.equal(adapter, jobAdapter);
      return { async assemble() { calls.assembly++; throw new Error('unexpected assembly'); } };
    },
    providerRequest: async (prompt, options) => {
      calls.provider++;
      assert.equal(prompt, 'Synthetic prompt.');
      assert.equal(options.provider, 'groq');
      assert.equal(options.model, 'openai/gpt-oss-120b');
      assert.equal(options.apiKey, env().GROQ_API_KEY);
      assert.equal(options.signal, signal);
      assert.equal(options.responseSchema, responseSchema);
      assert.equal(options.maxOutputTokens, 8192);
      return '{"synthetic":"response"}';
    },
  });
  assert.deepEqual(calls, { client: 1, discover: 0, batch: 0, provider: 0, assembly: 0 });
  await serve(router, async request => {
    const response = await request(authorization);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { status: 'checkpointed' });
    assert.equal(text.includes('private'), false);
    assert.equal(text.includes(env().WEEKLY_DRAFT_WORKER_SECRET), false);
    assert.equal(text.includes(env().GROQ_API_KEY), false);
  });
  assert.deepEqual(calls, { client: 1, discover: 1, batch: 1, provider: 1, assembly: 0 });
});

test('separate worker invocations rotate claimed batches through configured providers', async () => {
  const configured = { ...env(),
    WEEKLY_WORKSHEET_PROVIDERS: 'cloudflare:@cf/openai/gpt-oss-120b,groq:openai/gpt-oss-120b,nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-key',
    CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' };
  const expected = [
    { provider: 'cloudflare', model: '@cf/openai/gpt-oss-120b',
      apiKey: configured.CLOUDFLARE_API_TOKEN, accountId: configured.CLOUDFLARE_ACCOUNT_ID },
    { provider: 'groq', model: 'openai/gpt-oss-120b', apiKey: configured.GROQ_API_KEY },
    { provider: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b',
      apiKey: configured.NVIDIA_API_KEY },
  ];
  const selected = [];
  for (let batchIndex = 0; batchIndex < 6; batchIndex++) {
    const signal = new AbortController().signal;
    const responseSchema = { type: 'OBJECT' };
    const router = createWeeklyDraftWorkerComposition({ env: configured,
      getServiceRoleClient: () => ({ rpc: async () => { throw new Error('unexpected RPC'); } }),
      createJobAdapter: () => ({ discoverWork: async () => ({ jobId, action: 'claim' }) }),
      createBatchService: ({ providerBatch }) => ({ async processOneBatch() {
        await providerBatch('Synthetic prompt.', { batchIndex, signal,
          responseSchema, maxOutputTokens: 8192 });
        return { status: 'checkpointed' };
      } }),
      createAssemblyService: () => ({ assemble: async () => { throw new Error('unexpected assembly'); } }),
      providerRequest: async (prompt, options) => {
        assert.equal(prompt, 'Synthetic prompt.');
        assert.equal(options.signal, signal);
        assert.equal(options.responseSchema, responseSchema);
        assert.equal(options.maxOutputTokens, 8192);
        selected.push(options);
        return '{"synthetic":"response"}';
      },
    });
    await serve(router, async request => {
      const result = await request(authorization);
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { status: 'checkpointed' });
    });
  }
  assert.equal(selected.length, 6);
  selected.forEach((options, index) => {
    const { signal: _signal, responseSchema: _schema, maxOutputTokens: _tokens,
      ...providerOptions } = options;
    assert.deepEqual(providerOptions, expected[index % expected.length]);
  });
});

test('missing chain credentials or Cloudflare account ID fail before worker construction', () => {
  const configured = { ...env(),
    WEEKLY_WORKSHEET_PROVIDERS: 'cloudflare:@cf/openai/gpt-oss-120b,groq:openai/gpt-oss-120b,nvidia:nvidia/nemotron-3-ultra-550b-a55b',
    CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-key',
    CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' };
  let clientCalls = 0;
  for (const [field, value] of [
    ['CLOUDFLARE_API_TOKEN', undefined], ['CLOUDFLARE_ACCOUNT_ID', undefined],
    ['CLOUDFLARE_ACCOUNT_ID', 'invalid'], ['GROQ_API_KEY', undefined],
    ['NVIDIA_API_KEY', undefined],
  ]) {
    assert.throws(() => createWeeklyDraftWorkerComposition({
      env: { ...configured, [field]: value },
      getServiceRoleClient: () => { clientCalls++; return { rpc: async () => null }; },
      providerRequest: async () => { throw new Error('unexpected provider call'); },
    }), TypeError);
  }
  assert.equal(clientCalls, 0);
});

test('an uncertain or capacity provider error never dispatches to another chain entry', async () => {
  for (const code of ['PROVIDER_INTERRUPTED', 'PROVIDER_RATE_LIMIT']) {
    const calls = [];
    const router = createWeeklyDraftWorkerComposition({ env: env(),
      getServiceRoleClient: () => ({ rpc: async () => { throw new Error('unexpected RPC'); } }),
      createJobAdapter: () => ({ discoverWork: async () => ({ jobId, action: 'claim' }) }),
      createBatchService: ({ providerBatch }) => ({ async processOneBatch() {
        await providerBatch('Synthetic prompt.', { batchIndex: 0,
          signal: new AbortController().signal, responseSchema: { type: 'OBJECT' },
          maxOutputTokens: 8192 });
        return { status: 'checkpointed' };
      } }),
      createAssemblyService: () => ({ assemble: async () => { throw new Error('unexpected assembly'); } }),
      providerRequest: async (_prompt, options) => {
        calls.push(options.provider);
        throw Object.assign(new Error('synthetic failure'), { code });
      },
    });
    await serve(router, async request => {
      const result = await request(authorization);
      assert.equal(result.status, 503);
      assert.deepEqual(await result.json(), { status: 'error' });
    });
    assert.deepEqual(calls, ['groq']);
  }
});

test('explicit Gemini selection forwards one batch to the worksheet transport', async () => {
  const calls = { gemini: 0, chain: 0 };
  const signal = new AbortController().signal;
  const responseSchema = { type: 'OBJECT' };
  const router = createWeeklyDraftWorkerComposition({
    env: { ...env(), WEEKLY_DRAFT_PROVIDER: 'gemini', GEMINI_API_KEY: ' synthetic-gemini-key ',
      WEEKLY_WORKSHEET_PROVIDERS: undefined, GROQ_API_KEY: undefined },
    getServiceRoleClient: () => ({ rpc: async () => { throw new Error('unexpected RPC'); } }),
    createJobAdapter: () => ({ discoverWork: async () => ({ jobId, action: 'claim' }) }),
    createBatchService: ({ providerBatch }) => ({ async processOneBatch() {
      await providerBatch('Synthetic prompt.', { signal, responseSchema, maxOutputTokens: 8192 });
      return { status: 'checkpointed' };
    } }),
    createAssemblyService: () => ({ assemble: async () => { throw new Error('unexpected assembly'); } }),
    providerRequest: async () => { calls.chain++; throw new Error('unexpected chain call'); },
    geminiRequest: async (prompt, options) => {
      calls.gemini++;
      assert.equal(prompt, 'Synthetic prompt.');
      assert.deepEqual(options, { apiKey: 'synthetic-gemini-key', signal,
        responseSchema, maxOutputTokens: 8192 });
      return '{"synthetic":"response"}';
    },
  });
  assert.deepEqual(calls, { gemini: 0, chain: 0 });
  await serve(router, async request => {
    const response = await request(authorization);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'checkpointed' });
  });
  assert.deepEqual(calls, { gemini: 1, chain: 0 });
});

test('Gemini requires a nonblank key and rejects unknown worker provider selections', () => {
  let clientCalls = 0;
  const getServiceRoleClient = () => { clientCalls++; return { rpc: async () => ({ data: null }) }; };
  for (const [selection, key] of [
    ['gemini', undefined], ['gemini', '  '], ['groq', 'synthetic-gemini-key'],
    ['', 'synthetic-gemini-key'],
  ]) {
    assert.throws(() => createWeeklyDraftWorkerComposition({
      env: { ...env(), WEEKLY_DRAFT_PROVIDER: selection, GEMINI_API_KEY: key },
      getServiceRoleClient, providerRequest: async () => '{}', geminiRequest: async () => '{}',
    }), TypeError);
  }
  assert.equal(clientCalls, 0);
});

test('a Gemini transport failure does not retry or fall back to the chain', async () => {
  let geminiCalls = 0;
  let chainCalls = 0;
  const router = createWeeklyDraftWorkerComposition({
    env: { ...env(), WEEKLY_DRAFT_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-gemini-key' },
    getServiceRoleClient: () => ({ rpc: async () => { throw new Error('unexpected RPC'); } }),
    createJobAdapter: () => ({ discoverWork: async () => ({ jobId, action: 'claim' }) }),
    createBatchService: ({ providerBatch }) => ({ async processOneBatch() {
      await providerBatch('Synthetic prompt.', { signal: new AbortController().signal,
        responseSchema: { type: 'OBJECT' }, maxOutputTokens: 8192 });
      return { status: 'checkpointed' };
    } }),
    createAssemblyService: () => ({ assemble: async () => { throw new Error('unexpected assembly'); } }),
    providerRequest: async () => { chainCalls++; throw new Error('unexpected chain call'); },
    geminiRequest: async () => { geminiCalls++; throw new Error('synthetic provider failure'); },
  });
  await serve(router, async request => {
    const response = await request(authorization);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'error' });
  });
  assert.equal(geminiCalls, 1);
  assert.equal(chainCalls, 0);
});
