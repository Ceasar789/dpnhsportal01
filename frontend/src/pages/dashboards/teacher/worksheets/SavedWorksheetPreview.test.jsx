// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SavedWorksheetPreview from './SavedWorksheetPreview';

vi.mock('../shared/ui', () => ({ Modal: ({ title, children, onClose }) => (
  <section role="dialog" aria-label={title}>
    <button type="button" onClick={onClose}>Close</button>
    {children}
  </section>
) }));

const worksheet = { id: 'worksheet-1', title: 'Saved Monday',
  sections: [{ id: 'section-1', title: 'Comprehension', directions: 'Read carefully.' }] };
const choice = { id: 'item-1', position: 1, sectionId: 'section-1', question: 'First question',
  item_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], points: 2 };
afterEach(cleanup);

describe('saved worksheet question preview', () => {
  it('shows questions in position order with section text and MC and true/false options', async () => {
    const loadItems = vi.fn().mockResolvedValue({ items: [
      { id: 'item-2', position: 2, sectionId: 'section-1', question: 'Second question',
        item_type: 'true_false', options: null, points: 1 }, choice,
    ], keys: {} });
    render(<SavedWorksheetPreview worksheet={worksheet} loadItems={loadItems} onClose={vi.fn()} />);
    expect(await screen.findByText('2 questions')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 4 }).map(node => node.textContent))
      .toEqual(['1. First question', '2. Second question']);
    expect(screen.getByText('Comprehension')).toBeTruthy();
    expect(screen.getByText('Read carefully.')).toBeTruthy();
    for (const option of ['A', 'B', 'C', 'D', 'True', 'False']) expect(screen.getByText(option)).toBeTruthy();
    expect(loadItems).toHaveBeenCalledTimes(1);
    expect(loadItems).toHaveBeenCalledWith('worksheet-1');
  });

  it('keeps answer keys hidden until Show answer key is checked', async () => {
    const loadItems = vi.fn().mockResolvedValue({ items: [choice,
      { id: 'item-2', position: 2, question: 'List two', item_type: 'enumeration', points: 2 }],
    keys: { 'item-1': { correct_answer: 'B' }, 'item-2': { correct_answer: ['one', 'two'] } } });
    render(<SavedWorksheetPreview worksheet={worksheet} loadItems={loadItems} onClose={vi.fn()} />);
    await screen.findByText('2 questions');
    expect(screen.queryByText('Answer key: B')).toBeNull();
    const checkbox = screen.getByRole('checkbox', { name: 'Show answer key' });
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(screen.getByText('Answer key: B')).toBeTruthy();
    expect(screen.getByText('Answer key: ["one","two"]')).toBeTruthy();
  });

  it('shows a plain error when loadItems returns null', async () => {
    render(<SavedWorksheetPreview worksheet={worksheet} loadItems={vi.fn().mockResolvedValue(null)} onClose={vi.fn()} />);
    expect(await screen.findByText('Could not load the questions.')).toBeTruthy();
  });

  it('shows a plain error for an empty item list', async () => {
    render(<SavedWorksheetPreview worksheet={worksheet}
      loadItems={vi.fn().mockResolvedValue({ items: [], keys: {} })} onClose={vi.fn()} />);
    expect(await screen.findByText('Could not load the questions.')).toBeTruthy();
  });
});
