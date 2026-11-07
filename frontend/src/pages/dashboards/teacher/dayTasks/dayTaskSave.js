import { supabase } from '../../../../config/supabase';
import { hasExactDeletedIds } from '../../../../lib/deleteVerification';
import { normalizePoints, splitAcceptedAnswers, TRUE_FALSE_VALUES } from '../../../../lib/worksheetChecking';
import { DAY_TASK_TYPE_LABELS, DAY_TASK_TYPES, QUIZ_ITEM_TYPES, toStoredTaskType } from './dayTaskOptions';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_TITLE = 150;
const INVALID_DRAFT = 'This draft could not be saved. Nothing was saved.';
// A lost response can still mean the row was written, so this cannot promise "nothing was saved".
const WORKSHEET_FAILED = 'The draft could not be saved. Check Worksheets before trying again.';
const REMOVED = 'The draft could not be saved, and the incomplete copy was removed. Try again.';
const PARTIAL = 'Partially saved — please delete the draft in Worksheets and try again';

const invalid = () => { throw new Error(INVALID_DRAFT); };
const isText = value => typeof value === 'string' && value.trim() !== '';

function buildTitle(planTitle, day, taskType) {
  const suffix = [WEEKDAYS.includes(day) ? day : null, DAY_TASK_TYPE_LABELS[taskType]].filter(Boolean).join(' ');
  // The plan title gives way first, so a long one cannot cut off the day and type.
  const room = MAX_TITLE - suffix.length - 3;
  return `${planTitle.trim().slice(0, room).trimEnd()} - ${suffix}`;
}

// Same stored shapes as the question builder and saveItems: list keys for
// identification and enumeration, the plain string otherwise, and no key row for essays.
function storedKey(question, answer) {
  if (question.item_type === 'essay') return undefined;
  if (question.item_type === 'identification' || question.item_type === 'enumeration') {
    const list = Array.isArray(answer) ? answer.map(part => String(part).trim()).filter(Boolean) : splitAcceptedAnswers(answer);
    return list.length ? list : invalid();
  }
  if (question.item_type === 'true_false') return TRUE_FALSE_VALUES.includes(answer) ? answer : invalid();
  return question.options.includes(answer) ? answer : invalid();
}

function prepareItems(result, taskType) {
  if (!Array.isArray(result.questions) || !Array.isArray(result.answerKey)) invalid();
  if (taskType === 'activity') return result.questions.length ? invalid() : [];
  if (!result.questions.length) invalid();

  const allowed = taskType === 'quiz' ? QUIZ_ITEM_TYPES : ['essay'];
  const answers = new Map(result.answerKey.map(key => [key?.localId, key?.correct_answer]));
  return result.questions.map((question, index) => {
    if (!isText(question?.question) || !allowed.includes(question.item_type)) invalid();
    const multipleChoice = question.item_type === 'multiple_choice';
    if (multipleChoice && (!Array.isArray(question.options) || !question.options.length)) invalid();
    return {
      row: { position: index + 1, question: question.question, item_type: question.item_type,
        options: multipleChoice ? question.options : null, points: normalizePoints(question.points) },
      key: storedKey(question, answers.get(question.localId)),
    };
  });
}

async function insertItems(client, worksheetId, items) {
  const { data: inserted, error } = await client.from('worksheet_items')
    .insert(items.map(({ row }) => ({ worksheet_id: worksheetId, ...row }))).select('id, position');
  if (error || inserted?.length !== items.length) throw new Error(INVALID_DRAFT);

  const keyRows = inserted.flatMap((row) => {
    const { key } = items[row.position - 1];
    return key === undefined ? [] : [{ item_id: row.id, correct_answer: key }];
  });
  if (!keyRows.length) return;
  const { error: keyError } = await client.from('worksheet_item_keys').insert(keyRows);
  if (keyError) throw new Error(INVALID_DRAFT);
}

// Deleting the worksheet is enough: items and keys cascade, and
// guard_worksheet_item_delete steps aside once the parent row is gone.
// RLS can hide a row without an error, so only the returned id proves the delete.
async function removeWorksheet(client, worksheetId, teacherId) {
  try {
    const { data, error } = await client.from('worksheets').delete()
      .eq('id', worksheetId).eq('teacher_id', teacherId).select('id');
    return !error && hasExactDeletedIds(data, worksheetId);
  } catch {
    return false;
  }
}

export async function saveDayTaskDraft({ plan, result, day, taskType, teacherId, client = supabase } = {}) {
  if (!teacherId || !isText(plan?.id) || !isText(plan?.title) || !DAY_TASK_TYPES.includes(taskType)
    || result?.status !== 'generated-day-task' || result.saved !== false
    || result.taskType !== taskType || result.day !== day || !isText(result.instructions)) invalid();
  const items = prepareItems(result, taskType);

  const dayIndex = WEEKDAYS.indexOf(day);
  const worksheet = {
    teacher_id: teacherId,
    title: buildTitle(plan.title, day, taskType),
    description: null,
    items: items.length,
    status: 'Draft',
    task_type: toStoredTaskType(taskType),
    // 'manual' keeps the Questions and Delete actions, which WorksheetsTab hides for ai_generated rows.
    origin: 'manual',
    source_lesson_plan_id: plan.id,
    day_of_week: dayIndex === -1 ? null : dayIndex + 1,
    instructions: result.instructions,
    checking_mode: taskType === 'quiz' ? 'auto' : 'manual',
  };
  for (const field of ['subject', 'grade_level', 'subject_id']) {
    if (plan[field] !== undefined && plan[field] !== null) worksheet[field] = plan[field];
  }

  let worksheetId;
  try {
    const { data, error } = await client.from('worksheets').insert([worksheet]).select('id').single();
    worksheetId = data?.id;
    if (error || !worksheetId) throw new Error(WORKSHEET_FAILED);
  } catch {
    throw new Error(WORKSHEET_FAILED);
  }
  if (!items.length) return { worksheetId, itemCount: 0 };

  try {
    await insertItems(client, worksheetId, items);
  } catch {
    if (await removeWorksheet(client, worksheetId, teacherId)) throw new Error(REMOVED);
    throw Object.assign(new Error(PARTIAL), { worksheetId });
  }
  return { worksheetId, itemCount: items.length };
}
