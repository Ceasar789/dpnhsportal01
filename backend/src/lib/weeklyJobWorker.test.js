import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionWeeklyJobWorker, createWeeklyJobWorker } from './weeklyJobWorker.js';

test('production worker is disabled and starts no generation', async () => {
  assert.deepEqual(await createProductionWeeklyJobWorker().run(),
    { ok: false, code: 'integration_blocked' });
});

test('worker verifies its credential and executes at most one claimed step', async () => {
  const calls = [];
  const worker = createWeeklyJobWorker({ workerId: 'synthetic-worker',
    verifyWorker: async credential => credential === 'worker-token',
    service: { runStep: async (...args) => { calls.push(args); return { status: 'QUEUED' }; } },
  });
  assert.deepEqual(await worker.run('job-1', 'wrong'), { ok: false, code: 'worker_denied' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await worker.run('job-1', 'worker-token'),
    { ok: true, claimed: true, job: { status: 'QUEUED' } });
  assert.deepEqual(calls, [['job-1', 'synthetic-worker']]);
});
