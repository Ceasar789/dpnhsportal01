import { validateAcademicYear } from '../../admin/shared/settingsRules';

export function savedAiMetadata(plan) {
  return {
    subjectId: plan?.subject_id || '',
    subjectName: plan?.subject_id && plan.subject && plan.subject !== 'ILAW Lesson Plan' ? plan.subject : '',
    gradeLevel: plan?.grade_level || '',
    schoolYear: !validateAcademicYear(plan?.academic_year) ? plan.academic_year : '',
  };
}
