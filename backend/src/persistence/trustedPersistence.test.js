import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustedPersistence, resolveOfficialYear } from './trustedPersistence.js';
import { syntheticRepository } from './testing/syntheticRepository.js';
import { createProductionPersistence, createPersistenceHandler } from './productionBoundary.js';
import { WORKSHEET_KIND, assessmentPreview, validateWorksheetDraft, validateWorksheetForDistribution } from '../../../shared/trustedPersistence/contracts.js';
import { createBlankIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';

const year = '2034-2035'; // Deliberately unrelated to browser/server date.
const selected = () => ({ subjectId: 'science', gradeLevel: 'Grade 7', schoolYear: year });
function manual(complete = false) {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  document.info.nameOfLesson = complete ? 'Cells' : '';
  if (complete) {
    document.info.teachingDate = '2034-11-01';
    document.weekly.learningObjectives.Monday = 'Identify the nucleus.\r\nDescribe its function.';
    document.weekly.flow.Monday = 'Label a cell diagram.';
    document.weekly.formativeAssessment.Monday = 'Explain the role of the nucleus.';
  }
  return { kind: 'eduscribe.manual-ilaw', version: 2, title: document.info.nameOfLesson,
    assignment: selected(), document, sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } };
}
function worksheet(complete = false) {
  return { kind: WORKSHEET_KIND, version: 1, title: complete ? 'Cells' : '', assignment: selected(),
    sourcePlanId: null, instructions: 'Read carefully.', workflowState: 'draft',
    groups: [{ id: 'g2', title: 'Second named group', directions: 'Choose one.' }, { id: 'g1', title: 'First named group', directions: 'Explain.' }],
    questions: complete ? [
      { id: 'q1', groupId: 'g1', type: 'essay', text: 'Explain.', options: [], points: 2 },
      { id: 'q2', groupId: 'g2', type: 'multiple_choice', text: 'Choose.', options: ['A', 'B'], points: 1 },
    ] : [], answerKeys: complete ? { q2: 'B' } : {} };
}
function setup() {
  const repository = syntheticRepository({ profiles: [{ id: 'teacher-a', role: 'teacher', status: 'active' }, { id: 'teacher-b', role: 'teacher', status: 'active' }],
    settings: [{ school_year: year }], subjects: [{ id: 'science', name: 'Science', is_active: true }],
    assignments: [{ teacher_id: 'teacher-a', subject_id: 'science', grade_level: 'Grade 7', school_year: year }] });
  let next = 0;
  const resolveIdentity = async token => token === 'verified-a' ? { id: 'teacher-a' } : token === 'verified-b' ? { id: 'teacher-b' } : null;
  const service = createTrustedPersistence({ enabled: true, repository, resolveIdentity, newId: () => `record-${++next}` });
  const call = (op, command, token = 'verified-a') => service.execute(op, token, command);
  return { repository, service, call };
}
const create = document => ({ requestId: 'create-1', id: null, expectedRevision: null, document });
const update = (record, document, requestId = 'update-1') => ({ requestId, id: record.id, expectedRevision: record.revision, document });

test('existing editor True/False values pass complete validation', () => {
  const document = worksheet(true);
  document.questions[1] = { ...document.questions[1], type: 'true_false', options: [] };
  for (const answer of ['True', 'False']) {
    document.answerKeys.q2 = answer;
    assert.equal(validateWorksheetForDistribution(document).valid, true);
  }
  delete document.answerKeys.q2;
  assert.equal(validateWorksheetForDistribution(document).valid, false);
});

test('unsupported Manual version and student identity fail closed', async () => {
  const { call, repository } = setup();
  const document = manual(); document.version = 99;
  assert.equal((await call('CreateIncompleteDraft', create(document))).code, 'invalid_document');
  repository.configure({ profiles: [{ id: 'teacher-a', role: 'student', status: 'active' }] });
  assert.equal((await call('CreateIncompleteDraft', create(manual()))).code, 'inactive_teacher');
  assert.deepEqual(repository.snapshot().records, {});
});

test('Manual draft → same-ID draft → Saved → saved update → exact reopen, no effects', async () => {
  const { call, repository } = setup();
  const first = await call('CreateIncompleteDraft', create(manual())); assert.equal(first.ok, true); assert.equal(first.durable, false);
  const second = await call('UpdateIncompleteDraft', update(first.record, manual())); assert.equal(second.record.id, first.record.id);
  const saved = await call('SaveCompleteLessonPlan', update(second.record, manual(true), 'save-1')); assert.equal(saved.ok, true);
  assert.equal(saved.record.status, 'draft'); assert.equal(JSON.parse(saved.record.objectives).workflowState, 'saved');
  assert.deepEqual(JSON.parse(saved.record.objectives).document, manual(true).document);
  const changed = await call('UpdateSavedLessonPlan', update(saved.record, manual(true), 'saved-update')); assert.equal(changed.record.revision, 4);
  const reopened = await call('ReopenOwnedLessonPlan', { id: first.record.id }); assert.deepEqual(reopened.record, changed.record);
  assert.deepEqual(repository.snapshot().effects, { assignees: [], notifications: [], submissions: [], releases: [] });
  assert.equal((await call('UpdateIncompleteDraft', update(changed.record, manual(), 'downgrade'))).code, 'invalid_transition');
});
test('complete Manual validation does not permit unfinished content', async () => {
  const { call } = setup();
  const first = await call('CreateIncompleteDraft', create(manual()));
  assert.equal((await call('SaveCompleteLessonPlan', update(first.record, manual()))).code, 'incomplete_lesson_plan');
  assert.equal((await call('ValidateDocument', { document: manual(true) })).valid, true);
});
for (const status of ['inactive', 'archived', 'suspended']) test(`denies ${status} account`, async () => {
  const { call, repository } = setup(); repository.configure({ profiles: [{ id: 'teacher-a', role: 'teacher', status }] });
  assert.equal((await call('CreateIncompleteDraft', create(manual()))).code, 'inactive_teacher');
});
for (const field of ['subjectId', 'gradeLevel', 'schoolYear']) test(`rejects wrong ${field}`, async () => {
  const { call } = setup(); const input = manual(); input.assignment[field] = 'wrong';
  assert.equal((await call('CreateIncompleteDraft', create(input))).code, 'assignment_denied');
});
test('adviser-only and mismatched independent assignment tuples denied', async () => {
  const { call, repository } = setup();
  repository.configure({ assignments: [] }); assert.equal((await call('CreateIncompleteDraft', create(manual()))).code, 'assignment_denied');
  repository.configure({ assignments: [
    { teacher_id: 'teacher-a', subject_id: 'science', grade_level: 'Grade 8', school_year: year },
    { teacher_id: 'teacher-a', subject_id: 'math', grade_level: 'Grade 7', school_year: year },
  ] }); assert.equal((await call('CreateIncompleteDraft', create(manual()))).code, 'assignment_denied');
});
test('forged owner and unverified session cannot authorize', async () => {
  const { call } = setup(); const input = manual(); input.teacherId = 'teacher-a';
  assert.equal((await call('CreateIncompleteDraft', create(input))).code, 'invalid_document');
  assert.equal((await call('CreateIncompleteDraft', create(manual()), { id: 'teacher-a', role: 'teacher' })).code, 'not_authenticated');
});
test('cross-owner reopen/update denied; legacy HTML cannot be overwritten', async () => {
  const { call, repository } = setup(); const first = await call('CreateIncompleteDraft', create(manual()));
  assert.equal((await call('ReopenOwnedLessonPlan', { id: first.record.id }, 'verified-b')).code, 'not_found');
  assert.equal((await call('UpdateIncompleteDraft', update(first.record, manual()), 'verified-b')).code, 'not_found');
  repository.configure({ records: { html: { id: 'html', ownerId: 'teacher-a', type: 'html', objectives: '<p>Legacy</p>', ai_generated: true, revision: 1 } } });
  assert.equal((await call('UpdateIncompleteDraft', update({ id: 'html', revision: 1 }, manual()))).code, 'document_type_conflict');
  assert.equal(repository.snapshot().records.html.objectives, '<p>Legacy</p>');
});
test('Settings is authoritative; missing/ambiguous fails closed; historical reads survive', async () => {
  const { call, repository } = setup(); const first = await call('CreateIncompleteDraft', create(manual()));
  assert.equal(first.record.schoolYear, year);
  for (const settings of [[], [{ school_year: year }, { school_year: year }], [{ school_year: null }]]) {
    repository.configure({ settings }); assert.equal((await call('UpdateIncompleteDraft', update(first.record, manual()))).code, 'settings_unavailable');
  }
  repository.configure({ settings: [{ school_year: '2035-2036' }], assignments: [] });
  assert.equal((await call('ReopenOwnedLessonPlan', { id: first.record.id })).ok, true);
  assert.equal((await call('UpdateIncompleteDraft', update(first.record, manual()))).code, 'historical_write_blocked');
  assert.equal(repository.snapshot().records[first.record.id].schoolYear, year);
  assert.throws(() => resolveOfficialYear([{ school_year: '2034-2039' }]));
});
for (const variant of ['empty', 'partial', 'no-key', 'unassigned']) test(`durable contract accepts private ${variant} worksheet without distribution`, async () => {
  const { call, repository } = setup(); const doc = worksheet(variant === 'no-key');
  if (variant === 'partial') doc.questions.push({ id: 'q-part', groupId: 'g2', type: null, text: 'unfinished', options: [''], points: null });
  if (variant === 'no-key') doc.answerKeys = {};
  if (variant === 'unassigned') doc.assignment = null;
  const saved = await call('CreatePrivateWorksheetDraft', create(doc)); assert.equal(saved.ok, true);
  const reopened = await call('ReopenPrivateWorksheetDraft', { id: saved.record.id }); assert.deepEqual(reopened.record.document, doc);
  const resaved = await call('UpdatePrivateWorksheetDraft', update(saved.record, doc)); assert.equal(resaved.record.id, saved.record.id);
  const checked = await call('ValidateWorksheetForDistribution', { id: saved.record.id }); assert.notEqual(checked.valid, true);
  assert.equal((await call('PrepareNormalizedAssessmentProjection', { id: saved.record.id })).ok, false);
  assert.deepEqual(repository.snapshot().effects, { assignees: [], notifications: [], submissions: [], releases: [] });
});
test('projection preserves ordering, identities, directions; preview strips private keys', async () => {
  const { call, repository } = setup(); const saved = await call('CreatePrivateWorksheetDraft', create(worksheet(true)));
  const result = await call('PrepareNormalizedAssessmentProjection', { id: saved.record.id }); assert.equal(result.ok, true);
  assert.equal(result.distributionAuthorized, false);
  assert.deepEqual(result.projection.items.map(i => i.id), ['q2', 'q1']);
  assert.deepEqual(result.projection.groups.map(g => g.directions), ['Choose one.', 'Explain.']);
  assert.equal(result.projection.worksheet.assignment.schoolYear, year);
  const preview = assessmentPreview(result.projection);
  assert.equal(preview.privateAnswerKeys, undefined); assert.equal(preview.ownerId, undefined); assert.equal(preview.sourcePlanId, undefined);
  assert.equal('correctAnswer' in preview.questions[0], false);
  assert.equal(repository.snapshot().effects.assignees.length, 0);
});
test('source must be saved, owned and tuple/year compatible', async () => {
  const { call } = setup(); const source = await call('CreateIncompleteDraft', create(manual()));
  const doc = worksheet(true); doc.sourcePlanId = source.record.id;
  assert.equal((await call('CreatePrivateWorksheetDraft', create(doc))).code, 'source_plan_denied');
  await call('SaveCompleteLessonPlan', update(source.record, manual(true)));
  assert.equal((await call('CreatePrivateWorksheetDraft', create(doc))).ok, true);
  doc.sourcePlanId = 'missing'; assert.equal((await call('CreatePrivateWorksheetDraft', { ...create(doc), requestId: 'missing-source' })).code, 'not_found');
});
test('worksheet owner isolation and historical read do not authorize historical edits', async () => {
  const { call, repository } = setup();
  const first = await call('CreatePrivateWorksheetDraft', create(worksheet()));
  assert.equal((await call('ReopenPrivateWorksheetDraft', { id: first.record.id }, 'verified-b')).code, 'not_found');
  assert.equal((await call('UpdatePrivateWorksheetDraft', update(first.record, worksheet()), 'verified-b')).code, 'not_found');
  repository.configure({ settings: [{ school_year: '2035-2036' }], assignments: [] });
  assert.equal((await call('ReopenPrivateWorksheetDraft', { id: first.record.id })).ok, true);
  assert.equal((await call('UpdatePrivateWorksheetDraft', update(first.record, worksheet()))).code, 'historical_write_blocked');
  assert.equal(repository.snapshot().records[first.record.id].schoolYear, year);
});
test('source from another owner or incompatible year is rejected despite a valid authoring load', async () => {
  const { call, repository } = setup();
  const source = await call('CreateIncompleteDraft', create(manual()));
  const saved = await call('SaveCompleteLessonPlan', update(source.record, manual(true)));
  const snapshot = repository.snapshot();
  repository.configure({ assignments: [...snapshot.assignments, { ...snapshot.assignments[0], teacher_id: 'teacher-b' }] });
  const doc = worksheet(true); doc.sourcePlanId = source.record.id;
  assert.equal((await call('CreatePrivateWorksheetDraft', create(doc), 'verified-b')).code, 'not_found');
  const envelope = JSON.parse(saved.record.objectives); envelope.assignment.schoolYear = '2033-2034';
  repository.configure({ records: { [source.record.id]: { ...saved.record, schoolYear: '2033-2034', objectives: JSON.stringify(envelope) } } });
  assert.equal((await call('CreatePrivateWorksheetDraft', create(doc))).code, 'source_plan_denied');
});
for (const [createOp, updateOp, make] of [
  ['CreateIncompleteDraft', 'UpdateIncompleteDraft', manual],
  ['CreatePrivateWorksheetDraft', 'UpdatePrivateWorksheetDraft', worksheet],
]) test(`${createOp}: retries, conflict, CAS and rollback`, async () => {
  const { call, repository } = setup(); const command = create(make());
  const [a, b] = await Promise.all([call(createOp, command), call(createOp, command)]);
  assert.deepEqual(a, b); assert.equal(Object.keys(repository.snapshot().records).length, 1);
  const changed = structuredClone(command); changed.document.title = 'Changed';
  assert.equal((await call(createOp, changed)).code, 'idempotency_conflict');
  const next = update(a.record, make()); const updated = await call(updateOp, next);
  assert.deepEqual(await call(updateOp, next), updated);
  assert.equal((await call(updateOp, { ...next, requestId: 'stale' })).code, 'revision_conflict');
  const concurrent = await Promise.all(['a', 'b'].map(requestId => call(updateOp, update(updated.record, make(), requestId))));
  assert.equal(concurrent.filter(r => r.ok).length, 1); assert.equal(concurrent.filter(r => r.code === 'revision_conflict').length, 1);
  const before = repository.snapshot(); repository.failNextCommit();
  assert.equal((await call(createOp, { ...command, requestId: 'failure' })).code, 'persistence_failed');
  assert.deepEqual(repository.snapshot(), before);
  assert.equal((await call(createOp, { ...command, requestId: 'failure' })).ok, true);
});
test('safe draft rejects corrupt identities, unknown fields, oversized payloads', () => {
  const doc = worksheet(); doc.questions = [{ id: 'q', groupId: 'missing', type: null, text: '', options: [], points: null }];
  assert.throws(() => validateWorksheetDraft(doc));
  assert.throws(() => validateWorksheetDraft({ ...worksheet(), teacher_id: 'forged' }));
  assert.throws(() => validateWorksheetDraft({ ...worksheet(), instructions: 'x'.repeat(300000) }));
});
test('default server gate and production adapter cannot fake durable success', async () => {
  assert.equal((await createTrustedPersistence().execute('CreateIncompleteDraft', null, {})).code, 'integration_blocked');
  const production = createProductionPersistence({ enabled: true });
  assert.equal(production.enabled, false); assert.equal((await production.execute()).durable, false);
  let response; const res = { status(code) { assert.equal(code, 503); return this; }, json(value) { response = value; } };
  await createPersistenceHandler()({ get: () => '', params: { operation: 'CreateIncompleteDraft' }, body: {} }, res);
  assert.equal(response.ok, false);
});
test('generation/distribution/publication are not service capabilities', async () => {
  const { call, repository } = setup();
  for (const op of ['Generate', 'Distribute', 'PostLessonPlan', 'ReleaseScore']) assert.equal((await call(op, {})).code, 'unsupported_operation');
  assert.deepEqual(repository.snapshot().effects, { assignees: [], notifications: [], submissions: [], releases: [] });
});
