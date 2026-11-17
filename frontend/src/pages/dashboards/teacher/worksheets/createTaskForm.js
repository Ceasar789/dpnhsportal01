// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/createTaskForm.js
// U5: the Create Worksheet form's field ids, messages and checks, kept pure
// and tested on their own. manualTaskSave still refuses anything invalid.
// ============================================

import { MAX_DIRECTIONS, MAX_TITLE, pointsProblem } from './manualTaskSave';

export const CREATE_TASK_FIELDS = Object.freeze({
  title: 'create-task-title', type: 'create-task-type', subjectArea: 'create-task-subject-area', handIn: 'create-task-handin',
  points: 'create-task-points', directions: 'create-task-directions',
});

export const CREATE_TASK_MESSAGES = Object.freeze({
  title: 'Enter a title.',
  titleLong: `Keep the title within ${MAX_TITLE} characters.`,
  subject: 'Choose the subject and grade from your teaching load.',
  directions: 'Add the directions students will read.',
  directionsLong: `Keep the directions within ${MAX_DIRECTIONS} characters.`,
});

export const titleProblem = title => (!title.trim() ? CREATE_TASK_MESSAGES.title
  : title.trim().length > MAX_TITLE ? CREATE_TASK_MESSAGES.titleLong : null);

export const directionsProblem = (directions, required) => (required && !directions.trim() ? CREATE_TASK_MESSAGES.directions
  : directions.length > MAX_DIRECTIONS ? CREATE_TASK_MESSAGES.directionsLong : null);

// Every problem with the form, in the order the fields appear. The subject
// problem points at `subjectFieldId`: the control the teacher has to use
// (the subject picker, or the grade picker when the subject picker is
// hidden because there is only one subject); without one, at the area that
// holds the picker and its loading or empty message.
export function createTaskProblems({ title, directions, points, taskType, attachment, subjectReady, subjectFieldId }) {
  const problems = [];
  const add = (fieldId, message) => { if (fieldId && message) problems.push({ fieldId, message }); };
  add(CREATE_TASK_FIELDS.title, titleProblem(title));
  add(subjectFieldId || CREATE_TASK_FIELDS.subjectArea, subjectReady ? null : CREATE_TASK_MESSAGES.subject);
  if (attachment) add(CREATE_TASK_FIELDS.points, pointsProblem(points));
  add(CREATE_TASK_FIELDS.directions, directionsProblem(directions, taskType === 'activity' || attachment));
  return problems;
}
