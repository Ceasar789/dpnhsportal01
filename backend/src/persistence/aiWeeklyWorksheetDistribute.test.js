import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiWeeklyWorksheetDistribute } from './aiWeeklyWorksheetDistribute.js';

const collectionId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const studentA = '33333333-3333-4333-8333-333333333333';
const studentB = '44444444-4444-4444-8444-444444444444';
const command = () => ({ collectionId, expectedRevision: 2, sectionId,
  days: [1, 3], studentIds: [studentA, studentB], dueAt: '2020-01-01T00:00:00.000Z',
  ignored: 'secret student name' });
const receipt = () => ({ ok: true, durable: true, collectionId, sectionId,
  days: [1, 3], requested: 4, inserted: 3, alreadyAssigned: 1,
  assignedElsewhere: 1, ignored: 'secret student name' });

test('maps only six RPC arguments and returns a sanitized receipt, including past due input', async () => {
  const calls = [];
  const service = createAiWeeklyWorksheetDistribute({ invokeRpc: async (...args) => {
    calls.push(args); return { data: receipt(), error: null };
  } });
  assert.deepEqual(await service.distribute('synthetic-token', command()), {
    ok: true, durable: true, collectionId, sectionId, days: [1, 3],
    requested: 4, inserted: 3, alreadyAssigned: 1, assignedElsewhere: 1 });
  assert.deepEqual(calls, [['eduscribe_ai_weekly_worksheets_distribute_v1', {
    p_collection_id: collectionId, p_expected_revision: 2, p_section_id: sectionId,
    p_days: [1, 3], p_student_ids: [studentA, studentB],
    p_due_at: '2020-01-01T00:00:00.000Z' }, 'synthetic-token']]);
});

test('rejects invalid local commands and credentials without an RPC call', async () => {
  let calls = 0;
  const service = createAiWeeklyWorksheetDistribute({ invokeRpc: async () => { calls++; } });
  for (const bad of [null, { ...command(), collectionId: 'bad' },
    { ...command(), sectionId: 'bad' }, { ...command(), expectedRevision: 0 },
    { ...command(), expectedRevision: 2.5 }, { ...command(), days: [] },
    { ...command(), days: [1, 1] }, { ...command(), days: [6] },
    { ...command(), days: ['1'] }, { ...command(), studentIds: [] },
    { ...command(), studentIds: Array(201).fill(studentA) },
    { ...command(), studentIds: [studentA, studentA] },
    { ...command(), studentIds: ['bad'] }, { ...command(), dueAt: 'tomorrow' },
    { ...command(), dueAt: '2026-02-30T00:00:00Z' },
    { ...command(), dueAt: undefined }]) {
    assert.deepEqual(await service.distribute('token', bad),
      { ok: false, code: 'invalid_document', durable: false });
  }
  assert.deepEqual(await service.distribute('', command()),
    { ok: false, code: 'not_authenticated', durable: false });
  assert.equal(calls, 0);
});

test('accepts null due date and maps all nine fixed database codes', async () => {
  const noDue = { ...command(), dueAt: null };
  const success = createAiWeeklyWorksheetDistribute({ invokeRpc: async (_name, args) => {
    assert.equal(args.p_due_at, null);
    return { data: receipt(), error: null };
  } });
  assert.equal((await success.distribute('token', noDue)).ok, true);
  for (const code of ['not_authenticated', 'inactive_teacher', 'not_found',
    'revision_conflict', 'collection_archived', 'invalid_document',
    'section_not_allowed', 'student_not_in_section', 'invalid_due_date']) {
    const service = createAiWeeklyWorksheetDistribute({ invokeRpc: async () => ({
      data: null, error: { message: code, details: 'secret student name and token' } }) });
    assert.deepEqual(await service.distribute('token', command()),
      { ok: false, code, durable: false });
  }
});

test('unknown database text, thrown calls and absent transport return fixed codes only', async () => {
  const missing = createAiWeeklyWorksheetDistribute();
  assert.deepEqual(await missing.distribute('token', command()),
    { ok: false, code: 'integration_blocked', durable: false });
  for (const invokeRpc of [async () => ({ data: null,
    error: { message: 'secret student name and token' } }),
  async () => { throw new Error('secret student name and token'); }]) {
    const service = createAiWeeklyWorksheetDistribute({ invokeRpc });
    assert.deepEqual(await service.distribute('token', command()),
      { ok: false, code: 'persistence_failed', durable: false });
  }
});

test('rejects malformed receipts and inconsistent counts without returning raw fields', async () => {
  const changes = [
    data => { data.ok = false; }, data => { data.durable = false; },
    data => { data.collectionId = sectionId; }, data => { data.sectionId = collectionId; },
    data => { data.days = [3, 1]; }, data => { data.days = [1, 1]; },
    data => { data.requested = 5; }, data => { data.inserted = -1; },
    data => { data.inserted = 2; }, data => { data.alreadyAssigned = 0; },
    data => { data.assignedElsewhere = 2; }, data => { data.assignedElsewhere = 0.5; },
  ];
  for (const change of changes) {
    const data = receipt(); change(data);
    const service = createAiWeeklyWorksheetDistribute({ invokeRpc: async () => ({ data, error: null }) });
    assert.deepEqual(await service.distribute('token', command()),
      { ok: false, code: 'persistence_failed', durable: false });
  }
});
