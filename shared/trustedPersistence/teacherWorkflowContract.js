// Synthetic contract checks only. A future RPC must load every relationship itself.
import { normalizeGradeLevel } from '../../frontend/src/lib/academicRules.js';

const deny = code => ({ ok: false, code });

export function authorizeScoreChange({ actor, worksheet, submission, section, posting, enrollment, load, officialYear }) {
  if (!actor?.id) return deny('not_authenticated');
  if (actor.role !== 'teacher' || actor.status !== 'active') return deny('inactive_or_wrong_role');
  if (!worksheet?.id || !worksheet.subject_id || worksheet.teacher_id !== actor.id
      || !submission?.student_id || submission.worksheet_id !== worksheet.id)
    return deny('worksheet_denied');
  if (!section?.id || submission.section_id !== section.id || posting?.worksheet_id !== worksheet.id
      || posting.section_id !== section.id) return deny('section_denied');
  if (!enrollment || enrollment.student_id !== submission.student_id || enrollment.section_id !== section.id
      || enrollment.status !== 'active') return deny('enrollment_denied');
  // Legacy worksheets have no school_year. Missing trusted provenance blocks a write.
  if (!worksheet.school_year || !officialYear || worksheet.school_year !== officialYear
      || section.school_year !== officialYear) return deny('historical_write_blocked');
  if (load?.teacher_id !== actor.id || load.subject_id !== worksheet.subject_id
      || load.school_year !== officialYear || !normalizeGradeLevel(load.grade_level)
      || normalizeGradeLevel(load.grade_level) !== normalizeGradeLevel(section.grade_level)
      || normalizeGradeLevel(worksheet.grade_level) !== normalizeGradeLevel(section.grade_level)) return deny('assignment_denied');
  if (!['submitted', 'checked'].includes(submission.status) || submission.released)
    return deny('invalid_state');
  return { ok: true };
}

export function validateQuestionScores(items, marks) {
  if (!Array.isArray(items) || !items.length || !Array.isArray(marks) || marks.length !== items.length)
    return deny('invalid_scores');
  if (items.some(item => !item?.id) || marks.some(mark => !mark?.item_id)) return deny('invalid_scores');
  const itemById = new Map(items.map(item => [item.id, item]));
  if (itemById.size !== items.length || new Set(marks.map(mark => mark.item_id)).size !== marks.length)
    return deny('invalid_scores');
  let score = 0;
  let maximum = 0;
  for (const mark of marks) {
    const item = itemById.get(mark.item_id);
    const points = item?.points;
    if (!item || !Number.isFinite(points) || points < 0 || !Number.isFinite(mark.points_earned)
        || mark.points_earned < 0 || mark.points_earned > points
        || Number(mark.points_earned.toFixed(2)) !== mark.points_earned) return deny('invalid_scores');
    score += mark.points_earned;
    maximum += points;
  }
  if (score > 9999.99 || maximum > 9999.99) return deny('invalid_scores');
  return { ok: true, score: Math.round(score * 100) / 100, maximum: Math.round(maximum * 100) / 100 };
}

export function authorizeAttendanceChange({ actor, section, enrollment, studentId, officialYear, date }) {
  if (!actor?.id) return deny('not_authenticated');
  if (actor.role !== 'teacher' || actor.status !== 'active') return deny('inactive_or_wrong_role');
  // Proposed homeroom policy: only the current adviser records section attendance.
  if (!section?.id || section.adviser_id !== actor.id || !officialYear
      || section.school_year !== officialYear) return deny('section_denied');
  if (!studentId || enrollment?.student_id !== studentId || enrollment.section_id !== section.id
      || enrollment.status !== 'active')
    return deny('enrollment_denied');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return deny('invalid_date');
  if (typeof officialYear !== 'string' || !/^\d{4}-\d{4}$/.test(officialYear)) return deny('invalid_date');
  const startYear = Number(officialYear.slice(0, 4));
  if (Number(officialYear.slice(5)) !== startYear + 1
      || date < `${startYear}-06-01` || date >= `${startYear + 1}-06-01`) return deny('invalid_date');
  return { ok: true };
}

export function authorizeStudentResultRead({ actor, submission, kind = 'result' }) {
  if (!actor?.id) return deny('not_authenticated');
  if (actor.role !== 'student' || actor.status !== 'active' || submission?.student_id !== actor.id)
    return deny('not_found');
  if (kind !== 'result' || !submission.released) return deny('not_found');
  return { ok: true };
}

export function nextReviewState({ review, action, expectedRevision }) {
  if (!review || !Number.isInteger(expectedRevision) || review.revision !== expectedRevision)
    return deny('revision_conflict');
  if (review.released) return deny('already_released');
  if (action === 'edit') return { ok: true, status: 'draft', approved: false, revision: review.revision + 1 };
  if (action === 'approve' && review.status === 'draft' && review.complete === true)
    return { ok: true, status: 'approved', approved: true, revision: review.revision + 1 };
  if (action === 'release' && review.status === 'approved' && review.approved === true)
    return { ok: true, status: 'released', approved: true, revision: review.revision + 1 };
  return deny('invalid_transition');
}
