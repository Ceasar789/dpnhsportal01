import { supabase } from '../../../../config/supabase';
import { weeklyWorksheetSaveFlagEnabled } from './aiWeeklyWorksheetSaveClient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UNKNOWN_MESSAGE = 'Could not confirm the change. Reload the collection before trying again.';
const FAILURE_MESSAGES = {
  not_authenticated: 'Sign in again before saving.',
  inactive_teacher: 'This account cannot change worksheets.',
  not_found: 'This collection was not found.',
  invalid_document: 'Review the weekly worksheets before saving.',
  revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
  collection_archived: 'Restore this collection before editing it.',
  section_not_allowed: 'You cannot distribute to this section.',
  student_not_in_section: 'One or more students are not active members of this section.',
  invalid_due_date: 'Choose a valid future due date.',
  integration_blocked: 'Permanent worksheet changes are unavailable.',
};
const FAILURE_STATUSES = { not_authenticated: 401, inactive_teacher: 403,
  section_not_allowed: 403, student_not_in_section: 422, invalid_document: 422,
  invalid_due_date: 422, not_found: 404, revision_conflict: 409,
  collection_archived: 409, integration_blocked: 503 };

const failed = (code, message) => ({ status: 'failed', code, message, receipt: null, detail: null });
const unknown = detail => ({ status: 'unknown', code: null, message: UNKNOWN_MESSAGE, receipt: null, detail });
const httpDetail = (status, code) => Number.isInteger(status)
  ? `http_${status}${typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? `:${code}` : ''}`
  : 'unreadable_response';
const isUuid = value => typeof value === 'string' && UUID.test(value);
const validDays = days => Array.isArray(days) && days.length >= 1 && days.length <= 5
  && days.every(day => Number.isInteger(day) && day >= 1 && day <= 5)
  && new Set(days).size === days.length;
const validStudents = ids => Array.isArray(ids) && ids.length >= 1 && ids.length <= 200
  && ids.every(isUuid) && new Set(ids).size === ids.length;
const validDueAt = value => value === null || (typeof value === 'string'
  && ISO_DATE.test(value) && Number.isFinite(Date.parse(value))
  && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10)
    === value.slice(0, 10));
const validParams = params => params && typeof params === 'object' && !Array.isArray(params)
  && isUuid(params.collectionId) && Number.isSafeInteger(params.expectedRevision)
  && params.expectedRevision >= 1 && isUuid(params.sectionId)
  && validDays(params.days) && validStudents(params.studentIds)
  && validDueAt(params.dueAt);
const validCount = value => Number.isSafeInteger(value) && value >= 0;

function receiptFor(result, params) {
  if (result?.ok !== true || result.durable !== true
    || !isUuid(result.collectionId) || result.collectionId !== params.collectionId
    || !isUuid(result.sectionId) || result.sectionId !== params.sectionId
    || !Array.isArray(result.days) || result.days.length !== params.days.length
    || !result.days.every((day, index) => day === params.days[index])
    || !validCount(result.requested)
    || result.requested !== params.days.length * params.studentIds.length
    || !validCount(result.inserted) || !validCount(result.alreadyAssigned)
    || !validCount(result.assignedElsewhere)
    || result.inserted + result.alreadyAssigned !== result.requested
    || result.assignedElsewhere > result.alreadyAssigned) return null;
  return { collectionId: result.collectionId, sectionId: result.sectionId,
    days: [...result.days], requested: result.requested, inserted: result.inserted,
    alreadyAssigned: result.alreadyAssigned, assignedElsewhere: result.assignedElsewhere };
}

export async function distributeAiWeeklyCollection(apiBase, params) {
  if (!weeklyWorksheetSaveFlagEnabled()) return failed('integration_blocked',
    'Permanent worksheet changes are unavailable.');
  if (!validParams(params)) return failed('invalid_request', 'The request was not valid.');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return failed('not_authenticated', 'Sign in again before saving.');
    const body = { collectionId: params.collectionId, expectedRevision: params.expectedRevision,
      sectionId: params.sectionId, days: params.days, studentIds: params.studentIds,
      dueAt: params.dueAt };
    const response = await fetch(`${apiBase}/api/weekly-worksheets/distribute`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    let result;
    try { result = await response.json(); }
    catch { return unknown('unreadable_response'); }
    if (response.ok && response.status === 200) {
      const receipt = receiptFor(result, params);
      return receipt ? { status: 'saved', code: null, message: '', receipt, detail: null }
        : unknown('malformed_receipt');
    }
    if (!response.ok && result?.ok === false && result.durable === false
      && Object.hasOwn(FAILURE_MESSAGES, result.code)
      && response.status === FAILURE_STATUSES[result.code]) {
      return failed(result.code, FAILURE_MESSAGES[result.code]);
    }
    return unknown(httpDetail(response.status, result?.code));
  } catch (error) {
    return unknown(['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network_error');
  }
}
