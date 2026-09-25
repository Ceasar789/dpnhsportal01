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
 * subject_id and the ids of the subject cards actually on screen.
 *
 * `cardSubjectIds` is the student's schedule PLUS every subject they have
 * been given work in (see studentTaskGraph.js). That second half is what
 * emptied this bucket: a task whose subject has no schedule row used to fall
 * through to "Other", where its own subject name — the one useful thing
 * about it — was thrown away. Now that subject gets a card and the task
 * lands on it.
 *
 * What is left is the only case no card can hold: a task with no subject at
 * all. That cannot be created through the app any more (both worksheet
 * insert paths set subject_id and refuse without one), so an "Other" card
 * appearing means a legacy row, and it is worth seeing rather than hiding —
 * the alternative is a task the student can never open.
 *
 * `cardSubjectIds` is `null` when the set could not be determined (the
 * schedules or subjects read failed) — deliberately NOT the same as an empty
 * Set. An empty Set means "we asked, and there are no cards." `null` means
 * "we don't know," and the safe answer is the null-subject_id-only rule
 * rather than sweeping the student's entire task list into Other because a
 * read hiccuped.
 *
 * @param {string|null|undefined} subjectId
 * @param {Set<string>|null} cardSubjectIds
 */
export function isOtherTask(subjectId, cardSubjectIds) {
  if (!subjectId) return true;
  if (!cardSubjectIds) return false;
  return !cardSubjectIds.has(subjectId);
}
