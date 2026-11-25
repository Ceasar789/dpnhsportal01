// @vitest-environment jsdom
// U-PDF-T (design p15): Generate worksheet. Saved plans only, the plan's real
// days with their topics, Activity / Quiz / Assignment mapped onto the existing
// day-task request, no Subject or Class field, Quiz totals read-only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ request: vi.fn(), save: vi.fn() }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('./dayTaskClient', () => ({ requestDayTask: h.request, isCancelError: () => false }));
vi.mock('./dayTaskSave', () => ({ saveDayTaskDraft: h.save }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }) }));

import GenerateWorksheetDialog from './GenerateWorksheetDialog';

const T = 'teacher-1';
const days = `<div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span><table><tr>${
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => `<th>${d}</th>`).join('')}</tr><tr><td>Add fractions</td><td>Subtract fractions</td><td></td><td></td><td></td></tr></table></div></div>`;
const ROWS = [
  { id: 'p1', teacher_id: T, title: 'Fractions', subject: 'Mathematics', subject_id: 'math', grade_level: 'Grade 7', status: 'draft',
    ai_generated: true, objectives: days, updated_at: '2026-11-20T02:05:00Z' },
  { id: 'p2', teacher_id: T, title: 'Old plan', subject: 'Science', grade_level: 'Grade 8', status: 'archived', ai_generated: true, objectives: days },
];
const client = rows => ({ from: () => { const q = { select: () => q, eq: () => q, order: async () => ({ data: rows, error: null }) }; return q; } });
let props;
beforeEach(() => { h.request.mockReset(); h.save.mockReset(); });
afterEach(cleanup);
const show = async (rows = ROWS) => {
  props = { onClose: vi.fn(), onSaved: vi.fn(), onCreateManually: vi.fn() };
  render(<GenerateWorksheetDialog teacherId={T} client={client(rows)} {...props} />);
  await act(async () => {});
  return screen.getByRole('dialog', { name: 'Generate worksheet' });
};
const pickPlan = () => fireEvent.change(screen.getByLabelText('Lesson plan'), { target: { value: 'p1' } });

describe('Generate worksheet', () => {
  it('lists saved plans only and has no Subject or Class field', async () => {
    await show();
    const options = [...screen.getByLabelText('Lesson plan').querySelectorAll('option')].map(o => o.textContent);
    expect(options).toEqual(['Choose a saved lesson plan', 'Fractions · Mathematics · Grade 7']);
    expect(screen.queryByLabelText(/^Subject/)).toBeNull();
    expect(screen.queryByLabelText(/^Class/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create manually instead' })).toBeTruthy();
    expect(screen.getByText('Powered by Gemini')).toBeTruthy();
  });

  it('the days are the plan\'s real days with their topics; the Source card follows the choice', async () => {
    await show();
    pickPlan();
    const group = screen.getByRole('group', { name: 'Day' });
    expect(within(group).getAllByRole('radio').map(r => r.closest('label').textContent)).toEqual(['MondayAdd fractions', 'TuesdaySubtract fractions']);
    fireEvent.click(within(group).getByRole('radio', { name: /Tuesday/ }));
    const source = screen.getByRole('region', { name: 'Source lesson plan' });
    expect(source.textContent).toContain('Fractions');
    expect(source.textContent).toContain('Mathematics · Grade 7');
    expect(source.textContent).toContain('Saved');
    expect(source.textContent).toContain('Tuesday · Subtract fractions');
  });

  it('Activity, Quiz and Assignment replace the old Formative / Summative / Essay tiles', async () => {
    await show();
    const types = screen.getByRole('group', { name: 'Type of assessment' });
    expect(within(types).getAllByRole('radio').map(r => r.value)).toEqual(['activity', 'quiz', 'assignment']);
    expect(screen.queryByText('Formative')).toBeNull();
    expect(screen.queryByText('Summative')).toBeNull();
  });

  it('Quiz shows question-type counts, Total items and read-only Total points; sends the per-type counts', async () => {
    h.request.mockReturnValue(new Promise(() => {}));
    await show();
    pickPlan();
    fireEvent.click(screen.getByRole('radio', { name: /Monday/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Quiz/ }));
    fireEvent.change(screen.getByLabelText('Enumeration'), { target: { value: '2' } });
    const outputs = [...document.querySelectorAll('output')].map(o => o.textContent);
    expect(outputs).toEqual(['12', '14']);
    fireEvent.click(screen.getByRole('button', { name: 'Generate worksheet' }));
    expect(h.request.mock.calls[0][0]).toEqual({ lessonPlanId: 'p1', day: 'Monday', taskType: 'quiz', customized: true,
      typeCounts: { multiple_choice: 5, true_false: 3, identification: 2, enumeration: 2 } });
  });

  it('Activity sends no counts; Assignment sends its existing default count; no extra settings shown', async () => {
    h.request.mockReturnValue(new Promise(() => {}));
    await show();
    pickPlan();
    fireEvent.click(screen.getByRole('radio', { name: /Monday/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Activity/ }));
    expect(screen.queryByText('Question types')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Generate worksheet' }));
    expect(h.request.mock.calls[0][0]).toEqual({ lessonPlanId: 'p1', day: 'Monday', taskType: 'activity', customized: false });
    cleanup();
    await show();
    pickPlan();
    fireEvent.click(screen.getByRole('radio', { name: /Monday/ }));
    fireEvent.click(screen.getByRole('radio', { name: /^Assignment/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate worksheet' }));
    expect(h.request.mock.calls[1][0]).toEqual({ lessonPlanId: 'p1', day: 'Monday', taskType: 'assignment', customized: false, itemCount: 3 });
  });

  it('Generate is disabled until a plan, a day and a type are chosen; with no saved plan it says so', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'Generate worksheet' }).disabled).toBe(true);
    cleanup();
    await show([ROWS[1]]);
    expect(screen.getByText(/No saved lesson plans yet/)).toBeTruthy();
  });
});
