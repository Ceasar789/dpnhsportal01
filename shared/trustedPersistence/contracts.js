// JSON contracts shared by editor adapters and the trusted application service.
// No database, network, browser storage, or environment access belongs here.
export class PersistenceError extends Error {
  constructor(code) { super(code); this.name = 'PersistenceError'; this.code = code; }
}
export const reject = code => { throw new PersistenceError(code); };
export const requireThat = (condition, code = 'invalid_document') => { if (!condition) reject(code); };
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const identity = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function exact(value, keys) {
  requireThat(isRecord(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'));
}
export function boundedJson(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { reject('invalid_document'); }
  requireThat(typeof encoded === 'string' && new TextEncoder().encode(encoded).length <= 262144, 'payload_too_large');
  function visit(item, depth = 0) {
    requireThat(depth < 24);
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { requireThat(Number.isFinite(item)); return; }
    if (typeof item === 'string') { requireThat(item.length <= 16000 && !item.includes('\u0000')); return; }
    requireThat(Array.isArray(item) || isRecord(item));
    for (const [key, child] of Object.entries(item)) {
      requireThat(!['__proto__', 'constructor', 'prototype'].includes(key));
      visit(child, depth + 1);
    }
  }
  visit(value);
  return JSON.parse(encoded);
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const UNAVAILABLE = Object.freeze({ ok: false, code: 'integration_blocked', durable: false,
  message: 'Permanent saving is unavailable. Your work has not been saved to EduScribe.' });

export const WORKSHEET_KIND = 'eduscribe.worksheet-authoring';
export const QUESTION_TYPES = ['multiple_choice', 'true_false', 'identification', 'enumeration', 'essay'];
const text = (value, max = 16000) => typeof value === 'string' && value.length <= max;
export function validateWorksheetDraft(input) {
  const value = boundedJson(input);
  exact(value, ['kind', 'version', 'title', 'assignment', 'sourcePlanId', 'instructions', 'groups', 'questions', 'answerKeys', 'workflowState']);
  requireThat(value.kind === WORKSHEET_KIND && value.version === 1 && value.workflowState === 'draft');
  requireThat(text(value.title, 255) && text(value.instructions, 2000));
  requireThat(value.sourcePlanId === null || identity(value.sourcePlanId));
  if (value.assignment !== null) {
    exact(value.assignment, ['subjectId', 'gradeLevel', 'schoolYear']);
    requireThat(identity(value.assignment.subjectId) && text(value.assignment.gradeLevel, 50) && text(value.assignment.schoolYear, 20));
  }
  requireThat(Array.isArray(value.groups) && value.groups.length <= 100);
  requireThat(Array.isArray(value.questions) && value.questions.length <= 500 && isRecord(value.answerKeys));
  const groups = new Set();
  for (const group of value.groups) {
    exact(group, ['id', 'title', 'directions']);
    requireThat(identity(group.id) && !groups.has(group.id) && text(group.title, 120) && text(group.directions, 2000));
    groups.add(group.id);
  }
  const questions = new Set();
  for (const question of value.questions) {
    exact(question, ['id', 'groupId', 'type', 'text', 'options', 'points']);
    requireThat(identity(question.id) && !questions.has(question.id) && groups.has(question.groupId));
    requireThat(question.type === null || QUESTION_TYPES.includes(question.type));
    requireThat(text(question.text) && Array.isArray(question.options) && question.options.length <= 30 && question.options.every(option => text(option, 2000)));
    requireThat(question.points === null || (typeof question.points === 'number' && Number.isFinite(question.points) && question.points >= 0 && question.points <= 9999.99 && Math.abs(question.points * 100 - Math.round(question.points * 100)) < 0.000001));
    questions.add(question.id);
  }
  for (const [id, answer] of Object.entries(value.answerKeys)) {
    requireThat(questions.has(id) && (answer === null || typeof answer === 'boolean' || text(answer) ||
      (Array.isArray(answer) && answer.length <= 100 && answer.every(entry => text(entry, 2000)))));
  }
  return value;
}
export function validateWorksheetForDistribution(input) {
  const value = validateWorksheetDraft(input);
  const errors = [];
  if (!value.title.trim()) errors.push('title');
  if (!value.assignment) errors.push('assignment');
  if (!value.questions.length) errors.push('questions');
  for (const group of value.groups) {
    if (!group.title.trim() || !value.questions.some(q => q.groupId === group.id)) errors.push(`group:${group.id}`);
  }
  for (const q of value.questions) {
    const key = value.answerKeys[q.id];
    if (!q.text.trim() || !q.type || q.points === null) errors.push(`question:${q.id}`);
    if (q.type === 'multiple_choice' && (q.options.length < 2 || q.options.some(o => !o.trim()) ||
      new Set(q.options.map(o => o.trim())).size !== q.options.length || !q.options.includes(key))) errors.push(`choices:${q.id}`);
    if (q.type === 'true_false' && ![true, false, 'True', 'False', 'true', 'false'].includes(key)) errors.push(`key:${q.id}`);
    if (['identification', 'enumeration'].includes(q.type) &&
      !(typeof key === 'string' && key.trim() || Array.isArray(key) && key.length && key.every(a => a.trim()))) errors.push(`key:${q.id}`);
    if (q.type !== 'multiple_choice' && q.options.length) errors.push(`options:${q.id}`);
  }
  return { valid: errors.length === 0, errors };
}

// Conceptual projection, NOT a PostgREST payload: group/year/source/revision
// storage is not deployed. Only a future trusted atomic adapter may persist it.
export function prepareNormalizedAssessmentProjection(record) {
  requireThat(record?.type === 'worksheet' && identity(record.id) && identity(record.ownerId));
  const document = validateWorksheetDraft(record.document);
  requireThat(validateWorksheetForDistribution(document).valid, 'incomplete_worksheet');
  let position = 0;
  const items = document.groups.flatMap(group => document.questions.filter(q => q.groupId === group.id).map(q => ({
    id: q.id, worksheetId: record.id, groupId: group.id, position: ++position,
    question: q.text, itemType: q.type, options: [...q.options], points: q.points,
  })));
  return {
    worksheet: { id: record.id, ownerId: record.ownerId, title: document.title, assignment: { ...document.assignment },
      sourcePlanId: document.sourcePlanId, instructions: document.instructions, revision: record.revision, status: 'Draft' },
    groups: document.groups.map((group, index) => ({ ...group, worksheetId: record.id, position: index + 1 })),
    items,
    privateAnswerKeys: items.filter(item => item.itemType !== 'essay').map(item => ({ itemId: item.id, correctAnswer: structuredClone(document.answerKeys[item.id]) })),
  };
}
// Teacher-only preview: deliberately no owner, source, year, keys or receipts.
// There is no student draft endpoint. Distribution must later authorize recipients.
export function assessmentPreview(projection) {
  return {
    title: projection.worksheet.title, instructions: projection.worksheet.instructions,
    groups: projection.groups.map(g => ({ id: g.id, title: g.title, directions: g.directions, position: g.position })),
    questions: projection.items.map(q => ({ id: q.id, groupId: q.groupId, position: q.position,
      question: q.question, type: q.itemType, options: [...q.options], points: q.points })),
  };
}
