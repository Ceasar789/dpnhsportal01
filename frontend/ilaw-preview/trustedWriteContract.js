import { normalizeManualIlawV2, parseManualIlawV2 } from '../src/pages/dashboards/teacher/ilaw/manualIlawV2';
import { WEEKDAYS } from '../src/pages/dashboards/teacher/ilaw/ilawTemplateModel';

// ISOLATED CONTRACT ONLY. `context` must be assembled from verified server/DB
// data in a future implementation. Nothing in the active application imports it.
const denied = (code, errors) => ({ authorized: false, code, ...(errors ? { errors } : {}) });
const placeholder = /^(?:n\/?a|none|tbd|todo|placeholder|[-–—.\s]+|\[.*?\]|(?:enter|add|write|type)\s+(?:your\s+)?(?:learning\s+)?(?:objective|objectives|activity|activities|assessment|lesson\s+title|date|learning\s+area|grade(?:\/section)?)(?:\s+here)?[.!]?)$/i;
const meaningful = value => typeof value === 'string' && Boolean(value.trim()) && !placeholder.test(value.trim());
const anyDay = (document, field) => WEEKDAYS.some(day => meaningful(document.weekly[field][day]));

export function trustedSchoolYear(instant) {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw new TypeError('A valid trusted instant is required.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const start = parts.month >= 6 ? parts.year : parts.year - 1;
  return `${start}-${start + 1}`;
}

export function validateManualV2Content(payload) {
  let value;
  try { value = normalizeManualIlawV2(payload); }
  catch { return { 'document': 'The Manual ILAW Version 2 document is invalid.' }; }
  if (value.workflowState === 'draft') return {};
  const { document, sourceDetails } = value;
  const errors = {};
  for (const [key, label] of [
    ['nameOfLesson', 'Name of Lesson'], ['teachingDate', 'Teaching Date'],
    ['learningArea', 'Learning Area'], ['gradeSection', 'Grade/Section'],
  ]) {
    if (!meaningful(document.info[key])) errors[`document.info.${key}`] = `${label} is required.`;
  }
  if (!meaningful(sourceDetails.learningObjectives) && !anyDay(document, 'learningObjectives')) {
    errors['sourceDetails.learningObjectives'] = 'Add at least one learning objective.';
  }
  if (!anyDay(document, 'preLesson') && !anyDay(document, 'flow')) {
    errors['document.weekly.flow'] = 'Add at least one learning activity.';
  }
  if (!anyDay(document, 'formativeAssessment')) {
    errors['document.weekly.formativeAssessment'] = 'Add at least one assessment entry.';
  }
  return errors;
}

function trustedTeacher(context) {
  if (!context?.authUserId) return denied('not_authenticated');
  if (!context.profile || context.profile.id !== context.authUserId || context.profile.status !== 'active') {
    return denied('inactive_teacher');
  }
  if (context.profile.role !== 'teacher') return denied('invalid_role');
  return null;
}

function officialAssignment(context, requested, year) {
  const rows = Array.isArray(context.assignments) ? context.assignments : [];
  const own = rows.filter(row => row.teacherId === context.authUserId && row.active !== false);
  if (!own.length) return denied('missing_assignment');
  const subject = own.filter(row => row.subjectId === requested.subjectId);
  if (!subject.length) return denied('subject_mismatch');
  const grade = subject.filter(row => row.gradeLevel === requested.gradeLevel);
  if (!grade.length) return denied('grade_mismatch');
  const valid = grade.find(row => row.schoolYear === year);
  if (!valid || requested.schoolYear !== year) return denied('year_mismatch');
  if (valid.subjectName !== requested.subjectName) return denied('subject_mismatch');
  return valid;
}

function existingOwnership(context, existing, expectedRevision, requestedId) {
  if (!existing || existing.id !== requestedId || existing.teacher_id !== context.authUserId) return denied('wrong_owner');
  if (!Number.isSafeInteger(expectedRevision) || existing.revision !== expectedRevision) return denied('revision_conflict');
  return null;
}

export function authorizeManualWrite({ context, payload, operation, existing = null, expectedRevision, instant }) {
  const identityError = trustedTeacher(context);
  if (identityError) return identityError;
  let value;
  let year;
  try { value = normalizeManualIlawV2(payload); year = trustedSchoolYear(instant); }
  catch { return denied('invalid_payload'); }
  if (value.teacherId !== context.authUserId) return denied('wrong_owner');
  if (operation !== 'create' && operation !== 'update') return denied('invalid_payload');
  if (operation === 'create' && existing) return denied('revision_conflict');
  if (operation === 'update') {
    const ownerError = existingOwnership(context, existing, expectedRevision, value.planId);
    if (ownerError) return ownerError;
    if (existing.ai_generated !== false || existing.status !== 'draft') return denied('unsupported_transition');
    let old;
    try { old = parseManualIlawV2(existing.objectives, { teacherId: context.authUserId, planId: existing.id }); }
    catch { return denied('invalid_payload'); }
    if (old.assignment.schoolYear !== year || old.workflowState === 'saved' && value.workflowState === 'draft') {
      return denied('unsupported_transition');
    }
    if (old.assignment.subjectId !== value.assignment.subjectId || old.assignment.gradeLevel !== value.assignment.gradeLevel) {
      return denied('unsupported_transition');
    }
  }
  const official = officialAssignment(context, value.assignment, year);
  if (official.authorized === false) return official;
  const grade = value.document.info.gradeSection.trim();
  const gradeMatches = grade === official.gradeLevel ||
    [' ', ',', ';', '/'].some(separator => grade.startsWith(`${official.gradeLevel}${separator}`));
  const assignmentErrors = {};
  if (value.document.info.learningArea.trim() && value.document.info.learningArea.trim() !== official.subjectName) {
    assignmentErrors['document.info.learningArea'] = 'Learning area must match the official assignment.';
  }
  if (grade && !gradeMatches) assignmentErrors['document.info.gradeSection'] = 'Grade must match the official assignment.';
  if (Object.keys(assignmentErrors).length) return denied('invalid_payload', assignmentErrors);
  const errors = validateManualV2Content(value);
  if (Object.keys(errors).length) return denied('incomplete_saved_document', errors);
  return {
    authorized: true, code: 'authorized', payload: {
      ...value, teacherId: context.authUserId,
      assignment: { subjectId: official.subjectId, subjectName: official.subjectName,
        gradeLevel: official.gradeLevel, schoolYear: year },
    },
    privateStatus: 'draft', nextRevision: operation === 'create' ? 1 : existing.revision + 1,
  };
}

// Future-only authorization seam. It deliberately does not return a storable
// row: HTML sanitization and the coordinated DB migration are separate gates.
export function authorizeFutureHtmlWrite({ context, request, existing = null, instant }) {
  const identityError = trustedTeacher(context);
  if (identityError) return identityError;
  if (!request || (request.operation !== 'create' && request.operation !== 'update') ||
    typeof request.html !== 'string' || !request.html.trim() || typeof request.title !== 'string' || !request.title.trim()) {
    return denied('invalid_payload');
  }
  if (request.teacherId && request.teacherId !== context.authUserId) return denied('wrong_owner');
  if (request.ai_generated !== undefined || request.status !== undefined) return denied('invalid_payload');
  try {
    const parsed = JSON.parse(request.html);
    if (parsed !== null && typeof parsed === 'object') return denied('invalid_payload');
  } catch { /* Ordinary HTML is not JSON. */ }
  let year;
  try { year = trustedSchoolYear(instant); } catch { return denied('invalid_payload'); }
  const official = officialAssignment(context, request.assignment ?? {}, year);
  if (official.authorized === false) return official;
  if (request.operation === 'update') {
    const ownerError = existingOwnership(context, existing, request.expectedRevision, request.planId);
    if (ownerError) return ownerError;
    if (typeof existing.objectives !== 'string' || existing.status !== 'draft') return denied('invalid_payload');
    let stored;
    try { stored = JSON.parse(existing.objectives); } catch { /* Existing HTML is not JSON. */ }
    if (stored?.kind === 'eduscribe.manual-ilaw') return denied('invalid_payload');
  }
  return { authorized: true, code: 'authorized', privateStatus: 'draft',
    serverClassification: 'ai-html', requiresTrustedSanitization: true, assignment: official };
}
