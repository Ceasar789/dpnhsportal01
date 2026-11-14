// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/attachmentReviewRules.js
// File/link submissions, teacher side (S4): the pure rules of the review
// dialog. Statuses, filters and counts, search, score and feedback checks,
// the grade RPC's error messages, and the merge of the roster with the
// submissions and their attachments. An unsubmitted draft is never attached
// to a row, so it can never be shown or opened.
// ============================================

export const FEEDBACK_MAX = 2000;

export const STATUS_LABELS = {
  notSubmitted: 'Not submitted',
  turnedIn: 'Turned in',
  late: 'Late',
  graded: 'Graded',
  returned: 'Returned',
};

// One student's status from their submission (or none).
export const reviewStatus = (submission) => {
  if (!submission || submission.status === 'in_progress') return 'notSubmitted';
  if (submission.released === true) return 'returned';
  if (submission.status === 'checked') return 'graded';
  if (submission.status === 'submitted') return submission.is_late === true ? 'late' : 'turnedIn';
  return 'notSubmitted';
};

export const FILTERS = [
  ['all', 'All'], ['submitted', 'Submitted'], ['notSubmitted', 'Not submitted'], ['graded', 'Graded'], ['late', 'Late'],
];

// Submitted = turned in and waiting for a score; Graded = scored (returned or
// not); Late = turned in late, whatever happened next.
export const inFilter = (row, filter) => {
  const status = reviewStatus(row.submission);
  if (filter === 'submitted') return status === 'turnedIn' || status === 'late';
  if (filter === 'notSubmitted') return status === 'notSubmitted';
  if (filter === 'graded') return status === 'graded' || status === 'returned';
  if (filter === 'late') return status !== 'notSubmitted' && row.submission?.is_late === true;
  return true;
};

export const filterCounts = rows => Object.fromEntries(FILTERS.map(([key]) => [key, rows.filter(r => inFilter(r, key)).length]));

const fold = text => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const matchesSearch = (row, query) => !fold(query) || fold(row.name).includes(fold(query));

// The score as typed: 0 to max, at most 2 decimals.
export const scoreProblem = (text, max) => {
  const value = String(text ?? '').trim();
  const limit = `Enter a score from 0 to ${max} with at most 2 decimals.`;
  if (!value) return 'Enter a score.';
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value) || Number(value) > Number(max)) return limit;
  return null;
};

export const feedbackProblem = text => (String(text ?? '').length > FEEDBACK_MAX ? 'Keep the feedback to 2,000 characters.' : null);

// The feedback as the database keeps it: trimmed, and null when empty.
export const cleanFeedback = text => String(text ?? '').trim() || null;

// eduscribe_task_attachment_grade_v1 raises one of these codes. Database text is never shown.
export const GRADE_ERRORS = {
  not_authenticated: () => 'Your session has ended. Sign in again, then save the score.',
  not_found: () => 'This submission is no longer available to you. Refresh and try again.',
  not_attachment_task: () => 'This task no longer takes files or links. Refresh the page.',
  invalid_state: () => "This student's work is not turned in (they may have unsubmitted it). Refresh to see the latest.",
  invalid_score: max => `Enter a score from 0 to ${max} with at most 2 decimals.`,
  invalid_feedback: () => 'Keep the feedback to 2,000 characters.',
};
export const UNCONFIRMED = 'Could not confirm the save. Check the submission and try again.';
export const NETWORK = 'The score could not be saved. Check your connection and try again.';

export const gradeErrorMessage = (code, max) => (Object.prototype.hasOwnProperty.call(GRADE_ERRORS, code)
  ? GRADE_ERRORS[code](max) : UNCONFIRMED);

// Every assigned student once (plus anyone with a submission but no
// assignment row), with their submission and, only for work that was turned
// in, its attachment. Sorted by name; students with no known name last.
export const mergeRows = ({ roster = [], submissions = [], attachments = [], names = new Map() }) => {
  const byStudent = new Map();
  roster.forEach((r) => { if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, { student_id: r.student_id, section_id: r.section_id, submission: null }); });
  submissions.forEach((s) => {
    const row = byStudent.get(s.student_id) || { student_id: s.student_id, section_id: s.section_id };
    byStudent.set(s.student_id, { ...row, submission: s });
  });
  const attachmentBySubmission = new Map(attachments.map(a => [a.submission_id, a]));
  return [...byStudent.values()].map(row => ({
    ...row,
    name: names.get(row.student_id) || '—',
    attachment: reviewStatus(row.submission) === 'notSubmitted' ? null : attachmentBySubmission.get(row.submission.id) || null,
  })).sort((a, b) => (a.name === '—') - (b.name === '—') || a.name.localeCompare(b.name)
    || String(a.student_id).localeCompare(String(b.student_id)));
};
