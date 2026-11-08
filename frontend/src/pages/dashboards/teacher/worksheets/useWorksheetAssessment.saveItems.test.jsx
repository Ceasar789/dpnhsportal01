// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

const db = vi.hoisted(() => ({ calls: [], fail: {}, seen: {}, finished: [], open: [], answers: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));

const RAW = { message: 'duplicate key value violates unique constraint "worksheet_items_worksheet_id_position_key"' };
// Each failure key is "op:table": a number fails that many calls in a row, a list fails those
// call numbers (1-based), and 'throw' throws once.
const respond = (call) => {
  const key = `${call.op}:${call.table}`;
  db.seen[key] = (db.seen[key] || 0) + 1;
  const mode = db.fail[key];
  if (mode === 'throw') { db.fail[key] = 0; throw new Error('Failed to fetch'); }
  if (Array.isArray(mode) ? mode.includes(db.seen[key]) : mode > 0) {
    if (!Array.isArray(mode)) db.fail[key] = mode - 1;
    return { data: null, error: RAW };
  }
  if (call.table === 'worksheet_submissions') return { data: call.neq ? db.finished : db.open, error: null };
  if (call.table === 'worksheet_answers') return { data: db.answers, error: null };
  if (key === 'insert:worksheet_items') return { data: call.rows.map(row => ({ id: `new-${row.position}`, position: row.position })), error: null };
  return { data: [], error: null };
};
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from: table => {
      const call = { table, op: 'select' };
      const query = {
        select: () => query, order: () => query, range: () => query, limit: () => query,
        eq: (column, value) => { call.eq = { ...call.eq, [column]: value }; return query; },
        neq: () => { call.neq = true; return query; },
        in: (column, values) => { call.in = values; return query; },
        insert: rows => { call.op = 'insert'; call.rows = rows; return query; },
        update: values => { call.op = 'update'; call.values = values; return query; },
        delete: () => { call.op = 'delete'; return query; },
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: (resolve, reject) => {
          db.calls.push(call);
          try { return Promise.resolve(respond(call)).then(resolve, reject); } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return query;
    },
  },
}));

const SAVE_FAILED = 'Your questions could not be saved. Keep this window open and press Save again.';
const COUNT_FAILED = 'Your questions were saved, but the question count could not be updated. Press Save again.';
const CHECK_FAILED = 'Could not check for existing answers — not saving.';
const ITEMS = [
  { question: 'Name the planet', item_type: 'multiple_choice', options: ['Mars', 'Venus'], correct_answer: 'Mars', points: 1 },
  { question: 'Explain why', item_type: 'essay', options: null, correct_answer: '', points: 3 },
];

let toast;
const mount = async () => {
  toast = vi.fn();
  const view = renderHook(() => useWorksheetAssessment(toast));
  await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
  db.calls = [];
  db.seen = {};
  return view.result.current;
};
const writes = () => db.calls.filter(call => call.op !== 'select').map(call => `${call.op}:${call.table}`);
const shownTexts = () => toast.mock.calls.map(args => String(args[0]));

beforeEach(() => { Object.assign(db, { calls: [], fail: {}, seen: {}, finished: [], open: [], answers: [] }); });
afterEach(() => cleanup());

describe('saveItems order and success', () => {
  it('deletes the old items, inserts the new items and keys, then updates the count', async () => {
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: true });
    expect(writes()).toEqual(['delete:worksheet_items', 'insert:worksheet_items', 'insert:worksheet_item_keys', 'update:worksheets']);
    const [, items, keys, count] = db.calls.filter(call => call.op !== 'select');
    expect(items.rows.map(row => row.position)).toEqual([1, 2]);
    expect(keys.rows).toEqual([{ item_id: 'new-1', correct_answer: 'Mars' }]);
    expect(count.values).toEqual({ items: 2 });
    expect(shownTexts()).toEqual(['Questions saved']);
  });

  it('zero questions clears the items and sets the count to 0', async () => {
    const { saveItems } = await mount();
    expect(await saveItems('w1', [])).toEqual({ ok: true });
    expect(writes()).toEqual(['delete:worksheet_items', 'update:worksheets']);
    expect(db.calls.at(-1).values).toEqual({ items: 0 });
  });
});

describe('refusals come first and write nothing', () => {
  it.each([
    ['a finished submission', () => { db.finished = [{ id: 's1', status: 'submitted' }]; }],
    ['a written answer', () => { db.open = [{ id: 's1' }]; db.answers = [{ id: 'a1' }]; }],
  ])('%s', async (_name, setup) => {
    setup();
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false,
      message: 'Students have already answered this worksheet. Its questions can no longer be changed.' });
    expect(writes()).toEqual([]);
  });

  it('a failed guard read refuses without writing', async () => {
    db.fail['select:worksheet_submissions'] = 1;
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message: CHECK_FAILED });
    expect(writes()).toEqual([]);
  });
});

describe('failures', () => {
  it('the old items cannot be deleted: nothing new is written', async () => {
    db.fail['delete:worksheet_items'] = 1;
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message: SAVE_FAILED });
    expect(writes()).toEqual(['delete:worksheet_items']);
  });

  it('the item insert fails after the delete: the truthful message, no keys, no count', async () => {
    db.fail['insert:worksheet_items'] = 1;
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message: SAVE_FAILED });
    expect(writes()).toEqual(['delete:worksheet_items', 'insert:worksheet_items']);
  });

  it.each([['succeeds', 0], ['also fails', 1]])('the key insert fails and the cleanup %s: the new items are removed', async (_name, cleanupFails) => {
    db.fail['insert:worksheet_item_keys'] = 1;
    if (cleanupFails) db.fail['delete:worksheet_items'] = [2];
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message: SAVE_FAILED });
    expect(writes()).toEqual(['delete:worksheet_items', 'insert:worksheet_items', 'insert:worksheet_item_keys', 'delete:worksheet_items']);
    expect(db.calls.at(-1).in).toEqual(['new-1', 'new-2']);
  });

  it('the count update fails twice: ok false with the count message', async () => {
    db.fail['update:worksheets'] = 2;
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: false, message: COUNT_FAILED });
    expect(writes().filter(w => w === 'update:worksheets')).toHaveLength(2);
    expect(shownTexts()).not.toContain('Questions saved');
  });

  it('the count update fails once, then succeeds: ok true', async () => {
    db.fail['update:worksheets'] = 1;
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: true });
    expect(writes().filter(w => w === 'update:worksheets')).toHaveLength(2);
  });

  it('a thrown count update is retried like an error', async () => {
    db.fail['update:worksheets'] = 'throw';
    const { saveItems } = await mount();
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: true });
  });

  it('zero questions with a failing count: ok false with the count message', async () => {
    db.fail['update:worksheets'] = 2;
    const { saveItems } = await mount();
    expect(await saveItems('w1', [])).toEqual({ ok: false, message: COUNT_FAILED });
  });

  it('after a count failure the next save works normally', async () => {
    db.fail['update:worksheets'] = 2;
    const { saveItems } = await mount();
    expect((await saveItems('w1', ITEMS)).ok).toBe(false);
    db.calls = [];
    expect(await saveItems('w1', ITEMS)).toEqual({ ok: true });
    expect(writes()).toEqual(['delete:worksheet_items', 'insert:worksheet_items', 'insert:worksheet_item_keys', 'update:worksheets']);
  });

  it('never shows the database text', async () => {
    const { saveItems } = await mount();
    for (const key of ['delete:worksheet_items', 'insert:worksheet_items', 'insert:worksheet_item_keys']) {
      db.fail = { [key]: 1 };
      const result = await saveItems('w1', ITEMS);
      expect(result.message).not.toMatch(/duplicate key|constraint/);
    }
    expect(shownTexts().join(' ')).not.toMatch(/duplicate key|constraint/);
  });
});
