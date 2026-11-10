// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('./useDialogSafety', () => ({
  default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }),
}));

import { ThemeContext } from '../hooks';
import CreateTaskModal from './CreateTaskModal';
import DistributeModal from './DistributeModal';
import CheckSubmissionsModal from './CheckSubmissionsModal';

afterEach(cleanup);

const footerOf = name => screen.getByRole('dialog', { name }).querySelector('[data-modal-footer]');
const bodyOf = name => screen.getByRole('dialog', { name }).querySelector('.overflow-y-auto');
const names = el => within(el).getAllByRole('button').map(b => b.textContent.trim());

describe('Create Worksheet keeps its buttons, now in the pinned footer', () => {
  const show = () => {
    const onSave = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    render(<CreateTaskModal subjectPicker={<p>Subject: English</p>} subjectReady saving={false} onSave={onSave} onClose={onClose} />);
    return { onSave, onClose };
  };

  it('Cancel then Create, in the footer, outside the scrolling body', () => {
    show();
    const footer = footerOf('Create Worksheet');
    expect(names(footer)).toEqual(['Cancel', 'Create']);
    expect(bodyOf('Create Worksheet').contains(screen.getByRole('button', { name: 'Create' }))).toBe(false);
    expect(bodyOf('Create Worksheet').contains(screen.getByLabelText('Title'))).toBe(true);
  });

  it('same disabled state and handlers as before', async () => {
    const { onSave, onClose } = show();
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Map the conflict' } });
    fireEvent.change(screen.getByLabelText('Directions'), { target: { value: 'Work in pairs.' } });
    expect(create.disabled).toBe(false);
    await act(async () => { fireEvent.click(create); });
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Distribute keeps its buttons, now in the pinned footer', () => {
  const show = async (over = {}) => {
    const onClose = vi.fn();
    render(<ThemeContext.Provider value={{ dark: false }}>
      <DistributeModal task={{ id: 't1', title: 'Quiz', task_type: 'quiz', items: 5, checking_mode: 'auto' }}
        sections={[{ id: 'a', name: 'Rizal', grade_level: 'Grade 7', isAdviser: true }]} sectionsError={false} onRetrySections={vi.fn()}
        loadClassList={vi.fn(async () => [{ student_id: 's1', name: 'Ana' }])} loadAssignees={vi.fn(async () => [])}
        loadSubmissions={vi.fn(async () => [])} distributeTask={vi.fn()} onClose={onClose} showToast={vi.fn()} {...over} />
    </ThemeContext.Provider>);
    return { onClose };
  };

  it('the selected count, Cancel and Review sit in the footer, in the same order', async () => {
    await show();
    await screen.findByLabelText('Select all');
    const footer = footerOf('Distribute "Quiz"');
    expect(names(footer)).toEqual(['Cancel', 'Review']);
    expect(within(footer).getByText(/selected/)).toBeTruthy();
    expect(bodyOf('Distribute "Quiz"').contains(screen.getByLabelText('Section'))).toBe(true);
  });

  it('Cancel still closes', async () => {
    const { onClose } = await show();
    await screen.findByLabelText('Select all');
    fireEvent.click(within(footerOf('Distribute "Quiz"')).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ['sections failed to load', { sectionsError: true }],
    ['there are no sections', { sections: [] }],
  ])('no footer and no Review when %s, as before', async (_label, over) => {
    await show(over);
    expect(footerOf('Distribute "Quiz"')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  });
});

describe('Check submissions action row sticks to the bottom of the scrolling body', () => {
  it('Back, Approve review locally and Release result share one sticky row with a top border and safe-area padding', async () => {
    render(<ThemeContext.Provider value={{ dark: false }}><CheckSubmissionsModal
      worksheet={{ id: 'w1', title: 'Unit quiz', checking_mode: 'manual' }}
      loadItems={vi.fn(async () => ({ items: [{ id: 'i1', position: 1, question: 'Pick A', item_type: 'multiple_choice', options: ['A', 'B'], points: 2 }], keys: { i1: { correct_answer: 'A' } } }))}
      loadSubmissions={vi.fn(async () => [{ id: 's1', name: 'Ana Cruz', status: 'submitted', released: false }])}
      loadAnswers={vi.fn(async () => ({ answers: { i1: 'A' }, prior: {}, provisional: {} }))}
      saveMarks={vi.fn(async () => true)} releaseScore={vi.fn(async () => true)} onClose={vi.fn()} />
    </ThemeContext.Provider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Check' }, { timeout: 4000 }));
    await screen.findByText(/^Reviewed score:/);
    const row = screen.getByRole('button', { name: 'Back' }).parentElement;
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(['sticky', 'bottom-0', 'border-t']));
    expect(row.style.paddingBottom).toContain('safe-area-inset-bottom');
    expect(row.contains(screen.getByRole('button', { name: 'Approve review locally' }))).toBe(true);
    expect(row.contains(screen.getByRole('button', { name: 'Release result' }))).toBe(true);
    // Still inside the scrolling body: no pinned footer for this dialog.
    expect(screen.getByRole('dialog', { name: 'Submissions — Unit quiz' }).querySelector('[data-modal-footer]')).toBeNull();
  });
});
