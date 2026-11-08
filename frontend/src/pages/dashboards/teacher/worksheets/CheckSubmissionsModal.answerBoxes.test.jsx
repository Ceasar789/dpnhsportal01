// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import CheckSubmissionsModal from './CheckSubmissionsModal';

afterEach(cleanup);

const items = [
  { id: 'i1', position: 1, question: 'Name the red planet', item_type: 'identification', options: null, points: 1 },
  { id: 'i2', position: 2, question: 'List two conflicts', item_type: 'enumeration', options: null, points: 2 },
  { id: 'i3', position: 3, question: 'Explain why', item_type: 'essay', options: null, points: 5 },
];
const keys = { i1: { correct_answer: ['Mars'] }, i2: { correct_answer: ['Character vs. Character', 'Character vs. Society'] } };

const openCard = async ({ mode = 'auto', answers = {}, itemList = items } = {}) => {
  render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal
    worksheet={{ id: 'w1', title: 'Unit quiz', checking_mode: mode }}
    loadItems={vi.fn(async () => ({ items: itemList, keys }))}
    loadSubmissions={vi.fn(async () => [{ id: 's1', name: 'Ana Cruz', status: 'submitted', released: false }])}
    loadAnswers={vi.fn(async () => ({ answers, prior: {} }))} releaseScore={vi.fn(async () => true)} onClose={vi.fn()} />
  </ThemeContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Check' }, { timeout: 4000 }));
  await screen.findByText(/^Reviewed score:/);
};
const card = question => screen.getByRole('heading', { name: new RegExp(question) }).closest('section');
const box = (section, kind) => section.querySelector(`[data-answer-box="${kind}"]`);

describe('Student answer and Expected answer boxes', () => {
  it('an auto-checked item shows both labels and boxes', async () => {
    await openCard({ answers: { i1: 'Mars' } });
    const section = card('Name the red planet');
    expect(within(section).getByText('Student answer')).toBeTruthy();
    expect(within(section).getByText('Expected answer')).toBeTruthy();
    expect(box(section, 'student').textContent).toBe('Mars');
    expect(box(section, 'expected').textContent).toBe('Mars');
    expect(box(section, 'student').className).toContain('font-semibold');
    expect(box(section, 'student').className).toContain('text-sm');
    expect(box(section, 'expected').style.borderColor).toBe('var(--green)');
    expect(within(section).queryByText(/^Answer:/)).toBeNull();
  });

  it('a manual worksheet shows the same boxes', async () => {
    await openCard({ mode: 'manual', answers: { i1: 'Venus' } });
    const section = card('Name the red planet');
    expect(box(section, 'student').textContent).toBe('Venus');
    expect(box(section, 'expected').textContent).toBe('Mars');
  });

  it('an essay shows the student answer and no expected box', async () => {
    await openCard({ answers: { i3: 'Because of gravity.' } });
    const section = card('Explain why');
    expect(box(section, 'student').textContent).toBe('Because of gravity.');
    expect(box(section, 'expected')).toBeNull();
    expect(within(section).queryByText('Expected answer')).toBeNull();
  });

  it('long answers wrap', async () => {
    await openCard({ answers: { i1: 'x'.repeat(400) } });
    const section = card('Name the red planet');
    for (const kind of ['student', 'expected']) {
      expect(box(section, kind).className).toContain('break-words');
      expect(box(section, kind).className).toContain('whitespace-pre-wrap');
    }
  });

  it.each([['no answer at all', undefined], ['a blank answer', '   '], ['an empty list', []]])('%s shows No answer', async (_name, value) => {
    await openCard({ answers: value === undefined ? {} : { i1: value, i2: value } });
    const section = card('Name the red planet');
    expect(within(box(section, 'student')).getByText('No answer')).toBeTruthy();
  });

  it('an enumeration shows every answer, one per line', async () => {
    await openCard({ answers: { i2: ['Character vs Character', 'Character vs Society'] } });
    const section = card('List two conflicts');
    expect(box(section, 'student').textContent).toBe('Character vs Character\nCharacter vs Society');
    expect(box(section, 'expected').textContent).toBe('Character vs. Character\nCharacter vs. Society');
  });

  it('keeps the auto tag and the scoring controls', async () => {
    await openCard({ answers: { i1: 'Mars' } });
    const section = card('Name the red planet');
    expect(within(section).getByText(/Auto — correct/)).toBeTruthy();
    expect(within(section).getByRole('spinbutton', { name: 'Score for question 1' }).value).toBe('1');
    expect(within(section).getByRole('button', { name: 'Mark question 1 wrong' })).toBeTruthy();
  });

  it('renders an answer with an HTML tag as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    await openCard({ answers: { i1: `A ${attack}` } });
    expect(box(card('Name the red planet'), 'student').textContent).toBe(`A ${attack}`);
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
