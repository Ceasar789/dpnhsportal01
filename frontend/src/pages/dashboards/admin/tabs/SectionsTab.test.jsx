// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ context: null }));

vi.mock('../AdminContext', () => ({ useAdminContext: () => h.context }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false }));

const { default: SectionsTab } = await import('./SectionsTab');

const ACTIVE = { id: 'active-teacher', name: 'Active Teacher', email: 'active@example.test', role: 'teacher', status: 'active' };
const INACTIVE = { id: 'inactive-teacher', name: 'Inactive Teacher', email: 'inactive@example.test', role: 'teacher', status: 'inactive' };
const SUSPENDED = { id: 'suspended-teacher', name: 'Suspended Teacher', email: 'suspended@example.test', role: 'teacher', status: 'suspended' };

const baseContext = (overrides = {}) => ({
  schoolYear: '2026-2027', teachers: [ACTIVE, INACTIVE, SUSPENDED], sections: [],
  sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  sectionModal: 'create', editingSection: null,
  secName: '7-Synthetic', setSecName: vi.fn(), secGrade: 'Grade 7', setSecGrade: vi.fn(),
  secAdviser: '', setSecAdviser: vi.fn(), secAdviserError: '', setSecAdviserError: vi.fn(),
  secCapacity: '40', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: null, classList: [], classListLoading: false, classListError: false, unassignedStudents: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});

beforeEach(() => { h.context = baseContext(); });
afterEach(cleanup);

describe('Sections capacity form', () => {
  it.each([
    ['', 'Capacity is required.'],
    ['0', 'Capacity must be a whole number from 1 to 60.'],
    ['-1', 'Capacity must be a whole number from 1 to 60.'],
    ['1.5', 'Capacity must be a whole number from 1 to 60.'],
    ['61', 'Capacity must be a whole number from 1 to 60.'],
  ])('shows an accessible error for %j and does not call save', (capacity, message) => {
    h.context = baseContext({ secCapacity: capacity });
    render(<SectionsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByLabelText(/Capacity/).getAttribute('aria-invalid')).toBe('true');
    expect(h.context.saveSection).not.toHaveBeenCalled();
  });

  it.each(['1', '40', '60'])('allows valid capacity %s to reach the write boundary', (capacity) => {
    h.context = baseContext({ secCapacity: capacity });
    render(<SectionsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(h.context.saveSection).toHaveBeenCalledTimes(1);
  });

  it('marks capacity as required and publishes its valid range', () => {
    render(<SectionsTab />);
    const capacity = screen.getByLabelText(/Capacity/);
    expect(capacity.required).toBe(true);
    expect(capacity.min).toBe('1');
    expect(capacity.max).toBe('60');
    expect(capacity.step).toBe('1');
  });
});

describe('Sections adviser choices', () => {
  it('offers only active teachers for a new section', () => {
    render(<SectionsTab />);
    const adviser = screen.getByLabelText('Adviser');
    expect(within(adviser).getByRole('option', { name: 'Active Teacher' })).toBeTruthy();
    expect(within(adviser).queryByRole('option', { name: /Inactive Teacher/ })).toBeNull();
    expect(within(adviser).queryByRole('option', { name: /Suspended Teacher/ })).toBeNull();
  });

  it('shows and preserves the existing inactive adviser while keeping it unavailable for a new choice', () => {
    h.context = baseContext({
      sectionModal: 'edit',
      editingSection: { id: 'section-one', adviser_id: INACTIVE.id, capacity: 40 },
      secAdviser: INACTIVE.id,
    });
    render(<SectionsTab />);
    const adviser = screen.getByLabelText('Adviser');
    const legacy = within(adviser).getByRole('option', { name: /Inactive Teacher.*existing adviser/ });
    expect(legacy.disabled).toBe(true);
    expect(legacy.selected).toBe(true);
    expect(screen.getByText(/existing assignment will be preserved/i)).toBeTruthy();
  });

  it('explains when no active teachers are available', () => {
    h.context = baseContext({ teachers: [INACTIVE, SUSPENDED] });
    render(<SectionsTab />);
    expect(screen.getByText('No active teachers are currently available.')).toBeTruthy();
  });
});

describe('Sections full-state presentation', () => {
  it.each([
    [40, 40, 'full'],
    [40, 41, 'over capacity'],
  ])('truthfully reports enrollment %i of capacity %i as %s', (capacity, enrollment, label) => {
    h.context = baseContext({
      sectionModal: null,
      activeSection: { id: 'section-one', name: '7-Synthetic', capacity },
      classList: Array.from({ length: enrollment }, (_, index) => ({ id: `row-${index}`, name: `Synthetic ${index}`, email: `student-${index}@example.test` })),
    });
    render(<SectionsTab />);
    expect(screen.getByRole('status').textContent).toContain(`Enrollment: ${enrollment} of ${capacity}.`);
    expect(screen.getByRole('status').textContent).toContain(label);
  });

  it('blocks a duplicate membership removal while the first request is pending', async () => {
    let resolveRemoval;
    const removeStudentFromSection = vi.fn(() => new Promise(resolve => { resolveRemoval = resolve; }));
    h.context = baseContext({
      sectionModal: null,
      activeSection: { id: 'section-one', name: '7-Synthetic', capacity: 40 },
      classList: [{ id: 'membership-one', name: 'Synthetic Student', email: 'student@example.test' }],
      removeStudentFromSection,
    });
    render(<SectionsTab />);
    const remove = screen.getByRole('button', { name: 'Remove Synthetic Student from this section' });
    fireEvent.click(remove);
    fireEvent.click(remove);
    expect(removeStudentFromSection).toHaveBeenCalledTimes(1);
    await act(async () => resolveRemoval(false));
  });
});
