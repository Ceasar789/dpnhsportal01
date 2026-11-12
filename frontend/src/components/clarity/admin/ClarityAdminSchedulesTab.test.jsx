// @vitest-environment jsdom
// Clarity A3: the Admin Schedules tab (final design) from real rows, with
// every classic function reachable through the same handlers, and the
// dialog (clash messages included) a word-for-word copy of the classic one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import SchedulesTab from '../../../pages/dashboards/admin/tabs/SchedulesTab';
import ClarityAdminSchedulesTab from './ClarityAdminSchedulesTab';

const SECTIONS = [
  { id: 'a', name: '7-Rizal', grade_level: 'Grade 7', adviser_id: 't1' },
  { id: 'b', name: '7-Mabini', grade_level: '7', adviser_id: null },
  { id: 'c', name: '8-Luna', grade_level: 'Grade 8', adviser_id: null },
];
const SUBJECTS = [
  { id: 'm', name: 'Mathematics', code: 'MATH', is_active: true },
  { id: 's', name: 'Science', code: 'SCI', is_active: true },
  { id: 'e', name: 'English', code: 'ENG', is_active: true },
  { id: 'old', name: 'Old Subject', code: 'OLD', is_active: false },
];
const TEACHERS = [{ id: 't1', name: 'Ana Cruz' }, { id: 't2', name: 'Ben' }];
const SCHEDULES = [
  { id: 'p1', section_id: 'a', subject_id: 'm', teacher_id: 't1', day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00', room_number: 'Room 201' },
  { id: 'p2', section_id: 'a', subject_id: 's', teacher_id: 't2', day_of_week: 'Tuesday', start_time: '08:00:00', end_time: '09:00:00', room_number: null },
  { id: 'p3', section_id: 'a', subject_id: 'm', teacher_id: 't1', day_of_week: 'Wednesday', start_time: '09:00:00', end_time: '10:00:00', room_number: null },
  { id: 'p4', section_id: 'a', subject_id: 'old', teacher_id: 't2', day_of_week: 'Saturday', start_time: '07:00:00', end_time: '08:00:00', room_number: null },
  { id: 'p5', section_id: 'c', subject_id: 'e', teacher_id: 't2', day_of_week: 'Friday', start_time: '10:00:00', end_time: '11:00:00', room_number: null },
];
const baseCtx = (extra = {}) => ({
  schoolYear: '2026-2027', settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: TEACHERS, teachersError: null, teachersLoading: false, fetchTeachers: vi.fn(),
  subjects: SUBJECTS, subjectsError: null, subjectsLoading: false, fetchSubjects: vi.fn(),
  sections: SECTIONS, sectionsError: null, sectionsLoading: false, fetchSections: vi.fn(),
  teachingLoad: [{ teacher_id: 't1', subject_id: 'm', grade_level: 'Grade 7' }], teachingLoadError: null, teachingLoadLoading: false, fetchTeachingLoad: vi.fn(),
  schedules: SCHEDULES, schedulesLoading: false, schedulesError: null, fetchSchedules: vi.fn(),
  scheduleOpenSectionId: 'a', setScheduleOpenSectionId: vi.fn(),
  scheduleModal: false, openCreateSchedule: vi.fn(), closeScheduleModal: vi.fn(), saveSchedule: vi.fn(), deleteSchedule: vi.fn(),
  schedTeacher: '', setSchedTeacher: vi.fn(), schedSubject: '', schedSection: '', schedDay: 'Monday', setSchedDay: vi.fn(),
  schedStart: '08:00', setSchedStart: vi.fn(), schedEnd: '09:00', setSchedEnd: vi.fn(), schedRoom: '', setSchedRoom: vi.fn(), schedSaving: false,
  scheduleConflicts: [], scheduleCheckError: '',
  ...extra,
});
const show = (Tab = ClarityAdminSchedulesTab) => render(<Tab />);
const timetable = () => screen.getByRole('table', { name: 'Weekly timetable for 7-Rizal' });
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('header and section picker', () => {
  it('title, subtitle, the section picker grouped by grade with real counts, and "Add class"', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Schedules' })).toBeTruthy();
    expect(screen.getByText('Weekly timetable by section.')).toBeTruthy();
    const pick = screen.getByLabelText('Section');
    expect([...pick.querySelectorAll('optgroup')].map(g => g.label)).toEqual([
      'Grade 7 · 4 scheduled periods', 'Grade 8 · 1 scheduled period',
    ]);
    expect([...pick.querySelectorAll('option')].map(o => o.textContent)).toEqual([
      'Choose a section…', '7-Rizal — 2/3 active subjects · 1 legacy period', '7-Mabini — 0/3 active subjects', '8-Luna — 1/3 active subjects',
    ]);
    expect(screen.getByRole('button', { name: 'Add class' })).toBeTruthy();
  });

  it('the section summaries are the classic chip texts', () => {
    show(SchedulesTab);
    const chips = screen.getAllByRole('button', { pressed: true }).concat(screen.getAllByRole('button', { pressed: false }))
      .map(b => b.querySelector('.section-chip-count')?.textContent).filter(Boolean);
    expect(chips).toContain('2/3 active subjects · 1 legacy period');
  });

  it('choosing a section uses the shared open-section state (as the classic chips do)', () => {
    show();
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'c' } });
    expect(h.ctx.setScheduleOpenSectionId).toHaveBeenCalledWith('c');
  });

  it('no section chosen: the classic prompt, no timetable', () => {
    h.ctx = baseCtx({ scheduleOpenSectionId: null });
    show();
    expect(screen.getByText('Pick a section above to set its schedule.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add class' })).toBeNull();
  });
});

describe('timetable from real rows', () => {
  it('rows are the real time slots, columns Mon-Fri plus Saturday only because a period is on it', () => {
    show();
    const heads = within(timetable()).getAllByRole('columnheader').map(th => th.textContent);
    expect(heads).toEqual(['Time', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const slots = within(timetable()).getAllByRole('rowheader').map(th => [th.querySelector('[aria-hidden="true"]').textContent, th.querySelector('.x-sr').textContent]);
    expect(slots).toEqual([['7:00 – 8:00', '7:00 AM to 8:00 AM'], ['8:00 – 9:00', '8:00 AM to 9:00 AM'], ['9:00 – 10:00', '9:00 AM to 10:00 AM']]);
  });

  it('each block names the subject, the teacher, the day, the time and the room (only when real)', () => {
    show();
    const blocks = within(timetable()).getAllByRole('group').map(g => g.getAttribute('aria-label'));
    expect(blocks).toEqual([
      'Old Subject, Ben, Saturday 7:00 AM–8:00 AM',
      'Mathematics, Ana Cruz, Monday 8:00 AM–9:00 AM, Room 201',
      'Science, Ben, Tuesday 8:00 AM–9:00 AM',
      'Mathematics, Ana Cruz, Wednesday 9:00 AM–10:00 AM',
    ]);
    const math = within(timetable()).getAllByRole('group')[1];
    expect(within(math).getByText('A. Cruz')).toBeTruthy();
    expect(within(math).getByText('Room 201')).toBeTruthy();
  });

  it('empty cells stay empty; the same subject keeps one colour', () => {
    show();
    const cells = [...timetable().querySelectorAll('td')];
    expect(cells.filter(td => td.textContent === '').length).toBeGreaterThan(0);
    const mathColours = within(timetable()).getAllByRole('group').filter(g => g.textContent.startsWith('Mathematics'))
      .map(g => [...g.classList].find(c => /^c\d$/.test(c)));
    expect(new Set(mathColours).size).toBe(1);
  });

  it('a section with no periods: a plain message, no table', () => {
    h.ctx = baseCtx({ scheduleOpenSectionId: 'b' });
    show();
    expect(screen.getByText('No classes scheduled for 7-Mabini yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('every classic function, same handlers and arguments', () => {
  it('delete a period: same label and same deleteSchedule call as classic', () => {
    show(SchedulesTab);
    fireEvent.click(screen.getByRole('button', { name: "Delete Ana Cruz's Monday schedule" }));
    const classic = h.ctx.deleteSchedule.mock.calls[0][0];
    cleanup(); h.ctx = baseCtx();
    show();
    fireEvent.click(screen.getByRole('button', { name: "Delete Ana Cruz's Monday schedule" }));
    expect(h.ctx.deleteSchedule.mock.calls[0][0]).toBe(classic);
    expect(classic).toBe('p1');
  });

  it('after a delete, focus goes to that subject\'s Add button (classic focusSubject)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: "Delete Ana Cruz's Monday schedule" }));
    h.ctx.deleteSchedule.mock.calls[0][1]();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Mathematics schedule' }));
  });

  it('every active subject is listed (gaps visible), legacy periods are marked, Add calls openCreateSchedule as classic', () => {
    show(SchedulesTab);
    fireEvent.click(screen.getByRole('button', { name: 'Add English schedule' }));
    const classic = h.ctx.openCreateSchedule.mock.calls[0];
    cleanup(); h.ctx = baseCtx();
    show();
    const list = screen.getByRole('region', { name: 'Subjects for 7-Rizal — Grade 7' });
    expect(within(list).getByText(/No teacher yet — nobody scheduled/)).toBeTruthy();
    expect(within(list).getByText('Inactive · existing periods only')).toBeTruthy();
    expect(within(list).getByText(/Teacher: Ana Cruz/)).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: 'Add English schedule' }));
    expect(h.ctx.openCreateSchedule.mock.calls[0]).toEqual(classic);
    expect(classic).toEqual([{ sectionId: 'a', subjectId: 'e' }]);
  });

  it('"Add class" takes the keyboard to the first subject\'s Add button', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Mathematics schedule' }));
  });

  it('class setup: adviser and coverage, as classic', () => {
    show(SchedulesTab);
    const classic = screen.getByRole('region', { name: 'Class setup for 7-Rizal' }).textContent;
    cleanup();
    show();
    expect(screen.getByRole('region', { name: 'Class setup for 7-Rizal' }).textContent).toBe(classic);
  });
});

describe('states (same texts as classic)', () => {
  it.each([
    ['sections failed', { sectionsError: 'x' }, 'Could not load sections. Check your connection and try again.', 'Retry sections', 'fetchSections'],
    ['schedules failed', { schedulesError: 'x' }, 'Could not load schedules.', 'Retry schedules', 'fetchSchedules'],
  ])('%s', (_, extra, text, retry, handler) => {
    h.ctx = baseCtx(extra);
    show();
    expect(document.body.textContent).toContain(text);
    fireEvent.click(screen.getByRole('button', { name: retry }));
    expect(h.ctx[handler]).toHaveBeenCalled();
  });
  it('no sections at all', () => {
    h.ctx = baseCtx({ sections: [] });
    show();
    expect(screen.getByText('No sections for 2026-2027. Create them in Sections first.')).toBeTruthy();
  });
});

describe('the dialog is the classic one', () => {
  const dialogCtx = extra => baseCtx({ scheduleModal: true, schedSubject: 'm', schedSection: 'a', ...extra });
  it.each([
    ['open', {}],
    ['a clash list', { scheduleConflicts: ['Ana Cruz already teaches 7-Mabini on Monday 08:00–09:00'] }],
    ['a clash-check error', { scheduleCheckError: 'Could not check for clashes. Nothing was saved.' }],
    ['eligibility failed', { teachersError: 'x' }],
  ])('%s: identical markup', (_, extra) => {
    h.ctx = dialogCtx(extra);
    show(SchedulesTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    h.ctx = dialogCtx(extra);
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('validation: Create without a teacher and with end before start shows the same messages and does not save', () => {
    const run = (Tab) => {
      h.ctx = dialogCtx({ schedStart: '10:00', schedEnd: '09:00' });
      show(Tab);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));
      const html = norm(screen.getByRole('dialog').outerHTML);
      const saved = h.ctx.saveSchedule.mock.calls.length;
      cleanup();
      return [html, saved];
    };
    const classic = run(SchedulesTab);
    const clarity = run(ClarityAdminSchedulesTab);
    expect(clarity).toEqual(classic);
    expect(classic[0]).toContain('Select a teacher.');
    expect(classic[0]).toContain('End time must be after the start time.');
    expect(classic[1]).toBe(0);
  });

  it('a valid form saves through saveSchedule', () => {
    h.ctx = dialogCtx({ schedTeacher: 't1' });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));
    expect(h.ctx.saveSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('nothing invented', () => {
  it('no "preview" and no sample data', () => {
    show();
    expect(document.body.textContent).not.toMatch(/preview|7:30|Grade 8 – Mabini/i);
  });
});
