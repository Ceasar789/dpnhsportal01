import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiWeeklyWorksheetManage } from './aiWeeklyWorksheetManage.js';

const collectionId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const worksheetId = '33333333-3333-4333-8333-333333333333';
const anotherId = '44444444-4444-4444-8444-444444444444';

function collection() {
  return { collectionId, title: 'Synthetic week', sourceLessonPlan: { id: planId },
    worksheets: [{ day: 'Monday', title: 'Synthetic day', instructions: 'Answer the questions.',
      checkingMode: 'manual', sections: [{ id: 'main', title: 'Questions', directions: '' }],
      questions: [{ localId: 'mc', sectionId: 'main', question: 'Choose one.',
        item_type: 'multiple_choice', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], points: 1 }],
      answerKey: [{ localId: 'mc', correct_answer: 'Alpha' }] }] };
}
const command = () => ({ collectionId, expectedRevision: 1, collection: collection() });
const updateReceipt = args => ({ data: { ok: true, durable: true, collectionId,
  revision: 2, worksheets: args.p_payload.worksheets.map((day, index) => ({
    day: day.day, id: index ? anotherId : worksheetId, items: day.questions.length })) }, error: null });

test('update strips source ID and sends only the three RPC args', async () => {
  const calls = [];
  const service = createAiWeeklyWorksheetManage({ invokeRpc: async (...args) => {
    calls.push(args); return updateReceipt(args[1]);
  } });
  assert.deepEqual(await service.update('synthetic-token', command()), { ok: true, durable: true,
    collectionId, revision: 2, lockedDays: [],
    worksheets: [{ day: 1, id: worksheetId, items: 1 }] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'eduscribe_ai_weekly_worksheets_update_v1');
  assert.equal(calls[0][2], 'synthetic-token');
  assert.deepEqual(Object.keys(calls[0][1]),
    ['p_collection_id', 'p_expected_revision', 'p_payload']);
  assert.deepEqual(calls[0][1].p_payload, { title: 'Synthetic week', worksheets: [{
    day: 1, title: 'Synthetic day', instructions: 'Answer the questions.',
    sections: [{ id: 'main', title: 'Questions', directions: '' }], checkingMode: 'manual',
    questions: [{ position: 1, sectionId: 'main', question: 'Choose one.',
      item_type: 'multiple_choice', options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      points: 1, correct_answer: 'Alpha' }] }] });
});

test('update rejects mismatched collection, bad revision, missing credential and source plan without RPC', async () => {
  let calls = 0;
  const service = createAiWeeklyWorksheetManage({ invokeRpc: async () => { calls++; } });
  const mismatch = command(); mismatch.collection.collectionId = anotherId;
  assert.equal((await service.update('token', mismatch)).code, 'invalid_document');
  for (const expectedRevision of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await service.update('token', { ...command(), expectedRevision })).code,
      'invalid_document');
  }
  assert.equal((await service.update('', command())).code, 'not_authenticated');
  const noPlan = command(); delete noPlan.collection.sourceLessonPlan;
  assert.equal((await service.update('token', noPlan)).code, 'invalid_document');
  assert.equal(calls, 0);
});

test('update preserves safe builder errors and rejects unknown database messages', async () => {
  let calls = 0;
  const service = createAiWeeklyWorksheetManage({ invokeRpc: async () => {
    calls++; return { data: null, error: { message: 'secret question and token' } };
  } });
  const duplicate = command(); duplicate.collection.worksheets[0].questions[0].options[1] = ' Alpha ';
  assert.deepEqual(await service.update('token', duplicate),
    { ok: false, code: 'mcq_options_not_distinct', durable: false });
  const markup = command(); markup.collection.title = '<secret>';
  assert.equal((await service.update('token', markup)).code, 'unsafe_markup');
  assert.equal(calls, 0);
  assert.deepEqual(await service.update('token', command()),
    { ok: false, code: 'persistence_failed', durable: false });
  assert.equal(calls, 1);
});

test('all manage database errors become fixed codes without raw details', async () => {
  const codes = ['not_authenticated', 'inactive_teacher', 'not_found', 'revision_conflict',
    'student_work_exists', 'collection_archived', 'invalid_document', 'invalid_state'];
  for (const code of codes) {
    const service = createAiWeeklyWorksheetManage({ invokeRpc: async () => ({
      data: null, error: { message: code, details: 'secret question and token' },
    }) });
    assert.deepEqual(await service.update('token', command()),
      { ok: false, code, durable: false });
  }
});

test('update rejects malformed receipts, including stale revision, days and counts', async () => {
  const input = command();
  input.collection.worksheets.push({ ...structuredClone(input.collection.worksheets[0]), day: 'Tuesday' });
  const cases = [
    data => { data.revision = 1; },
    data => { data.collectionId = anotherId; },
    data => { data.worksheets[1].day = 1; },
    data => { data.worksheets[0].items = 2; },
    data => { data.worksheets[0].id = 'not-a-uuid'; },
    data => { data.durable = false; },
  ];
  for (const change of cases) {
    const service = createAiWeeklyWorksheetManage({ invokeRpc: async (_name, args) => {
      const receipt = updateReceipt(args); change(receipt.data); return receipt;
    } });
    assert.deepEqual(await service.update('token', input),
      { ok: false, code: 'persistence_failed', durable: false });
  }
});

test('update accepts a stored count for a locked day and preserves lockedDays', async () => {
  const input = command();
  input.collection.worksheets.push({ ...structuredClone(input.collection.worksheets[0]), day: 'Tuesday' });
  const service = createAiWeeklyWorksheetManage({ invokeRpc: async (_name, args) => {
    const receipt = updateReceipt(args);
    receipt.data.lockedDays = [1];
    receipt.data.worksheets[0].items = 2;
    return receipt;
  } });
  assert.deepEqual(await service.update('token', input), { ok: true, durable: true,
    collectionId, revision: 2, lockedDays: [1], worksheets: [
      { day: 1, id: worksheetId, items: 2 }, { day: 2, id: anotherId, items: 1 }] });
});

test('update rejects invalid lockedDays and changed counts on unlocked days', async () => {
  const input = command();
  input.collection.worksheets.push({ ...structuredClone(input.collection.worksheets[0]), day: 'Tuesday' });
  const cases = [
    data => { data.lockedDays = [1]; data.worksheets[1].items = 2; },
    data => { data.lockedDays = [1, 1]; },
    data => { data.lockedDays = [2, 1]; },
    data => { data.lockedDays = [0]; },
    data => { data.lockedDays = [1, 2, 3, 4, 5]; },
    data => { data.lockedDays = '1'; },
    data => { data.lockedDays = [3]; },
    data => { data.lockedDays = [1.5]; },
    data => { data.lockedDays = [1]; data.worksheets[0].items = -1; },
  ];
  for (const change of cases) {
    const service = createAiWeeklyWorksheetManage({ invokeRpc: async (_name, args) => {
      const receipt = updateReceipt(args); change(receipt.data); return receipt;
    } });
    assert.deepEqual(await service.update('token', input),
      { ok: false, code: 'persistence_failed', durable: false });
  }
});

test('archive and delete send scoped arguments and accept only valid receipts', async () => {
  const calls = [];
  const service = createAiWeeklyWorksheetManage({ invokeRpc: async (name, args, token) => {
    calls.push({ name, args, token });
    return { data: name.endsWith('_archive_v1')
      ? { ok: true, durable: true, collectionId, revision: 2, archived: true }
      : { ok: true, durable: true, collectionId, deleted: true }, error: null };
  } });
  assert.deepEqual(await service.archive('token', { collectionId, expectedRevision: 1, archived: true }),
    { ok: true, durable: true, collectionId, revision: 2, archived: true });
  assert.deepEqual(await service.remove('token', { collectionId, expectedRevision: 1 }),
    { ok: true, durable: true, collectionId, deleted: true });
  assert.deepEqual(calls, [
    { name: 'eduscribe_ai_weekly_worksheets_archive_v1', args: {
      p_collection_id: collectionId, p_expected_revision: 1, p_archived: true }, token: 'token' },
    { name: 'eduscribe_ai_weekly_worksheets_delete_v1', args: {
      p_collection_id: collectionId, p_expected_revision: 1 }, token: 'token' },
  ]);
});

test('archive/delete reject invalid commands and receipts; missing transport is blocked', async () => {
  const absent = createAiWeeklyWorksheetManage();
  assert.equal((await absent.update('token', command())).code, 'integration_blocked');
  assert.equal((await absent.archive('token', { collectionId, expectedRevision: 1, archived: true })).code,
    'integration_blocked');
  assert.equal((await absent.remove('token', { collectionId, expectedRevision: 1 })).code,
    'integration_blocked');
  let calls = 0;
  const service = createAiWeeklyWorksheetManage({ invokeRpc: async () => {
    calls++; return { data: { ok: true, durable: true, collectionId,
      revision: 1, archived: false, deleted: false }, error: null };
  } });
  assert.equal((await service.archive('token', { collectionId, expectedRevision: 1,
    archived: 'true' })).code, 'invalid_document');
  assert.equal((await service.remove('token', { collectionId, expectedRevision: 0 })).code,
    'invalid_document');
  assert.equal(calls, 0);
  assert.equal((await service.archive('token', { collectionId, expectedRevision: 1,
    archived: true })).code, 'persistence_failed');
  assert.equal((await service.remove('token', { collectionId, expectedRevision: 1 })).code,
    'persistence_failed');
});
