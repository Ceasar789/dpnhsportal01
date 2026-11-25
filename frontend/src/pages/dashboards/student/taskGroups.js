// Groups a student's tasks into To do / Upcoming / Done / Activities, and picks
// what the Overview "Due today / this week" card shows. Pure: no React, no
// Supabase. A row is { assignee, sheet, submission } as TasksTab builds it.
//
// Definitions (all in Manila time, whatever the browser's timezone):
//   due_at        TIMESTAMP WITHOUT TIME ZONE = Manila wall clock (manilaInstant).
//   today         the Manila calendar date of `now`.
//   overdue       not done, and the deadline instant is already past `now`
//                 (the same moment the countdown switches to "Late by …").
//   this week     today through the next 7 days: Manila dates today … today+7,
//                 both ends included. "Due today" is part of "this week".
//   Activities    handouts (isHandout): nothing to submit, never counted in
//                 To do / Upcoming / Done.
//   Done          submission status submitted or checked, or released.
//   To do         not done, and due today, overdue, or with no due date.
//   Upcoming      not done, and due after today.
import { manilaDateToday, manilaInstant, TASK_TYPE_LABELS } from '../../../lib/taskFormatting';
import { isAttachmentTask, isHandout } from './tabs/studentAnswers';

export const VIEWS = ['todo', 'upcoming', 'done', 'activities', 'all'];
export const VIEW_LABELS = { todo: 'To do', upcoming: 'Upcoming', done: 'Done', activities: 'Activities', all: 'All' };

const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (dateKey, days) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS)
  .toISOString().slice(0, 10);
// The Manila calendar date (YYYY-MM-DD) of an instant.
const manilaDay = instant => manilaDateToday(instant);
const time = value => manilaInstant(value)?.getTime() ?? null;

export const isDone = submission => Boolean(submission)
  && (submission.released === true || submission.status === 'submitted' || submission.status === 'checked');

export const groupOf = (row, now = new Date()) => {
  if (isHandout(row.sheet)) return 'activities';
  if (isDone(row.submission)) return 'done';
  const due = manilaInstant(row.assignee?.due_at);
  if (!due) return 'todo';
  return manilaDay(due) <= manilaDay(now) ? 'todo' : 'upcoming';
};

export const isOverdue = (row, now = new Date()) => {
  const group = groupOf(row, now);
  if (group !== 'todo') return false;
  const due = time(row.assignee?.due_at);
  return due !== null && due < new Date(now).getTime();
};

const newestAssignedFirst = (a, b) => (time(b.assignee?.assigned_at) ?? -Infinity) - (time(a.assignee?.assigned_at) ?? -Infinity);
// Soonest deadline first; no deadline last; ties by newest assigned.
const byDue = (a, b) => {
  const da = time(a.assignee?.due_at);
  const db = time(b.assignee?.due_at);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }
  return newestAssignedFirst(a, b);
};
// Most recently submitted first; a row with no submitted_at uses its assigned time.
const bySubmitted = (a, b) => {
  const ta = time(a.submission?.submitted_at) ?? time(a.assignee?.assigned_at) ?? -Infinity;
  const tb = time(b.submission?.submitted_at) ?? time(b.assignee?.assigned_at) ?? -Infinity;
  return tb - ta;
};

// { todo, upcoming, done, activities, all } of rows, each sorted. `all` and
// `activities` keep the incoming order (newest assignment first).
export const groupTasks = (rows, now = new Date()) => {
  const groups = { todo: [], upcoming: [], done: [], activities: [], all: [...rows] };
  rows.forEach(row => groups[groupOf(row, now)].push(row));
  groups.todo.sort(byDue);
  groups.upcoming.sort(byDue);
  groups.done.sort(bySubmitted);
  return groups;
};

// Q6 (4s): the student's Tasks views from the design (p9). The older groups
// above stay as they are (the Overview card and its tests use them).
//   Pending    not handed in (To do + Upcoming)
//   Submitted  handed in, score not released yet
//   Graded     score released
//   All        everything, handouts included
export const STUDENT_VIEWS = ['all', 'pending', 'submitted', 'graded'];
export const STUDENT_VIEW_LABELS = { all: 'All', pending: 'Pending', submitted: 'Submitted', graded: 'Graded' };
// Old ?view= values still land on the matching new view.
export const LEGACY_VIEWS = { todo: 'pending', upcoming: 'pending', done: 'submitted', activities: 'all' };
export const studentView = value => (STUDENT_VIEWS.includes(value) ? value : LEGACY_VIEWS[value] || 'all');

export const groupStudentViews = (rows, now = new Date()) => {
  const groups = groupTasks(rows, now);
  return {
    all: groups.all,
    pending: [...groups.todo, ...groups.upcoming].sort(byDue),
    submitted: groups.done.filter(row => row.submission?.released !== true),
    graded: groups.done.filter(row => row.submission?.released === true),
  };
};

// U-S3: the type a task shows on its badge (moved here from TasksTab so the
// filter and the badge can never disagree). A teacher Activity is stored as
// task_type 'worksheet' with no questions, or as an attachment worksheet.
export const taskTypeLabel = sheet => (isHandout(sheet) || (isAttachmentTask(sheet) && sheet?.task_type === 'worksheet')
  ? 'Activity' : (TASK_TYPE_LABELS[sheet?.task_type] || 'Task'));

// The types present in these rows, A-Z, with how many tasks each has.
export const taskTypeOptions = rows => [...rows.reduce((counts, row) => {
  const label = taskTypeLabel(row.sheet);
  return counts.set(label, (counts.get(label) || 0) + 1);
}, new Map())].sort((a, b) => a[0].localeCompare(b[0]));

// Missing (design p9): past due and never started. Overdue alone means past
// due and not handed in; late work is still accepted and flagged (Q9).
export const isMissing = (row, now = new Date()) => isOverdue(row, now) && !row.submission;

// The Overview card: how many unfinished tasks are due today and this week,
// and the first `limit` of this week's, soonest first.
export const dueSoon = (rows, now = new Date(), limit = 5) => {
  const today = manilaDay(now);
  const weekEnd = addDays(today, 7);
  const open = rows.filter(row => {
    const group = groupOf(row, now);
    return group === 'todo' || group === 'upcoming';
  });
  const dayOf = row => {
    const due = manilaInstant(row.assignee?.due_at);
    return due ? manilaDay(due) : null;
  };
  const week = open.filter(row => {
    const day = dayOf(row);
    return day !== null && day >= today && day <= weekEnd;
  }).sort(byDue);
  return {
    todayCount: week.filter(row => dayOf(row) === today).length,
    weekCount: week.length,
    items: week.slice(0, limit),
  };
};

// Rows in TasksTab's shape from the shared graph, for screens that do not
// build their own (Overview). Deleted tasks are skipped, as in TasksTab.
export const rowsFromGraph = graph => (graph?.assignees || []).map(assignee => {
  const sheet = graph.sheetById.get(assignee.task_id);
  if (!sheet) return null;
  const submission = graph.submissionStates.find(s => s.worksheet_id === sheet.id) || null;
  const subjectName = sheet.subject_id ? (graph.subjectsById.get(sheet.subject_id) || null) : null;
  return { assignee, sheet, submission, subjectName };
}).filter(Boolean);
