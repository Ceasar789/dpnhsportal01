// @vitest-environment jsdom
// 4f (R45 / R46): the builder shows the Auto-check explanation under the toggle, and the per-type
// choice is written only when VITE_AUTO_CHECK_TYPES_ENABLED is on (needs autorun/sql/4f).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ writes: [] }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from: table => ({
  update: values => ({ eq: async (column, id) => { h.writes.push({ table, values, column, id }); return { error: null }; } }),
}) } }));

import QuestionBuilderModal from './QuestionBuilderModal';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); h.writes = []; });
const mc = { id: 'i1', position: 1, question: 'Name the planet', item_type: 'multiple_choice', options: ['Mars', 'Venus'], points: 1 };
const show = async (mode = 'auto') => {
  const setCheckingMode = vi.fn(async () => true);
  render(<QuestionBuilderModal worksheet={{ id: 'w1', title: 'Quiz', checking_mode: mode }}
    loadItems={vi.fn(async () => ({ items: [mc], keys: { i1: { correct_answer: 'Mars' } } }))}
    saveItems={vi.fn(async () => ({ ok: true }))} setCheckingMode={setCheckingMode} onClose={vi.fn()} />);
  await screen.findByRole('button', { name: 'Save questions' });
  return { setCheckingMode };
};
const save = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save questions' })); }); };

describe('Auto-check panel in the question builder (4f)', () => {
  it('ON shows the rule-based explanation; switching OFF shows the manual explanation', async () => {
    await show('auto');
    expect(screen.getByRole('note', { name: 'Auto-check is on' }).textContent).toContain('Rule-based, no AI');
    fireEvent.click(screen.getByRole('checkbox', { name: /Auto-check this worksheet/ }));
    expect(screen.getByRole('note', { name: 'Auto-check is off' })).toBeTruthy();
  });
  it('flag off: saving writes no question-type list', async () => {
    const { setCheckingMode } = await show('auto');
    await save();
    expect(setCheckingMode).toHaveBeenCalledWith('w1', 'auto');
    expect(h.writes).toEqual([]);
  });
  it('flag on: an unticked type is saved with the checking mode', async () => {
    vi.stubEnv('VITE_AUTO_CHECK_TYPES_ENABLED', '1');
    await show('auto');
    fireEvent.click(screen.getByRole('checkbox', { name: 'True or false' }));
    await save();
    expect(h.writes).toEqual([{ table: 'worksheets', values: { auto_check_types: ['multiple_choice', 'identification'] }, column: 'id', id: 'w1' }]);
  });
});
