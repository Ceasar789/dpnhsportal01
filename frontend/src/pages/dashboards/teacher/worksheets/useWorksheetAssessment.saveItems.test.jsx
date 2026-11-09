// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

// rpc: the next response of supabase.rpc ({ data, error }), or 'throw'.
// writes: every non-select table call, which saveItems must never make.
const db = vi.hoisted(() => ({ rpc: null, rpcCalls: [], writes: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    rpc: (name, params) => {
      db.rpcCalls.push({ name, params });
      if (db.rpc === 'throw') return Promise.reject(new Error('Failed to fetch'));
      return Promise.resolve(db.rpc);
    },
    from: table => {
      const query = {
        select: () => query, order: () => query, range: () => query, limit: () => query,
        eq: () => query, neq: () => query, in: () => query,
        insert: () => { db.writes.push(`insert:${table}`); return query; },
        update: () => { db.writes.push(`update:${table}`); return query; },
        upsert: () => { db.writes.push(`upsert:${table}`); return query; },
        delete: () => { db.writes.push(`delete:${table}`); return query; },
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return query;
    },
  },
}));

const SAVE_FAILED = 'Your questions could not be saved. Keep this window open and press Save again.';
const DISTRIBUTED = 'This worksheet was already distributed. Its questions can no longer be changed.';
const ANSWERED = 'Students have already answered this worksheet. Its questions can no longer be changed.';
const OK = { data: { ok: true, worksheetId: 'w1', count: 2 }, error: null };
const ITEMS = [
  { question: 'Name the planet', item_type: 'multiple_choice', options: ['Mars', 'Venus'], correct_answer: 'Mars', points: 1 },
  { question: 'Explain why', item_type: 'essay', options: null, correct_answer: '', points: 3 },
];

let toast;
const mount = async () => {
  toast = vi.fn();
  const view = renderHook(() => useWorksheetAssessment(toast));
  await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
  db.writes = [];
  db.rpcCalls = [];
  return view.result.current;
};
const shownTexts = () => toast.mock.calls.map(args => String(args[0]));
const sent = () => db.rpcCalls[0].params.p_items;

beforeEach(() => { Object.assign(db, { rpc: OK, rpcCalls: [], writes: [] }); });
afterEach(() => cleanup());

describe('saveItems: one atomic call', () => {
  it('calls the replace function once with the worksheet id and items, and writes no table', async () => {
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: true });
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].name).toBe('eduscribe_worksheet_items_replace_v1');
    expect(Object.keys(db.rpcCalls[0].params).sort()).toEqual(['p_items', 'p_worksheet_id']);
    expect(db.rpcCalls[0].params.p_worksheet_id).toBe('w1');
    expect(db.writes).toEqual([]);
    expect(shownTexts()).toEqual(['Questions saved']);
  });

  it('zero questions sends an empty list', async () => {
    const { saveItems } = await mount();
    expect(await saveItems('w1', [])).toEqual({ ok: true });
    expect(sent()).toEqual([]);
    expect(db.writes).toEqual([]);
  });
});

describe('saveItems: the payload per question type', () => {
  it('builds each type exactly as the old writes stored it', async () => {
    const { saveItems } = await mount();
    await saveItems('w1', [
      { uid: 'u1', question: 'Pick', item_type: 'multiple_choice', options: ['A', '  ', 'B'], correct_answer: 'B', points: '2' },
      { uid: 'u2', question: 'True?', item_type: 'true_false', options: ['', '', '', ''], correct_answer: 'True', points: 1.5 },
      { question: 'Name it', item_type: 'identification', options: null, correct_answer: ['Mars', 'red planet'], points: 1 },
      { question: 'List them', item_type: 'enumeration', options: null, correct_answer: ['a', 'b'], points: 3 },
      { question: 'Explain', item_type: 'essay', options: null, correct_answer: '', points: 5, essay_min_sentences: 3, essay_min_words: 50 },
      { question: 'Reflect', item_type: 'essay', options: null, correct_answer: '', points: 4 },
    ]);
    expect(sent()).toEqual([
      { question: 'Pick', item_type: 'multiple_choice', options: ['A', 'B'], points: 2, correct_answer: 'B', essay_min_sentences: null, essay_min_words: null },
      { question: 'True?', item_type: 'true_false', options: null, points: 1.5, correct_answer: 'True', essay_min_sentences: null, essay_min_words: null },
      { question: 'Name it', item_type: 'identification', options: null, points: 1, correct_answer: ['Mars', 'red planet'], essay_min_sentences: null, essay_min_words: null },
      { question: 'List them', item_type: 'enumeration', options: null, points: 3, correct_answer: ['a', 'b'], essay_min_sentences: null, essay_min_words: null },
      { question: 'Explain', item_type: 'essay', options: null, points: 5, correct_answer: null, essay_min_sentences: 3, essay_min_words: 50 },
      { question: 'Reflect', item_type: 'essay', options: null, points: 4, correct_answer: null, essay_min_sentences: null, essay_min_words: null },
    ]);
  });

  it.each([['blank', ''], ['spaces', '  '], ['not a number', 'abc'], ['negative', -2], ['missing', undefined]])(
    'points that are %s become the number 1', async (_name, points) => {
      const { saveItems } = await mount();
      await saveItems('w1', [{ ...ITEMS[0], points }]);
      expect(sent()[0].points).toBe(1);
    });

  it('points are always sent as JSON numbers, a genuine 0 kept', async () => {
    const { saveItems } = await mount();
    await saveItems('w1', [{ ...ITEMS[0], points: '0' }, { ...ITEMS[0], points: '2.5' }]);
    expect(sent().map(item => item.points)).toEqual([0, 2.5]);
    expect(sent().every(item => typeof item.points === 'number')).toBe(true);
  });

  it('a non-essay drops any stray essay rule; a missing key is sent as null for the server to refuse', async () => {
    const { saveItems } = await mount();
    await saveItems('w1', [{ question: 'Q', item_type: 'identification', correct_answer: undefined, points: 1,
      essay_min_sentences: 3, essay_min_words: 9 }]);
    expect(sent()[0]).toMatchObject({ correct_answer: null, essay_min_sentences: null, essay_min_words: null });
  });
});

describe('saveItems: failures', () => {
  it.each([
    ['distributed', DISTRIBUTED],
    ['student_work_exists', ANSWERED],
    ['not_authenticated', SAVE_FAILED],
    ['not_found', SAVE_FAILED],
    ['invalid_items', SAVE_FAILED],
    ['duplicate key value violates unique constraint "worksheet_items_worksheet_id_position_key"', SAVE_FAILED],
    ['toString', SAVE_FAILED],
  ])('%s maps to its message', async (code, message) => {
    db.rpc = { data: null, error: { message: code } };
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message });
    expect(shownTexts()).not.toContain('Questions saved');
    expect(db.writes).toEqual([]);
  });

  it.each([
    ['a thrown call', 'throw'],
    ['no data', { data: null, error: null }],
    ['ok not true', { data: { ok: false }, error: null }],
  ])('%s gives the generic message', async (_name, response) => {
    db.rpc = response;
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message: SAVE_FAILED });
    expect(shownTexts()).not.toContain('Questions saved');
  });

  it('never shows database text, in the result or a toast', async () => {
    db.rpc = { data: null, error: { message: 'permission denied for table worksheet_items', details: 'x', hint: 'y' } };
    const { saveItems } = await mount();
    const result = await saveItems('w1', ITEMS);
    expect(result.message).toBe(SAVE_FAILED);
    expect(shownTexts().join(' ')).not.toMatch(/permission|worksheet_items/);
  });

  it('a failed save can be retried and then succeeds', async () => {
    db.rpc = { data: null, error: { message: 'invalid_items' } };
    const { saveItems } = await mount();
    expect((await saveItems('w1', ITEMS)).ok).toBe(false);
    db.rpc = OK;
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: true });
    expect(db.rpcCalls).toHaveLength(2);
    expect(db.rpcCalls[1].params).toEqual(db.rpcCalls[0].params);
  });
});
