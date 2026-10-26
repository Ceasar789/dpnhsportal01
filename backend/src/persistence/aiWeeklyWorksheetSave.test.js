import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeeklySavePayload, createAiWeeklyWorksheetSave,
  sanitizeWeeklyText } from './aiWeeklyWorksheetSave.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const savedId = '33333333-3333-4333-8333-333333333333';
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function collection() {
  return { collectionId: requestId, teacherId: 'forged', title: 'Synthetic week',
    sourceLessonPlan: { id: planId, title: 'Synthetic plan' },
    sourceContext: { secret: 'never forward' },
    worksheets: [{ day: 'Monday', draftId: 'local-only', title: 'Synthetic day',
      instructions: 'Answer the questions.', checkingMode: 'manual',
      sections: [{ id: 'main', title: ' ', directions: '' }],
      questions: [
        { localId: 'mc', sectionId: 'main', question: 'Choose one.', item_type: 'multiple_choice',
          options: ['Alpha', 'Beta', 'Gamma', 'Delta'], points: 1 },
        { localId: 'tf', sectionId: 'main', question: 'True or false?', item_type: 'true_false',
          options: [], points: 1 },
        { localId: 'id', sectionId: 'main', question: 'Identify it.', item_type: 'identification',
          options: [], points: 1 },
        { localId: 'enum', sectionId: 'main', question: 'Name two.', item_type: 'enumeration',
          options: [], points: 2, enumeration: { alternatives: ['other one, other two'], orderSensitive: false } },
        { localId: 'essay', sectionId: 'main', question: 'Explain.', item_type: 'essay',
          options: [], points: 0.3, essay: { referenceAnswer: 'A synthetic explanation.',
            minWords: 80, maxWords: 150, rubric: [
              { criterion: 'Evidence', points: 0.1 }, { criterion: 'Clarity', points: 0.2 }] } },
      ],
      answerKey: [
        { localId: 'mc', correct_answer: 'Alpha' },
        { localId: 'tf', correct_answer: 'True' },
        { localId: 'id', correct_answer: 'one term, another term' },
        { localId: 'enum', correct_answer: 'first item, second item' },
      ] }],
  };
}

function success(args) {
  return { data: { ok: true, durable: true, collectionId: savedId,
    worksheets: args.p_payload.worksheets.map((day, index) => ({
      day: day.day, id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
      items: day.questions.length })) }, error: null };
}

test('maps five types and only RPC fields; identical retries carry identical payload and request ID', async () => {
  const calls = [];
  const service = createAiWeeklyWorksheetSave({ invokeRpc: async (name, args, token) => {
    calls.push({ name, args, token }); return success(args);
  } });
  const input = { requestId, collection: collection(), teacher_id: 'forged' };
  const first = await service.save('synthetic-token', input);
  const second = await service.save('synthetic-token', input);
  assert.deepEqual(first, second);
  assert.equal(first.durable, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].name, 'eduscribe_ai_weekly_worksheets_save_v1');
  assert.equal(calls[0].token, 'synthetic-token');
  assert.equal(calls[0].args.p_request_id, requestId);
  const payload = calls[0].args.p_payload;
  assert.deepEqual(Object.keys(payload), ['sourceLessonPlanId', 'title', 'worksheets']);
  assert.deepEqual(Object.keys(payload.worksheets[0]),
    ['day', 'title', 'instructions', 'sections', 'checkingMode', 'questions']);
  assert.deepEqual(payload.worksheets[0].sections, [{ id: 'main', title: 'Questions', directions: '' }]);
  assert.deepEqual(payload.worksheets[0].questions.map(item => item.position), [1, 2, 3, 4, 5]);
  assert.deepEqual(payload.worksheets[0].questions.map(item => item.correct_answer),
    ['Alpha', 'True', 'one term, another term', 'first item, second item', null]);
  assert.equal(payload.worksheets[0].questions[1].options, null);
  assert.deepEqual(payload.worksheets[0].questions[3].enumeration,
    { alternatives: ['other one, other two'], orderSensitive: false });
  assert.equal(payload.worksheets[0].questions[4].essay.rubric[1].points, 0.2);
  assert.equal(JSON.stringify(payload).includes('never forward'), false);
  assert.equal(JSON.stringify(payload).includes('forged'), false);
});

test('accepts the RPC day-sorted replay receipt for a reordered draft', async () => {
  const input = collection();
  const monday = input.worksheets[0];
  input.worksheets = [{ ...structuredClone(monday), day: 'Tuesday', title: 'Tuesday' }, monday];
  let calls = 0;
  const service = createAiWeeklyWorksheetSave({ invokeRpc: async (_name, args) => {
    calls++;
    const result = success(args);
    if (calls === 2) result.data.worksheets.reverse();
    return result;
  } });
  const first = await service.save('token', { requestId, collection: input });
  const replay = await service.save('token', { requestId, collection: input });
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.worksheets[0].day, 1);
});

test('text-only sanitizer preserves comparisons and ampersands but rejects markup-like text', async () => {
  for (const value of ['x < 5', '5>3', 'a<3', 'a & b', 'H2O & CO2', 'x <= 5']) {
    assert.equal(await sanitizeWeeklyText(value), value);
  }
  for (const value of ['a<b', 'Is x<y and y<z?', '<b>bold</b>', '<script>x</script>',
    '<script>alert(1)</script>Hello', '&lt;script&gt;']) {
    await assert.rejects(sanitizeWeeklyText(value), { code: 'unsafe_markup' });
  }
  const input = collection();
  input.worksheets[0].questions[0].options[0] = 'Alpha &amp; Beta';
  input.worksheets[0].answerKey[0].correct_answer = 'Alpha & Beta';
  const payload = await buildWeeklySavePayload(input);
  assert.equal(payload.worksheets[0].questions[0].options[0], 'Alpha & Beta');
  assert.equal(payload.worksheets[0].questions[0].correct_answer, 'Alpha & Beta');
});

test('markup-like text is rejected in questions, options, keys, sections, and rubrics before RPC', async () => {
  const changes = [
    input => { input.worksheets[0].questions[0].question = 'a<b'; },
    input => { input.worksheets[0].questions[0].options[0] = '<b>bold</b>'; },
    input => { input.worksheets[0].answerKey[0].correct_answer = '&lt;script&gt;'; },
    input => { input.worksheets[0].sections[0].title = 'Is x<y and y<z?'; },
    input => { input.worksheets[0].questions[4].essay.rubric[0].criterion = '<script>x</script>'; },
  ];
  const service = createAiWeeklyWorksheetSave({ invokeRpc: async () => {
    throw new Error('RPC must not run for unsafe text');
  } });
  for (const change of changes) {
    const input = collection(); change(input);
    await assert.rejects(buildWeeklySavePayload(input), { code: 'unsafe_markup' });
    assert.deepEqual(await service.save('token', { requestId, collection: input }),
      { ok: false, code: 'unsafe_markup', durable: false });
  }
});

test('question points and rubric sums follow the SQL numeric rules', async () => {
  for (const points of [0, 100.01, 1.001]) {
    const input = collection(); input.worksheets[0].questions[0].points = points;
    await assert.rejects(buildWeeklySavePayload(input), { code: 'invalid_document' });
  }
  const off = collection();
  off.worksheets[0].questions[4].essay.rubric[1].points = 0.201;
  await assert.rejects(buildWeeklySavePayload(off), { code: 'invalid_document' });
  const exact = collection();
  exact.worksheets[0].questions[4].points = 1.5;
  exact.worksheets[0].questions[4].essay.rubric = [
    { criterion: 'Evidence', points: 0.125 }, { criterion: 'Clarity', points: 1.375 }];
  const payload = await buildWeeklySavePayload(exact);
  assert.equal(payload.worksheets[0].questions[4].essay.rubric[0].points, 0.125);
  assert.equal((await buildWeeklySavePayload(collection())).worksheets[0].questions[4].points, 0.3);
  const typed = collection(); typed.worksheets[0].questions[0].points = '1.25';
  assert.equal((await buildWeeklySavePayload(typed)).worksheets[0].questions[0].points, 1.25);
  for (const score of [Infinity, NaN, '1e-3']) {
    const invalid = collection(); invalid.worksheets[0].questions[4].essay.rubric[0].points = score;
    await assert.rejects(buildWeeklySavePayload(invalid), { code: 'invalid_document' });
  }
});

test('rejects malformed MCQ, absent answer, day, section, and enhanced auto enumeration', async () => {
  const cases = [
    input => { input.worksheets[0].questions[0].options.pop(); },
    input => { input.worksheets[0].answerKey[0].correct_answer = 'Missing'; },
    input => { input.worksheets[0].answerKey.pop(); },
    input => { input.worksheets[0].day = 'Saturday'; },
    input => { input.worksheets[0].questions[0].sectionId = 'absent'; },
    input => { input.worksheets[0].checkingMode = 'auto'; },
  ];
  for (const change of cases) {
    const input = collection(); change(input);
    await assert.rejects(buildWeeklySavePayload(input), { code: 'invalid_document' });
  }
  const duplicate = collection();
  duplicate.worksheets.push({ ...structuredClone(duplicate.worksheets[0]) });
  await assert.rejects(buildWeeklySavePayload(duplicate), { code: 'invalid_document' });
  const options = collection();
  options.worksheets[0].questions[0].options[1] = ' Alpha ';
  await assert.rejects(buildWeeklySavePayload(options), { code: 'mcq_options_not_distinct' });
});

test('checks character limits after sanitizing and rejects byte-oversized payloads', async () => {
  const cases = [
    [input => input.title = 'x', 255],
    [input => input.worksheets[0].title = 'x', 255],
    [input => input.worksheets[0].sections[0].title = 'x', 120],
    [input => input.worksheets[0].questions[0].question = 'x', 4000],
    [input => input.worksheets[0].instructions = 'x', 2000],
    [input => input.worksheets[0].sections[0].directions = 'x', 2000],
  ];
  for (const [set, limit] of cases) {
    const valid = collection(); set(valid);
    const target = 'x'.repeat(limit);
    if (limit === 255 && valid.title === 'x') valid.title = target;
    else if (limit === 255) valid.worksheets[0].title = target;
    else if (limit === 120) valid.worksheets[0].sections[0].title = target;
    else if (limit === 4000) valid.worksheets[0].questions[0].question = target;
    else if (valid.worksheets[0].instructions === 'x') valid.worksheets[0].instructions = target;
    else valid.worksheets[0].sections[0].directions = target;
    await buildWeeklySavePayload(valid);
    const invalid = structuredClone(valid);
    if (limit === 255 && invalid.title === target) invalid.title += 'x';
    else if (limit === 255) invalid.worksheets[0].title += 'x';
    else if (limit === 120) invalid.worksheets[0].sections[0].title += 'x';
    else if (limit === 4000) invalid.worksheets[0].questions[0].question += 'x';
    else if (invalid.worksheets[0].instructions === target) invalid.worksheets[0].instructions += 'x';
    else invalid.worksheets[0].sections[0].directions += 'x';
    await assert.rejects(buildWeeklySavePayload(invalid), { code: 'invalid_document' });
  }
  const unicode = collection(); unicode.title = '😀'.repeat(255);
  await buildWeeklySavePayload(unicode);
  unicode.title += '😀';
  await assert.rejects(buildWeeklySavePayload(unicode), { code: 'invalid_document' });
  const large = collection();
  large.worksheets = weekdays.slice(0, 3).map(day => {
    const draft = structuredClone(large.worksheets[0]); draft.day = day;
    draft.questions = Array.from({ length: 60 }, (_, index) => ({
      ...structuredClone(draft.questions[0]), localId: `large-${index}`,
      question: '界'.repeat(4000) }));
    draft.answerKey = draft.questions.map(item => ({ localId: item.localId, correct_answer: 'Alpha' }));
    return draft;
  });
  await assert.rejects(buildWeeklySavePayload(large), { code: 'payload_too_large' });
});

test('save rejects invalid request ID and maps every RPC error without leaking raw text', async () => {
  const input = collection();
  const noRpc = createAiWeeklyWorksheetSave({ invokeRpc: async () => { throw new Error('unexpected call'); } });
  assert.equal((await noRpc.save('token', { requestId: 'bad', collection: input })).code, 'invalid_document');
  assert.equal((await noRpc.save('token', { requestId: savedId, collection: input })).code, 'invalid_document');
  const dbCodes = ['not_authenticated', 'inactive_teacher', 'invalid_document',
    'source_plan_denied', 'idempotency_conflict', 'invalid_state'];
  for (const code of dbCodes) {
    const service = createAiWeeklyWorksheetSave({ invokeRpc: async () => ({
      data: null, error: { message: code, details: 'question and token must stay private' },
    }) });
    assert.deepEqual(await service.save('token', { requestId, collection: input }),
      { ok: false, code, durable: false });
  }
  const unknown = createAiWeeklyWorksheetSave({ invokeRpc: async () => ({
    data: null, error: { message: 'secret question and token' },
  }) });
  assert.equal((await unknown.save('token', { requestId, collection: input })).code, 'persistence_failed');
  const malformed = createAiWeeklyWorksheetSave({ invokeRpc: async () => ({
    data: { ok: true, durable: true, collectionId: savedId, worksheets: [] }, error: null,
  }) });
  assert.equal((await malformed.save('token', { requestId, collection: input })).code, 'persistence_failed');
});
