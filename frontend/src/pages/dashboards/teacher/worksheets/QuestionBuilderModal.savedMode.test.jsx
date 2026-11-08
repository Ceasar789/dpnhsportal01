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
  it('an essay keeps a stored Auto, enabled, with the provisional-mark note', async () => {
    await show({ items: [mc, essay] });
    expect(auto().checked).toBe(true);
    expect(auto().disabled).toBe(false);
    expect(screen.queryByText('Essay questions are checked by you.')).toBeNull();
    expect(screen.getByText('Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.')).toBeTruthy();
  });

  it('a Quiz stored as Auto with no questions opens with Auto ticked and enabled', async () => {
    await show({ items: [] });
    expect(auto().checked).toBe(true);
    expect(auto().disabled).toBe(false);
    expect(screen.queryByText('Add questions first.')).toBeNull();
    expect(screen.queryByText('Essay questions are checked by you.')).toBeNull();
  });

  it('all objective questions keep the stored Auto', async () => {
    await show();
    expect(auto().checked).toBe(true);
    expect(auto().disabled).toBe(false);
  });

  it('adding an essay keeps Auto on and shows the note; removing it hides the note', async () => {
    await show();
    setType(1, 'essay');
    expect(auto().checked).toBe(true);
    expect(auto().disabled).toBe(false);
    expect(screen.getByText('Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.')).toBeTruthy();
    setType(1, 'multiple_choice');
    expect(auto().checked).toBe(true);
    expect(screen.queryByText('Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.')).toBeNull();
  });

  it("deleting the last question keeps the teacher's Auto", async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete question 1' }));
    expect(auto().checked).toBe(true);
    expect(auto().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Add question$/ }));
    expect(auto().checked).toBe(true);
  });

  it('deleting the essay keeps Auto as it was', async () => {
    await show({ items: [mc, essay] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete question 2' }));
    expect(auto().disabled).toBe(false);
    expect(auto().checked).toBe(true);
  });

  it('an essay worksheet stored as Auto does not count as changed on open', async () => {
    const { onClose } = await show({ items: [mc, essay] });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  });

  it('a stored Auto with a loaded essay stays on after the essay is changed', async () => {
    await show({ items: [mc, essay] });
    setType(2, 'true_false');
    expect(auto().disabled).toBe(false);
    expect(auto().checked).toBe(true);
  });

  it('saving with an essay sends the teacher\'s mode as it is', async () => {
    const { setCheckingMode } = await show({ items: [mc, essay] });
    await save();
    expect(setCheckingMode).toHaveBeenCalledWith('w1', 'auto');
  });

  it("saving with no questions sends the teacher's mode as it is", async () => {
    const { setCheckingMode, saveItems } = await show({ items: [] });
    await save();
    expect(saveItems).toHaveBeenCalledWith('w1', []);
    expect(setCheckingMode).toHaveBeenCalledWith('w1', 'auto');
    cleanup();
    const manual = await show({ items: [], mode: 'manual' });
    await save();
    expect(manual.setCheckingMode).toHaveBeenCalledWith('w1', 'manual');
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

describe('essay minimum sentences and words', () => {
  const minSentences = n => screen.queryByLabelText(`Question ${n} minimum sentences`);
  const minWords = n => screen.queryByLabelText(`Question ${n} minimum words`);
  const HELPER = 'If the answer meets this, it gets full points as a PROVISIONAL mark. You still confirm it before the score is released.';

  it('show only for an essay, with the helper line', async () => {
    await show({ items: [mc, essay] });
    expect(minSentences(1)).toBeNull();
    expect(minWords(1)).toBeNull();
    expect(minSentences(2)).toBeTruthy();
    expect(minWords(2)).toBeTruthy();
    expect(screen.getAllByText(HELPER)).toHaveLength(1);
    setType(2, 'identification');
    expect(minSentences(2)).toBeNull();
    setType(1, 'essay');
    expect(minSentences(1)).toBeTruthy();
  });

  it('load the stored values and send them back as numbers, null for others', async () => {
    const { saveItems } = await show({ items: [mc, { ...essay, essay_min_sentences: 3, essay_min_words: 50 }] });
    expect(minSentences(2).value).toBe('3');
    expect(minWords(2).value).toBe('50');
    fireEvent.change(minWords(2), { target: { value: '80' } });
    await save();
    const sent = saveItems.mock.calls[0][1];
    expect(sent[0]).toMatchObject({ essay_min_sentences: null, essay_min_words: null });
    expect(sent[1]).toMatchObject({ essay_min_sentences: 3, essay_min_words: 80 });
  });

  it('empty means no rule and sends null', async () => {
    const { saveItems } = await show({ items: [mc, essay] });
    await save();
    expect(saveItems.mock.calls[0][1][1]).toMatchObject({ essay_min_sentences: null, essay_min_words: null });
  });

  it.each([
    ['sentences', '0', 'Question 2: minimum sentences must be a whole number from 1 to 50, or empty.'],
    ['sentences', '51', 'Question 2: minimum sentences must be a whole number from 1 to 50, or empty.'],
    ['words', '2.5', 'Question 2: minimum words must be a whole number from 1 to 2000, or empty.'],
    ['words', '2001', 'Question 2: minimum words must be a whole number from 1 to 2000, or empty.'],
  ])('an invalid %s value %j blocks save with a message', async (field, value, message) => {
    const { saveItems, setCheckingMode } = await show({ items: [mc, essay] });
    fireEvent.change(screen.getByLabelText(`Question 2 minimum ${field}`), { target: { value } });
    await save();
    expect(saveItems).not.toHaveBeenCalled();
    expect(setCheckingMode).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeTruthy();
  });

  it('an invalid value on a question changed away from essay is ignored', async () => {
    const { saveItems } = await show({ items: [mc, { ...essay, essay_min_sentences: 3, essay_min_words: 50 }] });
    fireEvent.change(minSentences(2), { target: { value: '0' } });
    setType(2, 'identification');
    fireEvent.change(screen.getByLabelText('Question 2 accepted answers'), { target: { value: 'x' } });
    await save();
    expect(saveItems.mock.calls[0][1][1]).toMatchObject({ essay_min_sentences: null, essay_min_words: null });
  });

  it('the provisional note is not shown with Manual', async () => {
    await show({ items: [mc, essay], mode: 'manual' });
    expect(screen.queryByText('Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.')).toBeNull();
    fireEvent.click(auto());
    expect(screen.getByText('Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.')).toBeTruthy();
  });
});
