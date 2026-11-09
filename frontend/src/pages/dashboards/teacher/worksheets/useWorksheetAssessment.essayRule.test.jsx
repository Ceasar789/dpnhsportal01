// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

// A tiny in-memory worksheet_items table: the replace function's rpc writes it, loadItems reads it back.
const db = vi.hoisted(() => ({ items: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    rpc: (name, params) => {
      db.rpc = { name, params };
      db.items = params.p_items.map((item, index) => ({ id: `new-${index + 1}`, position: index + 1, ...item }));
      return Promise.resolve({ data: { ok: true, worksheetId: params.p_worksheet_id, count: db.items.length }, error: null });
    },
    from: table => {
      const call = { op: 'select' };
      const query = {
        select: () => query, order: () => query, range: () => query, limit: () => query, eq: () => query,
        neq: () => query, in: () => query,
        insert: rows => { call.op = 'insert'; call.rows = rows; return query; },
        update: () => { call.op = 'update'; return query; },
        delete: () => { call.op = 'delete'; return query; },
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: (resolve, reject) => {
          let data = [];
          if (table === 'worksheet_items' && call.op === 'delete') db.items = [];
          if (table === 'worksheet_items' && call.op === 'insert') {
            data = call.rows.map(row => ({ id: `new-${row.position}`, ...row }));
            db.items = data;
          }
          if (table === 'worksheet_items' && call.op === 'select') data = db.items;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

afterEach(cleanup);

describe('essay rule columns', () => {
  it('saveItems sends them for an essay, null for others, and loadItems reads them back', async () => {
    const view = renderHook(() => useWorksheetAssessment(vi.fn()));
    await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
    const { saveItems, loadItems } = view.result.current;
    const result = await saveItems('w1', [
      { question: 'Pick', item_type: 'multiple_choice', options: ['A', 'B'], correct_answer: 'A', points: 1,
        essay_min_sentences: 9, essay_min_words: 9 },
      { question: 'Explain', item_type: 'essay', options: null, correct_answer: '', points: 3, essay_min_sentences: 3, essay_min_words: 50 },
      { question: 'Reflect', item_type: 'essay', options: null, correct_answer: '', points: 2 },
    ]);
    expect(result).toEqual({ ok: true });
    expect(db.rpc.name).toBe('eduscribe_worksheet_items_replace_v1');
    expect(db.rpc.params.p_items.map(row => [row.essay_min_sentences, row.essay_min_words])).toEqual([[null, null], [3, 50], [null, null]]);
    const loaded = await loadItems('w1');
    expect(loaded.items.map(item => [item.item_type, item.essay_min_sentences, item.essay_min_words])).toEqual([
      ['multiple_choice', null, null], ['essay', 3, 50], ['essay', null, null]]);
  });
});
