// @vitest-environment jsdom
// U-PDF-T (AI checking OFF design): the Checking mode radios became one "AI
// checking" switch over the same field. ON sends exactly what Auto-check sent
// ('auto'), OFF exactly what Manual check sent ('manual'); the default is the
// worksheet's stored mode, as before. The per-type list shows only with the
// existing per-type flag ON.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({ default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }) }));

import { ThemeContext } from '../hooks';
import DistributeModal from './DistributeModal';

const quiz = { id: 'task-1', title: 'Quiz 1', task_type: 'quiz', items: 5, checking_mode: 'manual' };
const SECTIONS = [{ id: 'sec', name: 'Rizal', grade_level: 'Grade 7', isAdviser: false }];
const objective = { items: [{ id: 'i1', item_type: 'multiple_choice' }], keys: {} };
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const open = async ({ task = quiz, assignees = [] } = {}) => {
  const distributeTask = vi.fn(async () => ({ ok: true, added: ['s1'], notified: true, assignedElsewhere: [] }));
  render(<ThemeContext.Provider value={{ dark: false }}>
    <DistributeModal task={task} sections={SECTIONS} sectionsError={false} onRetrySections={vi.fn()}
      loadClassList={vi.fn(async () => [{ student_id: 's1', name: 'Ana' }])} loadAssignees={vi.fn(async () => assignees)}
      loadSubmissions={vi.fn(async () => [])} loadItems={vi.fn(async () => objective)} distributeTask={distributeTask}
      onClose={vi.fn()} showToast={vi.fn()} />
  </ThemeContext.Provider>);
  await screen.findByLabelText('Select all');
  await act(async () => {});
  return { distributeTask };
};
const toggle = () => screen.getByRole('switch', { name: 'AI checking' });
const send = async () => {
  fireEvent.click(screen.getByRole('checkbox', { name: /Ana/ }));
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2099-01-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })); });
};

describe('AI checking switch', () => {
  it('no radios any more; OFF shows the manual summaries and Turn on AI checking', async () => {
    await open();
    expect(screen.queryByRole('radio', { name: /Auto-check|Manual check/ })).toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('OFF · You check this worksheet manually')).toBeTruthy();
    expect(screen.getByText('You review every submission')).toBeTruthy();
    expect(screen.getByText('You release the scores')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn on AI checking' })).toBeTruthy();
  });

  it('ON shows its summary and the existing sentence; OFF stores manual, ON stores auto', async () => {
    const off = await open();
    await send();
    expect(off.distributeTask.mock.calls[0][4]).toBe('manual');
    cleanup();
    const on = await open();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('ON · AI checks the objective items')).toBeTruthy();
    expect(screen.getByText('Answers are marked for you when you open Check submissions.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on AI checking' })).toBeNull();
    await send();
    expect(on.distributeTask.mock.calls[0][4]).toBe('auto');
  });

  it('the default is the stored mode; Turn on AI checking flips the same switch', async () => {
    await open({ task: { ...quiz, checking_mode: 'auto' } });
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    cleanup();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on AI checking' }));
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('same locks as before: an Assignment cannot turn it on; after a distribution it is locked', async () => {
    await open({ task: { ...quiz, task_type: 'assignment' } });
    expect(toggle().disabled).toBe(true);
    expect(screen.getByText('AI checking is not available for this task')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn on AI checking' })).toBeNull();
    cleanup();
    await open({ assignees: [{ student_id: 's9', section_id: 'sec' }] });
    expect(toggle().disabled).toBe(true);
    expect(screen.getByText('Locked after the first distribution.')).toBeTruthy();
  });

  it('the per-type list shows only with the per-type flag ON', async () => {
    await open();
    expect(screen.queryByText('AI checks these question types')).toBeNull();
    cleanup();
    vi.stubEnv('VITE_AUTO_CHECK_TYPES_ENABLED', '1');
    await open();
    expect(screen.getByText('AI checks these question types')).toBeTruthy();
    expect(screen.getByText('Essay, handwriting, drawing, arts')).toBeTruthy();
    expect(screen.getByText('Always checked manually by you')).toBeTruthy();
  });
});
