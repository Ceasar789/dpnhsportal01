// @vitest-environment jsdom
// Clarity A2: the Admin Sections tab (final design) from real context data,
// with every classic function reachable through the same handlers, and the
// dialogs word-for-word copies of the classic ones (parity checked here).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false, useMediaQuery: () => false }));
vi.mock('../../../pages/dashboards/admin/shared/StudentProfileSheet', () => ({
  default: ({ student }) => <div role="dialog" aria-label={`Profile of ${student.name}`} />,
}));

import SectionsTab from '../../../pages/dashboards/admin/tabs/SectionsTab';
import ClarityAdminSectionsTab from './ClarityAdminSectionsTab';

const TEACHERS = [
  { id: 't1', name: 'Ana Cruz', email: 'ana@x.test', role: 'teacher', status: 'active' },
  { id: 't2', name: 'Ben Reyes', email: 'ben@x.test', role: 'teacher', status: 'active' },
  { id: 't9', name: 'Old Adviser', email: 'old@x.test', role: 'teacher', status: 'archived' },
];
const SECTIONS = [
  { id: 'a', name: '7-Rizal', grade_level: 'Grade 7', adviser_id: 't1', capacity: 40, school_year: '2026-2027' },
  { id: 'b', name: '7-Mabini', grade_level: '7', adviser_id: null, capacity: 35, school_year: '2026-2027' },
  { id: 'c', name: '8-Luna', grade_level: 'Grade 8', adviser_id: 'gone', capacity: 38, school_year: '2026-2027' },
];
const baseCtx = () => ({
  schoolYear: '2026-2027', settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: TEACHERS, sections: SECTIONS, sectionsLoading: false, sectionsError: null, fetchSections: vi.fn(),
  sectionModal: false, editingSection: null,
  secName: '', setSecName: vi.fn(), secGrade: '', setSecGrade: vi.fn(), secAdviser: '', setSecAdviser: vi.fn(),
  secCapacity: '', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(),
  secAdviserError: '', setSecAdviserError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: null, classList: [], classListLoading: false, classListError: null, unassignedStudents: [], previousMembers: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(async () => true),
  showToast: vi.fn(),
  schedules: [{ id: 'p1', section_id: 'a', subject_id: 'm' }], schedulesLoading: false, schedulesError: null,
  subjects: [{ id: 'm', name: 'Math', code: 'MATH', is_active: true }, { id: 's', name: 'Science', code: 'SCI', is_active: true }],
  subjectsLoading: false, subjectsError: null,
  setPage: vi.fn(), setScheduleOpenSectionId: vi.fn(),
});
const show = (Tab = ClarityAdminSectionsTab) => render(<Tab />);
const card = name => screen.getByRole('heading', { level: 3, name }).closest('article');
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('layout from real data', () => {
  it('header and button', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Sections' })).toBeTruthy();
    expect(screen.getByText('Grouped by grade level.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add section' })).toBeTruthy();
  });

  it('one column per grade that has sections, in grade order, with the real count; no empty grades', () => {
    show();
    const cols = screen.getAllByRole('heading', { level: 2 }).map(h2 => h2.textContent);
    expect(cols).toEqual(['Grade 7', 'Grade 8']);
    const grade7 = screen.getByRole('region', { name: 'Grade 7' });
    expect(within(grade7).getByText('2', { selector: '.x-sec-colhead > span' }).textContent).toBe('2 sections');
    expect(within(grade7).getAllByRole('article').map(a => a.querySelector('h3').textContent)).toEqual(['7-Rizal', '7-Mabini']);
  });

  it('cards: name, the adviser from the real teacher list, the real capacity; no bar and no "N / capacity"', () => {
    show();
    expect(within(card('7-Rizal')).getByText('Ana Cruz')).toBeTruthy();
    expect(within(card('7-Mabini')).getByText('No adviser yet')).toBeTruthy();
    expect(within(card('8-Luna')).getByText('Adviser not found')).toBeTruthy();
    expect(within(card('7-Rizal')).getByText('Capacity 40')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\/\s*40|students/);
    expect(document.querySelector('[role="progressbar"], .x-bar')).toBeNull();
  });

  it('the coverage line has the same wording as the classic class-setup line', () => {
    show(SectionsTab);
    const classicLine = screen.getByText('7-Rizal').closest('td').querySelector('.row-sub').textContent;
    cleanup();
    show();
    const coverage = within(card('7-Rizal')).getAllByText((_, el) => el?.classList?.contains('x-sec-meta'))[1].textContent;
    expect(classicLine).toBe(`Adviser: Ana Cruz · ${coverage}`);
  });

  it('no "preview" and no invented numbers', () => {
    show();
    expect(document.body.textContent).not.toMatch(/preview|38 \/ 40/i);
  });
});

describe('states (same texts as classic)', () => {
  it.each([
    ['loading', c => { c.sectionsLoading = true; }, 'Loading sections…'],
    ['error', c => { c.sectionsError = 'x'; }, 'Could not load sections. Check your connection and try again.'],
    ['empty', c => { c.sections = []; }, 'No sections for 2026-2027 yet.'],
  ])('%s', (_, arrange, text) => {
    arrange(h.ctx);
    show(SectionsTab); const classic = document.body.textContent; cleanup();
    show();
    expect(classic).toContain(text);
    expect(document.body.textContent).toContain(text);
  });
  it('Retry calls fetchSections', () => {
    h.ctx.sectionsError = 'x';
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchSections).toHaveBeenCalled();
  });
});

describe('every classic function, same handlers and arguments', () => {
  const press = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Class list for 7-Rizal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit 7-Rizal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete 7-Rizal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open class setup for 7-Rizal' }));
    return [h.ctx.openClassList.mock.calls[0], h.ctx.openEditSection.mock.calls[0], h.ctx.deleteSection.mock.calls[0][0],
      h.ctx.setScheduleOpenSectionId.mock.calls[0], h.ctx.setPage.mock.calls[0]];
  };
  it('class list, edit, delete, open class setup', () => {
    show(SectionsTab); const classic = press(); cleanup(); h.ctx = baseCtx();
    show();
    expect(press()).toEqual(classic);
    expect(classic).toEqual([[SECTIONS[0]], [SECTIONS[0]], 'a', ['a'], ['schedules']]);
  });
  it('Add section opens the create dialog', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    expect(h.ctx.openCreateSection).toHaveBeenCalledTimes(1);
  });
  it('after a delete, focus moves to the next Delete button, or to the heading', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete 7-Rizal' }));
    const focusAfter = h.ctx.deleteSection.mock.calls[0][1];
    focusAfter();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete 7-Rizal' }));
    document.querySelectorAll('.archive-action').forEach(el => el.remove());
    focusAfter();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Sections' }));
  });
});

describe('the section dialog is the classic one', () => {
  const editing = { ...SECTIONS[0], adviser_id: 't9' };
  it.each([
    ['create', {}],
    ['edit, with an inactive existing adviser and a second advisory warning', { editingSection: editing, secName: '7-Rizal', secGrade: 'Grade 7', secAdviser: 't1', secCapacity: '40' }],
  ])('%s: identical markup', (_, extra) => {
    Object.assign(h.ctx, { sectionModal: true, ...extra });
    show(SectionsTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('validation: Create on empty fields shows the same errors and does NOT save', () => {
    h.ctx.sectionModal = true;
    show(SectionsTab);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));
    const classic = norm(screen.getByRole('dialog').outerHTML);
    cleanup();
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
    expect(screen.getByText('Section name is required.')).toBeTruthy();
    expect(screen.getByText('Grade level is required.')).toBeTruthy();
    expect(h.ctx.saveSection).not.toHaveBeenCalled();
  });

  it('valid fields save through saveSection', () => {
    Object.assign(h.ctx, { sectionModal: true, secName: '7-Rizal', secGrade: 'Grade 7', secCapacity: '40' });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));
    expect(h.ctx.saveSection).toHaveBeenCalledTimes(1);
  });

  it('the discard guard is kept', () => {
    h.ctx.sectionModal = true;
    show();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    screen.getByLabelText(/Section Name/).value = 'Changed';
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(h.ctx.closeSectionModal).not.toHaveBeenCalled();
  });
});

describe('the class list dialog is the classic one', () => {
  const classListCtx = () => ({
    activeSection: SECTIONS[0],
    classList: [{ id: 'r1', student_id: 'u1', name: 'Juan Dela Cruz', email: 'juan@x.test' }],
    unassignedStudents: [{ id: 'u2', name: 'Maria Lopez', email: 'maria@x.test' }],
    previousMembers: [{ id: 'r0', student_id: 'u0', name: 'Old Student', status: 'transferred', enrollment_date: '2026-06-10' }],
  });

  it('identical markup (enrolment line, add row, roster, previous members)', () => {
    Object.assign(h.ctx, classListCtx());
    show(SectionsTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('Add with no student chosen gives the same toast', () => {
    Object.assign(h.ctx, classListCtx());
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
    expect(h.ctx.showToast).toHaveBeenCalledWith('Choose a student to add', 'error');
  });

  it('remove asks for a reason, then calls removeStudentFromSection(row id, reason), as classic', async () => {
    const run = async (Tab) => {
      h.ctx = { ...baseCtx(), ...classListCtx() };
      show(Tab);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Juan Dela Cruz from this section' }));
      const legend = screen.getByText('Why is Juan Dela Cruz being removed from 7-Rizal?');
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[0]);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove from section' })); });
      const call = h.ctx.removeStudentFromSection.mock.calls[0];
      cleanup();
      return [Boolean(legend), radios.length, call];
    };
    const classic = await run(SectionsTab);
    const clarity = await run(ClarityAdminSectionsTab);
    expect(clarity).toEqual(classic);
    expect(classic[2][0]).toBe('r1');
  });

  it('View profile opens the student profile sheet', () => {
    Object.assign(h.ctx, classListCtx());
    show();
    fireEvent.click(screen.getByRole('button', { name: 'View profile of Juan Dela Cruz' }));
    expect(screen.getByRole('dialog', { name: 'Profile of Juan Dela Cruz' })).toBeTruthy();
  });
});
