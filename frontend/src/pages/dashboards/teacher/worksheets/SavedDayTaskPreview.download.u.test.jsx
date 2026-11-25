// @vitest-environment jsdom
// U-PDF-T (design p18): the worksheet Preview keeps its content, gets the three
// exports in a Download menu in its title bar, and the paper sits in its own
// labelled, focusable scroll area (the answer-key switch stays outside it).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }) }));
import SavedDayTaskPreview from './SavedDayTaskPreview';

afterEach(cleanup);
const worksheet = { id: 'w1', title: 'Quiz 1', task_type: 'quiz', subject: 'Mathematics', grade_level: 'Grade 7', instructions: 'Answer.' };
const loadItems = vi.fn(async () => ({ items: [{ id: 'i1', position: 1, question: 'What is 2 + 2?', item_type: 'identification', points: 1 }],
  keys: { i1: { correct_answer: '4' } } }));

describe('SavedDayTaskPreview downloads', () => {
  it('Download menu in the title bar with the exports passed in', async () => {
    const run = vi.fn();
    render(<SavedDayTaskPreview worksheet={worksheet} loadItems={loadItems} onClose={vi.fn()}
      downloads={[{ key: 'student', label: 'Student copy (.docx)', run }]} />);
    await act(async () => {});
    // U-PDF-T-FIX-A: the Preview is a page; the menu sits in its header.
    const header = screen.getByRole('heading', { level: 1, name: 'Quiz 1' }).parentElement.parentElement;
    fireEvent.click(within(header).getByRole('button', { name: 'Download Quiz 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Student copy/ }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('the paper is a labelled, focusable scroll region; the answer-key switch is outside it', async () => {
    render(<SavedDayTaskPreview worksheet={worksheet} loadItems={loadItems} onClose={vi.fn()} />);
    await act(async () => {});
    const region = screen.getByRole('region', { name: 'Worksheet' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('t-doc-scroll');
    expect(region.contains(screen.getByRole('tab', { name: 'Key to Correction' }))).toBe(false);
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull();
  });
});
