// @vitest-environment jsdom
// U-PDF-T-FIX-A (design p18): the worksheet Preview is a page. Back to Worksheets, title, Saved,
// Powered by Gemini (AI rows only), Last edited (only a real date), Download menu, Edit questions
// when offered; "Student copy" / "Key to Correction" tabs; footnote under the Student copy.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }) }));
import SavedDayTaskPreview from './SavedDayTaskPreview';

afterEach(cleanup);
const quiz = { id: 'w1', title: 'Linear Equations Worksheet', task_type: 'quiz', origin: 'ai_generated', subject: 'Mathematics', grade_level: 'Grade 8',
  instructions: 'Answer.', updated_at: '2026-11-20T02:12:00Z' };
const items = { items: [{ id: 'i1', position: 1, question: 'What is 2 + 2?', item_type: 'identification', points: 1 }], keys: { i1: { correct_answer: '4' } } };
const show = async (props = {}) => {
  render(<SavedDayTaskPreview worksheet={quiz} loadItems={vi.fn(async () => items)} onClose={vi.fn()} {...props} />);
  await act(async () => {});
};
const NOTE = 'This is the copy students see. The answers are not included.';

describe('SavedDayTaskPreview page', () => {
  it('is a page, not a dialog: Back to Worksheets, heading, Saved, Powered by Gemini, Last edited', async () => {
    const onClose = vi.fn();
    await show({ onClose });
    expect(screen.queryByRole('dialog')).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Linear Equations Worksheet' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Powered by Gemini')).toBeTruthy();
    expect(screen.getByText('Last edited Nov 20, 2026, 10:12 AM')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Back to Worksheets' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a manual row has no Powered by Gemini; no Last edited without a real date', async () => {
    await show({ worksheet: { ...quiz, origin: 'manual', updated_at: null } });
    expect(screen.queryByText('Powered by Gemini')).toBeNull();
    expect(screen.queryByText(/^Last edited/)).toBeNull();
  });

  it('tabs: Student copy first with the footnote; Key to Correction shows the answer key', async () => {
    await show();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Student copy', 'Key to Correction']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Teacher answer key' })).toBeNull();
    fireEvent.click(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('tabpanel')).getByRole('article', { name: 'Teacher answer key' }).textContent).toContain('Answer: 4');
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  it('arrow keys move between the tabs', async () => {
    await show();
    const [student, key] = screen.getAllByRole('tab');
    fireEvent.keyDown(student, { key: 'ArrowRight' });
    expect(key.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(key);
    fireEvent.keyDown(key, { key: 'Home' });
    expect(student.getAttribute('aria-selected')).toBe('true');
  });

  it('an Activity has no tabs (nothing to key), and keeps the footnote', async () => {
    await show({ worksheet: { ...quiz, task_type: 'worksheet' }, loadItems: vi.fn(async () => ({ items: [], keys: {} })) });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it('Edit questions and the Download menu sit in the header when offered; no other buttons', async () => {
    const onEditQuestions = vi.fn();
    await show({ onEditQuestions, downloads: [{ key: 'student', label: 'Student copy (.docx)', run: vi.fn() }] });
    fireEvent.click(screen.getByRole('button', { name: 'Edit questions' }));
    expect(onEditQuestions).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Download Linear Equations Worksheet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Checking settings|^Save$/ })).toBeNull();
  });
});
