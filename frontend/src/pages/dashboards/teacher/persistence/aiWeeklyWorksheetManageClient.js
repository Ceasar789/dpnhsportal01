import { supabase } from '../../../../config/supabase';
import { weeklyWorksheetSaveFlagEnabled } from './aiWeeklyWorksheetSaveClient';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNKNOWN_MESSAGE = 'Could not confirm the change. Reload the collection before trying again.';
const FAILURE_MESSAGES = {
  not_authenticated: 'Sign in again before saving.',
  inactive_teacher: 'This account cannot change worksheets.',
  not_found: 'This collection was not found.',
  invalid_document: 'Review the weekly worksheets before saving.',
  mcq_options_not_distinct: 'Each multiple-choice option must be different.',
  unsafe_markup: 'Remove HTML or unsafe markup from the worksheet text.',
  payload_too_large: 'The weekly worksheets are too large to save.',
  revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
  student_work_exists: 'This collection already has student work and cannot be changed.',
  collection_archived: 'Restore this collection before editing it.',
  invalid_state: 'This collection cannot be changed in its current state.',
  integration_blocked: 'Permanent worksheet changes are unavailable.',
};

const failed = (code, message) => ({ status: 'failed', code, message, receipt: null, detail: null });
const unknown = detail => ({ status: 'unknown', code: null, message: UNKNOWN_MESSAGE, receipt: null, detail });
const httpDetail = (status, code) => Number.isInteger(status)
  ? `http_${status}${typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? `:${code}` : ''}`
  : 'unreadable_response';
const isUuid = value => typeof value === 'string' && UUID.test(value);
const validParams = (action, params) => params && typeof params === 'object'
  && !Array.isArray(params) && isUuid(params.collectionId)
  && Number.isSafeInteger(params.expectedRevision) && params.expectedRevision >= 1
  && (action !== 'archive' || typeof params.archived === 'boolean')
  && (action !== 'update' || (params.collection && typeof params.collection === 'object'
    && !Array.isArray(params.collection) && params.collection.collectionId === params.collectionId));

function receiptFor(action, result, params) {
  if (result?.ok !== true || result.durable !== true
    || result.collectionId !== params.collectionId || !isUuid(result.collectionId)) return null;
  if (action === 'delete') return result.deleted === true
    ? { collectionId: result.collectionId, deleted: true } : null;
  if (!Number.isSafeInteger(result.revision) || result.revision <= params.expectedRevision) return null;
  if (action === 'archive') return result.archived === params.archived
    ? { collectionId: result.collectionId, revision: result.revision, archived: result.archived } : null;
  if (!Array.isArray(result.worksheets) || result.worksheets.length !== 5) return null;
  const days = new Set();
  const ids = new Set();
  const worksheets = [];
  for (const item of result.worksheets) {
    if (!Number.isInteger(item?.day) || item.day < 1 || item.day > 5 || days.has(item.day)
      || !isUuid(item.id) || ids.has(item.id)
      || !Number.isSafeInteger(item.items) || item.items < 0) return null;
    days.add(item.day);
    ids.add(item.id);
    worksheets.push({ day: item.day, id: item.id, items: item.items });
  }
  const lockedDays = Object.hasOwn(result, 'lockedDays') ? result.lockedDays : [];
  if (!Array.isArray(lockedDays) || lockedDays.length > 4
    || lockedDays.some((day, index) => !Number.isInteger(day) || day < 1 || day > 5
      || (index > 0 && day <= lockedDays[index - 1]) || !days.has(day))) return null;
  return { collectionId: result.collectionId, revision: result.revision, worksheets, lockedDays };
}

async function manage(action, apiBase, params) {
  if (!weeklyWorksheetSaveFlagEnabled()) return failed('integration_blocked',
    'Permanent worksheet changes are unavailable.');
  if (!validParams(action, params)) return failed('invalid_request', 'The request was not valid.');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return failed('not_authenticated', 'Sign in again before saving.');
    const body = action === 'update'
      ? { collectionId: params.collectionId, expectedRevision: params.expectedRevision,
        collection: params.collection }
      : action === 'archive'
        ? { collectionId: params.collectionId, expectedRevision: params.expectedRevision,
          archived: params.archived }
        : { collectionId: params.collectionId, expectedRevision: params.expectedRevision };
    const response = await fetch(`${apiBase}/api/weekly-worksheets/manage/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    let result;
    try { result = await response.json(); }
    catch { return unknown('unreadable_response'); }
    if (response.ok) {
      const receipt = receiptFor(action, result, params);
      return receipt ? { status: 'saved', code: null, message: '', receipt, detail: null }
        : unknown('malformed_receipt');
    }
    if (result?.ok === false && result.durable === false
      && Object.hasOwn(FAILURE_MESSAGES, result.code)) {
      return failed(result.code, FAILURE_MESSAGES[result.code]);
    }
    return unknown(httpDetail(response.status, result?.code));
  } catch (error) {
    return unknown(['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network_error');
  }
}

export const updateAiWeeklyCollection = (apiBase, params) => manage('update', apiBase, params);
export const archiveAiWeeklyCollection = (apiBase, params) => manage('archive', apiBase, params);
export const deleteAiWeeklyCollection = (apiBase, params) => manage('delete', apiBase, params);
