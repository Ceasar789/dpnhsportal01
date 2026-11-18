// @vitest-environment jsdom
// S5: pressing Review while the class list, the "who has it" reads or the questions
// are still loading says so next to the button instead of doing nothing. Review is
// never disabled; a failed read keeps its own message and Retry.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({
  default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }),
}));

import { ThemeContext } from '../hooks';
import DistributeModal from './DistributeModal';

const quiz = { id: 'task-1', title: 'Cells Quiz', task_type: 'quiz', items: 10, checking_mode: 'auto' };
const SECTIONS = [
  { id: 'advised', name: 'Rizal', grade_level: 'Grade 7', isAdviser: true },
  { id: 'handled', name: 'Bonifacio', grade_level: 'Grade 8', isAdviser: false },
];
const ROSTER = [{ student_id: 's1', name: 'Ana' }];
const LINE = 'Still loading, try again in a moment.';

const pending = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

const open = (props = {}) => render(<ThemeContext.Provider value={{ dark: false }}>
  <DistributeModal task={quiz} sections={SECTIONS} sectionsError={false} onRetrySections={vi.fn()}
    loadClassList={vi.fn(async () => ROSTER)} loadAssignees={vi.fn(async () => [])}
    loadSubmissions={vi.fn(async () => [])} distributeTask={vi.fn()} onClose={vi.fn()} showToast={vi.fn()} {...props} />
</ThemeContext.Provider>);

const footer = () => screen.getByRole('dialog', { name: 'Distribute "Cells Quiz"' }).querySelector('[data-modal-footer]');
const review = () => screen.getByRole('button', { name: 'Review' });

afterEach(() => cleanup());

describe('S5 Distribute: Review while still loading', () => {
  it('class list still loading: the line shows next to Review, Review stays enabled, nothing opens', async () => {
    const list = pending();
    open({ loadClassList: vi.fn(() => list.promise) });
    expect(screen.queryByText(LINE)).toBeNull();
    expect(review().disabled).toBe(false);
    fireEvent.click(review());
    const line = within(footer()).getByText(LINE);
    expect(line.getAttribute('role')).toBe('status');
    expect(review().disabled).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Confirm distribution' })).toBeNull();
    expect(document.querySelector('.fk-summary')).toBeNull();
    // Loading ends: the line goes; the next press lists the real problems.
    await act(async () => { list.resolve(ROSTER); });
    await screen.findByLabelText('Select all');
    expect(screen.queryByText(LINE)).toBeNull();
    fireEvent.click(review());
    expect(screen.queryByText(LINE)).toBeNull();
    expect(document.querySelector('.fk-summary')).not.toBeNull();
  });

  it('questions still being checked: the line shows, and goes when the check ends', async () => {
    const items = pending();
    open({ loadItems: vi.fn(() => items.promise) });
    await screen.findByLabelText('Select all');
    fireEvent.click(review());
    expect(within(footer()).getByText(LINE)).toBeTruthy();
    expect(document.querySelector('.fk-summary')).toBeNull();
    await act(async () => { items.resolve({ items: [{ item_type: 'multiple_choice' }] }); });
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('who-has-it reads still loading: the line shows', async () => {
    const assignees = pending();
    open({ loadAssignees: vi.fn(() => assignees.promise) });
    fireEvent.click(review());
    expect(within(footer()).getByText(LINE)).toBeTruthy();
    await act(async () => { assignees.resolve([]); });
    expect(screen.queryByText(LINE)).toBeNull();
  });

  it('changing the section clears the line until Review is pressed again', async () => {
    const lists = { advised: pending(), handled: pending() };
    open({ loadClassList: vi.fn(id => lists[id].promise) });
    fireEvent.click(review());
    expect(screen.getByText(LINE)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'handled' } });
    expect(screen.queryByText(LINE)).toBeNull();
    fireEvent.click(review());
    expect(screen.getByText(LINE)).toBeTruthy();
    await act(async () => { lists.advised.resolve(ROSTER); lists.handled.resolve(ROSTER); });
  });

  it('a failed read shows its own error and Retry, not the loading line', async () => {
    open({ loadClassList: vi.fn(async () => null) });
    await screen.findByText(/Could not load this section's class list/);
    fireEvent.click(review());
    expect(screen.queryByText(LINE)).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Confirm distribution' })).toBeNull();
  });
});
