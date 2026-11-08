// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

// provisional: rows | 'error' | 'throw'. upsertError: the worksheet_answers upsert result.
const db = vi.hoisted(() => ({ calls: [], provisional: [], upsertError: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from: table => {
      const call = { table, op: 'select', eq: {} };
      const query = {
        select: () => query, order: () => query, range: () => query, limit: () => query, neq: () => query, in: () => query,
        eq: (column, value) => { call.eq[column] = value; return query; },
        upsert: (rows, options) => { call.op = 'upsert'; call.rows = rows; call.options = options; return query; },
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: (resolve, reject) => {
          db.calls.push(call);
          if (table === 'worksheet_provisional_marks') {
            if (db.provisional === 'throw') return Promise.reject(new Error('Failed to fetch')).then(resolve, reject);
            if (db.provisional === 'error') return Promise.resolve({ data: null, error: { message: 'denied' } }).then(resolve, reject);
            return Promise.resolve({ data: db.provisional, error: null }).then(resolve, reject);
          }
          if (table === 'worksheet_answers' && call.op === 'upsert') return Promise.resolve({ data: null, error: db.upsertError }).then(resolve, reject);
          if (table === 'worksheet_answers') {
            return Promise.resolve({ data: [{ item_id: 'i1', answer: 'A', points_earned: 2, is_correct: true },
              { item_id: 'i2', answer: 'Text', points_earned: null, is_correct: null }], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

let toast;
const mount = async () => {
  toast = vi.fn();
  const view = renderHook(() => useWorksheetAssessment(toast));
  await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
  db.calls = [];
  return view.result.current;
};

beforeEach(() => { Object.assign(db, { calls: [], provisional: [], upsertError: null }); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('loadAnswers and provisional marks', () => {
  it('reads the submission\'s provisional marks next to the answers', async () => {
    db.provisional = [{ item_id: 'i2', points: '5.00', is_correct: true }, { item_id: 'i3', points: 0, is_correct: false }];
    const { loadAnswers } = await mount();
    expect(await loadAnswers('s1')).toEqual({
      answers: { i1: 'A', i2: 'Text' }, prior: { i1: 2 },
      provisional: { i2: { points: 5, isCorrect: true }, i3: { points: 0, isCorrect: false } },
    });
    expect(db.calls.find(call => call.table === 'worksheet_provisional_marks').eq).toEqual({ submission_id: 's1' });
  });

  it.each(['error', 'throw'])('a provisional read that fails (%s) leaves none and keeps the answers', async (mode) => {
    db.provisional = mode;
    const { loadAnswers } = await mount();
    expect(await loadAnswers('s1')).toEqual({ answers: { i1: 'A', i2: 'Text' }, prior: { i1: 2 }, provisional: {} });
  });
});

describe('saveMarks', () => {
  it('upserts every mark in one call on (submission_id, item_id)', async () => {
    const { saveMarks } = await mount();
    expect(await saveMarks('s1', [{ item_id: 'i1', pointsEarned: 2, isCorrect: true }, { item_id: 'i2', pointsEarned: 0, isCorrect: false }])).toBe(true);
    const upserts = db.calls.filter(call => call.op === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('worksheet_answers');
    expect(upserts[0].options).toEqual({ onConflict: 'submission_id,item_id' });
    const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(upserts[0].rows).toEqual([
      { submission_id: 's1', item_id: 'i1', points_earned: 2, is_correct: true, updated_at: expect.stringMatching(ISO) },
      { submission_id: 's1', item_id: 'i2', points_earned: 0, is_correct: false, updated_at: expect.stringMatching(ISO) },
    ]);
    expect(toast).toHaveBeenCalledWith('Provisional marks saved');
  });

  it('a failed save returns false with an error toast', async () => {
    db.upsertError = { message: 'denied' };
    const { saveMarks } = await mount();
    expect(await saveMarks('s1', [{ item_id: 'i1', pointsEarned: 2, isCorrect: true }])).toBe(false);
    expect(toast).toHaveBeenCalledWith('Could not save the marks. Check your connection and try again.', 'error');
  });
});
