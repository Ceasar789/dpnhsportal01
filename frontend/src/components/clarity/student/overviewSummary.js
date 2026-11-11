// ============================================
// FILE: src/components/clarity/student/overviewSummary.js
// TEMPORARY duplicate of the logic in OverviewTab.jsx. After the defense
// OverviewTab.jsx will import this helper (Option A), owner-approved.
//
// A word-for-word copy of the useMemo body at OverviewTab.jsx:48-132, as a
// pure function: same Worksheet Performance, Attendance, welcome info,
// pending count (its own rule, NOT taskGroups.isDone) and per-subject
// buckets. ClarityOverviewTab.test.jsx checks it against the classic tab.
// ============================================

import { isHandout } from '../../../pages/dashboards/student/tabs/studentAnswers';

export const overviewSummary = (graph, userName) => {
  const blank = {
    info: { name: userName || 'Student', studentId: null, gradeLevel: null, section: null, schoolYear: null },
    performance: null, attendance: null, subjects: [], tasksBySubject: {}, pendingCount: 0,
  };
  if (!graph || graph.fatalError || graph.scheduleError) return blank;

  const enrolled = graph.enrolments[0] || null;
  const info = {
    name: userName || 'Student',
    studentId: graph.studentRecord?.student_number || graph.studentRecord?.lrn || null,
    gradeLevel: enrolled?.sections?.grade_level || null,
    section: enrolled?.sections?.name || null,
    // The newest school year among the student's own active sections
    // ("2026-2027" sorts after "2025-2026"). Unknown stays null and the pill is hidden.
    schoolYear: graph.enrolments.map(e => e.sections?.school_year)
      .filter(year => typeof year === 'string' && year.trim())
      .sort().pop() || null,
  };

  // Already released-only by the query; the remaining filter just skips a
  // worksheet worth zero points, which would divide by zero. A released
  // row with a NULL score would read as 0% and drag the mean down.
  const released = graph.releasedScores
    .filter(s => s.score !== null && s.score !== undefined && Number(s.total_points) > 0);
  const performance = released.length === 0 ? null : {
    percent: Math.round(
      released.reduce((sum, s) => sum + (Number(s.score) / Number(s.total_points)) * 100, 0) / released.length
    ),
    count: released.length,
  };

  // Compared case-insensitively, identically to the student's Attendance tab.
  const attRows = graph.attendance;
  const presentCount = attRows.filter(r => String(r.status || '').toLowerCase() === 'present').length;
  const attendance = attRows.length === 0 ? null : {
    percent: Math.round((presentCount / attRows.length) * 100),
    present: presentCount,
    total: attRows.length,
  };

  // Pending: assigned, and no submission whose status is anything other
  // than 'in_progress'. A handout has nothing to submit, so it is never pending.
  const notPendingIds = new Set(
    graph.submissionStates.filter(s => s.status !== 'in_progress').map(s => s.worksheet_id)
  );

  const buckets = {};
  const bump = (key, dueAt, pending) => {
    if (!buckets[key]) buckets[key] = { total: 0, pendingCount: 0, nearestDue: null };
    buckets[key].total += 1;
    if (pending) {
      buckets[key].pendingCount += 1;
      if (dueAt && (!buckets[key].nearestDue || new Date(dueAt) < new Date(buckets[key].nearestDue))) {
        buckets[key].nearestDue = dueAt;
      }
    }
  };
  let pendingCount = 0;
  graph.assignees.forEach(a => {
    const sheet = graph.sheetById.get(a.task_id);
    if (!sheet) return; // task deleted out from under the assignment
    const pending = !notPendingIds.has(a.task_id) && !isHandout(sheet);
    if (pending) pendingCount += 1;
    // A task with no subject has no card; it is still counted above.
    if (!sheet.subject_id) return;
    bump(sheet.subject_id, a.due_at, pending);
  });

  return { info, performance, attendance, subjects: graph.subjects, tasksBySubject: buckets, pendingCount };
};
