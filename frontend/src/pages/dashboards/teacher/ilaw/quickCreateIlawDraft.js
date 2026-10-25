import { createBlankIlawDocument } from './ilawTemplateModel';
import { normalizeManualIlawDocument } from './fullManualIlawModel';

export const QUICK_CREATE_ILAW_KIND = 'eduscribe.quick-create-ilaw';
export const QUICK_CREATE_ILAW_VERSION = 1;

// This envelope exists only in React state. It is never a lesson_plans save payload.
export function createQuickCreateIlawDraft(payload, schoolYear) {
  if (!payload?.teacher_id || !payload.subject_id || !payload.subject?.trim() ||
    !payload.grade_level?.trim() || !payload.title?.trim() || !schoolYear) {
    throw new Error('A validated Quick Create lesson and teaching assignment are required.');
  }
  const document = createBlankIlawDocument({ subject: payload.subject, grade: payload.grade_level });
  document.info.nameOfLesson = payload.title;
  return {
    kind: QUICK_CREATE_ILAW_KIND,
    version: QUICK_CREATE_ILAW_VERSION,
    teacherId: payload.teacher_id,
    schoolYear,
    assignment: { subjectId: payload.subject_id, subjectName: payload.subject, gradeLevel: payload.grade_level },
    document: normalizeManualIlawDocument(document),
    sourceDetails: {
      classDuration: payload.duration ?? '',
      teachingStrategy: payload.strategy ?? '',
      learningObjectives: payload.objectives ?? '',
    },
  };
}
