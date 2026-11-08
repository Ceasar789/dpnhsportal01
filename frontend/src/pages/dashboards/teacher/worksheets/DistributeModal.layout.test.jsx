// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({
  default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }),
}));

import { ThemeContext } from '../hooks';
import DistributeModal from './DistributeModal';

afterEach(cleanup);

const open = async () => {
  render(<ThemeContext.Provider value={{ dark: false }}>
    <DistributeModal task={{ id: 't1', title: 'Quiz', task_type: 'quiz', items: 5, checking_mode: 'auto' }}
      sections={[{ id: 'a', name: 'Rizal', grade_level: 'Grade 7', isAdviser: true }]} sectionsError={false} onRetrySections={vi.fn()}
      loadClassList={vi.fn(async () => [{ student_id: 's1', name: 'Ana' }])} loadAssignees={vi.fn(async () => [])}
      loadSubmissions={vi.fn(async () => [])} distributeTask={vi.fn()} onClose={vi.fn()} showToast={vi.fn()} />
  </ThemeContext.Provider>);
  await screen.findByLabelText('Select all');
  return screen.getByRole('dialog', { name: 'Distribute "Quiz"' });
};
const classes = element => element.className.split(/\s+/);

describe('Distribute layout', () => {
  it('Section sits alone in its own full-width row', async () => {
    const dialog = await open();
    const row = dialog.querySelector('[data-row="section"]');
    expect(row.contains(screen.getByLabelText('Section'))).toBe(true);
    expect(row.contains(screen.getByLabelText('Due date'))).toBe(false);
    expect(classes(screen.getByLabelText('Section'))).toContain('w-full');
  });

  it('Due date and Due time share a row that wraps', async () => {
    const dialog = await open();
    const row = dialog.querySelector('[data-row="due"]');
    expect(row.contains(screen.getByLabelText('Due date'))).toBe(true);
    expect(row.contains(screen.getByRole('group', { name: 'Due time' }))).toBe(true);
    expect(classes(row)).toContain('flex-wrap');
    expect(row.className).not.toMatch(/nowrap/);
  });

  it('hour, minute and AM/PM sit in one wrapping group with a gap of at least 8px', async () => {
    const dialog = await open();
    const group = dialog.querySelector('[data-due-time]');
    for (const label of ['Due hour', 'Due minute', 'AM or PM']) expect(group.contains(screen.getByLabelText(label))).toBe(true);
    expect(classes(group)).toContain('flex-wrap');
    expect(classes(group).some(name => /^gap-([2-9]|\d{2,})$/.test(name))).toBe(true);
    for (const label of ['Due hour', 'Due minute', 'AM or PM']) expect(classes(screen.getByLabelText(label))).toContain('px-3');
  });

  it('nothing in the dialog scrolls sideways', async () => {
    const dialog = await open();
    const all = [dialog, ...dialog.querySelectorAll('*')];
    expect(all.some(element => /overflow-x-(auto|scroll)/.test(element.getAttribute('class') || ''))).toBe(false);
    expect(all.some(element => ['auto', 'scroll'].includes(element.style?.overflowX))).toBe(false);
  });

  it('labels look the same and are still attached', async () => {
    const dialog = await open();
    const label = text => [...dialog.querySelectorAll('label, span')].find(element => element.textContent === text);
    for (const text of ['Section', 'Due date', 'Due time']) {
      expect(label(text).className).toBe('text-xs font-semibold');
    }
    for (const name of ['Section', 'Due date', 'Due hour', 'Due minute', 'AM or PM']) expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Due time' })).toBeTruthy();
    expect(screen.getByText('Choose a due date.')).toBeTruthy();
  });
});
