// ============================================
// FILE: src/lib/otherTask.js
// Pure predicate for "does this task belong on the Other card/filter?",
// split out of studentSchedule.js so it can be unit tested without pulling
// in config/supabase.js (which touches sessionStorage at import time and so
// cannot be imported under vitest's node environment). Re-exported from
// studentSchedule.js for callers that want both the predicate and the fetch
// from one import.
// ============================================

/**
 * Whether a task belongs on the "Other" card/filter, given its worksheet's
 * subject_id and the student's scheduled subject ids.
 *
 * `scheduledSubjectIds` is `null` when that set could not be determined (the
 * schedules read failed) — deliberately NOT treated the same as an empty
 * Set. An empty Set means "we asked, and this student has nothing
 * scheduled," which correctly sends every subject-bearing task to Other.
 * `null` means "we don't know," and the safe, conservative answer is to
 * fall back to the original null-subject_id-only rule rather than widen
 * Other to swallow the student's entire task list because a read hiccuped.
 *
 * @param {string|null|undefined} subjectId
 * @param {Set<string>|null} scheduledSubjectIds
 */
export function isOtherTask(subjectId, scheduledSubjectIds) {
  if (!subjectId) return true;
  if (!scheduledSubjectIds) return false;
  return !scheduledSubjectIds.has(subjectId);
}
