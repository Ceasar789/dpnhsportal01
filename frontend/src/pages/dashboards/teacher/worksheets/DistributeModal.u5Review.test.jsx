// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({
  default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }),
}));

import { ThemeContext } from '../hooks';
import DistributeModal from './DistributeModal';

const quiz = { id: 'task-1', title: 'Cells Quiz', task_type: 'quiz', items: 10, checking_mode: 'auto' };
const SECTIONS = [
  { id: 'advised', name: 'Rizal', grade_level: 'Grade 7', isAdviser: true },
  { id: 'handled', name: 'Bonifacio', grade_level: 'Grade 8', isAdviser: false },
  { id: 'handled-2', name: 'Mabini', grade_level: 'Grade 9', isAdviser: false },
];
const ROSTER = [{ student_id: 's1', name: 'Ana' }, { student_id: 's2', name: 'Ben' }, { student_id: 's3', name: 'Cara' },
  { student_id: 's4', name: 'Dino' }];
const FUTURE = '2099-01-15';
const PAST = '2000-01-15';
const success = (extra = {}) => ({ ok: true, added: ['s1'], skipped: 0, message: '', notified: true,
  alreadyAssigned: [], assignedElsewhere: [], ...extra });

const open = async ({ task = quiz, sections = SECTIONS, roster = ROSTER, assignees = [], submissions = [],
  distributeTask = vi.fn(async () => success()), ...props } = {}) => {
  const onClose = vi.fn();
  const showToast = vi.fn();
  render(<ThemeContext.Provider value={{ dark: false }}>
    <DistributeModal task={task} sections={sections} sectionsError={false} onRetrySections={vi.fn()}
      loadClassList={vi.fn(async () => roster)} loadAssignees={vi.fn(async () => assignees)}
      loadSubmissions={vi.fn(async () => submissions)} distributeTask={distributeTask}
      onClose={onClose} showToast={showToast} {...props} />
  </ThemeContext.Provider>);
  await screen.findByLabelText('Select all');
  return { distributeTask, onClose, showToast };
};
afterEach(() => cleanup());

const review = () => screen.getByRole('button', { name: 'Review' });
const summaryItems = () => [...(document.querySelector('.fk-summary')?.querySelectorAll('a') || [])].map(a => [a.getAttribute('href'), a.textContent]);

// U5: Review is never disabled. A press on an incomplete form lists every
// problem, linked to its field, focuses the first, and the list follows the fixes.
describe('U5 Distribute: Review is never disabled', () => {
  it('lists the problems, focuses the first, and drops each one as it is fixed', async () => {
    const { distributeTask } = await open();
    expect(review().disabled).toBe(false);
    fireEvent.click(review());
    expect(screen.queryByRole('dialog', { name: 'Confirm distribution' })).toBeNull();
    expect(summaryItems()).toEqual([
      ['#teacher-distribute-date', 'Choose a due date.'],
      ['#teacher-distribute-students', 'Tick at least one student.'],
    ]);
    expect(document.activeElement).toBe(screen.getByLabelText('Due date'));
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    expect(summaryItems()).toEqual([['#teacher-distribute-date', 'Choose a due date.']]);
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: FUTURE } });
    expect(document.querySelector('.fk-summary')).toBeNull();
    fireEvent.click(review());
    expect(screen.getByRole('dialog', { name: 'Confirm distribution' })).toBeTruthy();
    expect(distributeTask).not.toHaveBeenCalled();
  });

  it('a past due time marks the date and time fields invalid and links the message', async () => {
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: PAST } });
    const message = document.getElementById('teacher-distribute-due-error');
    expect(message.textContent).toBe('The due date and time must be in the future (Manila time).');
    for (const label of ['Due date', 'Due hour', 'Due minute', 'AM or PM']) {
      expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByLabelText(label).getAttribute('aria-describedby')).toBe('teacher-distribute-due-error');
    }
  });

  it('nothing is listed before the first press', async () => {
    await open();
    expect(document.querySelector('.fk-summary')).toBeNull();
    expect(screen.getByLabelText('Due date').getAttribute('aria-invalid')).toBeNull();
  });
});
