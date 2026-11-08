// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({
  default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }),
}));

import { ThemeContext } from '../hooks';
import DistributeModal from './DistributeModal';

const quiz = { id: 'task-1', title: 'Cells Quiz', task_type: 'quiz', items: 10, checking_mode: 'auto' };
const assignment = { ...quiz, title: 'Cells Essay', task_type: 'assignment', items: 3, checking_mode: 'manual' };
const activity = { ...quiz, title: 'Cells Map', task_type: 'worksheet', items: 0, checking_mode: 'manual' };
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
const selectAll = () => screen.getByRole('checkbox', { name: 'Select all' });
const student = name => screen.getByRole('checkbox', { name: new RegExp(name) });
const setDue = (date, time) => {
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: date } });
  if (time) {
    const [h, m] = time.split(':').map(Number);
    fireEvent.change(screen.getByLabelText('Due hour'), { target: { value: String(h % 12 === 0 ? 12 : h % 12) } });
    fireEvent.change(screen.getByLabelText('Due minute'), { target: { value: String(m).padStart(2, '0') } });
    fireEvent.change(screen.getByLabelText('AM or PM'), { target: { value: h < 12 ? 'AM' : 'PM' } });
  }
};
const reviewButton = () => screen.getByRole('button', { name: 'Review' });
const toReview = (date = FUTURE) => {
  fireEvent.click(student('Ana'));
  setDue(date);
  fireEvent.click(reviewButton());
  return screen.getByRole('dialog', { name: 'Confirm distribution' });
};
const confirm = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await act(async () => {});
};

afterEach(() => cleanup());

describe('section picker', () => {
  it('groups sections into Advisory and Handled', async () => {
    await open();
    const groups = [...screen.getByLabelText('Section').querySelectorAll('optgroup')];
    expect(groups.map(group => group.label)).toEqual(['Advisory section', 'Handled sections']);
    expect([...groups[0].querySelectorAll('option')].map(option => option.value)).toEqual(['advised']);
    expect([...groups[1].querySelectorAll('option')].map(option => option.value)).toEqual(['handled', 'handled-2']);
    expect(groups[0].textContent).toBe('Rizal (Grade 7)');
  });

  it('leaves out a group with no sections', async () => {
    await open({ sections: [SECTIONS[1]] });
    expect([...screen.getByLabelText('Section').querySelectorAll('optgroup')].map(group => group.label)).toEqual(['Handled sections']);
  });

  it('changing section clears the ticks', async () => {
    await open();
    fireEvent.click(student('Ana'));
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'handled' } });
    await screen.findByRole('checkbox', { name: 'Select all' });
    await waitFor(() => expect(screen.getByText('0 selected')).toBeTruthy());
  });
});

describe('student list', () => {
  it('starts with nobody ticked', async () => {
    await open();
    expect(screen.getByText('0 selected')).toBeTruthy();
    for (const name of ['Ana', 'Ben', 'Cara', 'Dino']) expect(student(name).checked).toBe(false);
    expect(selectAll().checked).toBe(false);
  });

  it('Select all ticks only new students', async () => {
    await open({ assignees: [{ student_id: 's1' }], submissions: [{ student_id: 's2' }] });
    fireEvent.click(selectAll());
    expect(student('Cara').checked).toBe(true);
    expect(student('Dino').checked).toBe(true);
    expect(selectAll().checked).toBe(true);
    expect(screen.getByText(/^2 selected/)).toBeTruthy();
    fireEvent.click(selectAll());
    expect(student('Cara').checked).toBe(false);
    expect(screen.getByText(/^0 selected/)).toBeTruthy();
  });

  it('shows the indeterminate state, and unticking one clears Select all', async () => {
    await open();
    fireEvent.click(student('Ana'));
    expect(selectAll().indeterminate).toBe(true);
    expect(selectAll().checked).toBe(false);
    fireEvent.click(selectAll());
    expect(selectAll().indeterminate).toBe(false);
    expect(selectAll().checked).toBe(true);
    fireEvent.click(student('Ben'));
    expect(selectAll().checked).toBe(false);
    expect(selectAll().indeterminate).toBe(true);
  });

  it('disables students who already have the task, and never sends them', async () => {
    const { distributeTask } = await open({ assignees: [{ student_id: 's1' }] });
    expect(student('Ana').checked).toBe(true);
    expect(student('Ana').disabled).toBe(true);
    expect(screen.getByText('Already has this task')).toBeTruthy();
    fireEvent.click(selectAll());
    setDue(FUTURE);
    fireEvent.click(reviewButton());
    await confirm();
    expect(distributeTask.mock.calls[0][2]).toEqual(['s2', 's3', 's4']);
  });

  it('shows started students disabled, and never sends them', async () => {
    const { distributeTask } = await open({ submissions: [{ student_id: 's2' }] });
    expect(student('Ben').disabled).toBe(true);
    expect(screen.getByText('Already started')).toBeTruthy();
    fireEvent.click(selectAll());
    setDue(FUTURE);
    fireEvent.click(reviewButton());
    await confirm();
    expect(distributeTask.mock.calls[0][2]).toEqual(['s1', 's3', 's4']);
  });

  it('sends only the ticked new students', async () => {
    const { distributeTask } = await open();
    fireEvent.click(student('Ben'));
    fireEvent.click(student('Dino'));
    setDue(FUTURE);
    fireEvent.click(reviewButton());
    await confirm();
    expect(distributeTask.mock.calls[0][2]).toEqual(['s2', 's4']);
  });

  // Label and text queries: role queries are too slow across hundreds of checkboxes.
  const large = count => Array.from({ length: count }, (_, index) => ({ student_id: `id-${index}`, name: `Student ${index}` }));
  const selectEveryone = async (count) => {
    await open({ roster: large(count) });
    fireEvent.click(screen.getByLabelText('Select all'));
    setDue(FUTURE);
  };

  it('blocks more than 200 students', async () => {
    await selectEveryone(201);
    expect(screen.getByText(/at most 200 students/)).toBeTruthy();
    expect(screen.getByText('Review').disabled).toBe(true);
  }, 30000);

  it('allows exactly 200 students', async () => {
    await selectEveryone(200);
    expect(screen.queryByText(/at most 200 students/)).toBeNull();
    expect(screen.getByText('Review').disabled).toBe(false);
  }, 30000);
});

describe('checking mode', () => {
  const radio = name => screen.getByRole('radio', { name: new RegExp(`^${name}`) });

  it('starts from the stored mode, and each option has a short explanation', async () => {
    await open();
    expect(radio('Auto-check').checked).toBe(true);
    expect(radio('Manual check').checked).toBe(false);
    expect(radio('Auto-check').disabled).toBe(false);
    expect(screen.getByText('Answers are marked for you when you open Check submissions.')).toBeTruthy();
    expect(screen.getByText('You mark every answer yourself.')).toBeTruthy();
    cleanup();
    await open({ task: { ...quiz, checking_mode: 'manual' } });
    expect(radio('Manual check').checked).toBe(true);
  });

  it('passes the chosen mode as the fifth argument', async () => {
    const { distributeTask } = await open();
    fireEvent.click(radio('Manual check'));
    toReview();
    await confirm();
    expect(distributeTask.mock.calls[0][4]).toBe('manual');
  });

  it.each([['an Assignment', assignment], ['an Activity', activity],
    ['a task stored as auto with no items', { ...activity, checking_mode: 'auto' }]])('forces manual for %s', async (_name, task) => {
    const { distributeTask } = await open({ task });
    expect(radio('Manual check').checked).toBe(true);
    expect(radio('Manual check').disabled).toBe(true);
    expect(radio('Auto-check').disabled).toBe(true);
    expect(screen.getByText('Auto-check is not available for this task')).toBeTruthy();
    toReview();
    await confirm();
    expect(distributeTask.mock.calls[0][4]).toBe('manual');
  });

  it('locks to the stored mode once anyone has the task', async () => {
    const { distributeTask } = await open({ assignees: [{ student_id: 's4' }] });
    expect(radio('Auto-check').checked).toBe(true);
    expect(radio('Auto-check').disabled).toBe(true);
    expect(radio('Manual check').disabled).toBe(true);
    expect(screen.getByText('Locked after the first distribution.')).toBeTruthy();
    expect(screen.queryByText('Auto-check is not available for this task')).toBeNull();
    toReview();
    await confirm();
    expect(distributeTask.mock.calls[0][4]).toBe('auto');
  });
});

describe('checking mode lock priority', () => {
  it('a locked task keeps its stored mode even when it would otherwise be forced to manual', async () => {
    const { distributeTask } = await open({ task: { ...activity, checking_mode: 'auto' }, assignees: [{ student_id: 's4' }] });
    expect(screen.getByRole('radio', { name: /^Auto-check/ }).checked).toBe(true);
    expect(screen.getByText('Locked after the first distribution.')).toBeTruthy();
    expect(screen.queryByText('Auto-check is not available for this task')).toBeNull();
    toReview();
    await confirm();
    expect(distributeTask.mock.calls[0][4]).toBe('auto');
  });
});

describe('due date', () => {
  it('needs a date before Review', async () => {
    await open();
    fireEvent.click(student('Ana'));
    expect(screen.getByText('Choose a due date.')).toBeTruthy();
    expect(reviewButton().disabled).toBe(true);
  });

  it('refuses a past date with a clear message', async () => {
    await open();
    fireEvent.click(student('Ana'));
    setDue(PAST);
    expect(screen.getByRole('alert').textContent).toBe('The due date and time must be in the future (Manila time).');
    expect(reviewButton().disabled).toBe(true);
  });

  it('accepts a future date and sends the existing format', async () => {
    const { distributeTask } = await open();
    fireEvent.click(student('Ana'));
    setDue(FUTURE, '08:30');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(reviewButton().disabled).toBe(false);
    fireEvent.click(reviewButton());
    await confirm();
    expect(distributeTask.mock.calls[0][3]).toBe('2099-01-15T08:30:00');
  });

  it('needs at least one student before Review', async () => {
    await open();
    setDue(FUTURE);
    expect(reviewButton().disabled).toBe(true);
  });
});

describe('confirm step', () => {
  it('shows the section, students, due date and mode, and sends nothing yet', async () => {
    const { distributeTask } = await open();
    fireEvent.click(student('Ben'));
    const dialog = toReview();
    const text = dialog.textContent;
    expect(text).toContain('Rizal');
    expect(within(dialog).getByText('2')).toBeTruthy();
    expect(text).toContain('2099-01-15 at 11:59 PM (Manila time)');
    expect(text).toContain('Auto-check');
    expect(distributeTask).not.toHaveBeenCalled();
  });

  it('Back returns to the form without sending', async () => {
    const { distributeTask } = await open();
    toReview();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog', { name: 'Confirm distribution' })).toBeNull();
    expect(reviewButton()).toBeTruthy();
    expect(student('Ana').checked).toBe(true);
    expect(distributeTask).not.toHaveBeenCalled();
  });

  it('Escape returns to the form without sending or closing it', async () => {
    const { distributeTask, onClose } = await open();
    toReview();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Confirm distribution' })).toBeNull();
    expect(reviewButton()).toBeTruthy();
    expect(distributeTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a double click sends exactly one request, and Confirm is disabled while sending', async () => {
    let finish;
    const distributeTask = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    await open({ distributeTask });
    toReview();
    const button = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(distributeTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Distributing…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Back' }).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Confirm distribution' })).toBeTruthy();
    await act(async () => { finish(success()); });
  });
});

describe('result handling', () => {
  it('on success shows a toast and closes', async () => {
    const { onClose, showToast } = await open();
    toReview();
    await confirm();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Task distributed to 1 student(s).', 'success');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('nothing added keeps the modal open with a warning', async () => {
    const { onClose, showToast } = await open({ distributeTask: vi.fn(async () => success({ added: [], postingSaved: true,
      message: 'Everyone ticked already has this task.', notified: undefined })) });
    toReview();
    await confirm();
    expect(screen.getByRole('status').textContent).toBe('Everyone ticked already has this task.');
    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Confirm distribution' })).toBeNull();
  });

  it('a failed notification still closes, with the existing toast wording', async () => {
    const { onClose, showToast } = await open({ distributeTask: vi.fn(async () => success({ notified: false })) });
    toReview();
    await confirm();
    expect(showToast).toHaveBeenCalledWith('Task distributed, but the students could not be notified. They will still see it in their task list.', 'error');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failure stays open, shows the message, and allows another try', async () => {
    const distributeTask = vi.fn().mockResolvedValueOnce({ ok: false, message: 'You cannot distribute to this section.' })
      .mockResolvedValueOnce(success());
    const { onClose } = await open({ distributeTask });
    toReview();
    await confirm();
    expect(screen.getByRole('alert').textContent).toBe('You cannot distribute to this section.');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(reviewButton());
    await confirm();
    expect(distributeTask).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('joins the another-section warning into the one toast on success', async () => {
    const { showToast } = await open({ distributeTask: vi.fn(async () => success({ assignedElsewhere: ['s2', 's3'] })) });
    toReview();
    await confirm();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Task distributed to 1 student(s). 2 student(s) already have this task in another section.', 'success');
  });

  it('shows the another-section warning in the modal when nothing was added', async () => {
    const { onClose } = await open({ distributeTask: vi.fn(async () => success({ added: [], postingSaved: true,
      message: 'Everyone ticked already has this task.', assignedElsewhere: ['s1'] })) });
    toReview();
    await confirm();
    expect(screen.getByRole('status').textContent)
      .toBe('Everyone ticked already has this task. 1 student(s) already have this task in another section.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('safety and existing behavior', () => {
  it('renders markup as plain text everywhere', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    await open({ task: { ...quiz, title: `T ${attack}` }, sections: [{ ...SECTIONS[0], name: `S ${attack}` }],
      roster: [{ student_id: 's1', name: `N ${attack}` }] });
    fireEvent.click(student('N '));
    setDue(FUTURE);
    fireEvent.click(reviewButton());
    for (const value of [`T ${attack}`, `S ${attack}`, `N ${attack}`]) expect(document.body.textContent).toContain(value);
    expect(document.querySelector('img')).toBeNull();
  });

  it('keeps a named dialog and labels on every control', async () => {
    await open();
    expect(screen.getByRole('dialog', { name: 'Distribute "Cells Quiz"' })).toBeTruthy();
    for (const label of ['Section', 'Due date', 'Due hour', 'Due minute', 'AM or PM']) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Checking mode' })).toBeTruthy();
  });

  it('a failed class list read stays a failure, not an empty class', async () => {
    render(<ThemeContext.Provider value={{ dark: false }}>
      <DistributeModal task={quiz} sections={SECTIONS} sectionsError={false} onRetrySections={vi.fn()}
        loadClassList={vi.fn(async () => null)} loadAssignees={vi.fn(async () => [])}
        loadSubmissions={vi.fn(async () => [])} distributeTask={vi.fn()} onClose={vi.fn()} showToast={vi.fn()} />
    </ThemeContext.Provider>);
    expect((await screen.findByText(/Could not load this section's class list/)).textContent).toContain('failed read');
    expect(reviewButton().disabled).toBe(true);
  });
});
