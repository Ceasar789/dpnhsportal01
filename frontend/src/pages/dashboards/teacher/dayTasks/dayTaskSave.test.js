import { describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from: mock.from } }));

import { checkItem } from '../../../../lib/worksheetChecking';
import { TASK_TYPES } from '../../../../lib/taskFormatting';
import { saveDayTaskDraft } from './dayTaskSave';

const teacherId = 'teacher-1';
const plan = { id: 'plan-1', title: 'Cells', subject: 'Science', grade_level: 'Grade 7', subject_id: 'subject-1' };
const INVALID = 'This draft could not be saved. Nothing was saved.';
const PARTIAL = 'Partially saved — please delete the draft in Worksheets and try again';

const base = (extra = {}) => ({ status: 'generated-day-task', saved: false, taskType: 'quiz', day: 'Tuesday',
  sourceLessonPlan: { id: 'plan-1', title: 'Cells' }, title: 'AI title', instructions: 'Answer every item.',
  questions: [], answerKey: [], activity: null, providerCalls: 1, ...extra });
const quiz = (extra = {}) => base({ questions: [
  { localId: 'draft-1', question: 'Which controls the cell?', item_type: 'multiple_choice', options: ['Nucleus', 'Wall', 'Vacuole', 'Ribosome'], points: 1 },
  { localId: 'draft-2', question: 'Cells are alive.', item_type: 'true_false', options: [], points: 1 },
  { localId: 'draft-3', question: 'Name the powerhouse.', item_type: 'identification', options: [], points: 1 },
  { localId: 'draft-4', question: 'List two cell types.', item_type: 'enumeration', options: [], points: 2,
    enumeration: { alternatives: [], orderSensitive: false } },
], answerKey: [
  { localId: 'draft-1', correct_answer: 'Nucleus' }, { localId: 'draft-2', correct_answer: 'False' },
  { localId: 'draft-3', correct_answer: 'mitochondrion, mitochondria' }, { localId: 'draft-4', correct_answer: 'plant, animal' },
], ...extra });
const assignment = () => base({ taskType: 'assignment', questions: [
  { localId: 'draft-1', question: 'Explain why cells divide.', item_type: 'essay', options: [], points: 5,
    essay: { referenceAnswer: 'SECRET-REFERENCE', minWords: 30, maxWords: 60,
      rubric: [{ criterion: 'SECRET-RUBRIC', points: 5 }] } },
  { localId: 'draft-2', question: 'Describe a cell.', item_type: 'essay', options: [], points: 5,
    essay: { referenceAnswer: 'SECRET-REFERENCE', minWords: 30, maxWords: 60,
      rubric: [{ criterion: 'SECRET-RUBRIC', points: 5 }] } },
] });
const activity = () => base({ taskType: 'activity', instructions: 'Objective: Describe cells.',
  activity: { language: 'en', title: 'Cell map' } });

// Records every write. `fail` names the step that returns an error.
function fakeClient({ fail = {}, deleted, shortInsert = false, rejectItems = false } = {}) {
  const calls = [];
  const result = value => ({ then: (done, failed) => Promise.resolve(value).then(done, failed) });
  const client = { from(table) {
    return {
      insert(rows) {
        calls.push({ table, op: 'insert', rows });
        if (table === 'worksheets') return { select: () => ({ single: async () => (fail.worksheet
          ? { data: null, error: { message: 'RAW-DB-TEXT' } } : { data: { id: 'worksheet-1' }, error: null }) }) };
        if (table === 'worksheet_items') return { select: async () => {
          if (rejectItems) throw new Error('RAW-DB-TEXT');
          if (fail.items) return { data: null, error: { message: 'RAW-DB-TEXT' } };
          const data = rows.map(row => ({ id: `item-${row.position}`, position: row.position }));
          return { data: shortInsert ? data.slice(1) : [...data].reverse(), error: null };
        } };
        return result({ error: fail.keys ? { message: 'RAW-DB-TEXT' } : null });
      },
      delete() {
        const filters = [];
        calls.push({ table, op: 'delete', filters });
        const chain = {
          eq(column, value) { filters.push([column, value]); return chain; },
          select: async () => (fail.cleanup ? { data: null, error: { message: 'RAW-DB-TEXT' } }
            : { data: deleted ?? [{ id: 'worksheet-1' }], error: null }),
        };
        return chain;
      },
    };
  } };
  const writes = (table, op = 'insert') => calls.filter(call => call.table === table && call.op === op);
  return { client, calls, writes };
}

const save = (fake, extra = {}) => saveDayTaskDraft({ plan, result: quiz(), day: 'Tuesday', taskType: 'quiz', teacherId, client: fake.client, ...extra });
const savedQuiz = async () => {
  const fake = fakeClient();
  await save(fake);
  const items = fake.writes('worksheet_items')[0].rows;
  const keys = fake.writes('worksheet_item_keys')[0].rows;
  return { items, keys, pair: (position) => {
    const item = items[position - 1];
    return [item, keys.find(key => key.item_id === `item-${position}`)];
  } };
};

describe('saveDayTaskDraft activity', () => {
  it('writes one worksheet row and nothing else', async () => {
    const fake = fakeClient();
    const saved = await save(fake, { result: activity(), taskType: 'activity' });
    expect(saved).toEqual({ worksheetId: 'worksheet-1', itemCount: 0 });
    expect(fake.calls).toHaveLength(1);
    const [row] = fake.writes('worksheets')[0].rows;
    expect(row.task_type).toBe('worksheet');
    expect(row.instructions).toBe('Objective: Describe cells.');
    expect(row.checking_mode).toBe('manual');
    expect(row.items).toBe(0);
    expect(TASK_TYPES).toContain(row.task_type);
  });
});

describe('saveDayTaskDraft worksheet row', () => {
  it('sets ownership, draft state, source, day, and mode', async () => {
    const fake = fakeClient();
    await save(fake);
    expect(fake.writes('worksheets')[0].rows).toEqual([{ teacher_id: teacherId, title: 'Cells - Tuesday Quiz', description: null,
      items: 4, status: 'Draft', task_type: 'quiz', origin: 'manual', source_lesson_plan_id: 'plan-1', day_of_week: 2,
      instructions: 'Answer every item.', checking_mode: 'auto', subject: 'Science', grade_level: 'Grade 7', subject_id: 'subject-1' }]);
  });

  it('maps Monday to 1 and Friday to 5', async () => {
    for (const [day, expected] of [['Monday', 1], ['Friday', 5]]) {
      const fake = fakeClient();
      await save(fake, { day, result: quiz({ day }) });
      expect(fake.writes('worksheets')[0].rows[0].day_of_week).toBe(expected);
    }
  });

  it('uses null for a day it cannot map, and leaves it out of the title', async () => {
    const fake = fakeClient();
    await save(fake, { day: 'Saturday', result: quiz({ day: 'Saturday' }) });
    const [row] = fake.writes('worksheets')[0].rows;
    expect(row.day_of_week).toBeNull();
    expect(row.title).toBe('Cells - Quiz');
  });

  it('omits undefined or null plan fields from the payload', async () => {
    const fake = fakeClient();
    await save(fake, { plan: { id: 'plan-1', title: 'Cells', grade_level: null } });
    const [row] = fake.writes('worksheets')[0].rows;
    for (const field of ['subject', 'grade_level', 'subject_id']) expect(Object.hasOwn(row, field)).toBe(false);
  });

  it('keeps titles within 150 characters without losing the day and type', async () => {
    const fake = fakeClient();
    await save(fake, { plan: { ...plan, title: 'x'.repeat(400) }, result: quiz() });
    const { title } = fake.writes('worksheets')[0].rows[0];
    expect(title).toHaveLength(150);
    expect(title.endsWith(' - Tuesday Quiz')).toBe(true);
  });

  it('uses the app client by default', async () => {
    const fake = fakeClient();
    mock.from.mockImplementation(fake.client.from);
    await saveDayTaskDraft({ plan, result: activity(), day: 'Tuesday', taskType: 'activity', teacherId });
    expect(mock.from).toHaveBeenCalledWith('worksheets');
  });
});

describe('saveDayTaskDraft quiz rows', () => {
  it('writes items in order with the builder shape', async () => {
    const { items } = await savedQuiz();
    expect(items).toEqual([
      { worksheet_id: 'worksheet-1', position: 1, question: 'Which controls the cell?', item_type: 'multiple_choice',
        options: ['Nucleus', 'Wall', 'Vacuole', 'Ribosome'], points: 1 },
      { worksheet_id: 'worksheet-1', position: 2, question: 'Cells are alive.', item_type: 'true_false', options: null, points: 1 },
      { worksheet_id: 'worksheet-1', position: 3, question: 'Name the powerhouse.', item_type: 'identification', options: null, points: 1 },
      { worksheet_id: 'worksheet-1', position: 4, question: 'List two cell types.', item_type: 'enumeration', options: null, points: 2 },
    ]);
  });

  it('links keys by position even when rows return out of order', async () => {
    const { keys } = await savedQuiz();
    expect([...keys].sort((a, b) => a.item_id.localeCompare(b.item_id))).toEqual([
      { item_id: 'item-1', correct_answer: 'Nucleus' },
      { item_id: 'item-2', correct_answer: 'False' },
      { item_id: 'item-3', correct_answer: ['mitochondrion', 'mitochondria'] },
      { item_id: 'item-4', correct_answer: ['plant', 'animal'] },
    ]);
  });

  it('cleans a key that is already a list', async () => {
    const fake = fakeClient();
    const result = quiz();
    result.answerKey[2].correct_answer = [' mitochondrion ', '', 'mitochondria'];
    await save(fake, { result });
    expect(fake.writes('worksheet_item_keys')[0].rows.find(key => key.item_id === 'item-3').correct_answer)
      .toEqual(['mitochondrion', 'mitochondria']);
  });

  it('returns the item count', async () => {
    await expect(save(fakeClient())).resolves.toEqual({ worksheetId: 'worksheet-1', itemCount: 4 });
  });
});

describe('saved keys score correctly through the real checkItem', () => {
  it('multiple choice', async () => {
    const [item, key] = (await savedQuiz()).pair(1);
    expect(checkItem(item, key, 'Nucleus')).toEqual({ isCorrect: true, pointsEarned: 1 });
    expect(checkItem(item, key, 'Wall')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('true or false', async () => {
    const [item, key] = (await savedQuiz()).pair(2);
    expect(checkItem(item, key, 'False')).toEqual({ isCorrect: true, pointsEarned: 1 });
    expect(checkItem(item, key, 'True')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('identification accepts any one listed answer', async () => {
    const [item, key] = (await savedQuiz()).pair(3);
    expect(checkItem(item, key, 'mitochondrion')).toEqual({ isCorrect: true, pointsEarned: 1 });
    expect(checkItem(item, key, 'Mitochondria')).toEqual({ isCorrect: true, pointsEarned: 1 });
    expect(checkItem(item, key, 'nucleus')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('enumeration needs all items and gives partial credit', async () => {
    const [item, key] = (await savedQuiz()).pair(4);
    expect(checkItem(item, key, ['animal', 'plant'])).toEqual({ isCorrect: true, pointsEarned: 2 });
    expect(checkItem(item, key, ['plant'])).toEqual({ isCorrect: false, pointsEarned: 1 });
  });
});

describe('saveDayTaskDraft assignment', () => {
  it('writes essays with points, no keys, and no reference or rubric anywhere', async () => {
    const fake = fakeClient();
    const saved = await save(fake, { result: assignment(), taskType: 'assignment' });
    expect(saved.itemCount).toBe(2);
    const rows = fake.writes('worksheet_items')[0].rows;
    expect(rows.map(row => [row.item_type, row.points, row.options])).toEqual([['essay', 5, null], ['essay', 5, null]]);
    expect(fake.writes('worksheet_item_keys')).toHaveLength(0);
    expect(fake.writes('worksheets')[0].rows[0]).toMatchObject({ task_type: 'assignment', checking_mode: 'manual', items: 2 });
    expect(JSON.stringify(fake.calls)).not.toMatch(/SECRET-|referenceAnswer|rubric/);
  });

  it('a saved essay stays unscored for the teacher', async () => {
    const fake = fakeClient();
    await save(fake, { result: assignment(), taskType: 'assignment' });
    expect(checkItem(fake.writes('worksheet_items')[0].rows[0], undefined, 'An answer')).toEqual({ isCorrect: null, pointsEarned: null });
  });
});

describe('saveDayTaskDraft validation makes no database call', () => {
  const rejected = async (extra) => {
    const fake = fakeClient();
    await expect(save(fake, extra)).rejects.toThrow(INVALID);
    expect(fake.calls).toHaveLength(0);
  };

  it('needs a teacher id', async () => {
    for (const value of [undefined, null, '']) await rejected({ teacherId: value });
  });

  it('needs a plan id and title', async () => {
    await rejected({ plan: { title: 'Cells' } });
    await rejected({ plan: { id: 'plan-1' } });
    await rejected({ plan: undefined });
  });

  it('needs a known task type matching the result', async () => {
    await rejected({ taskType: 'exam' });
    await rejected({ taskType: 'assignment' });
    await rejected({ day: 'Monday' });
  });

  it('needs a generated, unsaved result with instructions', async () => {
    await rejected({ result: undefined });
    await rejected({ result: quiz({ status: 'other' }) });
    await rejected({ result: quiz({ saved: true }) });
    await rejected({ result: quiz({ instructions: ' ' }) });
    await rejected({ result: quiz({ questions: 'x' }) });
    await rejected({ result: quiz({ answerKey: undefined }) });
  });

  it('rejects empty or wrong question sets', async () => {
    await rejected({ result: quiz({ questions: [] }) });
    await rejected({ result: { ...activity(), questions: quiz().questions }, taskType: 'activity' });
    await rejected({ result: quiz({ questions: [assignment().questions[0]] }) });
    await rejected({ result: { ...assignment(), questions: [quiz().questions[1]] }, taskType: 'assignment' });
    await rejected({ result: quiz({ questions: [{ ...quiz().questions[1], question: '' }] }) });
    await rejected({ result: quiz({ questions: [null] }) });
  });

  it('rejects unusable keys rather than saving an unscorable item', async () => {
    const withKey = (index, correct_answer) => {
      const result = quiz();
      result.answerKey[index].correct_answer = correct_answer;
      return result;
    };
    await rejected({ result: withKey(0, 'Golgi') });
    await rejected({ result: withKey(1, 'true') });
    await rejected({ result: withKey(2, ' , ') });
    await rejected({ result: withKey(3, undefined) });
    await rejected({ result: quiz({ answerKey: quiz().answerKey.slice(1) }) });
  });

  it('handles being called with nothing', async () => {
    await expect(saveDayTaskDraft()).rejects.toThrow(INVALID);
  });
});

describe('saveDayTaskDraft failures', () => {
  const REMOVED = 'The draft could not be saved, and the incomplete copy was removed. Try again.';
  const cleanupCall = fake => fake.writes('worksheets', 'delete');

  it('a failed worksheet insert stops there with a safe message', async () => {
    const fake = fakeClient({ fail: { worksheet: true } });
    const error = await save(fake).catch(value => value);
    expect(error.message).toBe('The draft could not be saved. Check Worksheets before trying again.');
    expect(fake.calls).toHaveLength(1);
  });

  it('a failed items insert deletes the owned worksheet row', async () => {
    const fake = fakeClient({ fail: { items: true } });
    await expect(save(fake)).rejects.toThrow(REMOVED);
    expect(cleanupCall(fake)).toHaveLength(1);
    expect(cleanupCall(fake)[0].filters).toEqual([['id', 'worksheet-1'], ['teacher_id', teacherId]]);
    expect(fake.writes('worksheet_items', 'delete')).toHaveLength(0);
    expect(fake.writes('worksheet_item_keys')).toHaveLength(0);
  });

  it('a failed keys insert also deletes the worksheet row', async () => {
    const fake = fakeClient({ fail: { keys: true } });
    await expect(save(fake)).rejects.toThrow(REMOVED);
    expect(cleanupCall(fake)).toHaveLength(1);
  });

  it('a rejected call or a short insert also cleans up', async () => {
    for (const options of [{ rejectItems: true }, { shortInsert: true }]) {
      const fake = fakeClient(options);
      await expect(save(fake)).rejects.toThrow(REMOVED);
      expect(cleanupCall(fake)).toHaveLength(1);
    }
  });

  it('a failed cleanup carries the worksheet id and the fixed message', async () => {
    const fake = fakeClient({ fail: { items: true, cleanup: true } });
    const error = await save(fake).catch(value => value);
    expect(error.message).toBe(PARTIAL);
    expect(error.worksheetId).toBe('worksheet-1');
  });

  it('a delete that removes no row counts as a failed cleanup', async () => {
    const fake = fakeClient({ fail: { keys: true }, deleted: [] });
    const error = await save(fake).catch(value => value);
    expect(error.message).toBe(PARTIAL);
    expect(error.worksheetId).toBe('worksheet-1');
  });

  it('never exposes database text or logs content', async () => {
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const failure = vi.spyOn(console, 'error');
    for (const fail of [{ worksheet: true }, { items: true }, { keys: true }, { items: true, cleanup: true }]) {
      const error = await save(fakeClient({ fail })).catch(value => value);
      expect(error.message).not.toContain('RAW-DB-TEXT');
    }
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
