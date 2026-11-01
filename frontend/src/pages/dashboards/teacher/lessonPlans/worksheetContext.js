import { parseManualIlawV2 } from '../ilaw/manualIlawV2';
import { sanitizeLessonPlanHtml } from '../lessonPlanHtml';
import { eligibleQuickCreateSubjects } from './quickCreateModel';
import { savedPlanType } from './savedPlanType';
import { extractAiAssessmentContext } from './assessmentContext';
import { savedAiMetadata } from './aiAssignment';

const unavailable = reason => ({ status: 'ineligible', reason, context: null });

const cleanText = element => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
// Table cells often contain separate weekday headings and values without DOM
// whitespace. Keep only actual text segments and join them explicitly.
const instructionalText = element => {
  const segments = [];
  const collect = node => {
    if (node.nodeType === 3) {
      const value = node.textContent.trim();
      if (value && !/^(Monday|Tuesday|Wednesday|Thursday|Friday)$/i.test(value)) segments.push(value);
      return;
    }
    node.childNodes.forEach(collect);
  };
  collect(element);
  return segments.join(' ').replace(/\s+/g, ' ').trim();
};
const instructionalLabel = text => /(?:learning\s+)?objectives?|learning experienc|pre-lesson|^flow$|formative assessment|^assessment/i.test(text);
const meaningfulInstruction = text => text
  .replace(/\[[^\]]*\]/g, '')
  .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|To be specified)\b/gi, '')
  .replace(/[\s.,;:–—-]/g, '').length >= 8;

// Only recognized instructional regions enter the local worksheet context.
// A full-document textContent starts with the school letterhead in AI ILAW HTML.
function extractAiInstructionalText(html) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeLessonPlanHtml(html);
  const root = template.content;
  root.querySelectorAll('.ilaw-letterhead, .ilaw-info-table, .ilaw-signatures, img, svg').forEach(node => node.remove());

  const fields = [...root.querySelectorAll('.ilaw-I .ilaw-field, .ilaw-L .ilaw-field, .ilaw-A .ilaw-field')]
    .filter(field => instructionalLabel(cleanText(field.querySelector('.ilaw-label'))))
    .map(field => {
      const copy = field.cloneNode(true);
      copy.querySelectorAll('.ilaw-label, .ilaw-label-hint').forEach(node => node.remove());
      return instructionalText(copy);
    }).filter(meaningfulInstruction);
  if (fields.length) return fields.join(' ');

  // Legacy plans may have semantic headings without the ILAW class structure.
  const sections = [];
  for (const heading of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!instructionalLabel(cleanText(heading))) continue;
    const content = [];
    for (let node = heading.nextElementSibling; node && !/^H[1-6]$/.test(node.tagName); node = node.nextElementSibling) {
      content.push(instructionalText(node));
    }
    const sectionText = content.filter(Boolean).join(' ');
    if (meaningfulInstruction(sectionText)) sections.push(sectionText);
  }
  return sections.join(' ').trim();
}

// Prepares a frontend handoff only. It neither generates questions nor saves a
// worksheet; those capabilities require a separately approved generator flow.
export function prepareWorksheetContext({
  plan, teacherId, schoolYear, sourceTeacherId, sourceSchoolYear,
  assignmentRows, selectedSubjectId = '', selectedGradeLevel = '',
}) {
  if (!plan?.id || !teacherId || plan.teacher_id !== teacherId) {
    return unavailable('This saved lesson plan is not available for the signed-in Teacher.');
  }
  if (!schoolYear || sourceTeacherId !== teacherId || sourceSchoolYear !== schoolYear || !Array.isArray(assignmentRows)) {
    return unavailable('Current teaching assignments could not be verified.');
  }

  const type = savedPlanType(plan);
  if (type !== 'ai' && type !== 'manual') {
    return unavailable('This saved plan has no supported worksheet-generation context.');
  }
  if (type === 'ai' && !plan.title?.trim()) {
    return unavailable('This AI lesson plan has no title or topic to use for a worksheet.');
  }

  let manual = null;
  if (type === 'manual') {
    try {
      manual = parseManualIlawV2(plan.objectives, { teacherId, planId: plan.id });
    } catch {
      return unavailable('Only validated Manual ILAW version 2 plans are supported.');
    }
  }

  const storedSubjectId = manual?.assignment.subjectId || plan.subject_id || '';
  const storedGrade = manual?.assignment.gradeLevel || plan.grade_level || '';
  if (manual && ((plan.subject_id && plan.subject_id !== storedSubjectId)
    || (plan.grade_level && plan.grade_level !== storedGrade)
    || (plan.title && plan.title !== manual.title))) {
    return unavailable('The saved Manual ILAW metadata does not match its document.');
  }

  const subjects = eligibleQuickCreateSubjects(assignmentRows);
  if (!subjects.length) return unavailable('No current subject and grade assignment is available.');
  if (storedSubjectId && !subjects.some(item => item.id === storedSubjectId)) {
    return unavailable('The saved subject is not in the current teaching load.');
  }
  if (storedGrade && !subjects.some(item => item.grades.includes(storedGrade))) {
    return unavailable('The saved grade is not in the current teaching load.');
  }
  if ((storedSubjectId && selectedSubjectId && selectedSubjectId !== storedSubjectId)
    || (storedGrade && selectedGradeLevel && selectedGradeLevel !== storedGrade)) {
    return unavailable('The selected assignment conflicts with the saved lesson plan metadata.');
  }
  const subjectId = storedSubjectId || selectedSubjectId;
  const gradeLevel = storedGrade || selectedGradeLevel;
  const subject = subjects.find(item => item.id === subjectId && item.grades.includes(gradeLevel));
  if (!subject) {
    if (!storedSubjectId || !storedGrade) {
      return {
        status: 'needs-confirmation',
        reason: 'Confirm a current assigned subject and grade before using this plan.',
        assignmentOptions: subjects,
        context: null,
      };
    }
    return unavailable('This plan’s subject and grade are not in the current teaching load.');
  }

  let source;
  if (manual) {
    source = {
      kind: 'manual-ilaw-v2',
      learningObjectives: manual.sourceDetails.learningObjectives,
      weekdayObjectives: { ...manual.document.weekly.learningObjectives },
      learningActivities: { ...manual.document.weekly.flow },
      formativeAssessments: { ...manual.document.weekly.formativeAssessment },
      teachingStrategy: manual.sourceDetails.teachingStrategy,
    };
  } else {
    const lessonText = extractAiInstructionalText(plan.objectives);
    if (!lessonText) return unavailable('This AI lesson plan has no identifiable instructional objectives, experiences, or assessments for a worksheet.');
    source = { kind: 'ai-html-text', lessonText };
  }

  return {
    status: 'ready', reason: '',
    context: {
      lessonPlanId: plan.id,
      lessonTitle: (manual?.title || plan.title || '').trim(),
      subjectId: subject.id,
      subjectName: subject.name,
      gradeLevel,
      source,
    },
  };
}

// Local, unsaved sample only. This deliberately does not grant subject-specific
// generation or distribution permission when a legacy plan lacks metadata.
export function prepareDevelopmentWorksheetContext({ plan, teacherId }) {
  if (!plan?.id || !teacherId || plan.teacher_id !== teacherId) {
    return unavailable('This saved lesson plan is not available for the signed-in Teacher.');
  }
  const type = savedPlanType(plan);
  if (type !== 'ai' && type !== 'manual') {
    return unavailable('This saved plan has no supported worksheet-generation context.');
  }

  let manual = null;
  let source;
  if (type === 'manual') {
    try {
      manual = parseManualIlawV2(plan.objectives, { teacherId, planId: plan.id });
    } catch {
      return unavailable('Only validated Manual ILAW version 2 plans are supported.');
    }
    if ((plan.subject_id && plan.subject_id !== manual.assignment.subjectId)
      || (plan.grade_level && plan.grade_level !== manual.assignment.gradeLevel)
      || (plan.title && plan.title !== manual.title)) {
      return unavailable('The saved Manual ILAW metadata does not match its document.');
    }
    source = {
      kind: 'manual-ilaw-v2',
      learningObjectives: manual.sourceDetails.learningObjectives,
      weekdayObjectives: { ...manual.document.weekly.learningObjectives },
      learningActivities: { ...manual.document.weekly.flow },
      formativeAssessments: { ...manual.document.weekly.formativeAssessment },
      teachingStrategy: manual.sourceDetails.teachingStrategy,
    };
  } else {
    const lessonText = extractAiInstructionalText(plan.objectives);
    if (!plan.title?.trim() || !lessonText) {
      return unavailable('This AI lesson plan needs a title and identifiable instructional content for a worksheet sample.');
    }
    const assessment = extractAiAssessmentContext(plan.objectives);
    if (!assessment) {
      return unavailable('This saved AI lesson plan has no usable A — Assessment content for worksheet generation.');
    }
    source = { kind: 'ai-html-text', lessonText, assessment };
  }

  return {
    status: 'ready', reason: '',
    context: {
      lessonPlanId: plan.id,
      lessonTitle: (manual?.title || plan.title || '').trim(),
      subjectId: manual?.assignment.subjectId || plan.subject_id || '',
      subjectName: manual?.assignment.subjectName || savedAiMetadata(plan).subjectName,
      gradeLevel: manual?.assignment.gradeLevel || plan.grade_level || '',
      schoolYear: manual?.assignment.schoolYear || savedAiMetadata(plan).schoolYear,
      assignmentVerified: false,
      source,
    },
  };
}

// Contract for a future trusted writer. This only prepares a frontend preview
// and must never be accepted by the server as authorization or as saved output.
export function prepareAiAssessmentWorksheetContext(input) {
  const result = prepareWorksheetContext(input);
  if (result.status !== 'ready' || result.context.source.kind !== 'ai-html-text') return result;
  const assessment = extractAiAssessmentContext(input.plan.objectives);
  if (!assessment) return unavailable('This saved AI lesson plan has no usable A — Assessment content for worksheet generation.');
  return {
    ...result,
    context: { ...result.context, source: { ...result.context.source, assessment } },
  };
}
