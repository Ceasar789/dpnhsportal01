import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createWeeklyDraftWorkerCoordinator } from '../lib/weeklyDraftWorkerCoordinator.js';
import { createWeeklyDraftWorkerRouter } from './weeklyDraftWorker.js';

const secret = 'synthetic-worker-secret';
const jobId = '33333333-3333-4333-8333-333333333333';
const authorized = { authorization: `Bearer ${secret}` };

async function serve(router, callback) {
  const app = express();
  app.use('/internal/weekly-draft-worker', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/internal/weekly-draft-worker`;
    await callback((headers = {}) => fetch(base, { method: 'GET', headers }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('missing, malformed, wrong and different-length secrets are refused before work', async () => {
  let calls = 0;
  const router = createWeeklyDraftWorkerRouter({ workerSecret: secret,
    coordinator: { async runOnce() { calls++; return { status: 'idle' }; } } });
  await serve(router, async request => {
    for (const headers of [{}, { authorization: 'Basic synthetic-worker-secret' },
      { authorization: 'Bearer wrong' }, { authorization: 'Bearer synthetic-worker-secret-extra' },
      { authorization: `bearer ${secret}` }, { authorization: `Bearer ${secret} extra` }]) {
      const response = await request(headers);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { status: 'unauthorized' });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
  assert.equal(calls, 0);
});

test('factory refuses missing coordinator or empty and unusable secrets', () => {
  const coordinator = { async runOnce() { return { status: 'idle' }; } };
  for (const options of [{}, { workerSecret: secret }, { coordinator },
    { coordinator, workerSecret: '' }, { coordinator, workerSecret: '  ' },
    { coordinator, workerSecret: 'has space' }]) {
    assert.throws(() => createWeeklyDraftWorkerRouter(options), TypeError);
  }
});

test('correct bearer runs the coordinator once and returns bounded idle or action status', async () => {
  for (const status of ['idle', 'no_claim', 'canceled', 'stale', 'not_dispatched',
    'failed', 'checkpointed', 'completed', 'not_completed']) {
    let calls = 0;
    const router = createWeeklyDraftWorkerRouter({ workerSecret: secret,
      coordinator: { async runOnce() {
        calls++;
        return { status, jobId: 'private-job', checkpoints: ['private-answer'] };
      } } });
    await serve(router, async request => {
      const response = await request(authorized);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    });
    assert.equal(calls, 1);
  }
});

test('unconfirmed worker status is an HTTP failure without private outcome data', async () => {
  let calls = 0;
  const router = createWeeklyDraftWorkerRouter({ workerSecret: secret,
    coordinator: { async runOnce() {
      calls++;
      return { status: 'unconfirmed', checkpoint: { answers: 'private' } };
    } } });
  await serve(router, async request => {
    const response = await request(authorized);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'error' });
  });
  assert.equal(calls, 1);
});

test('coordinator error status or thrown failure is non-2xx and reveals no private data', async () => {
  for (const outcome of [{ status: 'error', sourceHtml: 'private source' },
    new Error('private provider response and secret')]) {
    let calls = 0;
    const router = createWeeklyDraftWorkerRouter({ workerSecret: secret,
      coordinator: { async runOnce() {
        calls++;
        if (outcome instanceof Error) throw outcome;
        return outcome;
      } } });
    await serve(router, async request => {
      const response = await request(authorized);
      assert.equal(response.status, 503);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { status: 'error' });
      assert.equal(text.includes('private'), false);
      assert.equal(text.includes(secret), false);
    });
    assert.equal(calls, 1);
  }
});

test('unknown or unconfirmed standalone timeout status fails closed and is not echoed', async () => {
  for (const status of ['private-state', 'timeout']) {
    const router = createWeeklyDraftWorkerRouter({ workerSecret: secret,
      coordinator: { async runOnce() { return { status, answers: ['private'] }; } } });
    await serve(router, async request => {
      const response = await request(authorized);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: 'error' });
    });
  }
});

test('claim and recover receive the same HTTP-entry time after delayed discovery', async () => {
  for (const action of ['claim', 'recover']) {
    const invocationStartedAt = performance.now();
    let now = invocationStartedAt;
    let clockReads = 0;
    let discoveries = 0;
    const batches = [];
    let markDiscovery;
    const discoveryStarted = new Promise(resolve => { markDiscovery = resolve; });
    let releaseDiscovery;
    const discoveryGate = new Promise(resolve => { releaseDiscovery = resolve; });
    const coordinator = createWeeklyDraftWorkerCoordinator({
      jobAdapter: { async discoverWork() {
        discoveries++;
        markDiscovery();
        await discoveryGate;
        return { jobId, action };
      } },
      batchService: { async processOneBatch(id, startedAt) {
        batches.push([id, startedAt]);
        return { status: 'checkpointed' };
      } },
      assemblyService: { async assemble() { throw new Error('Unexpected assembly.'); } },
    });
    const router = createWeeklyDraftWorkerRouter({ coordinator, workerSecret: secret,
      clock: { now() { clockReads++; return now; } } });
    await serve(router, async request => {
      const pending = request(authorized);
      await discoveryStarted;
      now = invocationStartedAt + 9_999;
      releaseDiscovery();
      const response = await pending;
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'checkpointed' });
    });
    assert.equal(clockReads, 1);
    assert.equal(discoveries, 1);
    assert.deepEqual(batches, [[jobId, invocationStartedAt]]);
  }
});

test('bad clock fails authorized work with generic 503 while unauthenticated work stays blocked', async () => {
  for (const clock of [{ now: () => NaN }, { now: () => -1 },
    { now() { throw new Error('private clock detail'); } }, {}]) {
    let calls = 0;
    const router = createWeeklyDraftWorkerRouter({ workerSecret: secret, clock,
      coordinator: { async runOnce() { calls++; return { status: 'idle' }; } } });
    await serve(router, async request => {
      const denied = await request();
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { status: 'unauthorized' });
      const authorizedResponse = await request(authorized);
      assert.equal(authorizedResponse.status, 503);
      assert.deepEqual(await authorizedResponse.json(), { status: 'error' });
      assert.equal(authorizedResponse.headers.get('cache-control'), 'no-store');
    });
    assert.equal(calls, 0);
  }
});
