import { randomUUID } from 'node:crypto';
import { normalizeManualIlawV2, parseManualIlawV2, validateManualIlawSave } from '../../../frontend/src/pages/dashboards/teacher/ilaw/manualIlawV2.js';
import { PersistenceError, requireThat, identity, exact, boundedJson, canonical,
  validateWorksheetDraft, validateWorksheetForDistribution, prepareNormalizedAssessmentProjection, UNAVAILABLE } from '../../../shared/trustedPersistence/contracts.js';

export const OPERATIONS = Object.freeze([
  'CreateIncompleteDraft', 'UpdateIncompleteDraft', 'SaveCompleteLessonPlan', 'UpdateSavedLessonPlan',
  'ReopenOwnedLessonPlan', 'ValidateDocument', 'CreatePrivateWorksheetDraft', 'UpdatePrivateWorksheetDraft',
  'ReopenPrivateWorksheetDraft', 'ValidateWorksheetForDistribution', 'PrepareNormalizedAssessmentProjection',
]);
const reads = new Set(['ReopenOwnedLessonPlan', 'ReopenPrivateWorksheetDraft', 'ValidateWorksheetForDistribution', 'PrepareNormalizedAssessmentProjection']);
const creates = new Set(['CreateIncompleteDraft', 'CreatePrivateWorksheetDraft']);

export function resolveOfficialYear(settings) {
  requireThat(Array.isArray(settings) && settings.length === 1, 'settings_unavailable');
  const year = settings[0].school_year;
  requireThat(typeof year === 'string' && /^\d{4}-\d{4}$/.test(year) && Number(year.slice(5)) === Number(year.slice(0, 4)) + 1, 'settings_unavailable');
  return year;
}
function assignmentFor(tx, userId, selected, year, optional = false) {
  if (selected === null && optional) return null;
  requireThat(selected && selected.schoolYear === year, 'assignment_denied');
  const tuple = tx.assignments().find(a => a.teacher_id === userId && a.subject_id === selected.subjectId &&
    a.grade_level === selected.gradeLevel && a.school_year === year);
  requireThat(tuple, 'assignment_denied');
  const subject = tx.subjects().find(s => s.id === tuple.subject_id && s.is_active === true);
  requireThat(subject, 'assignment_denied');
  return { subjectId: tuple.subject_id, subjectName: subject.name, gradeLevel: tuple.grade_level, schoolYear: year };
}
function owned(tx, id, userId, type) {
  const row = tx.get(id);
  requireThat(row && row.ownerId === userId, 'not_found');
  requireThat(row.type === type, 'document_type_conflict');
  if (type === 'manual') {
    requireThat(row.ai_generated === false && row.status === 'draft', 'document_type_conflict');
    parseManualIlawV2(row.objectives, { teacherId: userId, planId: row.id });
  }
  return row;
}
function sourceFor(tx, id, userId, assignment) {
  if (id === null) return;
  const source = owned(tx, id, userId, 'manual');
  const value = parseManualIlawV2(source.objectives, { teacherId: userId, planId: source.id });
  requireThat(value.workflowState === 'saved' && assignment && ['subjectId', 'gradeLevel', 'schoolYear'].every(k => value.assignment[k] === assignment[k]), 'source_plan_denied');
  // Legacy HTML remains readable through the existing path, but cannot be used
  // as a trusted source until an authoritative assignment/year adapter exists.
}
function manualDocument(input, id, userId, assignment, state) {
  exact(input, ['kind', 'version', 'title', 'assignment', 'document', 'sourceDetails']);
  exact(input.assignment, ['subjectId', 'gradeLevel', 'schoolYear']);
  const envelope = { ...input, teacherId: userId, planId: id, assignment, workflowState: state };
  try { normalizeManualIlawV2(envelope); } // Existing approved V2 contract.
  catch { requireThat(false, 'invalid_document'); }
  // Keep the original strings (including line endings) for exact round-trip.
  const info = envelope.document.info;
  requireThat(!info.learningArea.trim() || info.learningArea.trim() === assignment.subjectName, 'assignment_denied');
  requireThat(!info.gradeSection.trim() || info.gradeSection.trim() === assignment.gradeLevel ||
    [' ', ',', ';', '/'].some(s => info.gradeSection.trim().startsWith(assignment.gradeLevel + s)), 'assignment_denied');
  if (state === 'saved') requireThat(Object.keys(validateManualIlawSave(envelope)).length === 0, 'incomplete_lesson_plan');
  return envelope;
}

/**
 * SERVER ONLY. resolveIdentity must verify an opaque session credential; never
 * pass req.body as trusted context. All authorization data is read through tx.
 * Repository contract: transaction(callback) must atomically serialize receipts,
 * settings/assignment checks, source/owner checks, revision CAS and record writes.
 * A future DB implementation must NOT implement this as separate REST requests.
 * tx exposes only profiles/settings/assignments/subjects/get/put/receipt APIs;
 * no assignments-to-students, scores, notifications or Storage capability exists.
 */
export function createTrustedPersistence({ enabled = false, repository, resolveIdentity, newId = randomUUID } = {}) {
  return {
    async execute(operation, credential, rawCommand) {
      if (!enabled || !repository || repository.atomic !== true || !resolveIdentity) return { ...UNAVAILABLE };
      try {
        requireThat(OPERATIONS.includes(operation), 'unsupported_operation');
        const command = boundedJson(rawCommand);
        const user = await resolveIdentity(credential);
        requireThat(user && identity(user.id), 'not_authenticated');
        return await repository.transaction(async tx => {
          const profile = tx.profile(user.id);
          requireThat(profile?.id === user.id && profile.role === 'teacher' && profile.status === 'active', 'inactive_teacher');
          const type = operation.includes('Worksheet') || operation === 'PrepareNormalizedAssessmentProjection' ? 'worksheet' : 'manual';
          if (reads.has(operation)) {
            exact(command, ['id']); requireThat(identity(command.id));
            const row = owned(tx, command.id, user.id, type);
            if (operation.startsWith('Reopen')) return { ok: true, durable: repository.durable === true, record: structuredClone(row) };
            const year = resolveOfficialYear(tx.settings());
            requireThat(row.schoolYear === year, 'historical_write_blocked');
            const assignment = assignmentFor(tx, user.id, row.document.assignment, year);
            sourceFor(tx, row.document.sourcePlanId, user.id, assignment);
            const validation = validateWorksheetForDistribution(row.document);
            if (operation === 'ValidateWorksheetForDistribution') return { ok: true, ...validation, revision: row.revision, distributionAuthorized: false };
            requireThat(validation.valid, 'incomplete_worksheet');
            return { ok: true, projection: prepareNormalizedAssessmentProjection(row), distributionAuthorized: false };
          }
          if (operation === 'ValidateDocument') {
            exact(command, ['document']);
            const year = resolveOfficialYear(tx.settings());
            const assignment = assignmentFor(tx, user.id, command.document.assignment, year);
            manualDocument(command.document, 'validation-only', user.id, assignment, 'saved');
            return { ok: true, valid: true, durable: false };
          }
          exact(command, ['requestId', 'id', 'expectedRevision', 'document']);
          requireThat(identity(command.requestId), 'invalid_request_id');
          const create = creates.has(operation);
          requireThat(create ? command.id === null && command.expectedRevision === null :
            identity(command.id) && Number.isSafeInteger(command.expectedRevision) && command.expectedRevision >= 1, 'invalid_revision');
          const receiptKey = canonical([user.id, operation, command.requestId]);
          const fingerprint = canonical(command);
          const prior = tx.receipt(receiptKey);
          if (prior) {
            requireThat(prior.fingerprint === fingerprint, 'idempotency_conflict');
            owned(tx, prior.result.record.id, user.id, type);
            return structuredClone(prior.result);
          }
          const existing = create ? null : owned(tx, command.id, user.id, type);
          if (existing) requireThat(existing.revision === command.expectedRevision, 'revision_conflict');
          const year = resolveOfficialYear(tx.settings());
          if (existing) requireThat(existing.schoolYear === year, 'historical_write_blocked');
          const id = existing?.id ?? newId();
          requireThat(identity(id) && (existing || !tx.get(id)), 'identity_conflict');
          const assignment = assignmentFor(tx, user.id, command.document.assignment, year, type === 'worksheet');
          let row;
          if (type === 'manual') {
            const oldState = existing ? parseManualIlawV2(existing.objectives).workflowState : null;
            if (operation === 'UpdateIncompleteDraft') requireThat(oldState === 'draft', 'invalid_transition');
            if (operation === 'UpdateSavedLessonPlan') requireThat(oldState === 'saved', 'invalid_transition');
            if (existing) {
              const old = parseManualIlawV2(existing.objectives).assignment;
              requireThat(old.subjectId === assignment.subjectId && old.gradeLevel === assignment.gradeLevel, 'assignment_denied');
            }
            const state = ['SaveCompleteLessonPlan', 'UpdateSavedLessonPlan'].includes(operation) ? 'saved' : 'draft';
            const envelope = manualDocument(command.document, id, user.id, assignment, state);
            row = { id, ownerId: user.id, type, schoolYear: year, revision: (existing?.revision ?? 0) + 1,
              teacher_id: user.id, title: envelope.title, subject_id: assignment.subjectId, grade_level: assignment.gradeLevel,
              ai_generated: false, status: 'draft', objectives: JSON.stringify(envelope) };
          } else {
            const document = validateWorksheetDraft(command.document);
            sourceFor(tx, document.sourcePlanId, user.id, assignment);
            row = { id, ownerId: user.id, type, schoolYear: year, revision: (existing?.revision ?? 0) + 1, document };
          }
          const result = { ok: true, durable: repository.durable === true, record: row };
          tx.put(row);
          tx.putReceipt(receiptKey, { fingerprint, result });
          return structuredClone(result);
        });
      } catch (error) {
        if (error instanceof PersistenceError) return { ok: false, code: error.code, durable: false };
        // No error text or document content escapes the trusted boundary.
        return { ok: false, code: 'persistence_failed', durable: false };
      }
    },
  };
}
