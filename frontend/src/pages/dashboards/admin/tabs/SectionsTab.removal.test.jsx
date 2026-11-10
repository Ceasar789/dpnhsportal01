// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ context: null }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.context }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false }));

const { default: SectionsTab } = await import('./SectionsTab');

const context = (over = {}) => ({
  schoolYear: '2026-2027', teachers: [], sections: [], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  sectionModal: null, editingSection: null,
  secName: '', setSecName: vi.fn(), secGrade: '', setSecGrade: vi.fn(),
  secAdviser: '', setSecAdviser: vi.fn(), secAdviserError: '', setSecAdviserError: vi.fn(),
  secCapacity: '40', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: { id: 'rizal', name: '7-Rizal', capacity: 40 },
  classList: [{ id: 'm-ana', student_id: 'ana', name: 'Ana Reyes', email: 'ana@example.test' }],
  classListLoading: false, classListError: false, unassignedStudents: [], previousMembers: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(async () => true),
  showToast: vi.fn(),
  ...over,
});
const openReasons = () => fireEvent.click(screen.getByRole('button', { name: 'Remove Ana Reyes from this section' }));
const confirm = () => screen.getByRole('button', { name: 'Remove from section' });

afterEach(cleanup);

describe('removing a student asks why', () => {
  it('asks the question with three choices, none chosen, and Confirm disabled until one is', () => {
    h.context = context();
    render(<SectionsTab />);
    openReasons();
    const group = screen.getByRole('group', { name: 'Why is Ana Reyes being removed from 7-Rizal?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map(r => r.labels[0].textContent)).toEqual([
      'Dropped (no longer attending)', 'Transferred (moved to another school)', 'Added by mistake / wrong section',
    ]);
    expect(radios.every(r => !r.checked)).toBe(true);
    expect(confirm().disabled).toBe(true);
    expect(h.context.removeStudentFromSection).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByLabelText('Dropped (no longer attending)'));
    expect(confirm().disabled).toBe(false);
  });

  it.each([
    ['Dropped (no longer attending)', 'dropped'],
    ['Transferred (moved to another school)', 'transferred'],
    ['Added by mistake / wrong section', 'mistake'],
  ])('%s sends reason %s and closes the question', async (label, reason) => {
    h.context = context();
    render(<SectionsTab />);
    openReasons();
    fireEvent.click(screen.getByLabelText(label));
    await act(async () => { fireEvent.click(confirm()); });
    expect(h.context.removeStudentFromSection).toHaveBeenCalledWith('m-ana', reason);
    expect(screen.queryByRole('group', { name: /Why is Ana Reyes/ })).toBeNull();
  });

  it('a failed removal keeps the question open and the student listed', async () => {
    h.context = context({ removeStudentFromSection: vi.fn(async () => false) });
    render(<SectionsTab />);
    openReasons();
    fireEvent.click(screen.getByLabelText('Dropped (no longer attending)'));
    await act(async () => { fireEvent.click(confirm()); });
    expect(screen.getByRole('group', { name: /Why is Ana Reyes/ })).toBeTruthy();
    expect(screen.getByText('Ana Reyes')).toBeTruthy();
  });

  it('Cancel closes the question without removing anyone', () => {
    h.context = context();
    render(<SectionsTab />);
    openReasons();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: /Why is Ana Reyes/ })).toBeNull();
    expect(h.context.removeStudentFromSection).not.toHaveBeenCalled();
  });

  it('a second Confirm press while removing does not remove twice', async () => {
    let finish;
    const removeStudentFromSection = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    h.context = context({ removeStudentFromSection });
    render(<SectionsTab />);
    openReasons();
    fireEvent.click(screen.getByLabelText('Added by mistake / wrong section'));
    fireEvent.click(confirm());
    fireEvent.click(screen.getByRole('button', { name: 'Removing…' }));
    expect(removeStudentFromSection).toHaveBeenCalledTimes(1);
    await act(async () => finish(false));
  });
});

describe('previously in this section', () => {
  it('is shown, collapsed and read-only, only when there are former members', () => {
    h.context = context({ previousMembers: [
      { id: 'm-ben', student_id: 'ben', name: 'Ben Cruz', status: 'dropped', enrollment_date: '2026-06-11' },
      { id: 'm-cy', student_id: 'cy', name: 'Cy Lim', status: 'transferred', enrollment_date: '2026-06-12' },
    ] });
    render(<SectionsTab />);
    const summary = screen.getByText('Previously in this section (2)');
    const details = summary.closest('details');
    expect(details.open).toBe(false);
    const table = within(details).getByRole('table', { name: 'Previously in this section', hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true }).slice(1).map(tr => tr.textContent);
    expect(rows).toEqual(['Ben CruzDroppedJun 11, 2026', 'Cy LimTransferredJun 12, 2026']);
    expect(within(details).queryAllByRole('button', { hidden: true }).map(b => b.getAttribute('aria-label')))
      .toEqual(['View profile of Ben Cruz', 'View profile of Cy Lim']);
  });

  it('is not shown when nobody has left the section', () => {
    h.context = context();
    render(<SectionsTab />);
    expect(screen.queryByText(/Previously in this section/)).toBeNull();
  });
});
