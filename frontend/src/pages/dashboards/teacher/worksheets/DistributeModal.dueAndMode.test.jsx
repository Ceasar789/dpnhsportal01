// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({
  default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }),
}));

import { ThemeContext } from '../hooks';
import DistributeModal from './DistributeModal';

const quiz = { id: 'task-1', title: 'Monday Quiz 1', task_type: 'quiz', items: 5, checking_mode: 'auto' };
const SECTIONS = [{ id: 'advised', name: 'Rizal', grade_level: 'Grade 7', isAdviser: true }];
const ROSTER = [{ student_id: 's1', name: 'Ana' }];
const FUTURE = '2099-01-15';
const LATER = 'Choose a due time that is later than now.';
const PAST_MESSAGE = 'The due date and time must be in the future (Manila time).';
const objective = { items: [{ id: 'i1', item_type: 'multiple_choice' }, { id: 'i2', item_type: 'identification' }], keys: {} };
const withEssay = { items: [{ id: 'i1', item_type: 'multiple_choice' }, { id: 'i2', item_type: 'essay' }], keys: {} };

afterEach(() => { cleanup(); vi.useRealTimers(); });

const open = async ({ task = quiz, assignees = [], ...props } = {}) => {
  const distributeTask = vi.fn(async () => ({ ok: true, added: ['s1'], notified: true, assignedElsewhere: [] }));
  render(<ThemeContext.Provider value={{ dark: false }}>
    <DistributeModal task={task} sections={SECTIONS} sectionsError={false} onRetrySections={vi.fn()}
      loadClassList={vi.fn(async () => ROSTER)} loadAssignees={vi.fn(async () => assignees)}
      loadSubmissions={vi.fn(async () => [])} distributeTask={distributeTask} onClose={vi.fn()} showToast={vi.fn()} {...props} />
  </ThemeContext.Provider>);
  await screen.findByLabelText('Select all');
  return { distributeTask };
};
const pick = (date, hour, minute, period) => {
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: date } });
  if (hour) fireEvent.change(screen.getByLabelText('Due hour'), { target: { value: hour } });
  if (minute) fireEvent.change(screen.getByLabelText('Due minute'), { target: { value: minute } });
  if (period) fireEvent.change(screen.getByLabelText('AM or PM'), { target: { value: period } });
};
const review = () => screen.getByRole('button', { name: 'Review' });
const confirmDialog = () => screen.queryByRole('dialog', { name: 'Confirm distribution' });
const confirm = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); }); };
const radio = name => screen.getByRole('radio', { name: new RegExp(`^${name}`) });
// 2030-03-10 10:00:30 in Manila.
const setManilaNow = (iso = '2030-03-10T02:00:30Z') => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

describe('12-hour due time', () => {
  it('has three labelled selects defaulting to 11:59 PM', async () => {
    await open();
    expect(screen.getByLabelText('Due hour').value).toBe('11');
    expect(screen.getByLabelText('Due minute').value).toBe('59');
    expect(screen.getByLabelText('AM or PM').value).toBe('PM');
    expect(screen.getByLabelText('Due hour').querySelectorAll('option')).toHaveLength(12);
    expect(screen.getByLabelText('Due minute').querySelectorAll('option')).toHaveLength(60);
    expect(screen.queryByDisplayValue('23:59')).toBeNull();
  });

  it('1 PM is sent as 13:00 and shown as 1:00 PM in the summary', async () => {
    const { distributeTask } = await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick(FUTURE, '1', '00', 'PM');
    fireEvent.click(review());
    expect(confirmDialog().textContent).toContain('2099-01-15 at 1:00 PM (Manila time)');
    await confirm();
    expect(distributeTask.mock.calls[0][3]).toBe('2099-01-15T13:00:00');
  });

  it.each([['12', 'PM', '2099-01-15T12:00:00', '12:00 PM'], ['12', 'AM', '2099-01-15T00:00:00', '12:00 AM']])(
    '%s %s is %s', async (hour, period, sent, shown) => {
      const { distributeTask } = await open();
      fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
      pick(FUTURE, hour, '00', period);
      fireEvent.click(review());
      expect(confirmDialog().textContent).toContain(`at ${shown}`);
      await confirm();
      expect(distributeTask.mock.calls[0][3]).toBe(sent);
    });
});

describe('the due time must be later than now', () => {
  it('the date cannot be before today in Manila', async () => {
    setManilaNow('2030-03-09T17:00:00Z');
    await open();
    expect(screen.getByLabelText('Due date').getAttribute('min')).toBe('2030-03-10');
  });

  it('a past date typed in is refused', async () => {
    setManilaNow();
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick('2030-03-09', '11', '59', 'PM');
    expect(screen.getByRole('alert').textContent).toBe(PAST_MESSAGE);
    expect(review().disabled).toBe(true);
  });

  it.each([['an earlier time today', '9', '59'], ['the current minute', '10', '00']])('%s is refused', async (_name, hour, minute) => {
    setManilaNow();
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick('2030-03-10', hour, minute, 'AM');
    expect(review().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe(PAST_MESSAGE);
  });

  it('the next minute passes', async () => {
    setManilaNow();
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick('2030-03-10', '10', '01', 'AM');
    expect(review().disabled).toBe(false);
    fireEvent.click(review());
    expect(confirmDialog()).toBeTruthy();
  });

  it('Review checks again with a fresh clock', async () => {
    setManilaNow();
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick('2030-03-10', '10', '01', 'AM');
    vi.setSystemTime(new Date('2030-03-10T02:01:10Z'));
    fireEvent.click(review());
    expect(confirmDialog()).toBeNull();
    expect(screen.getByText(LATER)).toBeTruthy();
  });

  it('Confirm checks again: if the clock passed the due time, nothing is sent', async () => {
    setManilaNow();
    const { distributeTask } = await open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick('2030-03-10', '10', '01', 'AM');
    fireEvent.click(review());
    vi.setSystemTime(new Date('2030-03-10T02:01:00Z'));
    await confirm();
    expect(distributeTask).not.toHaveBeenCalled();
    expect(confirmDialog()).toBeNull();
    expect(screen.getByText(LATER)).toBeTruthy();
  });
});

describe('Auto-check from the real items', () => {
  it('an essay item forces Manual, disables Auto and says why', async () => {
    const { distributeTask } = await open({ loadItems: vi.fn(async () => withEssay) });
    await screen.findByText('Auto-check is not available because this task has essay questions.');
    expect(radio('Auto-check').disabled).toBe(true);
    expect(radio('Manual check').checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick(FUTURE);
    fireEvent.click(review());
    await confirm();
    expect(distributeTask.mock.calls[0][4]).toBe('manual');
  });

  it('only objective items allow Auto, sent as the fifth argument', async () => {
    const loadItems = vi.fn(async () => objective);
    const { distributeTask } = await open({ loadItems });
    expect(loadItems).toHaveBeenCalledWith('task-1');
    await vi.waitFor(() => expect(radio('Auto-check').disabled).toBe(false));
    expect(radio('Auto-check').checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick(FUTURE);
    fireEvent.click(review());
    await confirm();
    expect(distributeTask.mock.calls[0][4]).toBe('auto');
  });

  it('while the items load, Review is disabled and it says so', async () => {
    let finish;
    await open({ loadItems: vi.fn(() => new Promise(resolve => { finish = resolve; })) });
    fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
    pick(FUTURE);
    expect(screen.getByText('Checking questions...')).toBeTruthy();
    expect(review().disabled).toBe(true);
    await act(async () => { finish(objective); });
    expect(review().disabled).toBe(false);
    expect(screen.queryByText('Checking questions...')).toBeNull();
  });

  it('a failed load forces Manual with the message', async () => {
    await open({ loadItems: vi.fn(async () => null) });
    expect(await screen.findByText('Could not check the questions, so Manual check will be used.')).toBeTruthy();
    expect(radio('Manual check').checked).toBe(true);
    expect(radio('Auto-check').disabled).toBe(true);
  });

  it('without the prop the old rule applies', async () => {
    await open({ task: { ...quiz, task_type: 'assignment', checking_mode: 'manual' } });
    expect(screen.getByText('Auto-check is not available for this task')).toBeTruthy();
    cleanup();
    await open();
    expect(radio('Auto-check').disabled).toBe(false);
    expect(screen.queryByText('Checking questions...')).toBeNull();
  });

  it('a locked task keeps its stored mode even with an essay', async () => {
    await open({ assignees: [{ student_id: 'x', section_id: 'advised' }], loadItems: vi.fn(async () => withEssay) });
    await act(async () => {});
    expect(radio('Auto-check').checked).toBe(true);
    expect(radio('Auto-check').disabled).toBe(true);
    expect(screen.getByText('Locked after the first distribution.')).toBeTruthy();
  });

  it('renders a title with an HTML tag as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    await open({ task: { ...quiz, title: `T ${attack}` }, loadItems: vi.fn(async () => objective) });
    expect(document.body.textContent).toContain(`T ${attack}`);
    expect(document.querySelector('img')).toBeNull();
  });
});
