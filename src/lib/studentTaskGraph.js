// ============================================
// FILE: src/lib/studentTaskGraph.js
// Every read the student dashboard's Overview and Tasks screens need,
// fetched ONCE.
//
// Why this exists. Overview cost 10 round trips and Tasks cost 8, and all
// but four of those were the same query issued twice seconds apart —
// task_assignees, worksheets, both submission reads, subjects, and the
// whole three-read schedule derivation. Overview alone read
// section_students twice, because its enrolment banner and
// fetchScheduledSubjectIds() each asked for it separately. With 45 of the
// 60 test users being students, that duplication was most of the load the
// hosting tier could not carry.
//
// This is 9 reads in 3 sequential waves, held by StudentDataContext for the
// life of the dashboard, so moving between Overview and Tasks now costs
// nothing at all.
//
// What this file must NOT change is the meaning of a failure. Two error
// channels are kept deliberately separate, because the two screens have
// always disagreed about one of them and both were right:
//
//   fatalError    — enrolment, assignments, worksheets or submissions could
//                   not be read. Nothing on either screen is trustworthy.
//                   A submissions read that fails must never look like "no
//                   submission": that would invite an already-submitted
//                   student to answer again and fail on the UNIQUE
//                   constraint.
//   scheduleError — the schedule or the subject names could not be read.
//                   Overview treats this as fatal (it cannot draw subject
//                   cards without it); Tasks does not (it only needs it to
//                   widen ?subject=other, and falls back to the
//                   conservative null-subject rule). cardSubjectIds is
//                   then null, which isOtherTask() reads as "unknown" —
//                   never as "nothing scheduled".
// ============================================

import { supabase } from '../config/supabase';
import { withRetry } from './supabaseRetry';

// The exact submission columns the student's screens ever read. Named
// explicitly, never a bare select(), so a new column on the table cannot
// silently start handing this file scoring data it should not have.
export const SUBMISSION_STATE_FIELDS = 'id, worksheet_id, status, released';
export const SUBMISSION_SCORE_FIELDS = 'worksheet_id, score, total_points';

const empty = () => ({
  fatalError: null,
  scheduleError: null,
  enrolments: [],
  studentRecord: null,
  attendance: [],
  assignees: [],
  sheetById: new Map(),
  submissionStates: [],
  releasedScores: [],
  subjects: [],
  subjectsById: new Map(),
  cardSubjectIds: new Set(),
});

/**
 * @param {string} studentId
 * @returns {Promise<object>} the shape documented above. Callers check
 *   `fatalError` first and render their load-failure state; `scheduleError`
 *   is theirs to interpret.
 */
export async function fetchStudentTaskGraph(studentId) {
  const graph = empty();
  if (!studentId) return graph;

  // Wave 1. Both of these gate later reads: the section ids drive the
  // schedule lookup, the task ids drive the worksheet lookup.
  //
  // No .limit(1) on the enrolment: section_students is UNIQUE on
  // (section_id, student_id), so a re-sectioned student can hold two rows
  // both marked active. Ordered so the banner picks the same one every
  // load rather than an arbitrary one.
  const [enrolResult, assigneeResult] = await Promise.all([
    withRetry(() => supabase.from('section_students')
      .select('section_id, sections(name, grade_level)')
      .eq('student_id', studentId).eq('status', 'active')
      .order('section_id'),
      { label: 'Student enrolment fetch' }),
    withRetry(() => supabase.from('task_assignees')
      .select('task_id, section_id, due_at, assigned_at')
      .eq('student_id', studentId),
      { label: 'Student task assignments fetch' }),
  ]);

  if (enrolResult.error || assigneeResult.error) {
    graph.fatalError = enrolResult.error || assigneeResult.error;
    console.warn('Student dashboard load failed —', graph.fatalError.message);
    return graph;
  }

  graph.enrolments = enrolResult.data || [];
  // Newest assignment first — the order the student learned about the work.
  graph.assignees = [...(assigneeResult.data || [])].sort(
    (a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
  );

  const sectionIds = [...new Set(graph.enrolments.map(e => e.section_id).filter(Boolean))];
  const taskIds = [...new Set(graph.assignees.map(a => a.task_id).filter(Boolean))];

  // Wave 2. Independent of each other; issued together.
  const [schedResult, sheetResult, stateResult, scoreResult, studentResult, attResult] = await Promise.all([
    sectionIds.length
      ? withRetry(() => supabase.from('schedules').select('subject_id').in('section_id', sectionIds),
        { label: 'Student schedules fetch' })
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? withRetry(() => supabase.from('worksheets')
        .select('id, title, subject, task_type, subject_id').in('id', taskIds),
        { label: 'Student tasks fetch' })
      : Promise.resolve({ data: [], error: null }),
    withRetry(() => supabase.from('worksheet_submissions')
      .select(SUBMISSION_STATE_FIELDS).eq('student_id', studentId),
      { label: 'Student submissions fetch' }),
    // Released-only IN THE QUERY, not in JS. RLS hands back whole rows, so
    // filtering after the fact would still put a score the student is not
    // meant to see into their devtools.
    withRetry(() => supabase.from('worksheet_submissions')
      .select(SUBMISSION_SCORE_FIELDS)
      .eq('student_id', studentId).eq('released', true),
      { label: 'Student released scores fetch' }),
    withRetry(() => supabase.from('students')
      .select('student_number, lrn').eq('id', studentId).maybeSingle(),
      { label: 'Student number fetch' }),
    withRetry(() => supabase.from('attendance').select('status').eq('student_id', studentId),
      { label: 'Student attendance fetch' }),
  ]);

  if (sheetResult.error || stateResult.error || scoreResult.error
    || studentResult.error || attResult.error) {
    graph.fatalError = sheetResult.error || stateResult.error || scoreResult.error
      || studentResult.error || attResult.error;
    console.warn('Student dashboard load failed —', graph.fatalError.message);
    return graph;
  }

  graph.sheetById = new Map((sheetResult.data || []).map(s => [s.id, s]));
  graph.submissionStates = stateResult.data || [];
  graph.releasedScores = scoreResult.data || [];
  graph.studentRecord = studentResult.data || null;
  graph.attendance = attResult.data || [];

  // Wave 3. One subjects read covering BOTH uses — the subjects that become
  // the Overview cards, and the subject names that label the Tasks rows.
  // These were two separate reads of the same table.
  const scheduledIds = schedResult.error
    ? []
    : [...new Set((schedResult.data || []).map(s => s.subject_id).filter(Boolean))];
  const taskSubjectIds = [...new Set(
    [...graph.sheetById.values()].map(s => s.subject_id).filter(Boolean)
  )];
  const wantedIds = [...new Set([...scheduledIds, ...taskSubjectIds])];

  let subjectRows = [];
  let subjectsError = null;
  if (wantedIds.length > 0) {
    const { data, error } = await withRetry(
      () => supabase.from('subjects').select('id, name').in('id', wantedIds),
      { label: 'Student subjects fetch' }
    );
    if (error) subjectsError = error;
    else subjectRows = data || [];
  }

  if (schedResult.error || subjectsError) {
    // Unknown, not empty. Callers must not read this as "nothing scheduled".
    graph.scheduleError = schedResult.error || subjectsError;
    graph.cardSubjectIds = null;
    console.warn('Student schedule fetch failed —', graph.scheduleError.message);
  }

  graph.subjectsById = new Map(subjectRows.map(s => [s.id, s.name]));

  if (!graph.scheduleError) {
    // The cards are the student's SCHEDULE plus any subject they have actually
    // been given work in. The schedule alone was not enough: a task whose
    // subject has no schedule row for this section fell through to an "Other"
    // card, which told the student nothing about what the work was. Giving
    // that subject its own card puts the task where its name says it belongs,
    // and leaves "Other" for the one case nothing else can hold — a task with
    // no subject at all.
    //
    // Both halves are intersected with subjects rows that still exist: a
    // schedule row, or a worksheet, can outlive the subject it named.
    const wanted = new Set([...scheduledIds, ...taskSubjectIds]);
    graph.subjects = subjectRows
      .filter(s => wanted.has(s.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    graph.cardSubjectIds = new Set(graph.subjects.map(s => s.id));
  }

  return graph;
}
