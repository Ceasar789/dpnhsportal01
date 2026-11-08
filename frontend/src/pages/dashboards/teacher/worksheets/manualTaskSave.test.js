import { describe, expect, it, vi } from 'vitest';
import { buildManualTaskRow, saveManualTask } from './manualTaskSave';

vi.mock('../../../../config/supabase', () => ({ supabase: {} }));

const base = { teacherId: 'teacher-1', title: '  Conflict quiz  ', directions: 'Answer every question.',
  subject: { id: 'english', name: 'English' }, gradeLevel: 'Grade 7' };
const fakeClient = (result) => {
  const calls = [];
  return { calls, from: table => ({ insert: rows => { calls.push({ table, rows });
    return { select: () => ({ single: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)) }) }; } }) };
};
const FAILED = 'The worksheet could not be created. Check your worksheet list, then try again.';

describe('the row written for each type', () => {
  it.each([
    ['activity', 'auto', 'worksheet', 'manual'],
    ['quiz', 'auto', 'quiz', 'auto'],
    ['quiz', 'manual', 'quiz', 'manual'],
    ['assignment', 'auto', 'assignment', 'manual'],
  ])('%s with %s asked', (taskType, checkingMode, storedType, storedMode) => {
    const row = buildManualTaskRow({ ...base, taskType, checkingMode });
    expect(row).toEqual({ teacher_id: 'teacher-1', title: 'Conflict quiz', task_type: storedType,
      instructions: 'Answer every question.', items: 0, origin: 'manual', source_lesson_plan_id: null, collection_id: null,
      checking_mode: storedMode, status: 'Draft', subject: 'English', subject_id: 'english', grade_level: 'Grade 7',
      created_at: expect.any(String) });
    expect(Number.isNaN(Date.parse(row.created_at))).toBe(false);
  });

  it('stores blank directions as null for a Quiz or Assignment', () => {
    for (const taskType of ['quiz', 'assignment']) {
      expect(buildManualTaskRow({ ...base, taskType, directions: '   ' }).instructions).toBeNull();
    }
  });

  it.each([
    ['an Activity without directions', { taskType: 'activity', directions: '  \n ' }],
    ['a blank title', { taskType: 'quiz', title: '   ' }],
    ['a title over 150 characters', { taskType: 'quiz', title: 'x'.repeat(151) }],
    ['directions over 2,000 characters', { taskType: 'quiz', directions: 'x'.repeat(2001) }],
    ['an unknown type', { taskType: 'bogus' }],
    ['no teacher', { taskType: 'quiz', teacherId: '' }],
    ['no subject', { taskType: 'quiz', subject: null }],
    ['no grade', { taskType: 'quiz', gradeLevel: '' }],
  ])('refuses %s', (_name, change) => {
    expect(buildManualTaskRow({ ...base, ...change })).toBeNull();
  });

  it('accepts a title of exactly 150 characters', () => {
    expect(buildManualTaskRow({ ...base, taskType: 'quiz', title: 'x'.repeat(150) }).title).toHaveLength(150);
  });
});

describe('saveManualTask', () => {
  it('inserts one row and returns it', async () => {
    const client = fakeClient({ data: { id: 'new-1', title: 'Conflict quiz' }, error: null });
    expect(await saveManualTask({ ...base, taskType: 'quiz', checkingMode: 'auto' }, { client }))
      .toEqual({ ok: true, row: { id: 'new-1', title: 'Conflict quiz' } });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].table).toBe('worksheets');
    expect(client.calls[0].rows).toHaveLength(1);
  });

  it('a refused insert returns a friendly message, never the database text', async () => {
    const client = fakeClient({ data: null, error: { message: 'new row violates row-level security policy' } });
    const result = await saveManualTask({ ...base, taskType: 'quiz' }, { client });
    expect(result).toEqual({ ok: false, message: FAILED });
  });

  it('a network failure or a missing id also returns the friendly message', async () => {
    expect(await saveManualTask({ ...base, taskType: 'quiz' }, { client: fakeClient(new Error('Failed to fetch')) }))
      .toEqual({ ok: false, message: FAILED });
    expect(await saveManualTask({ ...base, taskType: 'quiz' }, { client: fakeClient({ data: {}, error: null }) }))
      .toEqual({ ok: false, message: FAILED });
  });

  it('an invalid task writes nothing', async () => {
    const client = fakeClient({ data: { id: 'x' }, error: null });
    expect((await saveManualTask({ ...base, taskType: 'activity', directions: '' }, { client })).ok).toBe(false);
    expect(client.calls).toHaveLength(0);
  });
});
