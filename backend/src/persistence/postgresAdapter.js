import { createClient } from '@supabase/supabase-js';
import { normalizeManualIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/fullManualIlawModel.js';
import { validateManualIlawCompletion } from '../../../frontend/src/pages/dashboards/teacher/ilaw/manualIlawV2.js';
import { PersistenceError, UNAVAILABLE, boundedJson, exact, identity, requireThat,
  validateWorksheetDraft, validateWorksheetForDistribution,
  prepareNormalizedAssessmentProjection } from '../../../shared/trustedPersistence/contracts.js';

// Deliberately absent from production composition. A later approved deployment
// must first reconcile the review-only SQL with the actual isolated schema.
export const POSTGRES_ADAPTER_ENABLED = false;
const PRODUCTION_REF = 'jllstakxiamxiycnwrbd';
const WRITE_OPERATIONS = Object.freeze({
  CreateIncompleteDraft: ['eduscribe_manual_write_v1', 'create', 'draft'],
  UpdateIncompleteDraft: ['eduscribe_manual_write_v1', 'update', 'draft'],
  SaveCompleteLessonPlan: ['eduscribe_manual_write_v1', 'update', 'saved'],
  UpdateSavedLessonPlan: ['eduscribe_manual_write_v1', 'update_saved', 'saved'],
  CreatePrivateWorksheetDraft: ['eduscribe_worksheet_write_v1', 'create', 'draft'],
  UpdatePrivateWorksheetDraft: ['eduscribe_worksheet_write_v1', 'update', 'draft'],
});
const READ_OPERATIONS = Object.freeze({
  ReopenOwnedLessonPlan: 'eduscribe_manual_read_v1',
  ReopenPrivateWorksheetDraft: 'eduscribe_worksheet_read_v1',
  ValidateWorksheetForDistribution: 'eduscribe_worksheet_projection_v1',
  PrepareNormalizedAssessmentProjection: 'eduscribe_worksheet_projection_v1',
});
const DB_ERRORS = new Set(['not_authenticated', 'inactive_teacher', 'settings_unavailable',
  'assignment_denied', 'not_found', 'document_type_conflict', 'invalid_document',
  'incomplete_lesson_plan', 'invalid_transition', 'historical_write_blocked',
  'source_plan_denied', 'revision_conflict', 'idempotency_conflict', 'identity_conflict',
  'invalid_request_id', 'invalid_revision', 'payload_too_large', 'integration_blocked']);
const fail = code => ({ ok: false, code, durable: false });
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function documentFor(operation, raw) {
  const doc = boundedJson(raw);
  if (operation.includes('Worksheet')) return validateWorksheetDraft(doc);
  exact(doc, ['kind', 'version', 'title', 'assignment', 'document', 'sourceDetails']);
  requireThat(doc.kind === 'eduscribe.manual-ilaw' && doc.version === 2 &&
    typeof doc.title === 'string' && doc.title.length <= 255, 'invalid_document');
  exact(doc.assignment, ['subjectId', 'gradeLevel', 'schoolYear']);
  requireThat(uuid(doc.assignment.subjectId) && typeof doc.assignment.gradeLevel === 'string' &&
    typeof doc.assignment.schoolYear === 'string', 'invalid_document');
  exact(doc.sourceDetails, ['classDuration', 'teachingStrategy', 'learningObjectives']);
  requireThat(Object.values(doc.sourceDetails).every(value => typeof value === 'string'), 'invalid_document');
  try {
    normalizeManualIlawDocument(doc.document);
    requireThat(doc.title === doc.document.info.nameOfLesson, 'invalid_document');
    if (['SaveCompleteLessonPlan', 'UpdateSavedLessonPlan'].includes(operation))
      requireThat(Object.keys(validateManualIlawCompletion(doc.document, doc.sourceDetails)).length === 0,
        'incomplete_lesson_plan');
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError('invalid_document');
  }
  return doc;
}

/**
 * A user-scoped RPC transport. The anon key is public configuration, never a
 * service-role credential. PostgreSQL auth.uid() and RPC grants remain the
 * authoritative identity/authorization boundary. No client is made until a
 * separately approved caller invokes this factory with a verified endpoint.
 */
export function createUserScopedRpcTransport({ url, anonKey, allowTestDataProject = false,
  approvedProductionProjectRef,
  createClientImpl = createClient } = {}) {
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new PersistenceError('integration_blocked'); }
  const local = url === 'http://127.0.0.1:54321';
  const approvedProductionTarget = approvedProductionProjectRef === PRODUCTION_REF
    && url === `https://${approvedProductionProjectRef}.supabase.co`;
  const hosted = endpoint.protocol === 'https:' &&
    /^[a-z0-9]{20}\.supabase\.co$/.test(endpoint.hostname) &&
    (endpoint.hostname !== `${PRODUCTION_REF}.supabase.co` || allowTestDataProject === true
      || approvedProductionTarget) &&
    endpoint.origin === url;
  requireThat((local || hosted) && !endpoint.username && !endpoint.password &&
    typeof anonKey === 'string' && anonKey.length > 0 && typeof createClientImpl === 'function',
    'integration_blocked');
  return async (name, args, credential) => {
    requireThat(typeof credential === 'string' && credential.length > 0, 'not_authenticated');
    const client = createClientImpl(url, anonKey, {
      accessToken: async () => credential,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return client.rpc(name, args);
  };
}

/** Enabled only by a future explicit server composition after disposable DB
 * verification. No direct-table or multi-request read/modify/write fallback. */
function buildAdapter(active, invokeRpc) {
  return Object.freeze({
    enabled: active && typeof invokeRpc === 'function',
    durable: false, // Capability is not evidence of a committed database write.
    async execute(operation, credential, rawCommand) {
      if (!active || typeof invokeRpc !== 'function') return { ...UNAVAILABLE };
      try {
        requireThat(typeof credential === 'string' && credential.length > 0, 'not_authenticated');
        const command = boundedJson(rawCommand);
        const write = WRITE_OPERATIONS[operation];
        const read = READ_OPERATIONS[operation];
        requireThat(write || read, 'unsupported_operation');
        let name; let args;
        if (read) {
          exact(command, ['id']); requireThat(uuid(command.id), 'invalid_document');
          name = read; args = { p_id: command.id };
        } else {
          exact(command, ['requestId', 'id', 'expectedRevision', 'document']);
          requireThat(identity(command.requestId) && command.requestId.length <= 128, 'invalid_request_id');
          requireThat(write[1] === 'create' ? command.id === null && command.expectedRevision === null :
            uuid(command.id) && Number.isSafeInteger(command.expectedRevision) && command.expectedRevision >= 1,
          'invalid_revision');
          name = write[0];
          args = { p_action: write[1], p_state: write[2], p_id: command.id,
            p_expected_revision: command.expectedRevision, p_request_id: command.requestId,
            p_document: documentFor(operation, command.document) };
        }
        const { data, error } = await invokeRpc(name, args, credential);
        if (error) return fail(DB_ERRORS.has(error.message) ? error.message : 'persistence_failed');
        if (!data || data.ok !== true || data.durable !== true || !data.record || !uuid(data.record.id))
          return { ...UNAVAILABLE };
        if (operation === 'ValidateWorksheetForDistribution') {
          const validation = validateWorksheetForDistribution(data.record.document);
          return { ok: true, ...validation, revision: data.record.revision, distributionAuthorized: false };
        }
        if (operation === 'PrepareNormalizedAssessmentProjection') {
          return { ok: true, projection: prepareNormalizedAssessmentProjection(data.record),
            distributionAuthorized: false };
        }
        return data;
      } catch (error) {
        if (error instanceof PersistenceError) return fail(error.code);
        return fail('persistence_failed');
      }
    },
  });
}

export function createPostgresPersistence({ invokeRpc } = {}) {
  return buildAdapter(POSTGRES_ADAPTER_ENABLED, invokeRpc);
}

// Test-only composition seam. Production code must use the disabled factory
// above; the isolated harness may call this only after independent target and
// marker checks. A fake invokeRpc does not establish database durability.
export function createIsolatedPostgresPersistence({ invokeRpc } = {}) {
  return buildAdapter(true, invokeRpc);
}
