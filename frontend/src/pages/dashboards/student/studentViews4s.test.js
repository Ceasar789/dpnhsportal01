// 4s (Q6, design p9): All / Pending / Submitted / Graded, plus the Missing rule.
import { describe, expect, it } from 'vitest';
import { groupStudentViews, isMissing, isOverdue, LEGACY_VIEWS, STUDENT_VIEW_LABELS, STUDENT_VIEWS, studentView } from './taskGroups';

const NOW = new Date('2026-11-24T02:00:00Z'); // 10:00 Manila
const row = (id, { due = null, submission = null, items = 3 } = {}) => ({
  assignee: { task_id: id, due_at: due, assigned_at: '2026-11-20T08:00:00' },
  sheet: { id, task_type: 'quiz', items, instructions: 'x' }, submission,
});
const ROWS = [
  row('late', { due: '2026-11-23T23:59:00' }),
  row('started-late', { due: '2026-11-23T23:59:00', submission: { status: 'in_progress', released: false } }),
  row('soon', { due: '2026-11-30T23:59:00' }),
  row('sent', { submission: { status: 'submitted', released: false } }),
  row('scored', { submission: { status: 'checked', released: true } }),
];
const ids = list => list.map(r => r.sheet.id);

describe('student views', () => {
  it('labels and order are the design set', () => {
    expect(STUDENT_VIEWS.map(v => STUDENT_VIEW_LABELS[v])).toEqual(['All', 'Pending', 'Submitted', 'Graded']);
  });
  it('groups: pending = not handed in (soonest first), submitted = waiting, graded = released', () => {
    const g = groupStudentViews(ROWS, NOW);
    expect(ids(g.all)).toHaveLength(5);
    expect(ids(g.pending)).toEqual(['late', 'started-late', 'soon']);
    expect(ids(g.submitted)).toEqual(['sent']);
    expect(ids(g.graded)).toEqual(['scored']);
  });
  it('Missing = past due and never started; Overdue also covers work in progress', () => {
    const [late, startedLate, soon] = ROWS;
    expect([isMissing(late, NOW), isOverdue(late, NOW)]).toEqual([true, true]);
    expect([isMissing(startedLate, NOW), isOverdue(startedLate, NOW)]).toEqual([false, true]);
    expect([isMissing(soon, NOW), isOverdue(soon, NOW)]).toEqual([false, false]);
    expect(isMissing(ROWS[3], NOW)).toBe(false);
  });
  it('old ?view= values map to the new views; unknown values open All', () => {
    expect(Object.fromEntries(Object.keys(LEGACY_VIEWS).map(v => [v, studentView(v)])))
      .toEqual({ todo: 'pending', upcoming: 'pending', done: 'submitted', activities: 'all' });
    expect(studentView('graded')).toBe('graded');
    expect(studentView(null)).toBe('all');
    expect(studentView('nonsense')).toBe('all');
  });
});
