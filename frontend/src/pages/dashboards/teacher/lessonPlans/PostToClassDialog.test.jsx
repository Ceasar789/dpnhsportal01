// @vitest-environment jsdom
// R19 / R20 / R23 (4d, design p14): Post to class with All / Everyone except / Only ticked; writes only with the flag on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ upserts: [] }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from(table) {
  const rows = {
    schedules: [{ section_id: 'sec8' }],
    sections: [{ id: 'sec8', name: 'Rizal', grade_level: 'Grade 8' }],
    section_students: [{ student_id: 's1' }, { student_id: 's2' }],
    profiles: [{ id: 's1', name: 'Ana Cruz' }, { id: 's2', name: 'Ben Diaz' }],
  };
  const q = { select: () => q, eq: () => q, in: () => q,
    upsert: async (row, options) => { h.upserts.push({ table, row, options }); return { error: null }; },
    then: (ok, bad) => Promise.resolve({ data: rows[table] || [], error: null }).then(ok, bad) };
  return q;
} } }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }) }));

import PostToClassDialog from './PostToClassDialog';

beforeEach(() => { h.upserts = []; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const plan = { id: 'p1', title: 'States of Matter' };

const open = async (onPosted = vi.fn()) => {
  render(<PostToClassDialog plan={plan} teacherId="t1" onClose={vi.fn()} onPosted={onPosted} />);
  const select = await screen.findByRole('combobox');
  fireEvent.change(select, { target: { value: 'sec8' } });
  return onPosted;
};

describe('PostToClassDialog (4d)', () => {
  it('lists the teacher classes by grade and name', async () => {
    render(<PostToClassDialog plan={plan} teacherId="t1" onClose={vi.fn()} />);
    const select = await screen.findByRole('combobox');
    expect([...select.options].map(o => o.textContent)).toEqual(['Choose a class', 'Grade 8 · Rizal']);
  });
  it('Only ticked: the chosen student is posted, as one row per plan and class', async () => {
    vi.stubEnv('VITE_LESSON_PLAN_POSTING_ENABLED', '1');
    const onPosted = await open();
    fireEvent.click(screen.getByRole('radio', { name: 'Only ticked students' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Ben Diaz' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Post' })); });
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]).toMatchObject({ table: 'lesson_plan_posts', options: { onConflict: 'lesson_plan_id,section_id' },
      row: { lesson_plan_id: 'p1', teacher_id: 't1', section_id: 'sec8', audience: 'only', student_ids: ['s2'] } });
    expect(onPosted).toHaveBeenCalled();
  });
  it('Only ticked with nobody ticked says so and writes nothing', async () => {
    vi.stubEnv('VITE_LESSON_PLAN_POSTING_ENABLED', '1');
    await open();
    fireEvent.click(screen.getByRole('radio', { name: 'Only ticked students' }));
    await screen.findByRole('checkbox', { name: 'Ana Cruz' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Post' })); });
    expect(screen.getByRole('alert').textContent).toBe('Tick at least one student.');
    expect(h.upserts).toHaveLength(0);
  });
  it('flag off: nothing is written even if the dialog is reached', async () => {
    await open();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Post' })); });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Posting lesson plans is not available yet.'));
    expect(h.upserts).toHaveLength(0);
  });
  it('the Lesson Plans tab shows Post to class only with the flag on', async () => {
    const { readFileSync } = await import('node:fs');
    const tab = readFileSync('src/pages/dashboards/teacher/tabs/LessonPlansTab.jsx', 'utf8');
    expect(tab).toContain('{lessonPlanPostingFlagEnabled() && dayTaskEligible && <Btn variant="outline" onClick={() => setPostingPlan(plan)}>');
    expect(tab).toContain('{postingPlan && lessonPlanPostingFlagEnabled() && <PostToClassDialog');
  });
});
