// @vitest-environment jsdom
// ============================================
// FILE: src/pages/dashboards/admin/tabs/SchedulesTab.test.jsx
// Interaction tests for the Schedules screen.
//
// This covers exactly what the render smoke test cannot: with no sections in
// its stub, that test only ever sees this tab's empty state. Removing an
// import used solely inside an opened section still passed it. Everything
// below lives past that point.
//
// Two rules in particular are enforced nowhere else. A teacher may only be
// scheduled for a subject and grade they hold (canTeachSection), and the
// section list must group by a grade_level column that is an unconstrained
// VARCHAR — 'Grade 7', 'grade 7' and '7' all reach it.
// ============================================

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const SchedulesTab = (await import('./SchedulesTab')).default;

const MATH = { id: 'sub-math', name: 'Mathematics', code: 'MATH' };
const ENG = { id: 'sub-eng', name: 'English', code: 'ENG' };
const OLD = { id: 'sub-old', name: 'Legacy Arts', code: 'ARTS', is_active: false };

const ANA = { id: 't-ana', name: 'Ana Cruz', email: 'ana@example.com' };
const RAMON = { id: 't-ramon', name: 'Ramon Delgado', email: 'ramon@example.com' };

const YEAR = '2026-2027';
const MADRID = { id: 'sec-madrid', name: 'Madrid', grade_level: 'Grade 7', school_year: YEAR };
const RIZAL = { id: 'sec-rizal', name: 'Rizal', grade_level: 'Grade 8', school_year: YEAR };
// Spelled the way an unconstrained VARCHAR lets an admin spell it.
const SLOPPY = { id: 'sec-sloppy', name: 'Bonifacio', grade_level: '7', school_year: YEAR };

// Ana holds English for Grade 7; Ramon holds Mathematics for Grade 8 only.
const LOAD = [
  { id: 'l1', teacher_id: ANA.id, subject_id: ENG.id, grade_level: 'Grade 7', school_year: YEAR },
  { id: 'l2', teacher_id: RAMON.id, subject_id: MATH.id, grade_level: 'Grade 8', school_year: YEAR },
];

const baseCtx = (over = {}) => ({
  schoolYear: YEAR,
  teachers: [ANA, RAMON],
  teachersLoading: false,
  teachersError: false,
  fetchTeachers: vi.fn(),
  subjects: [MATH, ENG],
  subjectsLoading: false,
  subjectsError: false,
  fetchSubjects: vi.fn(),
  sections: [MADRID, RIZAL, SLOPPY],
  sectionsLoading: false,
  sectionsError: false,
  fetchSections: vi.fn(),
  teachingLoad: LOAD,
  teachingLoadLoading: false,
  teachingLoadError: false,
  fetchTeachingLoad: vi.fn(),
  schedules: [],
  schedulesLoading: false,
  schedulesError: false,
  fetchSchedules: vi.fn(),
  scheduleModal: null,
  openCreateSchedule: vi.fn(),
  closeScheduleModal: vi.fn(),
  saveSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  schedTeacher: '', setSchedTeacher: vi.fn(),
  schedSubject: '', schedSection: '',
  schedDay: 'Monday', setSchedDay: vi.fn(),
  schedStart: '08:00', setSchedStart: vi.fn(),
  schedEnd: '09:00', setSchedEnd: vi.fn(),
  schedRoom: '', setSchedRoom: vi.fn(),
  schedSaving: false,
  ...over,
});

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(cleanup);

describe('SchedulesTab — sections', () => {
  it('shows only the chosen grade’s sections', () => {
    render(<SchedulesTab />);
    expect(screen.getByText('Madrid')).toBeTruthy();
    expect(screen.queryByText('Rizal')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Grade 8/ }));
    expect(screen.getByText('Rizal')).toBeTruthy();
    expect(screen.queryByText('Madrid')).toBeNull();
  });

  // grade_level is an unconstrained VARCHAR. Compared literally, a section
  // spelled '7' belongs to no tab at all and simply disappears.
  it('groups a section whose grade_level is spelled loosely', () => {
    render(<SchedulesTab />);
    expect(screen.getByText('Bonifacio')).toBeTruthy();
  });

  it('counts filled subjects per section without opening it', () => {
    h.ctx = baseCtx({
      schedules: [{
        id: 's1', section_id: MADRID.id, subject_id: ENG.id, teacher_id: ANA.id,
        day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00',
      }],
    });
    render(<SchedulesTab />);
    expect(screen.getByText('1/2 active subjects')).toBeTruthy();
  });

  it('asks for a section before showing anything to fill in', () => {
    render(<SchedulesTab />);
    expect(screen.getByText(/pick a section above/i)).toBeTruthy();
  });
});

describe('SchedulesTab — inside a section', () => {
  it('lists every subject, filled or not', () => {
    h.ctx = baseCtx({
      schedules: [{
        id: 's1', section_id: MADRID.id, subject_id: ENG.id, teacher_id: ANA.id,
        day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00',
        room_number: 'Room 201',
      }],
    });
    render(<SchedulesTab />);
    fireEvent.click(screen.getByText('Madrid'));

    // The filled one reads back who, when and where.
    expect(screen.getByText('Ana Cruz')).toBeTruthy();
    expect(screen.getByText(/Monday · 08:00–09:00 · Room 201/)).toBeTruthy();
    // The unfilled one is still listed — the gap is the thing worth seeing.
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText(/nobody scheduled/i)).toBeTruthy();
  });

  it('opens the form already knowing the section and subject', () => {
    render(<SchedulesTab />);
    fireEvent.click(screen.getByText('Madrid'));
    fireEvent.click(screen.getAllByRole('button', { name: /add/i })[0]);

    expect(h.ctx.openCreateSchedule).toHaveBeenCalledWith({
      sectionId: MADRID.id, subjectId: MATH.id,
    });
  });

  it('keeps inactive and unresolved saved periods visible without an Add action', () => {
    h.ctx = baseCtx({
      subjects: [MATH, ENG, OLD],
      schedules: [
        { id: 'old-row', section_id: MADRID.id, subject_id: OLD.id, teacher_id: ANA.id, day_of_week: 'Tuesday', start_time: '10:00', end_time: '11:00' },
        { id: 'missing-row', section_id: MADRID.id, subject_id: 'deleted-subject', teacher_id: RAMON.id, day_of_week: 'Friday', start_time: '13:00', end_time: '14:00' },
      ],
    });
    render(<SchedulesTab />);
    fireEvent.click(screen.getByText('Madrid'));

    expect(screen.getByText('Legacy Arts')).toBeTruthy();
    expect(screen.getByText('Subject reference unavailable')).toBeTruthy();
    expect(screen.getAllByText(/existing periods only/i)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Add Legacy Arts schedule/i })).toBeNull();
    expect(screen.getByText('0/2 active subjects · 2 legacy periods')).toBeTruthy();
  });

  it('exposes selected grade, selected section and subject-specific Add names', () => {
    render(<SchedulesTab />);
    expect(screen.getByRole('button', { name: /^Grade 7/ }).getAttribute('aria-pressed')).toBe('true');
    const madrid = screen.getByRole('button', { name: /Madrid/ });
    expect(madrid.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(madrid);
    expect(madrid.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add Mathematics schedule' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add English schedule' })).toBeTruthy();
  });

  it('marks narrow-layout cells with persistent identity, detail and action semantics', () => {
    h.ctx = baseCtx({ schedules: [{
      id: 's1', section_id: MADRID.id, subject_id: ENG.id, teacher_id: ANA.id,
      day_of_week: 'Monday', start_time: '08:00', end_time: '09:00', room_number: 'Room 201',
    }] });
    const { container } = render(<SchedulesTab />);
    fireEvent.click(screen.getByText('Madrid'));
    const englishRow = screen.getByText('English').closest('tr');
    expect(englishRow.querySelector('[data-cell="identity"]')).toBeTruthy();
    expect(englishRow.querySelector('[data-cell="detail"]')).toBeTruthy();
    expect(englishRow.querySelector('[data-cell="actions"]')).toBeTruthy();
    expect(container.querySelector('.schedule-table-card')).toBeTruthy();
  });
});

describe('SchedulesTab — the form', () => {
  // Opens the modal the way the real flow does: pick the section first, so
  // the component knows which grade the eligibility rule applies to.
  const openForm = (over = {}) => {
    const view = render(<SchedulesTab />);
    fireEvent.click(screen.getByText('Madrid'));
    Object.assign(h.ctx, {
      scheduleModal: 'create', schedSection: MADRID.id, ...over,
    });
    view.rerender(<SchedulesTab />);
    return view;
  };

  // canTeachSection, applied before the choice is offered rather than after
  // it is made. Ana holds English for Grade 7; Ramon does not.
  it('offers only teachers who hold that subject at that grade', () => {
    openForm({ schedSubject: ENG.id });
    const names = [...screen.getAllByRole('option')].map(o => o.textContent);
    expect(names).toContain('Ana Cruz');
    expect(names).not.toContain('Ramon Delgado');
  });

  it('says where to fix it when nobody is eligible', () => {
    openForm({ schedSubject: MATH.id });
    expect(screen.getByText(/no teacher holds this subject at this grade/i)).toBeTruthy();
    expect(screen.getByText(/in Teaching Load first/i)).toBeTruthy();
  });

  it('does not misreport loading or failed eligibility as no teaching load', () => {
    const view = openForm({ schedSubject: ENG.id, teachersLoading: true });
    expect(screen.getByText(/loading teachers and teaching-load assignments/i)).toBeTruthy();
    expect(screen.queryByText(/assign someone/i)).toBeNull();

    Object.assign(h.ctx, { teachersLoading: false, teachingLoadError: true });
    view.rerender(<SchedulesTab />);
    expect(screen.getByText(/eligibility could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText(/assign someone/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry eligibility/i }));
    expect(h.ctx.fetchTeachingLoad).toHaveBeenCalledOnce();
  });

  it('marks the teacher field and refuses to save when it is empty', () => {
    openForm({ schedSubject: ENG.id });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(screen.getByText('Select a teacher.')).toBeTruthy();
    expect(screen.getByLabelText('Teacher').required).toBe(true);
    expect(h.ctx.saveSchedule).not.toHaveBeenCalled();
  });

  // Used to be a toast from saveSchedule, which named neither box.
  it('marks both time boxes when the end is not after the start', () => {
    const { container } = openForm({
      schedSubject: ENG.id, schedTeacher: ANA.id, schedStart: '10:00', schedEnd: '09:00',
    });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(screen.getByText(/end time must be after the start time/i)).toBeTruthy();
    expect(container.querySelectorAll('input.is-invalid').length).toBe(2);
    expect(screen.getByLabelText('Start').getAttribute('aria-describedby')).toBe('schedules-time-error');
    expect(screen.getByLabelText('End').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Start').required).toBe(true);
    expect(h.ctx.saveSchedule).not.toHaveBeenCalled();
  });

  it('saves once everything is valid', () => {
    openForm({ schedSubject: ENG.id, schedTeacher: ANA.id });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(h.ctx.saveSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('SchedulesTab — failures', () => {
  it('distinguishes subject loading, failure and a genuine empty result', () => {
    const view = render(<SchedulesTab />);
    fireEvent.click(screen.getByText('Madrid'));

    Object.assign(h.ctx, { subjectsLoading: true });
    view.rerender(<SchedulesTab />);
    expect(screen.queryByText(/No active subjects yet/i)).toBeNull();

    Object.assign(h.ctx, { subjectsLoading: false, subjectsError: true });
    view.rerender(<SchedulesTab />);
    expect(screen.getByText(/Could not load subjects/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retry subjects/i }));
    expect(h.ctx.fetchSubjects).toHaveBeenCalledOnce();

    Object.assign(h.ctx, { subjectsError: false, subjects: [] });
    view.rerender(<SchedulesTab />);
    expect(screen.getByText(/No active subjects yet/i)).toBeTruthy();
  });

  it('offers a retry instead of an empty school', () => {
    h.ctx = baseCtx({ schedulesError: true });
    render(<SchedulesTab />);
    expect(screen.getByText(/could not load/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('points at Sections when the grade has none', () => {
    h.ctx = baseCtx({ sections: [] });
    render(<SchedulesTab />);
    expect(screen.getByText(/create them in Sections first/i)).toBeTruthy();
  });
});
