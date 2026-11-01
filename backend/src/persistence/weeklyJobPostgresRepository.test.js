import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyJobPostgresRepository } from './weeklyJobPostgresRepository.js';

const fakePool = () => {
  const calls = [];
  let released = 0;
  const client = { async query(sql, values = []) {
    calls.push({ sql, values });
    return { rows: [], rowCount: 1 };
  }, release() { released += 1; } };
  return { pool: { connect: async () => client }, calls, get released() { return released; } };
};

test('PostgreSQL adapter commits one transaction and rolls back a failed unit', async () => {
  const fixture = fakePool();
  const repository = createWeeklyJobPostgresRepository({ pool: fixture.pool });
  assert.equal(repository.atomic, true);
  assert.equal(repository.durable, true);
  await repository.transaction(tx => tx.putReceipt('teacher-1:request:with-colon',
    { fingerprint: 'a'.repeat(64), jobId: 'job-1' }));
  assert.equal(fixture.calls[0].sql, 'BEGIN');
  assert.deepEqual(fixture.calls[1].values.slice(0, 2), ['teacher-1', 'request:with-colon']);
  assert.equal(fixture.calls.at(-1).sql, 'COMMIT');
  await assert.rejects(repository.transaction(async tx => {
    await tx.putReceipt('teacher-1:second', { fingerprint: 'b'.repeat(64), jobId: 'job-2' });
    throw new Error('synthetic failure');
  }), /synthetic failure/);
  assert.equal(fixture.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(fixture.released, 2);
});

test('PostgreSQL job insert uses parameterized private state and checkpoint writes', async () => {
  const fixture = fakePool();
  const repository = createWeeklyJobPostgresRepository({ pool: fixture.pool });
  const job = { id: 'job-1', teacherId: 'teacher-1', sourceLessonPlanId: 'plan-1',
    sourceHash: 'a'.repeat(64), sourceVersion: '1', sources: [], plan: { id: 'plan-1' },
    version: 1, questionCount: 20, status: 'QUEUED', plannedProviderCalls: 10,
    attemptedProviderCalls: 1, revision: 1, lease: null, cancelRequested: false,
    retryAfter: null, failureCategory: null, collectionId: 'collection-1',
    worksheetIds: ['a', 'b', 'c', 'd', 'e'], checkpoints: [{ day: 'Monday', batch: 1,
      raw: '{"questions":[]}', questions: [] }] };
  await repository.transaction(tx => tx.putJob(job));
  assert.match(fixture.calls[1].sql, /INSERT INTO public\.weekly_worksheet_jobs/);
  assert.equal(JSON.parse(fixture.calls[1].values[7]).checkpoints, undefined);
  assert.match(fixture.calls[2].sql, /weekly_worksheet_checkpoints/);
  assert.equal(fixture.calls.at(-1).sql, 'COMMIT');
});
