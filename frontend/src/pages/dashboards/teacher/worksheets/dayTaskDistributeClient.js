import { supabase } from '../../../../config/supabase';

const RPC_NAME = 'eduscribe_day_task_distribute_v1';
const UNKNOWN_MESSAGE = 'The task could not be distributed. Check who has it before trying again.';
const NETWORK_MESSAGE = 'The server could not be reached. Check your connection, then check who has this task before trying again.';
const FAILURE_MESSAGES = {
  not_authenticated: 'Your session has ended. Sign in again before distributing.',
  inactive_teacher: 'This account cannot distribute tasks.',
  not_found: 'This task was not found. Refresh and try again.',
  invalid_document: 'This task is not ready to distribute. Check that it has content.',
  section_not_allowed: 'You cannot distribute to this section.',
  invalid_student_list: 'Choose between 1 and 200 students.',
  student_not_in_section: 'One or more students are not active members of this section.',
  invalid_due_date: 'Choose a due date and time in the future.',
  invalid_checking_mode: 'That checking mode is not available for this task.',
  checking_mode_locked: 'The checking mode cannot change after the task has been distributed.',
};

const failed = (code, message) => ({ ok: false, code, message });
const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const idList = value => Array.isArray(value) && value.every(id => typeof id === 'string');

// Deadlines are Manila wall-clock strings with no offset. The database needs an
// instant, so the school's fixed offset is stated here rather than the browser's.
export function manilaTimestamp(value) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(typeof value === 'string' ? value : '');
  return match ? `${match[1]}${match[2] || ':00'}+08:00` : null;
}

const validReceipt = (data, worksheetId, sectionId) => data?.ok === true && data.durable === true
  && sameId(data.worksheetId, worksheetId) && sameId(data.sectionId, sectionId)
  && Number.isSafeInteger(data.requested) && idList(data.added)
  && idList(data.alreadyAssigned) && idList(data.assignedElsewhere);

// A database message is never shown: only codes from this list reach the teacher.
const failureFor = (error) => {
  if (Object.hasOwn(FAILURE_MESSAGES, error?.message)) return failed(error.message, FAILURE_MESSAGES[error.message]);
  if (/failed to fetch|network|load failed/i.test(String(error?.message))) return failed('network', NETWORK_MESSAGE);
  return failed('unknown', UNKNOWN_MESSAGE);
};

export async function distributeDayTask({ worksheetId, sectionId, studentIds, dueAt, checkingMode }, { client = supabase } = {}) {
  const dueTimestamp = manilaTimestamp(dueAt);
  if (!dueTimestamp) return failed('invalid_due_date', FAILURE_MESSAGES.invalid_due_date);
  try {
    const { data, error } = await client.rpc(RPC_NAME, {
      p_worksheet_id: worksheetId, p_section_id: sectionId, p_student_ids: studentIds,
      p_due_at: dueTimestamp, p_checking_mode: checkingMode,
    });
    if (error) return failureFor(error);
    return validReceipt(data, worksheetId, sectionId) ? { ok: true, receipt: data } : failed('unknown', UNKNOWN_MESSAGE);
  } catch {
    return failed('network', NETWORK_MESSAGE);
  }
}
