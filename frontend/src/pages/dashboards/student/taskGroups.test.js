import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dueSoon, groupOf, groupTasks, isDone, isOverdue, rowsFromGraph } from './taskGroups';

const quiz = (id, extra = {}) => ({ id, title: id, task_type: 'quiz', items: 5, instructions: 'Answer.', subject_id: 'sub', ...extra });
const row = (id, { due = null, assigned = null, submission = null, sheet = {} } = {}) => ({
  assignee: { task_id: id, section_id: 's', due_at: due, assigned_at: assigned },
  sheet: quiz(id, sheet),
  submission,
});
const activity = id => row(id, { sheet: { task_type: 'worksheet', items: 0, instructions: 'Do this.' }, due: '2030-03-13T08:00:00' });
// 10:00 AM on Wed 13 Mar 2030 in Manila.
const NOW = new Date('2030-03-13T02:00:00Z');

let tz;
beforeEach(() => { tz = globalThis.process.env.TZ; globalThis.process.env.TZ = 'America/New_York'; });
afterEach(() => { if (tz === undefined) delete globalThis.process.env.TZ; else globalThis.process.env.TZ = tz; });

describe('groupOf', () => {
  it('a task due later today is To do and not overdue', () => {
    const r = row('a', { due: '2030-03-13T23:59:00' });
    expect(groupOf(r, NOW)).toBe('todo');
    expect(isOverdue(r, NOW)).toBe(false);
  });

  it('a task whose deadline passed is To do and overdue', () => {
    const r = row('a', { due: '2030-03-13T08:00:00' });
    expect(groupOf(r, NOW)).toBe('todo');
    expect(isOverdue(r, NOW)).toBe(true);
    expect(isOverdue(row('b', { due: '2030-03-01T08:00:00' }), NOW)).toBe(true);
  });

  it('no due date is To do and never overdue', () => {
    expect(groupOf(row('a'), NOW)).toBe('todo');
    expect(isOverdue(row('a'), NOW)).toBe(false);
  });

  it('due tomorrow is Upcoming', () => {
    expect(groupOf(row('a', { due: '2030-03-14T00:00:00' }), NOW)).toBe('upcoming');
  });

  it('switches at Manila midnight, not at the browser midnight', () => {
    const r = row('a', { due: '2030-03-14T00:00:00' });
    expect(groupOf(r, new Date('2030-03-13T15:59:59Z'))).toBe('upcoming'); // 11:59:59 PM Mar 13 Manila
    expect(groupOf(r, new Date('2030-03-13T16:00:00Z'))).toBe('todo'); // 12:00 AM Mar 14 Manila
  });

  it('an Activity is its own group, even when overdue', () => {
    expect(groupOf(activity('h'), NOW)).toBe('activities');
    expect(isOverdue(activity('h'), NOW)).toBe(false);
  });

  it('submitted, checked or released is Done; in progress is not', () => {
    expect(isDone({ status: 'submitted' })).toBe(true);
    expect(isDone({ status: 'checked' })).toBe(true);
    expect(isDone({ status: 'in_progress', released: true })).toBe(true);
    expect(isDone({ status: 'in_progress', released: false })).toBe(false);
    expect(isDone(null)).toBe(false);
    const overdueDone = row('a', { due: '2030-03-01T08:00:00', submission: { status: 'submitted' } });
    expect(groupOf(overdueDone, NOW)).toBe('done');
    expect(isOverdue(overdueDone, NOW)).toBe(false);
    expect(groupOf(row('b', { due: '2030-03-20T08:00:00', submission: { status: 'in_progress' } }), NOW)).toBe('upcoming');
  });
});

describe('groupTasks sorting', () => {
  it('To do and Upcoming by due date, no due date last, then newest assigned', () => {
    const rows = [
      row('none-old', { assigned: '2030-03-01T00:00:00Z' }),
      row('later', { due: '2030-03-13T20:00:00' }),
      row('none-new', { assigned: '2030-03-10T00:00:00Z' }),
      row('overdue', { due: '2030-03-12T08:00:00' }),
      row('week2', { due: '2030-03-25T08:00:00' }),
      row('week1', { due: '2030-03-15T08:00:00' }),
    ];
    const groups = groupTasks(rows, NOW);
    expect(groups.todo.map(r => r.sheet.id)).toEqual(['overdue', 'later', 'none-new', 'none-old']);
    expect(groups.upcoming.map(r => r.sheet.id)).toEqual(['week1', 'week2']);
    expect(groups.all.map(r => r.sheet.id)).toEqual(rows.map(r => r.sheet.id));
  });

  it('Done by submitted_at, newest first, falling back to newest assigned', () => {
    const rows = [
      row('old', { submission: { status: 'submitted', submitted_at: '2030-03-01T00:00:00Z' } }),
      row('fallback', { assigned: '2030-03-05T00:00:00Z', submission: { status: 'checked', released: true } }),
      row('new', { submission: { status: 'submitted', submitted_at: '2030-03-10T00:00:00Z' } }),
    ];
    expect(groupTasks(rows, NOW).done.map(r => r.sheet.id)).toEqual(['new', 'fallback', 'old']);
  });

  it('Activities stay out of the other groups', () => {
    const groups = groupTasks([activity('h'), row('a')], NOW);
    expect(groups.activities.map(r => r.sheet.id)).toEqual(['h']);
    expect(groups.todo.map(r => r.sheet.id)).toEqual(['a']);
    expect(groups.all).toHaveLength(2);
  });
});

describe('dueSoon', () => {
  it('counts today and today through the next 7 Manila days, unfinished only', () => {
    const rows = [
      row('today', { due: '2030-03-13T23:59:00' }),
      row('today-past', { due: '2030-03-13T08:00:00' }),
      row('yesterday', { due: '2030-03-12T23:59:00' }),
      row('edge-in', { due: '2030-03-20T23:59:00' }),
      row('edge-out', { due: '2030-03-21T00:00:00' }),
      row('done', { due: '2030-03-14T08:00:00', submission: { status: 'submitted' } }),
      row('none'),
      activity('h'),
    ];
    const soon = dueSoon(rows, NOW);
    expect(soon.todayCount).toBe(2);
    expect(soon.weekCount).toBe(3);
    expect(soon.items.map(r => r.sheet.id)).toEqual(['today-past', 'today', 'edge-in']);
  });

  it('lists at most five, soonest first', () => {
    const rows = [1, 2, 3, 4, 5, 6].map(day => row(`d${day}`, { due: `2030-03-${String(13 + day).padStart(2, '0')}T08:00:00` })).reverse();
    const soon = dueSoon(rows, NOW);
    expect(soon.weekCount).toBe(6);
    expect(soon.items.map(r => r.sheet.id)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
  });
});

describe('rowsFromGraph', () => {
  it('joins sheets, submissions and subject names, and skips deleted tasks', () => {
    const graph = {
      assignees: [{ task_id: 'a', due_at: null }, { task_id: 'gone', due_at: null }],
      sheetById: new Map([['a', quiz('a')]]),
      submissionStates: [{ worksheet_id: 'a', status: 'submitted' }],
      subjectsById: new Map([['sub', 'English']]),
    };
    const rows = rowsFromGraph(graph);
    expect(rows).toHaveLength(1);
    expect(rows[0].subjectName).toBe('English');
    expect(rows[0].submission.status).toBe('submitted');
  });
});
