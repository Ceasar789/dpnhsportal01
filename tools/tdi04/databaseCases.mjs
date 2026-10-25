import assert from 'node:assert/strict';
import { prepareNormalizedAssessmentProjection, validateWorksheetForDistribution } from '../../shared/trustedPersistence/contracts.js';

// NOT EXECUTED in TDI-04B. A future approved disposable driver must provide
// case(name, fn) with a fresh synthetic fixture and transactional cleanup.
// Fixture: teacher/other/student JWTs, manual(complete), worksheet(complete),
// rpcAs(jwt,name,args), selectAs(jwt,table,id), setTeacherStatus,
// setTeachingLoads, setSettings, effects() scoped only to its synthetic IDs,
// and countOwned(). No real application rows.
const newWrite = (document, requestId = 'req-create') => ({ p_action: 'create', p_state: 'draft',
  p_id: null, p_expected_revision: null, p_request_id: requestId, p_document: document });
const updateWrite = (record, document, requestId = 'req-update', state = 'draft') => ({
  p_action: 'update', p_state: state, p_id: record.id,
  p_expected_revision: record.revision, p_request_id: requestId, p_document: document,
});
const manualRpc = 'eduscribe_manual_write_v1';
const worksheetRpc = 'eduscribe_worksheet_write_v1';
const code = async (promise, expected) => {
  const result = await promise;
  assert.equal(result.error?.message, expected);
};

export async function runDatabaseCases(driver) {
  assert.equal(typeof driver?.case, 'function');
  await driver.case('Manual draft, same-ID update, complete Save and owned reopen', async f => {
    const first = (await f.rpcAs(f.teacher, manualRpc, newWrite(f.manual(false)))).data.record;
    const next = (await f.rpcAs(f.teacher, manualRpc, updateWrite(first, f.manual(false)))).data.record;
    const saved = (await f.rpcAs(f.teacher, manualRpc, updateWrite(next, f.manual(true), 'req-save', 'saved'))).data.record;
    const revised = (await f.rpcAs(f.teacher, manualRpc, {
      ...updateWrite(saved, f.manual(true), 'req-saved-update', 'saved'), p_action: 'update_saved',
    })).data.record;
    assert.equal(first.id, next.id); assert.equal(next.id, saved.id); assert.equal(saved.id, revised.id);
    assert.equal(revised.revision, 4);
    const reopened = (await f.rpcAs(f.teacher, 'eduscribe_manual_read_v1', { p_id: revised.id })).data.record;
    assert.deepEqual(JSON.parse(reopened.objectives).document, f.manual(true).document);
    await code(f.rpcAs(f.otherTeacher, 'eduscribe_manual_read_v1', { p_id: saved.id }), 'not_found');
    await code(f.rpcAs(f.teacher, manualRpc, updateWrite(saved, f.manual(true), 'stale', 'saved')),
      'invalid_transition'); // update_saved is a separate transition.
  });
  await driver.case('Manual HTML cannot be overwritten through V2 RPC', async f => {
    const html = await f.createLegacyAiPlan();
    await code(f.rpcAs(f.teacher, manualRpc, updateWrite(html, f.manual(false))),
      'document_type_conflict');
    assert.equal(await f.legacyHtml(html.id), html.objectives);
  });
  await driver.case('Incomplete Worksheet and private keys round-trip without distribution', async f => {
    const document = f.worksheet(false);
    const first = (await f.rpcAs(f.teacher, worksheetRpc, newWrite(document))).data.record;
    const reopen = (await f.rpcAs(f.teacher, 'eduscribe_worksheet_read_v1', { p_id: first.id })).data.record;
    assert.deepEqual(reopen.document, document);
    assert.equal(reopen.document.answerKeys[document.questions[0]?.id], undefined);
    const changed = structuredClone(document); changed.groups[0].directions = 'Revised directions';
    const next = (await f.rpcAs(f.teacher, worksheetRpc, updateWrite(first, changed))).data.record;
    assert.equal(next.id, first.id); assert.equal(next.revision, 2);
    assert.deepEqual((await f.rpcAs(f.teacher, 'eduscribe_worksheet_read_v1', { p_id: first.id })).data.record.document.groups,
      changed.groups);
    await code(f.rpcAs(f.otherTeacher, 'eduscribe_worksheet_read_v1', { p_id: first.id }), 'not_found');
    await code(f.rpcAs(f.student, 'eduscribe_worksheet_read_v1', { p_id: first.id }), 'inactive_teacher');
    assert.deepEqual(await f.effects(), f.emptyEffects);
  });
  await driver.case('Complete Worksheet projects ordered groups and private keys without publishing', async f => {
    const complete = f.worksheet(true);
    const first = (await f.rpcAs(f.teacher, worksheetRpc, newWrite(complete))).data.record;
    const scoped = (await f.rpcAs(f.teacher, 'eduscribe_worksheet_projection_v1', { p_id: first.id })).data.record;
    assert.equal(validateWorksheetForDistribution(scoped.document).valid, true);
    const projection = prepareNormalizedAssessmentProjection(scoped);
    assert.deepEqual(projection.groups.map(g => g.id), complete.groups.map(g => g.id));
    assert.deepEqual(projection.groups.map(g => g.directions), complete.groups.map(g => g.directions));
    assert.ok(projection.privateAnswerKeys.length > 0);
    assert.equal(await f.selectAs(f.student, 'worksheet_authoring_documents', first.id), null);
    assert.equal(await f.selectAs(f.student, 'worksheet_item_keys', first.id), null);
    assert.deepEqual(await f.effects(), f.emptyEffects);
  });
  await driver.case('Owned saved Manual source is required and never copied into student payload', async f => {
    const source = (await f.rpcAs(f.teacher, manualRpc, newWrite(f.manual(false)))).data.record;
    const worksheet = f.worksheet(false); worksheet.sourcePlanId = source.id;
    await code(f.rpcAs(f.teacher, worksheetRpc, newWrite(worksheet, 'source-draft')), 'source_plan_denied');
    await f.rpcAs(f.teacher, manualRpc, updateWrite(source, f.manual(true), 'source-save', 'saved'));
    const accepted = (await f.rpcAs(f.teacher, worksheetRpc,
      newWrite(worksheet, 'source-saved'))).data.record;
    assert.equal(accepted.document.sourcePlanId, source.id);
    assert.deepEqual(await f.effects(), f.emptyEffects);
  });
  await driver.case('Idempotency, stale revision, and concurrent updates', async f => {
    const command = newWrite(f.worksheet(false));
    const [a, b] = await Promise.all([f.rpcAs(f.teacher, worksheetRpc, command),
      f.rpcAs(f.teacher, worksheetRpc, command)]);
    assert.deepEqual(a.data, b.data);
    assert.equal(await f.countOwned('worksheets'), 1);
    await code(f.rpcAs(f.teacher, worksheetRpc,
      { ...command, p_document: { ...command.p_document, title: 'changed' } }), 'idempotency_conflict');
    const first = a.data.record;
    const update = updateWrite(first, f.worksheet(false), 'same-update');
    const updated = await f.rpcAs(f.teacher, worksheetRpc, update);
    assert.deepEqual((await f.rpcAs(f.teacher, worksheetRpc, update)).data, updated.data);
    await code(f.rpcAs(f.teacher, worksheetRpc,
      updateWrite(first, f.worksheet(false), 'stale-update')), 'revision_conflict');
    const [one, two] = await Promise.all(['one','two'].map(requestId =>
      f.rpcAs(f.teacher, worksheetRpc, updateWrite(updated.data.record, f.worksheet(false), requestId))));
    assert.equal([one, two].filter(r => r.data?.ok === true).length, 1);
    assert.equal([one, two].filter(r => r.error?.message === 'revision_conflict').length, 1);
  });
  await driver.case('Active exact load, Settings year, and no adviser-only access', async f => {
    const wrongSubject = f.manual(false); wrongSubject.assignment.subjectId = f.otherSubjectId;
    await code(f.rpcAs(f.teacher, manualRpc, newWrite(wrongSubject, 'wrong-subject')), 'assignment_denied');
    const wrongGrade = f.manual(false); wrongGrade.assignment.gradeLevel = 'Grade 8';
    await code(f.rpcAs(f.teacher, manualRpc, newWrite(wrongGrade, 'wrong-grade')), 'assignment_denied');
    const wrongYear = f.manual(false); wrongYear.assignment.schoolYear = '2033-2034';
    await code(f.rpcAs(f.teacher, manualRpc, newWrite(wrongYear, 'wrong-year')), 'assignment_denied');
    await f.setTeachingLoads([]);
    await code(f.rpcAs(f.teacher, manualRpc, newWrite(f.manual(false), 'adviser-only')), 'assignment_denied');
    await f.setTeacherStatus('inactive');
    await code(f.rpcAs(f.teacher, manualRpc, newWrite(f.manual(false), 'inactive')), 'inactive_teacher');
  });
  await driver.case('Missing Settings and forged owner fail closed', async f => {
    await f.setSettings([]);
    await code(f.rpcAs(f.teacher, manualRpc, newWrite(f.manual(false))), 'settings_unavailable');
    assert.equal(await f.countOwned('lesson_plans'), 0);
    await f.restoreSettings();
    await code(f.rpcAs(f.teacher, worksheetRpc,
      newWrite({ ...f.worksheet(false), teacher_id: f.otherTeacherId }, 'forged')), 'invalid_document');
  });
  await driver.case('Historical owner read survives; historical edit and source mismatch fail', async f => {
    const first = (await f.rpcAs(f.teacher, manualRpc, newWrite(f.manual(false)))).data.record;
    await f.setSettings([{ school_year: '2035-2036' }]);
    assert.equal((await f.rpcAs(f.teacher, 'eduscribe_manual_read_v1', { p_id: first.id })).data.record.id, first.id);
    await code(f.rpcAs(f.teacher, manualRpc, updateWrite(first, f.manual(false))), 'assignment_denied');
    assert.deepEqual(await f.effects(), f.emptyEffects);
  });
  await driver.case('Injected database failure rolls back row and receipt atomically', async f => {
    await f.failNextApprovedSyntheticWrite();
    const result = await f.rpcAs(f.teacher, worksheetRpc, newWrite(f.worksheet(false), 'rollback'));
    assert.ok(result.error);
    assert.equal(await f.countOwned('worksheets'), 0);
    assert.equal(await f.countOwned('teacher_write_receipts'), 0);
    assert.deepEqual(await f.effects(), f.emptyEffects);
  });
}
