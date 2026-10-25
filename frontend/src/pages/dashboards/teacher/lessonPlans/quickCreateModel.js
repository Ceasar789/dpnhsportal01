// These helpers describe a proposed payload only. No production save uses them.
export function eligibleQuickCreateSubjects(rows) {
  const grouped = new Map();
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    if (typeof row?.subject_id !== 'string' || !row.subject_id ||
      row.subjects?.id !== row.subject_id || typeof row.subjects?.name !== 'string' ||
      !row.subjects.name.trim() || typeof row.grade_level !== 'string' || !row.grade_level.trim()) continue;
    if (!grouped.has(row.subject_id)) grouped.set(row.subject_id, {
      id: row.subject_id, name: row.subjects.name, grades: [],
    });
    const subject = grouped.get(row.subject_id);
    if (!subject.grades.includes(row.grade_level)) subject.grades.push(row.grade_level);
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function validateQuickCreateDraft(draft, { subjects, teacherId, sourceTeacherId, schoolYear, sourceSchoolYear }) {
  const errors = {};
  if (!draft?.title?.trim()) errors.title = 'Enter a lesson plan title.';
  if (!teacherId || teacherId !== sourceTeacherId || !schoolYear || schoolYear !== sourceSchoolYear) {
    errors.assignment = 'Teaching load is not available for this Teacher and school year.';
  }
  const subject = subjects?.find(item => item.id === draft?.subjectId);
  if (!subject) errors.subject = 'Choose an assigned subject.';
  if (!subject?.grades.includes(draft?.gradeLevel)) errors.gradeLevel = 'Choose a grade assigned for this subject.';
  const minutes = String(draft?.durationMinutes ?? '').trim();
  if (minutes && (!/^[1-9]\d*$/.test(minutes) || !Number.isSafeInteger(Number(minutes)))) {
    errors.durationMinutes = 'Enter a whole number of minutes greater than zero.';
  }
  return errors;
}

export function buildQuickCreatePayload(draft, context) {
  const errors = validateQuickCreateDraft(draft, context);
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
  const subject = context.subjects.find(item => item.id === draft.subjectId);
  const minutes = String(draft.durationMinutes ?? '').trim();
  return {
    title: draft.title.trim(),
    subject: subject.name,
    subject_id: subject.id,
    grade_level: draft.gradeLevel,
    duration: minutes ? `${Number(minutes)} minutes` : '',
    strategy: draft.strategy ?? '',
    objectives: draft.objectives ?? '',
    teacher_id: context.teacherId,
    ai_generated: false,
  };
}
