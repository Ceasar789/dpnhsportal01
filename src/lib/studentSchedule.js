// ============================================
// FILE: src/lib/studentSchedule.js
// The single definition of "which subjects is this student's Other card
// about" — shared by OverviewTab.jsx and TasksTab.jsx so a task can never
// be counted as Other on one screen and not-Other on the other.
//
// This has drifted twice already:
//   - Task 9 built the set from schedules.subject_id, intersected with
//     surviving subjects rows, scoped to the student's ACTIVE
//     section_students. Correct.
//   - Fix round 1 rebuilt an equivalent-looking set in TasksTab.jsx from
//     task_assignees.section_id instead — the section the task was
//     distributed in, which is kept even after the student transfers
//     sections (see the tasks-schema notes) — and skipped the
//     intersection with subjects. A student who ever changed section, or a
//     schedule row naming a deleted subject, disagreed between screens
//     again.
// Both screens now call fetchScheduledSubjectIds() and get exactly the same
// answer, computed exactly once.
// ============================================

import { supabase } from '../config/supabase';
import { withRetry } from './supabaseRetry';
import { isOtherTask } from './otherTask';

// Re-exported so both OverviewTab.jsx and TasksTab.jsx can get the fetch and
// the predicate from one import; see otherTask.js for why the predicate
// itself lives in a separate, supabase-free module (it needs to be unit
// testable under vitest's node environment).
export { isOtherTask };

/**
 * Fetches the subjects on `studentId`'s class schedule: their ACTIVE
 * section_students row(s), the schedules for those sections, intersected
 * with subjects rows that still exist (a schedule row can outlive the
 * subject it named).
 *
 * Returns `{ subjects, scheduledSubjectIds, error }`:
 *   - On any failed read: `{ subjects: [], scheduledSubjectIds: null, error }`
 *     — callers must treat `null` as "unknown," never as "nothing
 *     scheduled" (see isOtherTask above), and should generally surface
 *     `error` as a load failure rather than silently degrading, the way
 *     OverviewTab already does for everything else on the page.
 *   - Otherwise: `{ subjects: [{id, name}], scheduledSubjectIds: Set<id>, error: null }`,
 *     where `scheduledSubjectIds` is exactly the ids in `subjects`.
 *
 * @param {string} studentId
 */
export async function fetchScheduledSubjectIds(studentId) {
  const { data: enrolment, error: enrolError } = await withRetry(
    () => supabase.from('section_students')
      .select('section_id')
      .eq('student_id', studentId).eq('status', 'active'),
    { label: 'Student active sections fetch (schedule)' }
  );
  if (enrolError) {
    console.warn('Student active sections fetch failed —', enrolError.message);
    return { subjects: [], scheduledSubjectIds: null, error: enrolError };
  }

  const sectionIds = [...new Set((enrolment || []).map(e => e.section_id).filter(Boolean))];
  if (sectionIds.length === 0) {
    // Genuinely not actively enrolled anywhere — a known, empty schedule,
    // not an unknown one.
    return { subjects: [], scheduledSubjectIds: new Set(), error: null };
  }

  const { data: schedRows, error: schedError } = await withRetry(
    () => supabase.from('schedules').select('subject_id').in('section_id', sectionIds),
    { label: 'Student schedules fetch' }
  );
  if (schedError) {
    console.warn('Student schedules fetch failed —', schedError.message);
    return { subjects: [], scheduledSubjectIds: null, error: schedError };
  }

  const scheduledIds = [...new Set((schedRows || []).map(s => s.subject_id).filter(Boolean))];
  if (scheduledIds.length === 0) {
    return { subjects: [], scheduledSubjectIds: new Set(), error: null };
  }

  const { data: subjectRows, error: subjectsError } = await withRetry(
    () => supabase.from('subjects').select('id, name').in('id', scheduledIds),
    { label: 'Student scheduled subjects fetch' }
  );
  if (subjectsError) {
    console.warn('Student scheduled subjects fetch failed —', subjectsError.message);
    return { subjects: [], scheduledSubjectIds: null, error: subjectsError };
  }

  const subjects = subjectRows || [];
  return { subjects, scheduledSubjectIds: new Set(subjects.map(s => s.id)), error: null };
}
