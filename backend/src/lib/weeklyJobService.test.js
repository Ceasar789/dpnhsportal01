import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyJobService } from './weeklyJobService.js';
import { createSyntheticWeeklyJobRepository } from '../persistence/testing/syntheticWeeklyJobRepository.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const topics = { Monday: 'nucleus', Tuesday: 'membrane', Wednesday: 'cytoplasm',
  Thursday: 'ribosome', Friday: 'mitochondrion' };
const plan = { id: 'plan-1', teacher_id: 'teacher-1', ai_generated: true, title: 'Cells',
  objectives: '<p>Five-day cells lesson</p>', subject: 'Science', grade_level: 'Grade 7' };
const days = DAYS.map(day => ({ day, objective: `Describe ${day} cells`, activity: `Observe ${day} cells`,
  assessment: `Explain ${day} cells` }));
const response = (day, batch) => JSON.stringify({ title: `${day} cells`, directions: 'Answer every question.',
  questions: Array.from({ length: 10 }, (_, index) => {
    const base = { question: `${day} batch ${batch} ${topics[day]} question ${index}`, points: 1,
      options: [], correct_answer: '' };
    if (index < 4) return { ...base, item_type: 'multiple_choice', options: ['Nucleus', 'Membrane', 'Cytoplasm', 'Ribosome'],
      correct_answer: 'Nucleus' };
    if (index < 7) return { ...base, item_type: 'true_false', correct_answer: 'True' };
    if (index < 9) return { ...base, item_type: 'enumeration', correct_answer: 'nucleus, membrane' };
    return { ...base, item_type: 'essay', essay: { referenceAnswer: 'A cell has several structures.',
      minWords: 20, maxWords: 100, rubric: [{ criterion: 'Explains structure', points: 1 }] } };
  }) });
const provider = async (prompt, options) => {
  assert.equal(options.maxOutputTokens, 8192);
  assert.equal(options.responseSchema.properties.questions.maxItems, 10);
  const day = DAYS.find(value => prompt.includes(`"day":"${value}"`));
  const batch = Number(prompt.match(/batch (\d+)/)[1]);
  return response(day, batch);
};
const make = (options = {}) => {
  const repository = options.repository || createSyntheticWeeklyJobRepository();
  const service = createWeeklyJobService({ repository,
    resolveIdentity: async token => token === 'teacher-token'
      ? { id: 'teacher-1', role: 'teacher', status: 'active' } : null,
    resolveSource: async ({ teacherId }) => teacherId === 'teacher-1' ? { plan, days } : null,
    generateText: provider, ...options });
  return { service, repository };
};
const submit = (service, questionCount = 20, requestId = 'request-1') => service.submit('teacher-token',
  { requestId, sourceLessonPlanId: plan.id, questionCount });

test('durable submission rejects a changed source before inserting a job or receipt', async () => {
  const base = createSyntheticWeeklyJobRepository();
  const repository = { atomic: true, durable: true,
    transaction: callback => base.transaction(tx => callback({ ...tx, verifySource: async () => false })) };
  const { service } = make({ repository });
  await assert.rejects(submit(service), /source_changed/);
  assert.deepEqual(await service.listJobs('teacher-token'), []);
});

for (const questionCount of [20, 30, 40]) test(`${questionCount}/day: checkpoints, stable IDs, atomic private commit`, async () => {
  const { service } = make();
  const job = await submit(service, questionCount);
  assert.equal(job.status, 'QUEUED');
  assert.equal(JSON.stringify(job).includes('correct_answer'), false);
  assert.equal(job.plannedProviderCalls, questionCount / 2);
  assert.deepEqual(await submit(service, questionCount), job);
  await assert.rejects(service.status('outsider', job.id), /not_authenticated/);
  for (let call = 1; call <= job.plannedProviderCalls; call += 1) {
    const result = await service.runStep(job.id, 'worker-1');
    assert.equal(result.attemptedProviderCalls, call);
    assert.equal(result.completedValidatedBatches, call);
    assert.equal(result.status, call === job.plannedProviderCalls ? 'COMPLETED' : 'QUEUED');
  }
  const committed = await service.commit(job.id);
  assert.equal(committed.status, 'COMPLETED');
  assert.equal(committed.durable, false);
  const collection = await service.openCollection('teacher-token', committed.collectionId);
  assert.equal(collection.worksheets.length, 5);
  assert.deepEqual(collection.worksheets.map(item => item.day), DAYS);
  assert.ok(collection.worksheets.every(item => item.questions.length === questionCount
    && item.answerKey.length === questionCount * 0.9 && item.status === 'Draft'));
  assert.ok(collection.worksheets.every(item => item.questions[0].correct_answer === undefined));
  assert.ok(['distribution', 'studentIds', 'submissions', 'scoreRelease'].every(field => !(field in collection)));
  assert.equal((await service.commit(job.id)).collectionId, collection.id);
  await assert.rejects(service.openCollection('outsider', collection.id), /not_authenticated/);
  const monday = collection.worksheets[0];
  const updated = await service.updateDaily('teacher-token', collection.id,
    { ...monday, title: 'Edited Monday cells', subjectId: 'forged-subject' }, 1);
  assert.equal(updated.worksheet.revision, 2);
  await assert.rejects(service.updateDaily('teacher-token', collection.id, monday, 1), /revision_conflict/);
  const reopened = await service.openCollection('teacher-token', collection.id);
  assert.equal(reopened.worksheets[0].title, 'Edited Monday cells');
  assert.equal(reopened.worksheets[0].subjectId, monday.subjectId);
  assert.equal(reopened.worksheets[1].title, 'Tuesday cells');
});

test('one worker claim, expired lease and unknown outcome never silently repeat', async () => {
  let tick = 0; let release;
  const pending = new Promise(resolve => { release = resolve; });
  let providerCalls = 0;
  const { service } = make({ now: () => tick, generateText: async (...args) => {
    providerCalls += 1; await pending; return provider(...args);
  } });
  const job = await submit(service);
  const first = service.runStep(job.id, 'worker-1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await service.runStep(job.id, 'worker-2'), false);
  tick = 110_001;
  assert.equal(await service.runStep(job.id, 'worker-2'), false);
  release();
  const late = await first;
  assert.equal(late, false);
  const status = await service.status('teacher-token', job.id);
  assert.equal(status.status, 'INTERRUPTED_UNKNOWN_OUTCOME');
  assert.equal(status.attemptedProviderCalls, 1);
  assert.equal(status.completedValidatedBatches, 0);
  assert.equal(providerCalls, 1);
});

test('rate limit preserves checkpoints and requires an explicit capacity resume', async () => {
  let calls = 0; let tick = 0;
  const { service } = make({ now: () => tick, generateText: async (...args) => {
    calls += 1;
    if (calls === 2) throw Object.assign(new Error('private provider detail'),
      { code: 'PROVIDER_RATE_LIMIT', retryAfterSeconds: 60 });
    return provider(...args);
  } });
  const job = await submit(service);
  assert.equal((await service.runStep(job.id, 'worker')).completedValidatedBatches, 1);
  const waiting = await service.runStep(job.id, 'worker');
  assert.equal(waiting.status, 'WAITING_FOR_CAPACITY');
  assert.equal(waiting.completedValidatedBatches, 1);
  assert.equal(waiting.retryAfter, new Date(60_000).toISOString());
  assert.equal(await service.runStep(job.id, 'worker'), false);
  await assert.rejects(service.resume('teacher-token', job.id), /resume_unavailable/);
  tick = 60_000;
  await service.resume('teacher-token', job.id);
  assert.equal((await service.runStep(job.id, 'worker')).completedValidatedBatches, 2);
  assert.equal(calls, 3);
});

test('invalid batch, interrupted request, cancellation and commit rollback fail closed', async () => {
  const { service } = make({ generateText: async () => '{"title":' });
  const job = await submit(service);
  const invalid = await service.runStep(job.id, 'worker');
  assert.equal(invalid.status, 'FAILED_VALIDATION');
  assert.equal(invalid.completedValidatedBatches, 0);
  await assert.rejects(service.commit(job.id), /invalid_state/);
  const interrupted = make({ generateText: async () => {
    throw Object.assign(new Error('connection lost'), { code: 'PROVIDER_INTERRUPTED' });
  } });
  const other = await submit(interrupted.service);
  assert.equal((await interrupted.service.runStep(other.id, 'worker')).status, 'INTERRUPTED_UNKNOWN_OUTCOME');
  const canceled = make();
  const queued = await submit(canceled.service);
  assert.equal((await canceled.service.cancel('teacher-token', queued.id)).status, 'CANCELED');
  assert.equal(await canceled.service.runStep(queued.id, 'worker'), false);
});

test('request identity conflicts and source ownership are checked before provider use', async () => {
  const { service } = make();
  await submit(service);
  await assert.rejects(submit(service, 30), /idempotency_conflict/);
  await assert.rejects(service.submit('outsider', { requestId: 'x', sourceLessonPlanId: plan.id,
    questionCount: 20 }), /not_authenticated/);
});

test('in-flight cancel discards the late response and never commits', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { service } = make({ generateText: async (...args) => { await pending; return provider(...args); } });
  const job = await submit(service);
  const running = service.runStep(job.id, 'worker');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await service.cancel('teacher-token', job.id)).status, 'RUNNING');
  release();
  assert.equal((await running).status, 'CANCELED');
  assert.equal((await service.status('teacher-token', job.id)).completedValidatedBatches, 0);
});

test('changed source blocks final commit and retains the validated checkpoints', async () => {
  let currentPlan = plan;
  const { service } = make({ resolveSource: async () => ({ plan: currentPlan, days }) });
  const job = await submit(service);
  for (let index = 1; index < job.plannedProviderCalls; index += 1) await service.runStep(job.id, 'worker');
  currentPlan = { ...plan, objectives: '<p>Revised cells lesson</p>' };
  await assert.rejects(service.runStep(job.id, 'worker'), /source_changed/);
  const state = await service.status('teacher-token', job.id);
  assert.equal(state.status, 'FAILED_VALIDATION');
  assert.equal(state.completedValidatedBatches, job.plannedProviderCalls);
});

test('failed atomic commit keeps validated checkpoints and creates no partial collection', async () => {
  const repository = createSyntheticWeeklyJobRepository({ failCollectionCommit: true });
  const { service } = make({ repository });
  const job = await submit(service);
  for (let index = 1; index < job.plannedProviderCalls; index += 1) await service.runStep(job.id, 'worker');
  await assert.rejects(service.runStep(job.id, 'worker'), /synthetic commit failure/);
  const ready = await service.status('teacher-token', job.id);
  assert.equal(ready.status, 'READY_TO_COMMIT');
  assert.equal(ready.completedValidatedBatches, job.plannedProviderCalls);
  const collectionId = await repository.transaction(tx => tx.getJob(job.id).collectionId);
  await assert.rejects(service.openCollection('teacher-token', collectionId), /not_found/);
  const committed = await service.commit(job.id);
  assert.equal(committed.status, 'COMPLETED');
});

test('archive, restore and delete contracts preserve assessed records', async () => {
  const { service } = make();
  const job = await submit(service);
  for (let index = 0; index < job.plannedProviderCalls; index += 1) await service.runStep(job.id, 'worker');
  const collection = await service.openCollection('teacher-token', (await service.status('teacher-token', job.id)).collectionId);
  const mondayId = collection.worksheets[0].id;
  assert.equal((await service.changeArchive('teacher-token', collection.id,
    { worksheetId: mondayId, archived: true, expectedRevision: 1 })).status, 'Archived');
  await assert.rejects(service.deleteEligibleDraft('teacher-token', collection.id, 2), /assessed_record_protected/);
  assert.equal((await service.changeArchive('teacher-token', collection.id,
    { worksheetId: mondayId, archived: false, expectedRevision: 2 })).status, 'Draft');
  const guarded = make({ repository: createSyntheticWeeklyJobRepository({ references: true }) });
  const guardedJob = await submit(guarded.service);
  for (let index = 0; index < guardedJob.plannedProviderCalls; index += 1)
    await guarded.service.runStep(guardedJob.id, 'worker');
  const guardedCollection = await guarded.service.openCollection('teacher-token',
    (await guarded.service.status('teacher-token', guardedJob.id)).collectionId);
  await assert.rejects(guarded.service.changeArchive('teacher-token', guardedCollection.id,
    { archived: true, expectedRevision: 1 }), /assessed_record_protected/);
  await assert.rejects(guarded.service.deleteEligibleDraft('teacher-token', guardedCollection.id, 1),
    /assessed_record_protected/);
});

test('deleting an eligible private draft clears durable Saved status', async () => {
  const base = createSyntheticWeeklyJobRepository();
  const repository = { ...base, durable: true };
  const { service } = make({ repository });
  const job = await submit(service);
  for (let index = 0; index < job.plannedProviderCalls; index += 1)
    await service.runStep(job.id, 'worker');
  const saved = await service.status('teacher-token', job.id);
  assert.equal(saved.saved, true);
  await service.deleteEligibleDraft('teacher-token', saved.collectionId, 1);
  assert.equal((await service.status('teacher-token', job.id)).saved, false);
  assert.equal((await service.listJobs('teacher-token'))[0].collectionId, null);
});
