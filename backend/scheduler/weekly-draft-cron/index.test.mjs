import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createWeeklyDraftWorkerRouter } from '../../src/routes/weeklyDraftWorker.js';
import { createWeeklyDraftCronHandler, runWeeklyDraftCronTick,
  WORKER_URL, REQUEST_TIMEOUT_MS } from './index.mjs';

const secret = 'synthetic-worker-secret';
const env = { WEEKLY_DRAFT_WORKER_SECRET: secret };
const reply = (status, httpStatus = 200) => new Response(JSON.stringify({ status }),
  { status: httpStatus, headers: { 'Content-Type': 'application/json' } });

function fakeClock() {
  const timers = new Map();
  let nextId = 0;
  return {
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fire() { for (const [id, timer] of timers) { timers.delete(id); timer.callback(); } },
    get pending() { return timers.size; },
    get delay() { return [...timers.values()][0]?.delay; },
  };
}

async function withLocalWorker(outcome, callback) {
  let coordinatorCalls = 0;
  const app = express();
  app.use('/api/internal/weekly-draft-worker', createWeeklyDraftWorkerRouter({
    workerSecret: secret,
    coordinator: { async runOnce() { coordinatorCalls++; return outcome; } },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const localUrl = `http://127.0.0.1:${server.address().port}/api/internal/weekly-draft-worker`;
    await callback({ localUrl, calls: () => coordinatorCalls });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('the real Express route emits the exact one-field JSON accepted by the scheduler', async () => {
  for (const [outcome, expectedStatus, expectedHttp] of [
    [{ status: 'idle', privateData: 'hidden' }, 'idle', 200],
    [{ status: 'checkpointed', answers: 'hidden' }, 'checkpointed', 200],
    [{ status: 'completed', draft: 'hidden' }, 'completed', 200],
    [{ status: 'failed', jobId: 'hidden' }, 'failed', 200],
    [{ status: 'unconfirmed', response: 'hidden' }, 'error', 503],
  ]) {
    await withLocalWorker(outcome, async ({ localUrl, calls }) => {
      let requests = 0;
      const fetchImpl = async (url, options) => {
        assert.equal(url, WORKER_URL);
        requests++;
        const response = await fetch(localUrl, options);
        assert.equal(response.status, expectedHttp);
        assert.deepEqual(await response.clone().json(), { status: expectedStatus });
        return response;
      };
      if (expectedHttp !== 200 || expectedStatus === 'failed') {
        await assert.rejects(runWeeklyDraftCronTick({ env, fetchImpl }),
          error => error.code === (expectedHttp === 200 ? 'terminal_failed' : 'http_error'));
      } else {
        assert.deepEqual(await runWeeklyDraftCronTick({ env, fetchImpl }),
          { status: expectedStatus });
      }
      assert.equal(requests, 1);
      assert.equal(calls(), 1);
    });
  }
});

test('one scheduled tick sends one authenticated GET and accepts bounded success statuses', async () => {
  for (const status of ['idle', 'checkpointed', 'completed', 'canceled',
    'no_claim', 'stale', 'not_dispatched', 'not_completed']) {
    const calls = [];
    const clock = fakeClock();
    const result = await runWeeklyDraftCronTick({ env, clock,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return reply(status);
      } });
    assert.equal(result.status, status);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, WORKER_URL);
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(calls[0].options.headers.Accept, 'application/json');
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.equal(clock.pending, 0);
  }
});

test('terminal failed and HTTP failures fail the tick without retry or response exposure', async () => {
  for (const [response, code] of [[reply('failed'), 'terminal_failed'],
    [reply('error', 503), 'http_error'], [reply('error', 504), 'http_error'],
    [reply('unauthorized', 401), 'http_error']]) {
    let calls = 0;
    const clock = fakeClock();
    await assert.rejects(runWeeklyDraftCronTick({ env, clock,
      fetchImpl: async () => { calls++; return response; } }),
    error => error.code === code && !String(error).includes(secret));
    assert.equal(calls, 1);
    assert.equal(clock.pending, 0);
  }
});

test('redirects, malformed bodies, and private response fields fail closed', async () => {
  for (const response of [new Response(null, { status: 302, headers: { Location: WORKER_URL } }),
    new Response('{'), new Response('{"status":"idle","answers":"private"}'),
    new Response(JSON.stringify({ status: 'unknown' })),
    new Response(' '.repeat(129) + '{"status":"idle"}')]) {
    let calls = 0;
    await assert.rejects(runWeeklyDraftCronTick({ env, clock: fakeClock(),
      fetchImpl: async () => { calls++; return response; } }),
    error => ['http_error', 'malformed_response'].includes(error.code));
    assert.equal(calls, 1);
  }
});

test('a timed-out or uncertain request is aborted and never retried in the tick', async () => {
  const clock = fakeClock();
  let calls = 0;
  let signal;
  const pending = runWeeklyDraftCronTick({ env, clock, fetchImpl: async (_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise(() => {});
  } });
  assert.equal(clock.delay, REQUEST_TIMEOUT_MS);
  clock.fire();
  await assert.rejects(pending, error => error.code === 'timeout');
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.equal(clock.pending, 0);

  calls = 0;
  await assert.rejects(runWeeklyDraftCronTick({ env, clock: fakeClock(),
    fetchImpl: async () => { calls++; throw new Error(`private ${secret}`); } }),
  error => error.code === 'transport_uncertain' && !String(error).includes(secret));
  assert.equal(calls, 1);
});

test('missing secret or unexpected URL fails before any request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return reply('idle'); };
  for (const badEnv of [undefined, {}, { WEEKLY_DRAFT_WORKER_SECRET: '' },
    { WEEKLY_DRAFT_WORKER_SECRET: 'has whitespace' }]) {
    await assert.rejects(runWeeklyDraftCronTick({ env: badEnv, fetchImpl }),
      error => error.code === 'configuration');
  }
  for (const endpoint of ['http://eduscribe-dnhs-portal.vercel.app/api/internal/weekly-draft-worker',
    'https://evil.example/api/internal/weekly-draft-worker', `${WORKER_URL}?token=x`,
    `${WORKER_URL}#fragment`, `${WORKER_URL}/`,
    'https://user@eduscribe-dnhs-portal.vercel.app/api/internal/weekly-draft-worker']) {
    await assert.rejects(runWeeklyDraftCronTick({ env, endpoint, fetchImpl }),
      error => error.code === 'configuration');
    assert.throws(() => createWeeklyDraftCronHandler({ endpoint, fetchImpl }),
      error => error.code === 'configuration');
  }
  assert.equal(calls, 0);
});

test('scheduled handler reports only fixed outcomes and redacts failures', async () => {
  const logs = [];
  const logger = { info: value => logs.push(value), error: value => logs.push(value) };
  let calls = 0;
  const success = createWeeklyDraftCronHandler({ logger, fetchImpl: async () => {
    calls++;
    return reply('idle');
  } });
  await success.scheduled({}, env);
  assert.equal(calls, 1);
  assert.deepEqual(logs, ['Weekly draft cron: idle.']);

  const failure = createWeeklyDraftCronHandler({ logger, fetchImpl: async () => {
    calls++;
    throw new Error(`private ${secret} worksheet content`);
  } });
  let noRetryCalls = 0;
  await assert.rejects(failure.scheduled({ noRetry() { noRetryCalls++; } }, env),
    error => !String(error).includes(secret));
  assert.equal(noRetryCalls, 1);
  assert.equal(calls, 2);
  assert.deepEqual(logs, ['Weekly draft cron: idle.',
    'Weekly draft cron stopped: transport_uncertain.']);
  assert.equal(JSON.stringify(logs).includes(secret), false);
});
