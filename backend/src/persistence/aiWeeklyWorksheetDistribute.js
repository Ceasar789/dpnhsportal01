const DB_CODES = new Set(['not_authenticated', 'inactive_teacher', 'not_found',
  'revision_conflict', 'collection_archived', 'invalid_document',
  'section_not_allowed', 'student_not_in_section', 'invalid_due_date']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const fail = code => ({ ok: false, code, durable: false });
const uuid = value => typeof value === 'string' && UUID.test(value);
const validDays = days => Array.isArray(days) && days.length >= 1 && days.length <= 5
  && days.every(day => Number.isInteger(day) && day >= 1 && day <= 5)
  && new Set(days).size === days.length;
const validStudents = ids => Array.isArray(ids) && ids.length >= 1 && ids.length <= 200
  && ids.every(uuid) && new Set(ids).size === ids.length;
const validDueAt = value => value === null || (typeof value === 'string'
  && ISO_DATE.test(value) && Number.isFinite(Date.parse(value))
  && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10)
    === value.slice(0, 10));
const validCommand = command => command && typeof command === 'object' && !Array.isArray(command)
  && uuid(command.collectionId) && Number.isSafeInteger(command.expectedRevision)
  && command.expectedRevision >= 1 && uuid(command.sectionId)
  && validDays(command.days) && validStudents(command.studentIds)
  && validDueAt(command.dueAt);
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const validReceipt = (data, command) => data?.ok === true && data.durable === true
  && uuid(data.collectionId) && data.collectionId === command.collectionId
  && uuid(data.sectionId) && data.sectionId === command.sectionId
  && Array.isArray(data.days) && data.days.length === command.days.length
  && data.days.every((day, index) => day === command.days[index])
  && validCount(data.requested) && data.requested === command.days.length * command.studentIds.length
  && validCount(data.inserted) && validCount(data.alreadyAssigned)
  && validCount(data.assignedElsewhere)
  && data.inserted + data.alreadyAssigned === data.requested
  && data.assignedElsewhere <= data.alreadyAssigned;

export function createAiWeeklyWorksheetDistribute({ invokeRpc } = {}) {
  return {
    async distribute(credential, command) {
      if (typeof invokeRpc !== 'function') return fail('integration_blocked');
      if (typeof credential !== 'string' || !credential) return fail('not_authenticated');
      if (!validCommand(command)) return fail('invalid_document');
      try {
        const { data, error } = await invokeRpc('eduscribe_ai_weekly_worksheets_distribute_v1',
          { p_collection_id: command.collectionId,
            p_expected_revision: command.expectedRevision, p_section_id: command.sectionId,
            p_days: command.days, p_student_ids: command.studentIds, p_due_at: command.dueAt },
          credential);
        if (error) return fail(DB_CODES.has(error?.message) ? error.message : 'persistence_failed');
        if (!validReceipt(data, command)) return fail('persistence_failed');
        return { ok: true, durable: true, collectionId: data.collectionId,
          sectionId: data.sectionId, days: [...data.days], requested: data.requested,
          inserted: data.inserted, alreadyAssigned: data.alreadyAssigned,
          assignedElsewhere: data.assignedElsewhere };
      } catch {
        return fail('persistence_failed');
      }
    },
  };
}
