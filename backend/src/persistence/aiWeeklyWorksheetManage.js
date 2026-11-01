import { buildWeeklySavePayload } from './aiWeeklyWorksheetSave.js';

const DB_CODES = new Set(['not_authenticated', 'inactive_teacher', 'not_found',
  'revision_conflict', 'student_work_exists', 'collection_archived',
  'invalid_document', 'invalid_state']);
const BUILD_CODES = new Set(['invalid_document', 'payload_too_large',
  'mcq_options_not_distinct', 'unsafe_markup', 'not_authenticated']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = code => ({ ok: false, code, durable: false });
const uuid = value => typeof value === 'string' && UUID.test(value);
const validRevision = value => Number.isSafeInteger(value) && value >= 1;
const validCommand = (credential, command) => {
  if (typeof credential !== 'string' || !credential) return 'not_authenticated';
  if (!command || typeof command !== 'object' || Array.isArray(command)
    || !uuid(command.collectionId) || !validRevision(command.expectedRevision)) return 'invalid_document';
  return null;
};
const rpcFailure = error => fail(DB_CODES.has(error?.message) ? error.message : 'persistence_failed');
const validReceipt = (data, collectionId) => data?.ok === true && data.durable === true
  && uuid(data.collectionId) && data.collectionId === collectionId;

export function createAiWeeklyWorksheetManage({ invokeRpc } = {}) {
  return {
    async update(credential, command) {
      if (typeof invokeRpc !== 'function') return fail('integration_blocked');
      const problem = validCommand(credential, command);
      if (problem) return fail(problem);
      if (command.collection?.collectionId !== command.collectionId) return fail('invalid_document');
      let payload;
      try {
        payload = await buildWeeklySavePayload(command.collection);
        delete payload.sourceLessonPlanId;
      } catch (error) {
        return fail(BUILD_CODES.has(error?.code) ? error.code : 'persistence_failed');
      }
      try {
        const { data, error } = await invokeRpc('eduscribe_ai_weekly_worksheets_update_v1',
          { p_collection_id: command.collectionId, p_expected_revision: command.expectedRevision,
            p_payload: payload }, credential);
        if (error) return rpcFailure(error);
        const expected = new Map(payload.worksheets.map(day => [day.day, day.questions.length]));
        const lockedDays = data && Object.hasOwn(data, 'lockedDays') ? data.lockedDays : [];
        if (!validReceipt(data, command.collectionId)
          || !Number.isSafeInteger(data.revision) || data.revision <= command.expectedRevision
          || !Array.isArray(data.worksheets) || data.worksheets.length !== expected.size
          || new Set(data.worksheets.map(item => item?.day)).size !== expected.size
          || !Array.isArray(lockedDays) || lockedDays.length > 4
          || lockedDays.some((day, index) => !Number.isInteger(day) || day < 1 || day > 5
            || (index > 0 && day <= lockedDays[index - 1])
            || !data.worksheets.some(item => item?.day === day))
          || data.worksheets.some(item => !expected.has(item?.day)
            || !uuid(item.id) || (lockedDays.includes(item.day)
              ? !Number.isSafeInteger(item.items) || item.items < 0
              : item.items !== expected.get(item.day)))) {
          return fail('persistence_failed');
        }
        return { ok: true, durable: true, collectionId: data.collectionId,
          revision: data.revision, lockedDays,
          worksheets: data.worksheets.map(item => ({ day: item.day, id: item.id, items: item.items })) };
      } catch {
        return fail('persistence_failed');
      }
    },
    async archive(credential, command) {
      if (typeof invokeRpc !== 'function') return fail('integration_blocked');
      const problem = validCommand(credential, command);
      if (problem) return fail(problem);
      if (typeof command.archived !== 'boolean') return fail('invalid_document');
      try {
        const { data, error } = await invokeRpc('eduscribe_ai_weekly_worksheets_archive_v1',
          { p_collection_id: command.collectionId, p_expected_revision: command.expectedRevision,
            p_archived: command.archived }, credential);
        if (error) return rpcFailure(error);
        if (!validReceipt(data, command.collectionId)
          || !Number.isSafeInteger(data.revision) || data.revision <= command.expectedRevision
          || data.archived !== command.archived) return fail('persistence_failed');
        return { ok: true, durable: true, collectionId: data.collectionId,
          revision: data.revision, archived: data.archived };
      } catch {
        return fail('persistence_failed');
      }
    },
    async remove(credential, command) {
      if (typeof invokeRpc !== 'function') return fail('integration_blocked');
      const problem = validCommand(credential, command);
      if (problem) return fail(problem);
      try {
        const { data, error } = await invokeRpc('eduscribe_ai_weekly_worksheets_delete_v1',
          { p_collection_id: command.collectionId, p_expected_revision: command.expectedRevision },
          credential);
        if (error) return rpcFailure(error);
        if (!validReceipt(data, command.collectionId) || data.deleted !== true)
          return fail('persistence_failed');
        return { ok: true, durable: true, collectionId: data.collectionId, deleted: true };
      } catch {
        return fail('persistence_failed');
      }
    },
  };
}
