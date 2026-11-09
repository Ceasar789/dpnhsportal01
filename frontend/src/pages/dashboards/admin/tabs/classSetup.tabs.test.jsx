// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {}, narrow: false }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useIsNarrow: () => h.narrow }));

const { default: SchedulesTab } = await import('./SchedulesTab');
const { default: SectionsTab } = await import('./SectionsTab');

const YEAR = '2026-2027';
const ENG = { id: 'eng', name: 'English', code: 'ENG' };
const MATH = { id: 'math', name: 'Mathematics', code: 'MATH' };
const SCI = { id: 'sci', name: 'Science', code: 'SCI' };
const ANA = { id: 'ana', name: 'Ana Reyes', role: 'teacher', status: 'active' };
const BEN = { id: 'ben', name: 'Ben Cruz', role: 'teacher', status: 'active' };
const RIZAL = { id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: YEAR, adviser_id: 'ana', capacity: 40 };
const LUNA = { id: 'luna', name: '8-Luna', grade_level: 'Grade 8', school_year: YEAR, adviser_id: null, capacity: 40 };
const row = (id, over) => ({ id, section_id: 'rizal', subject_id: 'eng', teacher_id: 'ana', day_of_week: 'Monday',
  start_time: '08:00:00', end_time: '09:00:00', room_number: null, school_year: YEAR, ...over });
const SCHEDULES = [
  row('e3', { day_of_week: 'Friday', start_time: '08:00:00', end_time: '09:00:00', teacher_id: 'ben' }),
  row('e1', { day_of_week: 'Monday', start_time: '10:00:00', end_time: '11:00:00', room_number: 'Room 101' }),
  row('e2', { day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00' }),
  row('m1', { subject_id: 'math', day_of_week: 'Tuesday' }),
];

const schedulesCtx = (over = {}) => ({
  schoolYear: YEAR, settingsSchoolYear: YEAR, schoolYearSource: 'settings',
  teachers: [ANA, BEN], teachersLoading: false, teachersError: false, fetchTeachers: vi.fn(),
  subjects: [ENG, MATH, SCI], subjectsLoading: false, subjectsError: false, fetchSubjects: vi.fn(),
  sections: [RIZAL, LUNA], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(),
  schedules: SCHEDULES, schedulesLoading: false, schedulesError: false, fetchSchedules: vi.fn(),
  scheduleOpenSectionId: 'rizal', setScheduleOpenSectionId: vi.fn(),
  scheduleModal: null, openCreateSchedule: vi.fn(), closeScheduleModal: vi.fn(), saveSchedule: vi.fn(), deleteSchedule: vi.fn(),
  schedTeacher: '', setSchedTeacher: vi.fn(), schedSubject: '', schedSection: '',
  schedDay: 'Monday', setSchedDay: vi.fn(), schedStart: '08:00', setSchedStart: vi.fn(),
  schedEnd: '09:00', setSchedEnd: vi.fn(), schedRoom: '', setSchedRoom: vi.fn(), schedSaving: false,
  scheduleConflicts: [], scheduleCheckError: '',
  ...over,
});
const sectionsCtx = (over = {}) => ({
  schoolYear: YEAR, settingsSchoolYear: YEAR, schoolYearSource: 'settings',
  teachers: [ANA, BEN], sections: [RIZAL, LUNA], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  sectionModal: null, editingSection: null,
  secName: '', setSecName: vi.fn(), secGrade: '', setSecGrade: vi.fn(),
  secAdviser: '', setSecAdviser: vi.fn(), secAdviserError: '', setSecAdviserError: vi.fn(),
  secCapacity: '40', setSecCapacity: vi.fn(), secCapacityError: '', setSecCapacityError: vi.fn(), secSaving: false,
  openCreateSection: vi.fn(), openEditSection: vi.fn(), closeSectionModal: vi.fn(), saveSection: vi.fn(), deleteSection: vi.fn(),
  activeSection: null, classList: [], classListLoading: false, classListError: false, unassignedStudents: [],
  openClassList: vi.fn(), closeClassList: vi.fn(), addStudentToSection: vi.fn(), removeStudentFromSection: vi.fn(),
  showToast: vi.fn(),
  schedules: SCHEDULES, schedulesLoading: false, schedulesError: false,
  subjects: [ENG, MATH, SCI], subjectsLoading: false, subjectsError: false,
  setPage: vi.fn(), setScheduleOpenSectionId: vi.fn(),
  ...over,
});

const summary = () => screen.getByRole('region', { name: /Class setup for/ });
const subjectRow = name => screen.getByText(name, { selector: 'div' }).closest('tr');

afterEach(() => { cleanup(); h.narrow = false; });

describe('Schedules: class setup for a section', () => {
  it('shows the adviser and how many subjects have a teacher', () => {
    h.ctx = schedulesCtx();
    render(<SchedulesTab />);
    expect(within(summary()).getByText('Adviser: Ana Reyes')).toBeTruthy();
    expect(within(summary()).getByText('2 of 3 subjects have a teacher')).toBeTruthy();
  });

  it('opens the shared section on its own grade', () => {
    h.ctx = schedulesCtx({ scheduleOpenSectionId: 'luna', schedules: [] });
    render(<SchedulesTab />);
    expect(screen.getByRole('button', { name: /^Grade 8/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(summary()).getByText('No adviser yet')).toBeTruthy();
    expect(within(summary()).getByText('0 of 3 subjects have a teacher')).toBeTruthy();
  });

  it('names each teacher once and lists the periods by day, then time', () => {
    h.ctx = schedulesCtx();
    render(<SchedulesTab />);
    const english = subjectRow('English');
    expect(within(english).getByText('Teachers: Ana Reyes, Ben Cruz')).toBeTruthy();
    const whens = [...english.querySelectorAll('.sched-when')].map(el => el.textContent);
    expect(whens).toEqual(['Monday · 08:00–09:00', 'Monday · 10:00–11:00 · Room 101', 'Friday · 08:00–09:00']);
    expect(within(subjectRow('Mathematics')).getByText('Teacher: Ana Reyes')).toBeTruthy();
  });

  it('a subject nobody teaches says so and keeps its Add action', () => {
    h.ctx = schedulesCtx();
    render(<SchedulesTab />);
    const science = subjectRow('Science');
    expect(within(science).getByText(/No teacher yet/)).toBeTruthy();
    fireEvent.click(within(science).getByRole('button', { name: 'Add Science schedule' }));
    expect(h.ctx.openCreateSchedule).toHaveBeenCalledWith({ sectionId: 'rizal', subjectId: 'sci' });
  });

  it('a failed schedules load shows the error, never "No teacher yet"', () => {
    h.ctx = schedulesCtx({ schedulesError: true, schedules: [] });
    render(<SchedulesTab />);
    expect(screen.getByText(/Could not load schedules/)).toBeTruthy();
    expect(screen.queryByText(/No teacher yet/)).toBeNull();
    expect(screen.queryByText(/subjects have a teacher/)).toBeNull();
  });

  it('while subjects or schedules load, the count says so instead of a number', () => {
    h.ctx = schedulesCtx({ subjectsLoading: true });
    render(<SchedulesTab />);
    expect(within(summary()).getByText('Loading class setup…')).toBeTruthy();
  });
});

describe('Sections: class setup line', () => {
  it('shows the adviser and coverage per section, and opens its class setup', () => {
    h.ctx = sectionsCtx();
    render(<SectionsTab />);
    expect(screen.getByText('Adviser: Ana Reyes · 2 of 3 subjects have a teacher')).toBeTruthy();
    expect(screen.getByText('No adviser yet · 0 of 3 subjects have a teacher')).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Open class setup for 7-Rizal' });
    expect(open.style.minHeight).toBe('44px');
    fireEvent.click(open);
    expect(h.ctx.setScheduleOpenSectionId).toHaveBeenCalledWith('rizal');
    expect(h.ctx.setPage).toHaveBeenCalledWith('schedules');
  });

  it('a failed schedules read says unavailable, never "0 of"', () => {
    h.ctx = sectionsCtx({ schedulesError: true, schedules: [] });
    render(<SectionsTab />);
    expect(screen.getByText('Adviser: Ana Reyes · class setup unavailable')).toBeTruthy();
    expect(screen.queryByText(/0 of 3/)).toBeNull();
  });

  it('on a narrow screen the action is in the row sheet, not inside the row', () => {
    h.narrow = true;
    h.ctx = sectionsCtx();
    render(<SectionsTab />);
    expect(screen.queryByRole('button', { name: 'Open class setup for 7-Rizal' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open 7-Rizal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open class setup' }));
    expect(h.ctx.setPage).toHaveBeenCalledWith('schedules');
  });
});
