import assert from 'node:assert/strict';
import test from 'node:test';
import { runWeeklyDraftWorkerTick, REQUEST_TIMEOUT_MS } from './weekly-draft-worker-tick.mjs';

const endpoint = 'https://example.test/api/internal/weekly-draft-worker';
const secret = 'synthetic-worker-secret';
const response = (status, code = 200) => ({ status: code, redirected: false,
  body: JSON.stringify({ status }) });

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('waits for each confirmed checkpoint before requesting another action', async () => {
  const clock = fakeClock();
  const seen = [];
  let inFlight = false;
  const request = async (url, options) => {
    assert.equal(inFlight, false);
    inFlight = true;
    seen.push({ url, options });
    await Promise.resolve();
    inFlight = false;
    return response(seen.length === 3 ? 'completed' : 'checkpointed');
  };
  const result = await runWeeklyDraftWorkerTick({ endpoint, secret, request, clock });
  assert.deepEqual(result, { status: 'completed', requests: 3 });
  assert.equal(seen.length, 3);
  for (const { url, options } of seen) {
    assert.equal(url, endpoint);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
  }
});

test('stops on every confirmed outcome that cannot justify another immediate action', async () => {
  for (const status of ['idle', 'completed', 'canceled', 'failed', 'no_claim', 'stale',
    'not_dispatched', 'not_completed']) {
    let calls = 0;
    const result = await runWeeklyDraftWorkerTick({ endpoint, secret,
      request: async () => { calls++; return response(status); }, clock: fakeClock() });
    assert.deepEqual(result, { status, requests: 1 });
    assert.equal(calls, 1);
  }
});

test('HTTP errors, timeouts and uncertain transport stop without a retry or leaked detail', async () => {
  for (const [request, expectedCode] of [[async () => response('unauthorized', 401), 'http_error'],
    [async () => response('error', 503), 'http_error'],
    [async () => { throw new Error(`private ${secret}`); }, 'transport_uncertain']]) {
    let calls = 0;
    await assert.rejects(runWeeklyDraftWorkerTick({ endpoint, secret, clock: fakeClock(),
      request: async (...args) => { calls++; return request(...args); } }), error => {
      assert.equal(error.code, expectedCode);
      assert.equal(String(error).includes(secret), false);
      return true;
    });
    assert.equal(calls, 1);
  }
  const clock = fakeClock();
  let calls = 0;
  const pending = runWeeklyDraftWorkerTick({ endpoint, secret, clock,
    request: async () => { calls++; return new Promise(() => {}); } });
  await Promise.resolve();
  clock.advance(REQUEST_TIMEOUT_MS);
  await assert.rejects(pending, error => error.code === 'timeout');
  assert.equal(calls, 1);
});

test('rejects redirects and malformed or unknown responses without another request', async () => {
  for (const received of [{ ...response('checkpointed'), redirected: true },
    response('checkpointed', 302), { status: 200, body: '{', redirected: false },
    { status: 200, body: '{"status":"checkpointed","answers":[]}', redirected: false },
    { status: 200, body: `${' '.repeat(129)}{"status":"checkpointed"}`, redirected: false },
    response('private-state')]) {
    let calls = 0;
    await assert.rejects(runWeeklyDraftWorkerTick({ endpoint, secret, clock: fakeClock(),
      request: async () => { calls++; return received; } }));
    assert.equal(calls, 1);
  }
});

test('limits a run to 21 confirmed requests and refuses another when time is short', async () => {
  let calls = 0;
  const capped = await runWeeklyDraftWorkerTick({ endpoint, secret, clock: fakeClock(),
    request: async () => { calls++; return response('checkpointed'); } });
  assert.deepEqual(capped, { status: 'action_cap', requests: 21 });
  assert.equal(calls, 21);

  const clock = fakeClock();
  calls = 0;
  const budgeted = await runWeeklyDraftWorkerTick({ endpoint, secret, clock,
    request: async () => {
      calls++;
      clock.advance(119_000);
      return response('checkpointed');
    } });
  assert.deepEqual(budgeted, { status: 'time_cap', requests: 20 });
  assert.equal(calls, 20);
});

test('rejects unsafe or missing configuration without issuing a request', async () => {
  let calls = 0;
  for (const url of ['http://example.test/api/internal/weekly-draft-worker',
    'https://user@example.test/api/internal/weekly-draft-worker',
    `${endpoint}?token=x`, `${endpoint}#part`, `${endpoint}?`, `${endpoint}#`, `${endpoint}/`]) {
    await assert.rejects(runWeeklyDraftWorkerTick({ endpoint: url, secret,
      request: async () => { calls++; return response('idle'); }, clock: fakeClock() }),
    error => error.code === 'configuration');
  }
  await assert.rejects(runWeeklyDraftWorkerTick({ endpoint, secret: '',
    request: async () => { calls++; return response('idle'); }, clock: fakeClock() }),
  error => error.code === 'configuration');
  assert.equal(calls, 0);
});
