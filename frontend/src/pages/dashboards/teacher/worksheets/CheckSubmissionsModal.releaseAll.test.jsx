// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import CheckSubmissionsModal from './CheckSubmissionsModal';

afterEach(cleanup);

const WARNING = 'Auto-check can mark valid answers wrong on open-ended questions such as enumeration. Open a submission to review it before releasing.';
const items = [
  { id: 'i1', position: 1, question: 'Pick A', item_type: 'multiple_choice', options: ['A', 'B'], points: 2 },
  { id: 'i2', position: 2, question: 'Red planet', item_type: 'identification', options: null, points: 1 },
];
const keys = { i1: { correct_answer: 'A' }, i2: { correct_answer: ['Mars'] } };
const subs = [
  { id: 's1', name: 'Ana Cruz', status: 'submitted', released: false },
  { id: 's2', name: 'Ben Reyes', status: 'submitted', released: false },
  { id: 's3', name: 'Cara Lim', status: 'checked', released: true, score: 3, total_points: 3 },
  { id: 's4', name: 'Dan Uy', status: 'in_progress', released: false },
  { id: 's5', name: 'Eve Tan', status: 'submitted', released: false },
  { id: 's6', name: 'Finn Go', status: 'submitted', released: false },
];
const answerSets = {
  s1: { answers: { i1: 'A', i2: 'Mars' }, prior: {} },
  s2: { answers: { i1: 'B', i2: 'mars' }, prior: {} },
  s5: { answers: { i1: 'A', i2: 'Mars' }, prior: { i1: 1 } },
  s6: null,
};

const setup = ({ mode = 'auto', itemList = items, subList = subs, releaseScore, loadAnswers } = {}) => {
  const props = {
    worksheet: { id: 'w1', title: 'Unit quiz', checking_mode: mode },
    loadItems: vi.fn(async () => ({ items: itemList, keys })),
    loadSubmissions: vi.fn(async () => subList),
    loadAnswers: loadAnswers || vi.fn(async id => answerSets[id] ?? null),
    releaseScore: releaseScore || vi.fn(async () => true),
    onClose: vi.fn(),
  };
  render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal {...props} /></ThemeContext.Provider>);
  return props;
};
const listShown = () => screen.findByRole('list', { name: 'Worksheet submissions' }, { timeout: 4000 });
const bulkDialog = () => screen.getByRole('dialog', { name: 'Release all auto-checked results' });
const openConfirm = async () => {
  await listShown();
  fireEvent.click(screen.getByRole('button', { name: 'Release all' }));
  await screen.findByRole('list', { name: 'Results to release' });
  return bulkDialog();
};
const releaseN = async (dialog, n) => {
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: `Release ${n}` })); });
};

describe('Release all button', () => {
  it('is shown for an auto worksheet with a submitted, unreleased paper', async () => {
    setup();
    await listShown();
    expect(screen.getByRole('button', { name: 'Release all' })).toBeTruthy();
  });

  it('is hidden for a manual worksheet', async () => {
    setup({ mode: 'manual' });
    await listShown();
    expect(screen.queryByRole('button', { name: 'Release all' })).toBeNull();
  });

  it('is hidden when nothing is eligible', async () => {
    setup({ subList: [subs[2], subs[3]] });
    await listShown();
    expect(screen.queryByRole('button', { name: 'Release all' })).toBeNull();
  });

  it('is hidden when the worksheet has an essay, even one with a stale key row', async () => {
    keys.i3 = { correct_answer: 'stale' };
    setup({ itemList: [...items, { id: 'i3', position: 3, question: 'Explain', item_type: 'essay', options: null, points: 5 }] });
    await listShown();
    expect(screen.queryByRole('button', { name: 'Release all' })).toBeNull();
    delete keys.i3;
  });
});

describe('confirmation', () => {
  it('lists each eligible student with the auto score, the skipped ones with reasons, and the warning', async () => {
    setup();
    const dialog = await openConfirm();
    const toRelease = within(dialog).getByRole('list', { name: 'Results to release' });
    expect([...toRelease.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Ana Cruz: 3 / 3', 'Ben Reyes: 1 / 3']);
    expect(within(dialog).getByText('4 skipped')).toBeTruthy();
    const skipped = within(dialog).getByRole('list', { name: 'Skipped submissions' });
    expect([...skipped.querySelectorAll('li')].map(li => li.textContent)).toEqual([
      'Cara Lim: Already released', 'Dan Uy: Not submitted', 'Eve Tan: Has saved marks', 'Finn Go: Answers could not be loaded']);
    expect(within(dialog).getByText(WARNING)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Release 2' })).toBeTruthy();
  });

  it('reads answers only for submitted, unreleased papers, one after another', async () => {
    const order = [];
    let release;
    const loadAnswers = vi.fn(id => { order.push(`start ${id}`);
      return new Promise(resolve => { release = () => { order.push(`end ${id}`); resolve(answerSets[id] ?? null); }; }); });
    setup({ loadAnswers });
    await listShown();
    fireEvent.click(screen.getByRole('button', { name: 'Release all' }));
    expect(within(bulkDialog()).getByText(/^Checking submissions\.\.\./)).toBeTruthy();
    for (let i = 0; i < 4; i += 1) await act(async () => { release(); });
    await screen.findByRole('list', { name: 'Results to release' });
    expect(order).toEqual(['start s1', 'end s1', 'start s2', 'end s2', 'start s5', 'end s5', 'start s6', 'end s6']);
  });

  it('Cancel while checking stops the reads and sends nothing', async () => {
    let release;
    const loadAnswers = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const { releaseScore } = setup({ loadAnswers });
    await listShown();
    fireEvent.click(screen.getByRole('button', { name: 'Release all' }));
    fireEvent.click(within(bulkDialog()).getByRole('button', { name: 'Cancel' }));
    await act(async () => { release(answerSets.s1); });
    expect(loadAnswers).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Release all auto-checked results' })).toBeNull();
    expect(releaseScore).not.toHaveBeenCalled();
  });

  it('Cancel on the confirmation sends nothing', async () => {
    const { releaseScore } = setup();
    const dialog = await openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Release all auto-checked results' })).toBeNull();
    expect(releaseScore).not.toHaveBeenCalled();
  });
});

describe('running', () => {
  it('sends one release per eligible paper, in order, never for released, unsubmitted or saved-mark papers', async () => {
    const { releaseScore, loadSubmissions } = setup();
    await releaseN(await openConfirm(), 2);
    expect(releaseScore.mock.calls.map(call => call.slice(0, 5))).toEqual([
      ['s1', 'w1', 3, 3, [{ item_id: 'i1', isCorrect: true, pointsEarned: 2 }, { item_id: 'i2', isCorrect: true, pointsEarned: 1 }]],
      ['s2', 'w1', 1, 3, [{ item_id: 'i1', isCorrect: false, pointsEarned: 0 }, { item_id: 'i2', isCorrect: true, pointsEarned: 1 }]],
    ]);
    expect(releaseScore.mock.calls.every(call => call[5].quiet === true)).toBe(true);
    expect(releaseScore.mock.calls.map(call => call[0])).not.toContain('s3');
    expect(screen.getByText('Released 2. Failed 0.')).toBeTruthy();
    expect(loadSubmissions).toHaveBeenCalledTimes(2);
  });

  it('runs one at a time: the second release waits for the first', async () => {
    const order = [];
    const pending = [];
    const releaseScore = vi.fn(id => { order.push(`start ${id}`);
      return new Promise(resolve => pending.push(() => { order.push(`end ${id}`); resolve(true); })); });
    setup({ releaseScore });
    await releaseN(await openConfirm(), 2);
    expect(order).toEqual(['start s1']);
    await act(async () => { pending.shift()(); });
    await act(async () => { pending.shift()(); });
    expect(order).toEqual(['start s1', 'end s1', 'start s2', 'end s2']);
  });

  it('the same marks reach the release as the single Release button sends', async () => {
    const single = setup();
    await listShown();
    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: 'Check' }));
    await screen.findByText('Reviewed score: 3 / 3');
    fireEvent.click(screen.getByRole('button', { name: 'Approve review locally' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Release result' })); });
    const singleArgs = single.releaseScore.mock.calls[0];
    expect(singleArgs).toHaveLength(5);
    cleanup();
    const bulk = setup();
    await releaseN(await openConfirm(), 2);
    expect(bulk.releaseScore.mock.calls[0].slice(0, 5)).toEqual(singleArgs);
  });

  it('a failure in the middle does not stop the rest, and the summary names it with the friendly reason', async () => {
    const releaseScore = vi.fn(async (id, _w, _s, _t, _p, options) => {
      if (id === 's1') { options.onFailure('This submission is not ready for score release. Refresh and review its status.'); return false; }
      return true;
    });
    setup({ releaseScore });
    await releaseN(await openConfirm(), 2);
    expect(releaseScore).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Released 1. Failed 1.')).toBeTruthy();
    const failed = screen.getByRole('list', { name: 'Failed releases' });
    expect(failed.textContent).toBe('Ana Cruz: This submission is not ready for score release. Refresh and review its status.');
  });

  it('a failure with no reason gets the friendly fallback, never raw text', async () => {
    setup({ releaseScore: vi.fn(async id => id !== 's2') });
    await releaseN(await openConfirm(), 2);
    expect(screen.getByRole('list', { name: 'Failed releases' }).textContent)
      .toBe('Ben Reyes: Could not confirm the release. Check the submission and try again.');
  });

  it('a double click on Release starts one run', async () => {
    const { releaseScore } = setup();
    const dialog = await openConfirm();
    const button = within(dialog).getByRole('button', { name: 'Release 2' });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    await screen.findByText('Released 2. Failed 0.');
    expect(releaseScore).toHaveBeenCalledTimes(2);
  });

  it('the dialog cannot be closed while releasing, and closes after', async () => {
    const pending = [];
    setup({ releaseScore: vi.fn(() => new Promise(resolve => pending.push(resolve))) });
    await releaseN(await openConfirm(), 2);
    expect(within(bulkDialog()).getByRole('button', { name: 'Close Release all auto-checked results' }).disabled).toBe(true);
    expect(within(bulkDialog()).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await act(async () => { pending.shift()(true); });
    await act(async () => { pending.shift()(true); });
    fireEvent.click(within(bulkDialog()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Release all auto-checked results' })).toBeNull();
  });

  it('the list shows the released rows after the run', async () => {
    let call = 0;
    const loadSubmissions = vi.fn(async () => (call++ === 0 ? subs
      : subs.map(s => (s.id === 's1' ? { ...s, status: 'checked', released: true, score: 3, total_points: 3 } : s))));
    render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal worksheet={{ id: 'w1', title: 'Unit quiz', checking_mode: 'auto' }}
      loadItems={vi.fn(async () => ({ items, keys }))} loadSubmissions={loadSubmissions}
      loadAnswers={vi.fn(async id => answerSets[id] ?? null)} releaseScore={vi.fn(async () => true)} onClose={vi.fn()} /></ThemeContext.Provider>);
    await releaseN(await openConfirm(), 2);
    fireEvent.click(within(bulkDialog()).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getAllByText('Released — 3/3')).toHaveLength(2));
  });
});

describe('already released', () => {
  const odd = { id: 's7', name: 'Gil Sy', status: 'submitted', released: true, score: 3, total_points: 3 };

  it('a released paper that still says submitted is never sent', async () => {
    const { releaseScore, loadAnswers } = setup({ subList: [odd, subs[0]] });
    const dialog = await openConfirm();
    expect(within(dialog).getByRole('list', { name: 'Skipped submissions' }).textContent).toBe('Gil Sy: Already released');
    await releaseN(dialog, 1);
    expect(releaseScore.mock.calls.map(call => call[0])).toEqual(['s1']);
    expect(loadAnswers.mock.calls.map(call => call[0])).toEqual(['s1']);
  });

  it('only released papers means no Release all button', async () => {
    setup({ subList: [odd] });
    await listShown();
    expect(screen.queryByRole('button', { name: 'Release all' })).toBeNull();
  });
});

describe('plain text', () => {
  it('a student name with an HTML tag renders as text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    setup({ subList: [{ ...subs[0], name: `N ${attack}` }] });
    const dialog = await openConfirm();
    expect(within(dialog).getByRole('list', { name: 'Results to release' }).textContent).toBe(`N ${attack}: 3 / 3`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
