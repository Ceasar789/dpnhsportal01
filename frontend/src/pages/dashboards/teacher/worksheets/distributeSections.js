import { normalizeGradeLevel } from '../../../../lib/academicRules';

// U-PDF-T (Q2): Distribute offers only the sections where this teacher teaches
// the worksheet's subject at the worksheet's grade (teaching load = schedules).
// An advisory section is offered only when it also meets that rule. A worksheet
// with no stored subject (or grade) is not narrowed on that part, so an older
// worksheet keeps the list it had before (nothing is widened).
export function sectionsForWorksheet(sections, worksheet) {
  const subject = worksheet?.subject_id || null;
  const grade = normalizeGradeLevel(worksheet?.grade_level) || null;
  return (sections || []).filter(section =>
    (!subject || (section.subjectIds || []).includes(subject))
    && (!grade || normalizeGradeLevel(section.grade_level) === grade));
}
