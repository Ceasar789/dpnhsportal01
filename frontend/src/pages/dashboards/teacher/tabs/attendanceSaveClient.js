import { supabase } from '../../../../config/supabase';

// Saves one advisory section's daily attendance for one date through the
// trusted function (attendance-save.sql). Only listed students change.
const RPC_NAME = 'eduscribe_attendance_save_v1';
export const SAVE_FAILED = 'Attendance could not be saved. Nothing was changed.';
const NOT_ALLOWED = 'You are not allowed to save attendance.';
const FAILURE_MESSAGES = {
  future_date: "You can't take attendance for a future date.",
  not_found: "This section isn't available for attendance.",
  invalid_students: 'A student on this list is no longer enrolled in this section. Refresh the page and try again.',
  inactive_teacher: NOT_ALLOWED,
  not_authenticated: NOT_ALLOWED,
};

const failed = code => ({
  ok: false, code,
  message: Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, code) ? FAILURE_MESSAGES[code] : SAVE_FAILED,
});

// marks: [{ student_id, status }] where status is a saved value or null to clear.
// A database message is never shown: only codes from the list above reach the teacher.
export async function saveAttendance({ sectionId, date, marks }, { client = supabase } = {}) {
  if (typeof client?.rpc !== 'function') return failed('unknown');
  try {
    const { data, error } = await client.rpc(RPC_NAME, {
      p_section_id: sectionId, p_date: date, p_marks: marks,
    });
    if (error) {
      return failed(Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, error.message) ? error.message : 'unknown');
    }
    if (data?.ok !== true) return failed('unknown');
    return { ok: true, receipt: data };
  } catch {
    return failed('unknown');
  }
}
