// ============================================
// FILE: src/lib/academicRules.js
// Pure rules governing what a teacher may be scheduled to teach.
// Kept free of React and Supabase so it can be unit-tested directly.
// ============================================

export const GRADE_LEVELS = [
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];

/**
 * The school year we are currently inside, as "YYYY-YYYY".
 *
 * The DepEd school year opens in June, so before June we are still in the
 * year that began last calendar year.
 *
 * Shared rather than local because every academic record is scoped by year
 * and two screens disagreeing about which year it is would be invisible:
 * the teacher side had no notion of a school year at all, so it read EVERY
 * year's teaching load at once. A teacher who held Mathematics one year and
 * English the next counted as two subjects, tripped the one-subject-per-
 * teacher check, and was locked out of creating any task — pointed at an
 * admin whose data was correct.
 *
 * @param {Date} [now] injectable for tests
 */
export function currentSchoolYear(now = new Date()) {
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

// sections.grade_level is an unconstrained VARCHAR, so values arriving from the
// database may not match the canonical spelling. Everything compares through here.
export function normalizeGradeLevel(value) {
  if (!value) return null;
  const digits = value.toString().match(/\d+/);
  if (!digits) return null;
  const candidate = `Grade ${digits[0]}`;
  return GRADE_LEVELS.includes(candidate) ? candidate : null;
}

export function teacherLoadFor(load, schoolYear) {
  if (!Array.isArray(load)) return [];
  return load.filter(row => row.school_year === schoolYear);
}

export function subjectsTeacherHolds(load, schoolYear) {
  const rows = teacherLoadFor(load, schoolYear);
  return [...new Set(rows.map(row => row.subject_id))];
}

export function canTeachSection(load, subjectId, section) {
  const yearRows = teacherLoadFor(load, section?.school_year);

  if (yearRows.length === 0) {
    return { ok: false, reason: 'This teacher has no teaching load for this school year.' };
  }

  const subjectRows = yearRows.filter(row => row.subject_id === subjectId);
  if (subjectRows.length === 0) {
    return { ok: false, reason: 'This teacher is not assigned to this subject.' };
  }

  const wanted = normalizeGradeLevel(section?.grade_level);
  const held = subjectRows
    .map(row => normalizeGradeLevel(row.grade_level))
    .filter(Boolean);

  if (!wanted || !held.includes(wanted)) {
    return {
      ok: false,
      reason: `This teacher does not handle this subject for ${section?.grade_level || 'that grade level'}.`,
    };
  }

  return { ok: true, reason: null };
}
