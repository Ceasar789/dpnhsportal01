import { createBlankIlawDocument, WEEKDAYS, WEEKLY_FIELDS } from './ilawTemplateModel.js';
import { ILAW_TEMPLATE_SIGNATORIES } from './ilawSignatoryDefaults.js';

export const MANUAL_ILAW_KIND = 'eduscribe.manual-ilaw';
export const MANUAL_ILAW_VERSION = 1;

// Active manual authoring stays in React memory; this is not a database payload.
export function createTemporaryManualIlawDraft(teacherId, teacherProfile) {
  if (!teacherId) throw new Error('A signed-in Teacher is required to start a manual draft.');
  const document = createBlankIlawDocument();
  document.signatures.preparedBy.name = typeof teacherProfile?.name === 'string' ? teacherProfile.name.trim() : '';
  document.signatures.checkedBy = { ...ILAW_TEMPLATE_SIGNATORIES.checkedBy };
  document.signatures.notedBy = { ...ILAW_TEMPLATE_SIGNATORIES.notedBy };
  return {
    kind: 'eduscribe.temporary-manual-ilaw',
    version: MANUAL_ILAW_VERSION,
    teacherId,
    document,
    sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' },
  };
}

// Explicit local download only. No database, Storage, or browser persistence occurs.
export function serializeTemporaryManualIlawDraft(draft) {
  if (!isRecord(draft) || draft.kind !== 'eduscribe.temporary-manual-ilaw' ||
    draft.version !== MANUAL_ILAW_VERSION || typeof draft.teacherId !== 'string' || !draft.teacherId ||
    !isRecord(draft.sourceDetails) || !hasOnlyKeys(draft.sourceDetails, ['classDuration', 'teachingStrategy', 'learningObjectives'])) {
    throw new Error('This temporary ILAW draft cannot be downloaded.');
  }
  for (const key of ['classDuration', 'teachingStrategy', 'learningObjectives']) {
    if (typeof draft.sourceDetails[key] !== 'string') throw new Error('This temporary ILAW draft cannot be downloaded.');
  }
  return JSON.stringify({ ...draft, document: normalizeManualIlawDocument(draft.document) }, null, 2);
}

export function parseTemporaryManualIlawDraft(raw, teacherId) {
  let draft;
  try { draft = JSON.parse(raw); } catch { throw new Error('This draft file is not valid JSON. The current draft was kept.'); }
  if (!isRecord(draft) || draft.kind !== 'eduscribe.temporary-manual-ilaw' ||
    draft.version !== MANUAL_ILAW_VERSION ||
    !hasOnlyKeys(draft, ['kind', 'version', 'teacherId', 'document', 'sourceDetails'])) {
    throw new Error('This Manual ILAW draft format or version is not supported. The current draft was kept.');
  }
  if (typeof draft.teacherId !== 'string' || !draft.teacherId || draft.teacherId !== teacherId) {
    throw new Error('This draft belongs to a different Teacher. The current draft was kept.');
  }
  if (!isRecord(draft.sourceDetails) ||
    !hasOnlyKeys(draft.sourceDetails, ['classDuration', 'teachingStrategy', 'learningObjectives']) ||
    ['classDuration', 'teachingStrategy', 'learningObjectives'].some(key => typeof draft.sourceDetails[key] !== 'string')) {
    throw new Error('This draft has incomplete lesson-wide details. The current draft was kept.');
  }
  return { ...draft, document: normalizeManualIlawDocument(draft.document) };
}

const INFO_KEYS = Object.keys(createBlankIlawDocument().info);
const SIGNATURE_KEYS = ['preparedBy', 'checkedBy', 'notedBy'];
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));

// Reject damaged documents. Filling missing cells with blanks here would hide lost work.
export function normalizeManualIlawDocument(input) {
  if (!isRecord(input) || !isRecord(input.info) || !isRecord(input.weekly) || !isRecord(input.signatures)) {
    throw new Error('This ILAW draft is incomplete or damaged. The current draft was kept.');
  }
  if (!hasOnlyKeys(input, ['info', 'learningCompetency', 'weekly', 'signatures']) ||
    !hasOnlyKeys(input.info, INFO_KEYS) ||
    !hasOnlyKeys(input.weekly, WEEKLY_FIELDS.map(([key]) => key)) ||
    !hasOnlyKeys(input.signatures, SIGNATURE_KEYS)) {
    throw new Error('This ILAW draft has unsupported fields. The current draft was kept.');
  }
  const output = createBlankIlawDocument();
  for (const key of INFO_KEYS) {
    if (typeof input.info[key] !== 'string') throw new Error(`Invalid ILAW information: ${key}.`);
    output.info[key] = input.info[key].replaceAll('\r\n', '\n');
  }
  if (typeof input.learningCompetency !== 'string') throw new Error('Invalid learning competency.');
  output.learningCompetency = input.learningCompetency.replaceAll('\r\n', '\n');
  for (const [field] of WEEKLY_FIELDS) {
    if (!isRecord(input.weekly[field])) throw new Error(`Invalid ILAW section: ${field}.`);
    if (!hasOnlyKeys(input.weekly[field], WEEKDAYS)) throw new Error(`Unsupported ILAW entries in ${field}.`);
    for (const day of WEEKDAYS) {
      if (typeof input.weekly[field][day] !== 'string') throw new Error(`Invalid ${field} entry for ${day}.`);
      output.weekly[field][day] = input.weekly[field][day].replaceAll('\r\n', '\n');
    }
  }
  for (const key of SIGNATURE_KEYS) {
    if (!isRecord(input.signatures[key])) throw new Error(`Invalid signature: ${key}.`);
    if (!hasOnlyKeys(input.signatures[key], ['name', 'role'])) throw new Error(`Unsupported signature fields in ${key}.`);
    for (const field of ['name', 'role']) {
      if (typeof input.signatures[key][field] !== 'string') throw new Error(`Invalid signature ${key} ${field}.`);
      output.signatures[key][field] = input.signatures[key][field].replaceAll('\r\n', '\n');
    }
  }
  return output;
}

export function validateManualIlawDocument(input, assignment, { allowManualMetadata = false } = {}) {
  const document = normalizeManualIlawDocument(input);
  const errors = {};
  for (const [key, label] of [
    ['nameOfLesson', 'Name of Lesson'],
    ['teachingDate', 'Teaching Date'],
    ['learningArea', 'Learning Area/s'],
    ['gradeSection', 'Grade/Section'],
  ]) {
    if (!document.info[key].trim()) errors[key] = `${label} is required.`;
  }
  // A temporary document can be reviewed without implying assignment authorization.
  if (!allowManualMetadata && (!assignment || !assignment.subjectId || !assignment.subjectName || !assignment.gradeLevel)) {
    errors.assignment = 'Select a verified teaching assignment before a future save.';
  } else if (!allowManualMetadata && (document.info.learningArea.trim() !== assignment.subjectName ||
    !new RegExp(`^${assignment.gradeLevel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[ ,;/])`).test(document.info.gradeSection.trim()))) {
    errors.assignment = 'Learning area and grade must match the selected teaching assignment.';
  }
  return errors;
}

// Versioned structured-document contract. Currently used by isolated fixtures
// and saved-list type recognition; no active Manual flow persists this payload.
export function serializeManualIlawDraft({ teacherId, planId, assignment, document }) {
  if (typeof teacherId !== 'string' || !teacherId || typeof planId !== 'string' || !planId ||
    typeof assignment?.subjectId !== 'string' || !assignment.subjectId ||
    typeof assignment?.subjectName !== 'string' || !assignment.subjectName ||
    typeof assignment?.gradeLevel !== 'string' || !assignment.gradeLevel) {
    throw new Error('A synthetic Teacher, plan, and assignment are required.');
  }
  return JSON.stringify({
    kind: MANUAL_ILAW_KIND,
    version: MANUAL_ILAW_VERSION,
    teacherId,
    planId,
    assignment: { subjectId: assignment.subjectId, subjectName: assignment.subjectName, gradeLevel: assignment.gradeLevel },
    document: normalizeManualIlawDocument(document),
  });
}

export function parseManualIlawDraft(raw, { teacherId, planId, assignment } = {}) {
  let payload;
  try { payload = JSON.parse(raw); } catch { throw new Error('This ILAW draft cannot be read. The current draft was kept.'); }
  if (!isRecord(payload) || payload.kind !== MANUAL_ILAW_KIND || payload.version !== MANUAL_ILAW_VERSION) {
    throw new Error('This ILAW draft version is not supported. The current draft was kept.');
  }
  if (!hasOnlyKeys(payload, ['kind', 'version', 'teacherId', 'planId', 'assignment', 'document'])) {
    throw new Error('This ILAW draft has unsupported fields. The current draft was kept.');
  }
  if (typeof payload.teacherId !== 'string' || typeof payload.planId !== 'string' ||
    !payload.teacherId || !payload.planId ||
    (teacherId && payload.teacherId !== teacherId) || (planId && payload.planId !== planId)) {
    throw new Error('This draft belongs to a different Teacher or plan. The current draft was kept.');
  }
  if (!isRecord(payload.assignment) || typeof payload.assignment.subjectId !== 'string' ||
    typeof payload.assignment.subjectName !== 'string' || typeof payload.assignment.gradeLevel !== 'string' ||
    !payload.assignment.subjectId || !payload.assignment.subjectName || !payload.assignment.gradeLevel ||
    !hasOnlyKeys(payload.assignment, ['subjectId', 'subjectName', 'gradeLevel'])) {
    throw new Error('This draft has invalid assignment evidence. The current draft was kept.');
  }
  if (assignment && (payload.assignment.subjectId !== assignment.subjectId ||
    payload.assignment.subjectName !== assignment.subjectName || payload.assignment.gradeLevel !== assignment.gradeLevel)) {
    throw new Error('This draft does not match the selected assignment. The current draft was kept.');
  }
  return { ...payload, document: normalizeManualIlawDocument(payload.document) };
}
