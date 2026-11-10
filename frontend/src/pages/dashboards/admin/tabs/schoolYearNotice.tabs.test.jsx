// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false }));

const { default: TeachingLoadTab } = await import('./TeachingLoadTab');
const { default: SectionsTab } = await import('./SectionsTab');

const MISMATCH = 'You are working in 2027-2028, but teachers see 2026-2027. '
  + 'Sections and teaching load created now will not appear for teachers until the System Settings year is changed.';
const FALLBACK = 'School year setting could not be loaded. Showing 2030-2031 from the calendar.';

const teachingCtx = (over = {}) => ({
  schoolYear: '2026-2027', setSchoolYear: vi.fn(), settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: [{ id: 't1', name: 'Ana Cruz', email: 'ana@example.com', department: '', status: 'active' }],
  teachersError: false, teachersLoading: false,
  subjects: [{ id: 'sub-eng', name: 'English', code: 'ENG' }], subjectsError: false, fetchSubjects: vi.fn(),
  teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(), fetchTeachers: vi.fn(),
  addLoadEntries: vi.fn().mockResolvedValue(1), removeLoad: vi.fn().mockResolvedValue(true), copyLoadFromYear: vi.fn(),
  showToast: vi.fn(),
  ...over,
});
const sectionsCtx = (over = {}) => ({
  schoolYear: '2026-2027', settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: [], sections: [], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  sectionModal: 'create', editingSection: null,
  secName: '7-Planning', setSecName: vi.fn(), secGrade: 'Grade 7', setSecGrade: vi.fn(),
  secAdviser: '', setSecAdviser: vi.fn(), secAdviserError: '', setSecAdviserError: vi.fn(),
  secCapacity: '40', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: null, classList: [], classListLoading: false, classListError: false, unassignedStudents: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(),
  showToast: vi.fn(),
  ...over,
});

afterEach(cleanup);

describe('Teaching Load school year', () => {
  it('says which year teachers see, with no warning when the years match', () => {
    h.ctx = teachingCtx();
    render(<TeachingLoadTab />);
    expect(screen.getByText('Teachers currently see 2026-2027.')).toBeTruthy();
    expect(screen.getByLabelText('School Year').getAttribute('aria-describedby')).toContain('teaching-year-teachers');
    expect(screen.queryByText(/You are working in/)).toBeNull();
  });

  it('(b) warns, without blocking, when the working year differs from the settings year', async () => {
    h.ctx = teachingCtx({ schoolYear: '2027-2028' });
    render(<TeachingLoadTab />);
    expect(screen.getByText(MISMATCH).getAttribute('role')).toBe('status');
    // The Save path is unchanged and still reachable: stage one subject and save.
    fireEvent.click(screen.getByRole('button', { name: /Ana Cruz/i }));
    fireEvent.change(screen.getByLabelText('Add Subject'), { target: { value: 'sub-eng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Subject' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Assignment' }));
    await vi.waitFor(() => expect(h.ctx.addLoadEntries).toHaveBeenCalledTimes(1));
  });

  it('(c) shows the calendar fallback notice when the settings year could not be loaded', () => {
    h.ctx = teachingCtx({ schoolYear: '2030-2031', settingsSchoolYear: null, schoolYearSource: 'fallback' });
    render(<TeachingLoadTab />);
    expect(screen.getByText(FALLBACK)).toBeTruthy();
    expect(screen.queryByText(/Teachers currently see/)).toBeNull();
  });

  it('(d) while loading, the year field is empty and disabled', () => {
    h.ctx = teachingCtx({ schoolYear: null, settingsSchoolYear: null, schoolYearSource: 'loading' });
    render(<TeachingLoadTab />);
    const field = screen.getByLabelText('School Year');
    expect(field.value).toBe('');
    expect(field.disabled).toBe(true);
  });
});

describe('Sections school year', () => {
  it('(b) the mismatch warning shows on the page and in the form, and Create still saves', () => {
    h.ctx = sectionsCtx({ schoolYear: '2027-2028' });
    render(<SectionsTab />);
    expect(screen.getAllByText(MISMATCH).length).toBeGreaterThanOrEqual(2);
    const form = screen.getByRole('dialog');
    expect(within(form).getByText(MISMATCH)).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(h.ctx.saveSection).toHaveBeenCalledTimes(1);
  });

  it('(c) shows the fallback notice', () => {
    h.ctx = sectionsCtx({ schoolYear: '2030-2031', settingsSchoolYear: null, schoolYearSource: 'fallback', sectionModal: null });
    render(<SectionsTab />);
    expect(screen.getByText(FALLBACK)).toBeTruthy();
  });

  it('no notice when the working year is the settings year', () => {
    h.ctx = sectionsCtx({ sectionModal: null });
    render(<SectionsTab />);
    expect(screen.queryByText(/You are working in|could not be loaded/)).toBeNull();
  });
});
