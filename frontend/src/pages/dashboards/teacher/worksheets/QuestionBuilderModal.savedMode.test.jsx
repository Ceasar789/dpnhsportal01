// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import QuestionBuilderModal from './QuestionBuilderModal';

afterEach(cleanup);

const SAVE_FAILED = 'Your questions could not be saved. Keep this window open and press Save again.';
const mc = { id: 'i1', position: 1, question: 'Name the planet', item_type: 'multiple_choice', options: ['Mars', 'Venus'], points: 1 };
const essay = { id: 'i2', position: 2, question: 'Explain why', item_type: 'essay', options: null, points: 3 };

const show = async ({ items = [mc], mode = 'auto', saveItems = vi.fn(async () => ({ ok: true })), setCheckingMode = vi.fn(async () => true) } = {}) => {
  const onClose = vi.fn();
  const loadItems = vi.fn(async () => ({ items, keys: { i1: { correct_answer: 'Mars' } } }));
  render(<QuestionBuilderModal worksheet={{ id: 'w1', title: 'Conflict quiz', checking_mode: mode }}
    loadItems={loadItems} saveItems={saveItems} setCheckingMode={setCheckingMode} onClose={onClose} />);
  await screen.findByRole('button', { name: 'Save questions' });
  return { onClose, saveItems, setCheckingMode };
};
const auto = () => screen.getByRole('checkbox', { name: /Auto-check this worksheet/ });
const setType = (n, value) => fireEvent.change(screen.getByLabelText(`Question ${n} type`), { target: { value } });
const save = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save questions' })); }); };

describe('Auto-check toggle on a saved worksheet', () => {
  it('an essay turns Auto off and disables it, with the reason', async () => {
    await show({ items: [mc, essay] });
    expect(auto().checked).toBe(false);
    expect(auto().disabled).toBe(true);
    expect(screen.getByText('Essay questions are checked by you.')).toBeTruthy();
  });

  it('no questions turns Auto off and disables it, with the reason', async () => {
    await show({ items: [] });
    expect(auto().checked).toBe(false);
    expect(auto().disabled).toBe(true);
    expect(screen.getByText('Add questions first.')).toBeTruthy();
  });

  it('all objective questions keep the stored Auto', async () => {
    await show();
    expect(auto().checked).toBe(true);
    expect(auto().disabled).toBe(false);
  });

  it('adding an essay turns Auto off; removing it leaves Auto off but enabled', async () => {
    await show();
    setType(1, 'essay');
    expect(auto().checked).toBe(false);
    expect(auto().disabled).toBe(true);
    setType(1, 'multiple_choice');
    expect(auto().disabled).toBe(false);
    expect(auto().checked).toBe(false);
  });

  it('deleting the last question turns Auto off', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete question 1' }));
    expect(auto().checked).toBe(false);
    expect(auto().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Add question$/ }));
    expect(auto().disabled).toBe(false);
    expect(auto().checked).toBe(false);
  });

  it('a stored Auto with a loaded essay stays off after the essay is changed', async () => {
    await show({ items: [mc, essay] });
    setType(2, 'true_false');
    expect(auto().disabled).toBe(false);
    expect(auto().checked).toBe(false);
  });

  it('saving with an essay sends manual', async () => {
    const { setCheckingMode } = await show({ items: [mc, essay] });
    await save();
    expect(setCheckingMode).toHaveBeenCalledWith('w1', 'manual');
  });

  it('saving with no questions sends manual', async () => {
    const { setCheckingMode, saveItems } = await show({ items: [] });
    await save();
    expect(saveItems).toHaveBeenCalledWith('w1', []);
    expect(setCheckingMode).toHaveBeenCalledWith('w1', 'manual');
  });

  it('saving all objective questions with Auto kept on sends auto', async () => {
    const { setCheckingMode, onClose } = await show();
    await save();
    expect(setCheckingMode).toHaveBeenCalledWith('w1', 'auto');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('a failed save', () => {
  it('keeps the editor open with the same questions and the message', async () => {
    const { onClose } = await show({ saveItems: vi.fn(async () => ({ ok: false, message: SAVE_FAILED })) });
    await save();
    expect(screen.getByRole('alert').textContent).toBe(SAVE_FAILED);
    expect(screen.getByRole('dialog', { name: 'Questions — Conflict quiz' })).toBeTruthy();
    expect(screen.getByDisplayValue('Name the planet')).toBeTruthy();
    expect(screen.getByLabelText('Question 1 points').value).toBe('1');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Save again sends the same questions', async () => {
    const saveItems = vi.fn(async () => ({ ok: false, message: SAVE_FAILED }));
    await show({ saveItems });
    await save();
    saveItems.mockResolvedValueOnce({ ok: true });
    await save();
    expect(saveItems).toHaveBeenCalledTimes(2);
    expect(saveItems.mock.calls[1]).toEqual(saveItems.mock.calls[0]);
  });

  it('shows the count message and does not change the checking mode', async () => {
    const message = 'Your questions were saved, but the question count could not be updated. Press Save again.';
    const { setCheckingMode } = await show({ saveItems: vi.fn(async () => ({ ok: false, message })) });
    await save();
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(setCheckingMode).not.toHaveBeenCalled();
  });

  it('a save that returns nothing usable still shows the friendly message', async () => {
    await show({ saveItems: vi.fn(async () => false) });
    await save();
    expect(screen.getByRole('alert').textContent).toBe(SAVE_FAILED);
  });

  it('renders the message as plain text', async () => {
    await show({ saveItems: vi.fn(async () => ({ ok: false, message: 'Bad <b>save</b>' })) });
    await save();
    expect(screen.getByRole('alert').textContent).toBe('Bad <b>save</b>');
    expect(document.querySelector('[role="alert"] b')).toBeNull();
  });
});

describe('closing', () => {
  it('after a failed save, closing asks for confirmation with the failed-save message', async () => {
    const { onClose } = await show({ saveItems: vi.fn(async () => ({ ok: false, message: SAVE_FAILED })) });
    fireEvent.change(screen.getByDisplayValue('Name the planet'), { target: { value: 'Name the red planet' } });
    await save();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByText('Your last save failed. Close anyway and lose these questions?').length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('unsaved edits without a failed save get the usual question, not the failed-save one', async () => {
    const { onClose } = await show();
    fireEvent.change(screen.getByDisplayValue('Name the planet'), { target: { value: 'Name the red planet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Your last save failed/)).toBeNull();
    expect(screen.getAllByText('Discard unsaved changes?').length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('with nothing changed, closing needs no confirmation', async () => {
    const { onClose } = await show();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a successful save after a failure clears the failed-save state', async () => {
    const saveItems = vi.fn(async () => ({ ok: false, message: SAVE_FAILED }));
    const { onClose } = await show({ saveItems });
    await save();
    saveItems.mockResolvedValueOnce({ ok: true });
    await save();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('draft modes are unchanged', () => {
  it('a local draft with no questions keeps the toggle enabled and settable', async () => {
    const { createManualWorksheetDraft } = await import('./generatedDraftModel');
    const draft = createManualWorksheetDraft('teacher-1', '2030-2031');
    render(<QuestionBuilderModal worksheet={draft} draft={draft} onDraftChange={vi.fn()} onClose={vi.fn()}
      manualEligibility={{ subjects: [], loading: false, error: false, teacherId: 'teacher-1', schoolYear: '2030-2031' }} />);
    expect(auto().disabled).toBe(false);
    fireEvent.click(auto());
    expect(auto().checked).toBe(true);
    expect(screen.queryByText('Add questions first.')).toBeNull();
  });
});
