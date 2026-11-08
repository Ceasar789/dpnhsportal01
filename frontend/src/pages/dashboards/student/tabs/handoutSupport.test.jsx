// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const db = vi.hoisted(() => ({ selects: {} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from(table) {
    const query = {
      select(columns) { db.selects[table] = columns; return query; },
      eq() { return query; }, in() { return query; }, order() { return query; }, maybeSingle() { return query; },
      then(resolve) {
        const rows = table === 'task_assignees' ? [{ task_id: 'w1', section_id: 's1', due_at: null, assigned_at: null }]
          : table === 'worksheets' ? [{ id: 'w1', task_type: 'worksheet', items: 0, instructions: 'Read.' }] : [];
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return query;
  } },
}));

import { fetchStudentTaskGraph } from '../../../../lib/studentTaskGraph';
import StudentWorksheetHeader from './StudentWorksheetHeader';
import { isHandout } from './studentAnswers';

afterEach(() => cleanup());

describe('isHandout', () => {
  const sheet = { task_type: 'worksheet', items: 0, instructions: 'Read the story.' };

  it('is true only with all three conditions', () => {
    expect(isHandout(sheet)).toBe(true);
  });

  it.each([['quiz'], ['assignment'], ['project'], [undefined]])('task type %s is not a handout', (taskType) => {
    expect(isHandout({ ...sheet, task_type: taskType })).toBe(false);
  });

  it.each([[1], [null], [undefined], ['0'], [''], [NaN]])('item count %s is not a handout', (items) => {
    expect(isHandout({ ...sheet, items })).toBe(false);
  });

  it.each([[null], [undefined], [''], ['   '], [' \n '], [5]])('instructions %j are not a handout', (instructions) => {
    expect(isHandout({ ...sheet, instructions })).toBe(false);
  });

  it('a missing row is not a handout', () => {
    for (const value of [null, undefined]) expect(isHandout(value)).toBe(false);
  });
});

describe('student task graph', () => {
  it('reads the item count and instructions, and keeps them on the row', async () => {
    const graph = await fetchStudentTaskGraph('student-1');
    expect(db.selects.worksheets).toBe('id, title, subject, task_type, subject_id, items, instructions');
    expect(isHandout(graph.sheetById.get('w1'))).toBe(true);
  });
});

describe('StudentWorksheetHeader', () => {
  const props = { title: 'Conflict map', instructions: 'Read.', items: [{ points: 2 }] };

  it('shows WORKSHEET and the Score line by default', () => {
    render(<StudentWorksheetHeader {...props} />);
    expect(screen.getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
    expect(screen.getByText('Score:')).toBeTruthy();
    expect(screen.queryByText('ACTIVITY')).toBeNull();
  });

  it('a handout shows ACTIVITY and no Score line, and keeps the directions', () => {
    render(<StudentWorksheetHeader {...props} handout />);
    expect(screen.getByRole('heading', { name: 'ACTIVITY' })).toBeTruthy();
    expect(screen.queryByText('WORKSHEET')).toBeNull();
    expect(screen.queryByText('Score:')).toBeNull();
    expect(screen.getByText('Directions:')).toBeTruthy();
  });

  it('a normal task with a released score looks as before', () => {
    render(<StudentWorksheetHeader {...props} releasedScore={{ score: 8, total: 10 }} />);
    expect(screen.getByText('Score:').parentElement.textContent).toContain('8 / 10');
  });
});
