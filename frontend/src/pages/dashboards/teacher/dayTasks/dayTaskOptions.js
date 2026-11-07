// Options for one generated day task. Pure, and mirrors the rules in
// backend/src/routes/dayTasks.js, which stays the authority.

export const DAY_TASK_TYPES = ['activity', 'quiz', 'assignment'];
export const DAY_TASK_TYPE_LABELS = { activity: 'Activity', quiz: 'Quiz', assignment: 'Assignment' };

export const QUIZ_ITEM_TYPES = ['multiple_choice', 'true_false', 'identification', 'enumeration'];
export const ITEM_TYPE_LABELS = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / False',
  identification: 'Identification',
  enumeration: 'Enumeration',
  essay: 'Essay',
};

export const QUIZ_MIN = 10;
export const QUIZ_MAX = 20;
export const QUIZ_DEFAULT = 10;
export const ASSIGNMENT_MIN = 1;
export const ASSIGNMENT_MAX = 5;
export const ASSIGNMENT_DEFAULT = 3;

const STORED_TASK_TYPES = { activity: 'worksheet', quiz: 'quiz', assignment: 'assignment' };

const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const invalid = error => ({ ok: false, error });
const VALID = { ok: true, error: '' };

export function defaultQuizSplit(n) {
  const true_false = Math.floor(n * 3 / 10);
  const identification = Math.floor(n * 2 / 10);
  return { multiple_choice: n - true_false - identification, true_false, identification, enumeration: 0 };
}

function validateQuiz(itemCount, typeCounts) {
  const countRange = `A quiz needs ${QUIZ_MIN} to ${QUIZ_MAX} items.`;
  if (typeCounts === undefined) {
    return inRange(itemCount === undefined ? QUIZ_DEFAULT : itemCount, QUIZ_MIN, QUIZ_MAX) ? VALID : invalid(countRange);
  }
  if (!typeCounts || typeof typeCounts !== 'object' || Array.isArray(typeCounts)
    || Object.keys(typeCounts).some(type => !QUIZ_ITEM_TYPES.includes(type))) {
    return invalid('Choose only multiple choice, true/false, identification, or enumeration.');
  }
  const counts = Object.values(typeCounts);
  if (counts.some(count => !inRange(count, 0, QUIZ_MAX))) return invalid(`Each count must be a whole number from 0 to ${QUIZ_MAX}.`);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!inRange(total, QUIZ_MIN, QUIZ_MAX)) return invalid(`The total must be ${QUIZ_MIN} to ${QUIZ_MAX} items.`);
  return itemCount === undefined || itemCount === total ? VALID : invalid('The item count must equal the total.');
}

export function validateOptions({ taskType, itemCount, typeCounts }) {
  if (!DAY_TASK_TYPES.includes(taskType)) return invalid('Choose a task type.');
  if (taskType === 'quiz') return validateQuiz(itemCount, typeCounts);
  if (typeCounts !== undefined) return invalid('Only a quiz can be split by question type.');
  if (taskType === 'activity') return itemCount === undefined ? VALID : invalid('An activity has no item count.');
  return inRange(itemCount === undefined ? ASSIGNMENT_DEFAULT : itemCount, ASSIGNMENT_MIN, ASSIGNMENT_MAX)
    ? VALID : invalid(`An assignment needs ${ASSIGNMENT_MIN} to ${ASSIGNMENT_MAX} items.`);
}

export function buildRequestBody({ lessonPlanId, day, taskType, itemCount, typeCounts, customized }) {
  const body = { lessonPlanId, day, taskType };
  if (taskType === 'activity') return body;
  if (taskType === 'assignment') return { ...body, itemCount: itemCount ?? ASSIGNMENT_DEFAULT };
  if (!customized) return { ...body, itemCount: itemCount ?? QUIZ_DEFAULT };
  return { ...body, typeCounts: Object.fromEntries(QUIZ_ITEM_TYPES.map(type => [type, typeCounts[type] ?? 0])) };
}

export const toStoredTaskType = taskType => STORED_TASK_TYPES[taskType];
