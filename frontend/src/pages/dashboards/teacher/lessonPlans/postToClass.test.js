// R19 / R20 / R23 (4d): what a post looks like, and that nothing is written while the flag is off.
import { describe, expect, it, vi } from 'vitest';
import { lessonPlanPostingFlagEnabled, postRow, savePost } from './postToClass';

const roster = [{ id: 's1', name: 'Ana' }, { id: 's2', name: 'Ben' }];
const base = { planId: 'p1', teacherId: 't1', sectionId: 'sec1', roster };

describe('postRow', () => {
  it('everyone: no student list', () => {
    expect(postRow({ ...base, audience: 'all', ticked: ['s1'] }).row)
      .toEqual({ lesson_plan_id: 'p1', teacher_id: 't1', section_id: 'sec1', audience: 'all', student_ids: [] });
  });
  it('except / only keep ticked students of THIS class only', () => {
    expect(postRow({ ...base, audience: 'except', ticked: ['s2', 'stranger', 's2'] }).row.student_ids).toEqual(['s2']);
    expect(postRow({ ...base, audience: 'only', ticked: ['s1'] }).row.audience).toBe('only');
  });
  it('says what is missing', () => {
    expect(postRow({ ...base, sectionId: '', audience: 'all' }).error).toBe('Choose a class.');
    expect(postRow({ ...base, audience: 'only', ticked: [] }).error).toBe('Tick at least one student.');
    expect(postRow({ ...base, audience: 'except', ticked: ['stranger'] }).error).toBe('Tick the students to leave out.');
    expect(postRow({ ...base, audience: 'some' }).error).toBe('Choose who the plan is for.');
  });
});

describe('savePost', () => {
  it('flag off: refuses and writes nothing', async () => {
    const from = vi.fn();
    expect(lessonPlanPostingFlagEnabled({})).toBe(false);
    expect((await savePost({ from }, { lesson_plan_id: 'p1' }, {})).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
  it('flag on: one upsert per plan and class (repost updates it)', async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    expect((await savePost({ from }, { lesson_plan_id: 'p1', section_id: 's' }, { VITE_LESSON_PLAN_POSTING_ENABLED: '1' })).ok).toBe(true);
    expect(from).toHaveBeenCalledWith('lesson_plan_posts');
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'lesson_plan_id,section_id' });
  });
});
