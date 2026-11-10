// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeachingLoadUnsavedChangesProvider } from '../../../../context/TeachingLoadUnsavedChangesContext';

const h = vi.hoisted(() => ({ ctx: null, narrow: false }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useIsNarrow: () => h.narrow }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: async fn => fn() }));
vi.mock('../../../../config/supabase', () => {
  const result = (table) => {
    if (table === 'profiles') return { data: { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test', status: 'active' }, error: null };
    if (table === 'students') return { data: { id: 'ana', lrn: null, student_number: null, student_status: 'Regular' }, error: null };
    return { data: [], error: null };
  };
  const query = (table) => {
    const api = { select: () => api, eq: () => api, maybeSingle: () => api, then: (ok, no) => Promise.resolve(result(table)).then(ok, no) };
    return api;
  };
  return { supabase: { from: query } };
});

const { default: SectionsTab } = await import('./SectionsTab');
const { default: TeachingLoadTab } = await import('./TeachingLoadTab');

const sectionsCtx = (over = {}) => ({
  schoolYear: '2026-2027', teachers: [], sections: [], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  sectionModal: null, editingSection: null,
  secName: '', setSecName: vi.fn(), secGrade: '', setSecGrade: vi.fn(),
  secAdviser: '', setSecAdviser: vi.fn(), secAdviserError: '', setSecAdviserError: vi.fn(),
  secCapacity: '40', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: { id: 'rizal', name: '7-Rizal', capacity: 40 },
  classList: [{ id: 'm-ana', student_id: 'ana', name: 'Ana Reyes', email: 'ana@example.test' }],
  classListLoading: false, classListError: false, unassignedStudents: [],
  previousMembers: [{ id: 'm-ben', student_id: 'ben', name: 'Ben Cruz', status: 'dropped', enrollment_date: '2026-06-11' }],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(),
  showToast: vi.fn(),
  ...over,
});
const escape = () => fireEvent.keyDown(document, { key: 'Escape' });

afterEach(() => { cleanup(); h.narrow = false; });

describe('Sections: View profile opens over the class list', () => {
  it.each([false, true])('from an active row (narrow=%s): opens, Escape closes only the profile, focus returns', async (narrow) => {
    h.narrow = narrow;
    h.ctx = sectionsCtx();
    render(<SectionsTab />);
    const button = screen.getByRole('button', { name: 'View profile of Ana Reyes' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Student profile: Ana Reyes' })).toBeTruthy());
    await waitFor(() => expect(screen.queryByText('Loading profile…')).toBeNull());
    // The class list is still there underneath, and cannot be reached.
    const classList = screen.getByRole('dialog', { name: '7-Rizal — Class List', hidden: true });
    expect(classList.closest('.modal-overlay').inert).toBe(true);

    await act(async () => { escape(); });
    expect(screen.queryByRole('dialog', { name: /Student profile/ })).toBeNull();
    expect(h.ctx.closeClassList).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '7-Rizal — Class List' })).toBeTruthy();
    expect(classList.closest('.modal-overlay').inert).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View profile of Ana Reyes' }));
    expect(screen.getByText('Ana Reyes')).toBeTruthy();
  });

  it('from a "Previously in this section" row, closed with the Close button', async () => {
    h.ctx = sectionsCtx();
    render(<SectionsTab />);
    const button = screen.getByRole('button', { name: 'View profile of Ben Cruz', hidden: true });
    button.focus();
    fireEvent.click(button);
    const profile = await screen.findByRole('dialog', { name: /Student profile/ });
    await act(async () => { fireEvent.click(within(profile).getByRole('button', { name: 'Close' })); });
    expect(screen.queryByRole('dialog', { name: /Student profile/ })).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(h.ctx.closeClassList).not.toHaveBeenCalled();
  });
});

describe('Teaching Load: View profile for the selected teacher', () => {
  it('opens the teacher profile, Escape closes it, focus returns', async () => {
    const ANA = { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test', department: 'English', status: 'active' };
    h.ctx = {
      schoolYear: '2026-2027', setSchoolYear: vi.fn(), teachers: [ANA], teachersError: false, teachersLoading: false,
      subjects: [], subjectsError: false, subjectsLoading: false, fetchSubjects: vi.fn(),
      teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(), fetchTeachers: vi.fn(),
      sections: [], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
      schedules: [], schedulesLoading: false, schedulesError: false, fetchSchedules: vi.fn(),
      addLoadEntries: vi.fn(), removeLoad: vi.fn(), copyLoadFromYear: vi.fn(), showToast: vi.fn(),
    };
    render(<TeachingLoadUnsavedChangesProvider><TeachingLoadTab /></TeachingLoadUnsavedChangesProvider>);
    expect(screen.queryByRole('button', { name: 'View profile' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ana Reyes/ }));
    const button = screen.getByRole('button', { name: 'View profile' });
    expect(button.getAttribute('aria-describedby')).toBe('teacher-detail-heading');
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Teacher profile: Ana Reyes' })).toBeTruthy();
    await act(async () => { escape(); });
    expect(screen.queryByRole('dialog', { name: /Teacher profile/ })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
