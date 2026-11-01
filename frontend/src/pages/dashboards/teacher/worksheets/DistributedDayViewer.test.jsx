// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DistributedDayViewer from './DistributedDayViewer';

const day = {
  day: 'Monday', title: 'Monday questions', instructions: 'Read every question carefully.',
  checkingMode: 'manual',
  questions: [
    { localId: 'item-1', item_type: 'multiple_choice', question: 'Choose one',
      options: ['First', 'Second', 'Third', 'Fourth'], points: 2 },
    { localId: 'item-2', item_type: 'true_false', question: 'Is this true?', points: 1 },
    { localId: 'item-3', item_type: 'identification', question: 'Name the part', points: 1 },
    { localId: 'item-4', item_type: 'enumeration', question: 'List two parts', points: 2,
      enumeration: { alternatives: [], orderSensitive: false } },
    { localId: 'item-5', item_type: 'essay', question: 'Explain the process', points: 5,
      essay: { referenceAnswer: 'A synthetic reference.', minWords: 80, maxWords: 120 } },
  ],
  answerKey: [
    { localId: 'item-1', correct_answer: 'Second' },
    { localId: 'item-2', correct_answer: 'True' },
    { localId: 'item-3', correct_answer: 'Leaf' },
    { localId: 'item-4', correct_answer: 'Sun, Moon' },
  ],
};

afterEach(cleanup);

it('shows a paper with letterhead, grouped questions and answers without editing controls', () => {
  const onClose = vi.fn();
  render(<DistributedDayViewer day={day} hasUnsavedChanges={false} onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: 'Monday worksheet (distributed)' });
  const paper = within(dialog).getByRole('article', { name: 'Distributed worksheet test paper' });
  expect(paper.style.backgroundColor).toBe('rgb(255, 254, 251)');
  for (const line of ['Republic of the Philippines', 'Department of Education',
    'Region IVA-CALABARZON', 'City Schools Division of Biñan City',
    'DELA PAZ NATIONAL HIGH SCHOOL', 'P. Paterno St., Dela Paz, Biñan City, Laguna']) {
    expect(within(paper).getByText(line)).toBeTruthy();
  }
  expect(within(paper).getAllByRole('img')).toHaveLength(3);
  expect(within(paper).getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
  expect(within(paper).getByText('Monday questions')).toBeTruthy();
  expect(within(paper).getByText('Total points: 11')).toBeTruthy();
  expect(within(paper).queryByText(/^(Name|Grade|Section|Score|Date):/)).toBeNull();
  expect(within(dialog).getByText('Read every question carefully.')).toBeTruthy();
  expect(within(dialog).getByText('Checking: Manual check')).toBeTruthy();
  expect(within(dialog).getByText('Read-only. This day was distributed and can no longer be edited.')).toBeTruthy();
  expect(within(dialog).queryByText(/This editor has unsaved changes/)).toBeNull();
  expect([...paper.querySelectorAll('section[aria-label]')].map(node => node.getAttribute('aria-label')))
    .toEqual(['I. Multiple choice', 'II. True or false', 'III. Identification',
      'IV. Enumeration', 'V. Essay']);
  expect([...paper.querySelectorAll('ol > li')].map(node => node.textContent)).toEqual([
    expect.stringContaining('1. Choose one'), expect.stringContaining('2. Is this true?'),
    expect.stringContaining('3. Name the part'), expect.stringContaining('4. List two parts'),
    expect.stringContaining('5. Explain the process'),
  ]);
  const choice = paper.querySelector('ol > li');
  expect(within(choice).getAllByRole('listitem').map(node => node.textContent)).toEqual([
    'A.First', 'B.SecondCorrect answer', 'C.Third', 'D.Fourth',
  ]);
  for (const answer of ['Answer: True', 'Answer: Leaf', 'Answer: Sun, Moon']) {
    expect(within(dialog).getByText(answer)).toBeTruthy();
  }
  expect(within(dialog).getByText('Reference answer: A synthetic reference.')).toBeTruthy();
  expect(within(dialog).getByText('Word range: 80–120 words')).toBeTruthy();
  expect(dialog.querySelector('input, textarea, select')).toBeNull();
  expect(within(dialog).queryByRole('button', { name: /save|edit/i })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('shows the unsaved-changes note and closes with Escape', () => {
  const onClose = vi.fn();
  render(<DistributedDayViewer day={{ ...day, checkingMode: 'auto' }} hasUnsavedChanges onClose={onClose} />);
  expect(screen.getByText('This editor has unsaved changes, so this view may differ from what students received.')).toBeTruthy();
  expect(screen.getByText('Checking: Auto-check')).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('omits directions and missing answer details', () => {
  const incomplete = { ...day, checkingMode: undefined, instructions: ' ', answerKey: [],
    questions: [{ ...day.questions[0], options: ['First', 'Second', 'Third', 'Fourth'] },
      { ...day.questions[4], essay: {} }] };
  render(<DistributedDayViewer day={incomplete} hasUnsavedChanges={false} onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByText('Directions')).toBeNull();
  expect(within(dialog).queryByText('Correct answer')).toBeNull();
  expect(within(dialog).queryByText(/Reference answer:/)).toBeNull();
  expect(within(dialog).queryByText(/Word range:/)).toBeNull();
  expect(within(dialog).queryByText(/Checking:/)).toBeNull();
});

it('groups by fixed type order, keeps position order within groups and continues numbering', () => {
  const reordered = { ...day, questions: [
    { ...day.questions[4], position: 4 },
    { ...day.questions[0], localId: 'item-6', position: 3, points: 1,
      options: ['First', 'Second', 'Third', 'Fourth', 'Fifth'] },
    { localId: 'item-7', position: 5, item_type: 'matching', question: 'Match the pairs', points: 3 },
    { ...day.questions[0], position: 1 },
    { ...day.questions[1], position: 2 },
  ] };
  render(<DistributedDayViewer day={reordered} hasUnsavedChanges={false} onClose={vi.fn()} />);
  const paper = screen.getByRole('article', { name: 'Distributed worksheet test paper' });
  const groups = [...paper.querySelectorAll('section[aria-label]')];
  expect(groups.map(node => node.getAttribute('aria-label'))).toEqual([
    'I. Multiple choice', 'II. True or false', 'III. Essay', 'IV. Other questions',
  ]);
  expect(within(groups[0]).getByRole('heading').textContent).toBe('I. Multiple choice');
  expect(within(groups[1]).getByRole('heading').textContent).toBe('II. True or false (1 point each)');
  expect([...paper.querySelectorAll('ol > li')].map(node => node.querySelector('p').textContent)).toEqual([
    '1. Choose one', '2. Choose one', '3. Is this true?', '4. Explain the process', '5. Match the pairs',
  ]);
  expect(within(groups[0]).getByText('E.')).toBeTruthy();
});
