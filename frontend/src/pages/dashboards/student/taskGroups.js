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
import { manilaDateToday, manilaInstant } from '../../../lib/taskFormatting';
import { isHandout } from './tabs/studentAnswers';

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
