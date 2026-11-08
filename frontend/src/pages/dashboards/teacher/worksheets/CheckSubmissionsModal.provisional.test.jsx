// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import CheckSubmissionsModal from './CheckSubmissionsModal';

afterEach(cleanup);

const items = [
  { id: 'i1', position: 1, question: 'Pick A', item_type: 'multiple_choice', options: ['A', 'B'], points: 2 },
  { id: 'i2', position: 2, question: 'Explain why', item_type: 'essay', options: null, points: 5 },
];
const keys = { i1: { correct_answer: 'A' } };
const answers = { i1: 'A', i2: 'One. Two. Three.' };
const PROVISIONAL = { i1: { points: 2, isCorrect: true }, i2: { points: 5, isCorrect: true } };
const subs = [{ id: 's1', name: 'Ana Cruz', status: 'submitted', released: false }];

const open = async ({ loaded = { answers, prior: {}, provisional: PROVISIONAL }, saveMarks = vi.fn(async () => true),
  releaseScore = vi.fn(async () => true), itemList = items } = {}) => {
  render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal
    worksheet={{ id: 'w1', title: 'Unit quiz', checking_mode: 'auto' }}
    loadItems={vi.fn(async () => ({ items: itemList, keys }))} loadSubmissions={vi.fn(async () => subs)}
    loadAnswers={vi.fn(async () => loaded)} saveMarks={saveMarks} releaseScore={releaseScore} onClose={vi.fn()} />
  </ThemeContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Check' }, { timeout: 4000 }));
  await screen.findByText(/^Reviewed score:/);
  return { saveMarks, releaseScore };
};
const card = question => screen.getByRole('heading', { name: new RegExp(question) }).closest('section');
const score = n => screen.getByLabelText(`Score for question ${n}`);
const accept = () => screen.queryByRole('button', { name: 'Accept provisional marks' });
const approve = () => screen.getByRole('button', { name: 'Approve review locally' });
const releaseButton = () => screen.getByRole('button', { name: 'Release result' });
const NEED = /provisional marks? must be accepted or changed before this can be released/;

describe('provisional marks in Check Submissions', () => {
  it('pre-fill items with no saved mark, tagged "Auto (provisional)"', async () => {
    await open();
    expect(score(1).value).toBe('2');
    expect(score(2).value).toBe('5');
    expect(within(card('Pick A')).getByText('Auto (provisional)')).toBeTruthy();
    expect(within(card('Explain why')).getByText('Auto (provisional)')).toBeTruthy();
    expect(screen.getByText('Reviewed score: 7 / 7')).toBeTruthy();
  });

  it('a saved mark wins over the provisional one and carries no provisional tag', async () => {
    await open({ loaded: { answers, prior: { i2: 3 }, provisional: PROVISIONAL } });
    expect(score(2).value).toBe('3');
    expect(within(card('Explain why')).queryByText(/Auto \(provisional\)/)).toBeNull();
    expect(within(card('Pick A')).getByText('Auto (provisional)')).toBeTruthy();
    expect(screen.getByText('1 provisional mark must be accepted or changed before this can be released.')).toBeTruthy();
  });

  it('Release is blocked until the provisional marks are saved', async () => {
    const { releaseScore } = await open();
    expect(screen.getByText('2 provisional marks must be accepted or changed before this can be released.')).toBeTruthy();
    expect(approve().disabled).toBe(true);
    expect(releaseButton().disabled).toBe(true);
    fireEvent.click(releaseButton());
    expect(releaseScore).not.toHaveBeenCalled();
  });

  it('Accept provisional marks saves exactly the provisional values in one call, then Release works', async () => {
    const { saveMarks, releaseScore } = await open({ loaded: { answers, prior: {},
      provisional: { i1: { points: 2, isCorrect: true }, i2: { points: 0, isCorrect: false } } } });
    await act(async () => { fireEvent.click(accept()); });
    expect(saveMarks).toHaveBeenCalledTimes(1);
    expect(saveMarks).toHaveBeenCalledWith('s1', [
      { item_id: 'i1', pointsEarned: 2, isCorrect: true },
      { item_id: 'i2', pointsEarned: 0, isCorrect: false },
    ]);
    expect(accept()).toBeNull();
    expect(screen.queryByText(NEED)).toBeNull();
    expect(screen.getAllByText('Auto (provisional) — accepted')).toHaveLength(2);
    fireEvent.click(approve());
    await act(async () => { fireEvent.click(releaseButton()); });
    expect(releaseScore).toHaveBeenCalledWith('s1', 'w1', 2, 7, [
      { item_id: 'i1', isCorrect: true, pointsEarned: 2 }, { item_id: 'i2', isCorrect: null, pointsEarned: 0 }]);
  });

  it('a failed save keeps the marks provisional and Release blocked', async () => {
    await open({ saveMarks: vi.fn(async () => false) });
    await act(async () => { fireEvent.click(accept()); });
    expect(accept()).toBeTruthy();
    expect(screen.getByText(NEED)).toBeTruthy();
    expect(releaseButton().disabled).toBe(true);
  });

  it('editing a provisional mark makes it the teacher\'s own; Accept saves only the rest', async () => {
    const { saveMarks } = await open();
    fireEvent.change(score(2), { target: { value: '4' } });
    expect(within(card('Explain why')).getByText('Auto (provisional) (edited)')).toBeTruthy();
    expect(screen.getByText('1 provisional mark must be accepted or changed before this can be released.')).toBeTruthy();
    await act(async () => { fireEvent.click(accept()); });
    expect(saveMarks).toHaveBeenCalledWith('s1', [{ item_id: 'i1', pointsEarned: 2, isCorrect: true }]);
    expect(approve().disabled).toBe(false);
  });

  it('without provisional marks (or a failed read) the modal works as before', async () => {
    await open({ loaded: { answers, prior: {} } });
    expect(accept()).toBeNull();
    expect(screen.queryByText(/Auto \(provisional\)/)).toBeNull();
    expect(score(1).value).toBe('2');
    expect(score(2).value).toBe('');
    expect(within(card('Explain why')).getByText('Essay — score by hand')).toBeTruthy();
    expect(screen.getByText('1 item still needs your score before this can be released.')).toBeTruthy();
    fireEvent.change(score(2), { target: { value: '5' } });
    expect(approve().disabled).toBe(false);
  });

  it('Release all stays hidden for a worksheet with an essay, even with provisional marks', async () => {
    render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal
      worksheet={{ id: 'w1', title: 'Unit quiz', checking_mode: 'auto' }}
      loadItems={vi.fn(async () => ({ items, keys }))} loadSubmissions={vi.fn(async () => subs)}
      loadAnswers={vi.fn(async () => ({ answers, prior: {}, provisional: PROVISIONAL }))} saveMarks={vi.fn()}
      releaseScore={vi.fn()} onClose={vi.fn()} />
    </ThemeContext.Provider>);
    await screen.findByRole('button', { name: 'Check' }, { timeout: 4000 });
    expect(screen.queryByRole('button', { name: 'Release all' })).toBeNull();
  });
});
