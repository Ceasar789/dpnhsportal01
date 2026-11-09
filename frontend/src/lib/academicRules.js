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

// ── Schedule clashes ────────────────────────────────────────────────────────
// A browser-side check only: two admins saving at the same moment could still
// create a clash. Database-level enforcement is future work.

// "08:00" or "08:00:00" -> minutes after midnight; null for anything else.
const minutesOf = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const roomKey = (value) => String(value ?? '').trim().toLowerCase();

/**
 * The existing periods a new period would clash with, in the same school year.
 * Overlap: same day, start < otherEnd and otherStart < end. Periods that only
 * touch (one ends when the other starts) do not clash.
 *   teacher  the same teacher has an overlapping period in any section
 *   room     the same room (trimmed, case-insensitive), only when a room is entered
 *   section  the same section already has an overlapping period
 *
 * @param {object} period    { section_id, teacher_id, day_of_week, start_time, end_time, room_number, school_year }
 * @param {object[]} existing periods already saved
 * @returns {{type: 'teacher'|'room'|'section', other: object}[]}
 */
export function findScheduleClashes(period, existing) {
  const start = minutesOf(period?.start_time);
  const end = minutesOf(period?.end_time);
  if (start === null || end === null) return [];
  const room = roomKey(period.room_number);
  const clashes = [];
  for (const other of existing || []) {
    if (!other || other.school_year !== period.school_year || other.day_of_week !== period.day_of_week) continue;
    const otherStart = minutesOf(other.start_time);
    const otherEnd = minutesOf(other.end_time);
    if (otherStart === null || otherEnd === null || !(start < otherEnd && otherStart < end)) continue;
    if (other.teacher_id && other.teacher_id === period.teacher_id) clashes.push({ type: 'teacher', other });
    if (room && roomKey(other.room_number) === room) clashes.push({ type: 'room', other });
    if (other.section_id && other.section_id === period.section_id) clashes.push({ type: 'section', other });
  }
  return clashes;
}

const hhmm = (value) => String(value ?? '').slice(0, 5);
const nameIn = (list, id) => (list || []).find(item => item?.id === id)?.name || null;

/**
 * One plain sentence per clash, naming the other class from names already
 * loaded; "another class" when a name is missing. Duplicates are dropped.
 *
 * @param {object[]} clashes from findScheduleClashes
 * @param {{teachers?: object[], sections?: object[], subjects?: object[], room?: string}} names
 * @returns {string[]}
 */
export function describeScheduleClashes(clashes, { teachers, sections, subjects, room } = {}) {
  const messages = (clashes || []).map(({ type, other }) => {
    const when = `on ${other.day_of_week} ${hhmm(other.start_time)}–${hhmm(other.end_time)}`;
    const section = nameIn(sections, other.section_id);
    const subject = nameIn(subjects, other.subject_id);
    if (type === 'teacher') {
      const teacher = nameIn(teachers, other.teacher_id);
      const what = section && subject ? `${subject} in ${section}` : 'another class';
      return `${teacher ? `Teacher ${teacher}` : 'This teacher'} already teaches ${what} ${when}.`;
    }
    if (type === 'room') {
      // The room as the other class has it stored ("Room 101"), not as typed ("room 101 ").
      const typed = String(other.room_number || room || '').trim();
      const label = /^room\b/i.test(typed) ? typed : `Room ${typed}`;
      const what = section && subject ? `${section} (${subject})` : 'another class';
      return `${label} is already used by ${what} ${when}.`;
    }
    return `${section || 'This section'} already has ${subject || 'another class'} ${when}.`;
  });
  return [...new Set(messages)];
}
