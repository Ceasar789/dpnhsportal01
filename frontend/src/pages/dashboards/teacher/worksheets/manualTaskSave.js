import { supabase } from '../../../../config/supabase';

// A task the teacher writes by hand. It is one worksheets row with no
// questions yet; the Questions editor adds them afterwards.
export const MANUAL_TASK_TYPES = ['activity', 'quiz', 'assignment'];
export const MAX_TITLE = 150;
export const MAX_DIRECTIONS = 2000;

const STORED_TYPES = { activity: 'worksheet', quiz: 'quiz', assignment: 'assignment' };
const INVALID = 'Check the title, type and directions, then try again.';
// A lost response can still mean the row was written, so the list is worth a look first.
const FAILED = 'The worksheet could not be created. Check your worksheet list, then try again.';

// Only a Quiz may be auto-checked: an Activity has no questions, and an
// Assignment is answered in writing and checked by the teacher.
export const checkingModeFor = (taskType, chosen) => (taskType === 'quiz' && chosen === 'auto' ? 'auto' : 'manual');

export function buildManualTaskRow({ teacherId, title, taskType, directions, checkingMode, subject, gradeLevel }) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const text = typeof directions === 'string' ? directions : '';
  if (!teacherId || !cleanTitle || cleanTitle.length > MAX_TITLE || !MANUAL_TASK_TYPES.includes(taskType)
    || text.length > MAX_DIRECTIONS || (taskType === 'activity' && !text.trim())
    || !subject?.id || !subject?.name || !gradeLevel) return null;
  return {
    teacher_id: teacherId,
    title: cleanTitle,
    task_type: STORED_TYPES[taskType],
    instructions: text.trim() ? text : null,
    items: 0,
    origin: 'manual',
    source_lesson_plan_id: null,
    collection_id: null,
    checking_mode: checkingModeFor(taskType, checkingMode),
    status: 'Draft',
    subject: subject.name,
    subject_id: subject.id,
    grade_level: gradeLevel,
    created_at: new Date().toISOString(),
  };
}

// One insert, so a refused write leaves nothing behind. Database messages are never shown.
export async function saveManualTask(input, { client = supabase } = {}) {
  const row = buildManualTaskRow(input);
  if (!row) return { ok: false, message: INVALID };
  try {
    const { data, error } = await client.from('worksheets').insert([row]).select('*').single();
    if (error || !data?.id) return { ok: false, message: FAILED };
    return { ok: true, row: data };
  } catch {
    return { ok: false, message: FAILED };
  }
}
