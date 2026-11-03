import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeeklyDraftWorkerCoordinator } from './weeklyDraftWorkerCoordinator.js';

const jobId = '33333333-3333-4333-8333-333333333333';
const invocationStartedAt = 0;

function setup({ work = null, batchResult = { status: 'checkpointed', batchIndex: 0 },
  assemblyResult = { status: 'completed' } } = {}) {
  const calls = { discover: 0, batch: [], assembly: [], claim: 0 };
  const jobAdapter = {
    async discoverWork() {
      calls.discover++;
      if (work instanceof Error) throw work;
      return work;
    },
    async claim() { calls.claim++; throw new Error('Coordinator must not claim.'); },
  };
  const batchService = { async processOneBatch(id, start) {
    calls.batch.push([id, start]);
    if (batchResult instanceof Error) throw batchResult;
    return batchResult;
  } };
  const assemblyService = { async assemble(id) {
    calls.assembly.push(id);
    if (assemblyResult instanceof Error) throw assemblyResult;
    return assemblyResult;
  } };
  return { calls, coordinator: createWeeklyDraftWorkerCoordinator({
    jobAdapter, batchService, assemblyService,
  }) };
}

test('idle tick discovers once and starts no action', async () => {
  const { calls, coordinator } = setup();
  assert.deepEqual(await coordinator.runOnce(invocationStartedAt), { status: 'idle' });
  assert.deepEqual(calls, { discover: 1, batch: [], assembly: [], claim: 0 });
});

test('claim and recover delegate exactly once to the batch service without claiming first', async () => {
  for (const action of ['claim', 'recover']) {
    const { calls, coordinator } = setup({ work: { jobId, action } });
    assert.deepEqual(await coordinator.runOnce(invocationStartedAt), { status: 'checkpointed' });
    assert.deepEqual(calls, { discover: 1, batch: [[jobId, invocationStartedAt]], assembly: [], claim: 0 });
  }
});

test('assemble delegates exactly once and does not dispatch a batch', async () => {
  const { calls, coordinator } = setup({ work: { jobId, action: 'assemble' } });
  assert.deepEqual(await coordinator.runOnce(invocationStartedAt), { status: 'completed' });
  assert.deepEqual(calls, { discover: 1, batch: [], assembly: [jobId], claim: 0 });
});

test('duplicate tick or Cancel race returns the existing stale outcome without trying another job', async () => {
  for (const status of ['no_claim', 'canceled', 'stale', 'not_dispatched']) {
    const { calls, coordinator } = setup({ work: { jobId, action: 'claim' },
      batchResult: { status } });
    assert.deepEqual(await coordinator.runOnce(invocationStartedAt), { status });
    assert.deepEqual(calls, { discover: 1, batch: [[jobId, invocationStartedAt]], assembly: [], claim: 0 });
  }
  const { calls, coordinator } = setup({ work: { jobId, action: 'assemble' },
    assemblyResult: { status: 'not_completed' } });
  assert.deepEqual(await coordinator.runOnce(invocationStartedAt), { status: 'not_completed' });
  assert.deepEqual(calls, { discover: 1, batch: [], assembly: [jobId], claim: 0 });
});

test('discovery or action errors return only a fixed status and never start a second action', async () => {
  for (const scenario of [
    { work: new Error('private checkpoint and credentials') },
    { work: { jobId, action: 'claim' },
      batchResult: new Error('private provider response and answers') },
    { work: { jobId, action: 'assemble' },
      assemblyResult: new Error('private source HTML and answer key') },
  ]) {
    const { calls, coordinator } = setup(scenario);
    const result = await coordinator.runOnce(invocationStartedAt);
    assert.deepEqual(result, { status: 'error' });
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.equal(calls.discover, 1);
    assert.ok(calls.batch.length + calls.assembly.length <= 1);
    assert.equal(calls.claim, 0);
  }
});

test('malformed discovery and private service results fail closed without leaking fields', async () => {
  for (const work of [{ jobId: 'bad-id', action: 'claim' },
    { jobId, action: 'save' }, { jobId, action: 'assemble', teacherId: 'private' }]) {
    const { calls, coordinator } = setup({ work });
    assert.deepEqual(await coordinator.runOnce(invocationStartedAt), { status: 'error' });
    assert.deepEqual(calls, { discover: 1, batch: [], assembly: [], claim: 0 });
  }
  for (const result of [{ status: 'checkpointed', checkpoint: { answers: 'private' } },
    { status: 'unknown', secret: 'private' }]) {
    const { coordinator } = setup({ work: { jobId, action: 'claim' }, batchResult: result });
    const output = await coordinator.runOnce(invocationStartedAt);
    assert.deepEqual(output, { status: result.status === 'checkpointed' ? 'checkpointed' : 'error' });
    assert.equal(JSON.stringify(output).includes('private'), false);
  }
});

test('constructor refuses missing dependencies', () => {
  assert.throws(() => createWeeklyDraftWorkerCoordinator(), TypeError);
});

test('missing or invalid start fails before discovery or action', async () => {
  const { calls, coordinator } = setup({ work: { jobId, action: 'claim' } });
  for (const start of [undefined, null, -1, NaN, Infinity, '1', performance.now() + 10_000]) {
    assert.deepEqual(await coordinator.runOnce(start), { status: 'error' });
  }
  assert.deepEqual(calls, { discover: 0, batch: [], assembly: [], claim: 0 });
});
