import { supabase } from '../../../../config/supabase';

// A task the teacher writes by hand. It is one worksheets row with no
// questions yet; the Questions editor adds them afterwards.
export const MANUAL_TASK_TYPES = ['activity', 'quiz', 'assignment', 'exam'];
export const MAX_TITLE = 150;
export const MAX_DIRECTIONS = 2000;
// S4: the types a student may hand in as one file or one link, and the points rule
// (worksheets.max_points: above 0, at most 9999.99, at most 2 decimals).
export const HAND_IN_TYPES = ['activity', 'assignment'];
export const pointsProblem = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return 'Enter the points for this task.';
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) return 'Enter points above 0, up to 9999.99, with at most 2 decimals.';
  return null;
};

const STORED_TYPES = { activity: 'worksheet', quiz: 'quiz', assignment: 'assignment', exam: 'exam' };
const INVALID = 'Check the title, type and directions, then try again.';
// A lost response can still mean the row was written, so the list is worth a look first.
const FAILED = 'The worksheet could not be created. Check your worksheet list, then try again.';

// Only a Quiz or an Exam may be auto-checked: an Activity has no questions, and
// an Assignment is answered in writing and checked by the teacher.
export const checkingModeFor = (taskType, chosen) => ((taskType === 'quiz' || taskType === 'exam') && chosen === 'auto' ? 'auto' : 'manual');

export function buildManualTaskRow({ teacherId, title, taskType, directions, checkingMode, subject, gradeLevel, handIn, points }) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const text = typeof directions === 'string' ? directions : '';
  if (!teacherId || !cleanTitle || cleanTitle.length > MAX_TITLE || !MANUAL_TASK_TYPES.includes(taskType)
    || text.length > MAX_DIRECTIONS || (taskType === 'activity' && !text.trim())
    || !subject?.id || !subject?.name || !gradeLevel) return null;
  const attachment = handIn === 'attachment';
  // A file/link task needs directions (it has no questions) and its points.
  if (attachment && (!HAND_IN_TYPES.includes(taskType) || !text.trim() || pointsProblem(points))) return null;
  return {
    teacher_id: teacherId,
    title: cleanTitle,
    task_type: STORED_TYPES[taskType],
    instructions: text.trim() ? text : null,
    items: 0,
    origin: 'manual',
    source_lesson_plan_id: null,
    collection_id: null,
    checking_mode: attachment ? 'manual' : checkingModeFor(taskType, checkingMode),
    status: 'Draft',
    subject: subject.name,
    subject_id: subject.id,
    grade_level: gradeLevel,
    created_at: new Date().toISOString(),
    ...(attachment ? { submission_mode: 'attachment', max_points: Number(String(points).trim()) } : {}),
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
