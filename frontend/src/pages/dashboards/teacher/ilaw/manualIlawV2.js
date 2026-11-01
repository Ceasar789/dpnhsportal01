import { normalizeManualIlawDocument, validateManualIlawDocument } from './fullManualIlawModel.js';

export const MANUAL_ILAW_V2_KIND = 'eduscribe.manual-ilaw';
export const MANUAL_ILAW_V2_VERSION = 2;
export const MANUAL_ILAW_STATES = Object.freeze(['draft', 'saved']);
const SOURCE_KEYS = ['classDuration', 'teachingStrategy', 'learningObjectives'];
const ASSIGNMENT_KEYS = ['subjectId', 'subjectName', 'gradeLevel', 'schoolYear'];
const KEYS = ['kind', 'version', 'teacherId', 'planId', 'title', 'assignment', 'workflowState', 'document', 'sourceDetails'];

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => Object.keys(value).sort().join('|') === [...keys].sort().join('|');

export function normalizeManualIlawV2(input) {
  if (!record(input) || !exactKeys(input, KEYS) || input.kind !== MANUAL_ILAW_V2_KIND ||
    input.version !== MANUAL_ILAW_V2_VERSION || typeof input.teacherId !== 'string' || !input.teacherId ||
    typeof input.planId !== 'string' || !input.planId ||
    typeof input.title !== 'string' || !MANUAL_ILAW_STATES.includes(input.workflowState) ||
    !record(input.assignment) || !exactKeys(input.assignment, ASSIGNMENT_KEYS) ||
    ASSIGNMENT_KEYS.some(key => typeof input.assignment[key] !== 'string' || !input.assignment[key]) ||
    !record(input.sourceDetails) || !exactKeys(input.sourceDetails, SOURCE_KEYS) ||
    SOURCE_KEYS.some(key => typeof input.sourceDetails[key] !== 'string')) {
    throw new Error('Unsupported or incomplete Manual ILAW version 2 payload.');
  }
  const document = normalizeManualIlawDocument(input.document);
  if (input.title !== document.info.nameOfLesson) throw new Error('The lesson title does not match the document.');
  return {
    kind: MANUAL_ILAW_V2_KIND, version: MANUAL_ILAW_V2_VERSION,
    teacherId: input.teacherId, planId: input.planId, title: input.title,
    assignment: { ...input.assignment }, workflowState: input.workflowState,
    document, sourceDetails: { ...input.sourceDetails },
  };
}

export function serializeManualIlawV2(input) {
  return JSON.stringify(normalizeManualIlawV2(input));
}

export function parseManualIlawV2(raw, { teacherId, planId } = {}) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('This Manual ILAW payload is not valid JSON.'); }
  const value = normalizeManualIlawV2(parsed);
  if ((teacherId && value.teacherId !== teacherId) || (planId && value.planId !== planId)) {
    throw new Error('This Manual ILAW plan belongs to a different Teacher or plan.');
  }
  return value;
}

// Save checks the approved lesson essentials as well as assignment agreement.
// Drafts may remain incomplete; no curriculum content is inferred.
export function validateManualIlawSave(input) {
  const value = normalizeManualIlawV2(input);
  return {
    ...validateManualIlawDocument(value.document, value.assignment),
    ...validateManualIlawCompletion(value.document, value.sourceDetails),
  };
}

export function validateManualIlawCompletion(document, sourceDetails) {
  const errors = {};
  const entered = value => typeof value === 'string' && value.trim().length > 0;
  const anyDay = field => Object.values(document.weekly[field]).some(entered);
  if (!entered(document.info.nameOfLesson)) errors.nameOfLesson = 'Name of Lesson is required.';
  if (!entered(document.info.teachingDate)) errors.teachingDate = 'Teaching Date is required.';
  if (!entered(document.info.learningArea)) errors.learningArea = 'Learning Area/s is required.';
  if (!entered(document.info.gradeSection)) errors.gradeSection = 'Grade/Section is required.';
  if (!entered(sourceDetails?.learningObjectives) && !anyDay('learningObjectives')) {
    errors.objectives = 'Add at least one meaningful learning objective.';
  }
  if (!anyDay('preLesson') && !anyDay('flow')) {
    errors.activities = 'Add at least one meaningful learning activity.';
  }
  if (!anyDay('formativeAssessment')) {
    errors.assessment = 'Add at least one meaningful assessment entry.';
  }
  return errors;
}
