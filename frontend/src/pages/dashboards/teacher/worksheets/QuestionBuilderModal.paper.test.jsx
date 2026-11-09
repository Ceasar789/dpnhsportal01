// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import QuestionBuilderModal from './QuestionBuilderModal';

afterEach(cleanup);

const HELPER = 'If the answer meets this, it gets full points as a PROVISIONAL mark. You still confirm it before the score is released.';
const ITEMS = [
  { id: 'i1', position: 1, question: 'Pick the planet', item_type: 'multiple_choice', options: ['Mars', 'Venus'], points: 1 },
  { id: 'i2', position: 2, question: 'Mars is red', item_type: 'true_false', options: null, points: 1 },
  { id: 'i3', position: 3, question: 'Name it', item_type: 'identification', options: null, points: 1 },
  { id: 'i4', position: 4, question: 'List two', item_type: 'enumeration', options: null, points: 2 },
  { id: 'i5', position: 5, question: 'Explain', item_type: 'essay', options: null, points: 5, essay_min_sentences: 3 },
];
const KEYS = { i1: { correct_answer: 'Mars' }, i2: { correct_answer: 'True' }, i3: { correct_answer: ['Mars'] }, i4: { correct_answer: ['a', 'b'] } };

const show = async ({ items = ITEMS } = {}) => {
  const onClose = vi.fn();
  const saveItems = vi.fn(async () => ({ ok: true }));
  render(<QuestionBuilderModal worksheet={{ id: 'w1', title: 'Paper quiz', checking_mode: 'manual' }}
    loadItems={vi.fn(async () => ({ items, keys: KEYS }))} saveItems={saveItems}
    setCheckingMode={vi.fn(async () => true)} onClose={onClose} />);
  await screen.findByRole('button', { name: 'Save questions' });
  return { onClose, saveItems };
};
const card = n => screen.getByRole('group', { name: `Question ${n}` });
const keyArea = n => screen.getByRole('group', { name: `Question ${n} answer key` });

describe('saved-mode Questions editor as a paper', () => {
  it('shows the worksheet title on the paper, with the Auto-check toggle above it', async () => {
    await show();
    const paper = screen.getByRole('region', { name: 'Question paper' });
    expect(within(paper).getByRole('heading', { name: 'Paper quiz' })).toBeTruthy();
    const toggle = screen.getByRole('checkbox', { name: /Auto-check this worksheet/ });
    expect(paper.contains(toggle)).toBe(false);
    expect(toggle.compareDocumentPosition(paper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Questions — Paper quiz' })).toBeTruthy();
  });

  it('every question card shows its number and has its own answer-key box', async () => {
    await show();
    ITEMS.forEach((_item, index) => {
      const n = index + 1;
      expect(card(n).querySelector('.qb-paper-number').textContent).toBe(`${n}.`);
      expect(card(n).contains(keyArea(n))).toBe(true);
      expect(within(card(n)).getByLabelText(`Question ${n} text`)).toBeTruthy();
      expect(within(card(n)).getByLabelText(`Question ${n} type`)).toBeTruthy();
      expect(within(card(n)).getByLabelText(`Question ${n} points`)).toBeTruthy();
      expect(within(card(n)).getByRole('button', { name: `Delete question ${n}` })).toBeTruthy();
    });
  });

  it('the key controls sit inside the answer-key box; the question and choices stay on the paper line', async () => {
    await show();
    expect(within(keyArea(1)).getByLabelText('Question 1 correct choice')).toBeTruthy();
    expect(within(keyArea(1)).queryByLabelText('Question 1 choice 1')).toBeNull();
    expect(within(card(1)).getByLabelText('Question 1 choice 1')).toBeTruthy();
    expect(within(keyArea(1)).queryByLabelText('Question 1 text')).toBeNull();
    expect(within(keyArea(2)).getByLabelText('Question 2 correct answer')).toBeTruthy();
    expect(within(keyArea(3)).getByLabelText('Question 3 accepted answers')).toBeTruthy();
    expect(within(keyArea(4)).getByLabelText('Question 4 accepted answers')).toBeTruthy();
    expect(within(keyArea(5)).getByLabelText('Question 5 minimum sentences').value).toBe('3');
    expect(within(keyArea(5)).getByLabelText('Question 5 minimum words')).toBeTruthy();
    expect(within(keyArea(5)).getByText(HELPER)).toBeTruthy();
  });

  it('adds no text a test could match twice', async () => {
    await show();
    expect(screen.getAllByText(HELPER)).toHaveLength(1);
    expect(screen.getAllByText('Paper quiz')).toHaveLength(1);
    // The big numbers are decoration: one each, hidden from assistive technology.
    expect(screen.getAllByText('1.')).toHaveLength(1);
    expect(screen.getByText('1.').getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryAllByText(/Answer key/)).toHaveLength(ITEMS.length);
    screen.queryAllByText(/Answer key/).forEach(label => expect(label.getAttribute('aria-hidden')).toBe('true'));
  });

  it('Add, Delete, Save and Cancel still work', async () => {
    const { saveItems, onClose } = await show();
    fireEvent.click(screen.getByRole('button', { name: /^Add question$/ }));
    expect(card(6)).toBeTruthy();
    expect(within(card(6)).getByRole('group', { name: 'Question 6 answer key' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete question 6' }));
    expect(screen.queryByRole('group', { name: 'Question 6' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save questions' })); });
    expect(saveItems).toHaveBeenCalledTimes(1);
    expect(saveItems.mock.calls[0][1]).toHaveLength(5);
    expect(onClose).toHaveBeenCalled();
    cleanup();
    const second = await show();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(second.onClose).toHaveBeenCalled();
  });

  it('a validation error is still shown as an alert', async () => {
    const { saveItems } = await show();
    fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: '  ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save questions' })); });
    expect(screen.getByRole('alert').textContent).toBe('Question 1 has no text.');
    expect(saveItems).not.toHaveBeenCalled();
  });
});
