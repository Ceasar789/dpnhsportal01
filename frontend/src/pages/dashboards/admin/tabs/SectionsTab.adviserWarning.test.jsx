// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { otherAdvisedSections } from '../shared/sectionsValidation';

const h = vi.hoisted(() => ({ context: null }));

vi.mock('../AdminContext', () => ({ useAdminContext: () => h.context }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false }));

const { default: SectionsTab } = await import('./SectionsTab');

const ANA = { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test', role: 'teacher', status: 'active' };
const BEN = { id: 'ben', name: 'Ben Cruz', email: 'ben@example.test', role: 'teacher', status: 'active' };
const RIZAL = { id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: '2026-2027', adviser_id: 'ana', capacity: 40 };
const MABINI = { id: 'mabini', name: '7-Mabini', grade_level: 'Grade 7', school_year: '2026-2027', adviser_id: 'ben', capacity: 40 };
const OLD = { id: 'old', name: '8-Luna', grade_level: 'Grade 8', school_year: '2025-2026', adviser_id: 'ben', capacity: 40 };

const context = (overrides = {}) => ({
  schoolYear: '2026-2027', teachers: [ANA, BEN], sections: [RIZAL, MABINI],
  sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  sectionModal: 'create', editingSection: null,
  secName: '7-Bonifacio', setSecName: vi.fn(), secGrade: 'Grade 7', setSecGrade: vi.fn(),
  secAdviser: '', setSecAdviser: vi.fn(), secAdviserError: '', setSecAdviserError: vi.fn(),
  secCapacity: '40', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: null, classList: [], classListLoading: false, classListError: false, unassignedStudents: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(),
  showToast: vi.fn(),
  ...overrides,
});
const WARNING = 'Ana Reyes already advises 7-Rizal this school year. A teacher normally advises one section.';

beforeEach(() => { h.context = context(); });
afterEach(cleanup);

describe('adviser warning in the Sections form', () => {
  it('warns when the chosen adviser already advises another section this year, and saving still works', () => {
    h.context = context({ secAdviser: 'ana' });
    render(<SectionsTab />);
    const warning = screen.getByText(WARNING);
    expect(warning.getAttribute('role')).toBe('status');
    expect(screen.getByLabelText('Adviser').getAttribute('aria-describedby')).toContain('sections-adviser-warning');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(h.context.saveSection).toHaveBeenCalledTimes(1);
  });

  it('does not warn about the section being edited', () => {
    h.context = context({ sectionModal: 'edit', editingSection: RIZAL, secName: '7-Rizal', secAdviser: 'ana' });
    render(<SectionsTab />);
    expect(screen.queryByText(/already advises/)).toBeNull();
  });

  it('does not warn for a section in a different school year', () => {
    h.context = context({ sections: [RIZAL, OLD], secAdviser: 'ben' });
    render(<SectionsTab />);
    expect(screen.queryByText(/already advises/)).toBeNull();
  });

  it('does not warn when there is no adviser', () => {
    render(<SectionsTab />);
    expect(screen.queryByText(/already advises/)).toBeNull();
  });
});

describe('otherAdvisedSections', () => {
  const sections = [RIZAL, MABINI, OLD, { id: 'x', name: '7-Extra', school_year: '2026-2027', adviser_id: 'ana' }];
  it('finds only the adviser\'s other sections in the same year', () => {
    expect(otherAdvisedSections({ adviserId: 'ana', sections, editingSectionId: 'rizal', schoolYear: '2026-2027' })
      .map(s => s.id)).toEqual(['x']);
    expect(otherAdvisedSections({ adviserId: 'ben', sections, editingSectionId: null, schoolYear: '2026-2027' })
      .map(s => s.id)).toEqual(['mabini']);
    expect(otherAdvisedSections({ adviserId: '', sections, editingSectionId: null, schoolYear: '2026-2027' })).toEqual([]);
  });
});
