import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDailyBatch } from './weeklyWorksheetGenerator.js';
import { createWeeklyDraftAssemblyService } from './weeklyDraftAssemblyService.js';

const jobId = '33333333-3333-4333-8333-333333333333';
const teacherId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const topics = ['fractions', 'ratios', 'patterns', 'graphs', 'equations'];
const plan = { id: planId, title: 'Synthetic weekly plan', subject: 'Mathematics',
  subject_id: null, grade_level: 'Grade 7', academic_year: '2026-2027' };
const sourceDays = days.map(day => ({ day, objective: `Study ${day} examples`,
  activity: `Compare ${day} examples`, assessment: `Explain ${day} examples` }));

const questionText = (day, batch, index) =>
  `${day} batch ${batch} question ${index}: Explain ${topics[days.indexOf(day)]}.`;
const rawQuestion = (day, batch, index, allChoice = false) => {
  const base = { question: questionText(day, batch, index), points: 1, options: [], correct_answer: '' };
  if (allChoice || index < 4) return { ...base, item_type: 'multiple_choice',
    options: ['First', 'Second', 'Third', 'Fourth'], correct_answer: 'First' };
  if (index < 7) return { ...base, item_type: 'true_false', correct_answer: 'True' };
  if (index < 9) return { ...base, item_type: 'enumeration', correct_answer: 'one, two',
    enumeration: { alternatives: [], orderSensitive: false } };
  return { ...base, item_type: 'essay', essay: { referenceAnswer: 'A worked explanation.',
    minWords: 10, maxWords: 100, rubric: [{ criterion: 'Reasoning', points: 1 }] } };
};
const parsedBatch = (dayIndex, batch, { allChoice = false, duplicate = false, note = true } = {}) => {
  const day = days[dayIndex];
  const questions = Array.from({ length: 10 }, (_, index) => rawQuestion(day, batch, index, allChoice));
  if (duplicate) questions[0].question = questionText('Monday', 1, 0).replace('Monday', day);
  const raw = { title: `${day} batch ${batch} title`, directions: `${day} batch ${batch} directions`,
    coverageLimitation: dayIndex === 0 && note ? `Note ${batch}.` : '', questions };
  return parseDailyBatch(JSON.stringify(raw), plan, sourceDays[dayIndex], 10, batch);
};
const receiptFor = (questionCount = 20) => {
  const batchesPerDay = questionCount / 10;
  return { id: jobId, teacherId, sourceLessonPlanId: planId, plan, sourceDays,
    questionCount, plannedCalls: batchesPerDay * 5,
    checkpoints: Array.from({ length: batchesPerDay * 5 }, (_, batchIndex) => ({
      batchIndex, validatedResponse: parsedBatch(Math.floor(batchIndex / batchesPerDay),
        batchIndex % batchesPerDay + 1),
    })) };
};
const setup = (receipt = receiptFor(), completion = true,
  { readError = null, markResult = true } = {}) => {
  const calls = { read: 0, complete: [], mark: [] };
  const jobAdapter = { async readCheckpoints(id) {
    assert.equal(id, jobId); calls.read++;
    if (readError) throw readError;
    return receipt;
  }, async complete(id, collection) {
    assert.equal(id, jobId); calls.complete.push(collection);
    if (completion instanceof Error) throw completion;
    return completion;
  }, async failFinalization(id, category) {
    assert.equal(id, jobId); calls.mark.push(category);
    if (markResult instanceof Error) throw markResult;
    return markResult;
  } };
  return { service: createWeeklyDraftAssemblyService({ jobAdapter }), calls };
};

test('assembles verified batches into the minimal unsaved collection and returns only status', async () => {
  for (const questionCount of [20, 30, 40]) {
    const { service, calls } = setup(receiptFor(questionCount));
    assert.deepEqual(await service.assemble(jobId), { status: 'completed' });
    assert.equal(calls.read, 1);
    assert.equal(calls.complete.length, 1);
    assert.deepEqual(calls.mark, []);
    const collection = calls.complete[0];
    assert.deepEqual(Object.keys(collection), ['kind', 'status', 'saved', 'teacherId',
      'sourceLessonPlan', 'worksheets']);
    assert.equal(collection.kind, 'weekly-worksheet-collection');
    assert.equal(collection.status, 'local-draft');
    assert.equal(collection.saved, false);
    assert.equal(collection.teacherId, teacherId);
    assert.deepEqual(collection.sourceLessonPlan, { id: planId, title: plan.title });
    assert.deepEqual(collection.worksheets.map(draft => draft.day), days);
    for (const [dayIndex, draft] of collection.worksheets.entries()) {
      assert.equal(draft.title, `${days[dayIndex]} batch 1 title`);
      assert.equal(draft.instructions, `${days[dayIndex]} batch 1 directions`);
      assert.equal(draft.questions.length, questionCount);
      assert.equal(draft.answerKey.length, questionCount / 10 * 9);
      assert.deepEqual(draft.questions.map(item => item.localId),
        Array.from({ length: questionCount }, (_, index) => `draft-${index + 1}`));
      assert.equal(draft.schoolYear, plan.academic_year);
      assert.equal(draft.status, 'generated-draft');
      assert.equal(draft.saved, false);
    }
    assert.equal(collection.worksheets[0].distributionNote,
      Array.from({ length: questionCount / 10 }, (_, index) => `Note ${index + 1}.`).join(' '));
  }
});

test('missing, reordered, or nonconsecutive checkpoints never reach complete', async () => {
  const cases = [
    value => { value.checkpoints.pop(); },
    value => { [value.checkpoints[0], value.checkpoints[1]] = [value.checkpoints[1], value.checkpoints[0]]; },
    value => { value.checkpoints[1].batchIndex = 3; },
  ];
  for (const change of cases) {
    const receipt = receiptFor(); change(receipt);
    const { service, calls } = setup(receipt);
    await assert.rejects(service.assemble(jobId), { code: 'INVALID_CHECKPOINT' });
    assert.equal(calls.complete.length, 0);
    assert.deepEqual(calls.mark, ['validation']);
  }
});

test('invalid weekday order, question count, or planned call count never reaches complete', async () => {
  const cases = [
    value => { value.sourceDays = [...value.sourceDays].reverse(); },
    value => { value.questionCount = 25; },
    value => { value.plannedCalls = 9; },
  ];
  for (const change of cases) {
    const receipt = receiptFor(); change(receipt);
    const { service, calls } = setup(receipt);
    await assert.rejects(service.assemble(jobId), { code: 'INVALID_CHECKPOINT' });
    assert.equal(calls.complete.length, 0);
    assert.deepEqual(calls.mark, ['validation']);
  }
});

test('malformed question or misaligned answer key never reaches complete', async () => {
  const cases = [
    value => { value.checkpoints[0].validatedResponse.questions[0].question = ''; },
    value => { value.checkpoints[0].validatedResponse.answerKey[0].localId = 'draft-2'; },
    value => { value.checkpoints[0].validatedResponse.answerKey[0].correct_answer = 'No option'; },
  ];
  for (const change of cases) {
    const receipt = receiptFor(); change(receipt);
    const { service, calls } = setup(receipt);
    await assert.rejects(service.assemble(jobId), { code: 'INVALID_CHECKPOINT' });
    assert.equal(calls.complete.length, 0);
    assert.deepEqual(calls.mark, ['validation']);
  }
});

test('daily mix failure retains the finalizer classification and does not complete', async () => {
  const receipt = receiptFor();
  for (let index = 0; index < 2; index++)
    receipt.checkpoints[index].validatedResponse = parsedBatch(0, index + 1,
      { allChoice: true, note: false });
  const { service, calls } = setup(receipt);
  await assert.rejects(service.assemble(jobId), error =>
    error.code === 'AI_RESPONSE_INVALID' && error.validation?.category === 'type_distribution');
  assert.equal(calls.complete.length, 0);
  assert.deepEqual(calls.mark, ['validation']);
});

test('cross-day duplicate retains the finalizer classification and does not complete', async () => {
  const receipt = receiptFor();
  receipt.checkpoints[2].validatedResponse = parsedBatch(1, 1, { duplicate: true });
  const { service, calls } = setup(receipt);
  await assert.rejects(service.assemble(jobId), error =>
    error.code === 'AI_RESPONSE_INVALID' && error.validation?.subreason === 'duplicate_cross_day');
  assert.equal(calls.complete.length, 0);
  assert.deepEqual(calls.mark, ['validation']);
});

test('a confirmed source change or invalid checkpoint read is terminalized once', async () => {
  for (const [code, category] of [['source_changed', 'source_changed'],
    ['invalid_result', 'validation']]) {
    const readError = Object.assign(new Error(code), { code });
    const { service, calls } = setup(receiptFor(), true, { readError });
    await assert.rejects(service.assemble(jobId), { code });
    assert.deepEqual(calls.mark, [category]);
    assert.equal(calls.complete.length, 0);
  }
});

test('Cancel winning finalization failure race returns no result or private checkpoints', async () => {
  const receipt = receiptFor();
  receipt.checkpoints[0].validatedResponse.questions[0].question = '';
  const { service, calls } = setup(receipt, true, { markResult: false });
  assert.deepEqual(await service.assemble(jobId), { status: 'not_completed' });
  assert.deepEqual(calls.mark, ['validation']);
  assert.equal(calls.complete.length, 0);
});

test('transient read and failure-RPC errors surface without being labeled validation', async () => {
  const readError = Object.assign(new Error('temporary database failure'), { code: 'persistence_failed' });
  const unreadable = setup(receiptFor(), true, { readError });
  await assert.rejects(unreadable.service.assemble(jobId), { code: 'persistence_failed' });
  assert.deepEqual(unreadable.calls.mark, []);
  assert.equal(unreadable.calls.complete.length, 0);

  const receipt = receiptFor();
  receipt.checkpoints[0].validatedResponse.questions[0].question = '';
  const rpcError = Object.assign(new Error('temporary database failure'), { code: 'persistence_failed' });
  const unmarked = setup(receipt, true, { markResult: rpcError });
  await assert.rejects(unmarked.service.assemble(jobId), { code: 'persistence_failed' });
  assert.deepEqual(unmarked.calls.mark, ['validation']);
  assert.equal(unmarked.calls.complete.length, 0);
});

test('source_changed from complete marks failure once and exposes no private data', async () => {
  const sourceError = Object.assign(new Error('source_changed'), { code: 'source_changed' });
  const { service, calls } = setup(receiptFor(), sourceError);
  await assert.rejects(service.assemble(jobId), error =>
    error === sourceError && !('checkpoints' in error) && !('collection' in error));
  assert.equal(calls.complete.length, 1);
  assert.deepEqual(calls.mark, ['source_changed']);
});

test('Cancel winning after a source_changed completion returns not_completed', async () => {
  const sourceError = Object.assign(new Error('source_changed'), { code: 'source_changed' });
  const { service, calls } = setup(receiptFor(), sourceError, { markResult: false });
  assert.deepEqual(await service.assemble(jobId), { status: 'not_completed' });
  assert.equal(calls.complete.length, 1);
  assert.deepEqual(calls.mark, ['source_changed']);
});

test('failure marking error after source_changed completion is surfaced', async () => {
  const sourceError = Object.assign(new Error('source_changed'), { code: 'source_changed' });
  const markError = Object.assign(new Error('temporary database failure'), { code: 'persistence_failed' });
  const { service, calls } = setup(receiptFor(), sourceError, { markResult: markError });
  await assert.rejects(service.assemble(jobId), error => error === markError);
  assert.equal(calls.complete.length, 1);
  assert.deepEqual(calls.mark, ['source_changed']);
});

test('false or unrelated completion failure does not mark source_changed', async () => {
  const unrelated = Object.assign(new Error('temporary database failure'), { code: 'persistence_failed' });
  const refused = setup(receiptFor(), false);
  assert.deepEqual(await refused.service.assemble(jobId), { status: 'not_completed' });
  assert.equal(refused.calls.complete.length, 1);
  assert.deepEqual(refused.calls.mark, []);

  const failed = setup(receiptFor(), unrelated);
  await assert.rejects(failed.service.assemble(jobId), error => error === unrelated);
  assert.equal(failed.calls.complete.length, 1);
  assert.deepEqual(failed.calls.mark, []);
});
