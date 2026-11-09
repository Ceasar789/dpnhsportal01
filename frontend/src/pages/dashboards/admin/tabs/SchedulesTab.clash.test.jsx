// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const SchedulesTab = (await import('./SchedulesTab')).default;

const YEAR = '2026-2027';
const MATH = { id: 'math', name: 'Mathematics', code: 'MATH' };
const ANA = { id: 'ana', name: 'Ana Reyes', email: 'ana@example.com' };
const RIZAL = { id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: YEAR };

const ctx = (over = {}) => ({
  schoolYear: YEAR, settingsSchoolYear: YEAR, schoolYearSource: 'settings',
  teachers: [ANA], teachersLoading: false, teachersError: false, fetchTeachers: vi.fn(),
  subjects: [MATH], subjectsLoading: false, subjectsError: false, fetchSubjects: vi.fn(),
  sections: [RIZAL], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  teachingLoad: [{ id: 'l1', teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7', school_year: YEAR }],
  teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(),
  schedules: [], schedulesLoading: false, schedulesError: false, fetchSchedules: vi.fn(),
  scheduleModal: 'create', openCreateSchedule: vi.fn(), closeScheduleModal: vi.fn(),
  saveSchedule: vi.fn(), deleteSchedule: vi.fn(),
  schedTeacher: 'ana', setSchedTeacher: vi.fn(), schedSubject: 'math', schedSection: 'rizal',
  schedDay: 'Monday', setSchedDay: vi.fn(), schedStart: '08:30', setSchedStart: vi.fn(),
  schedEnd: '09:30', setSchedEnd: vi.fn(), schedRoom: '', setSchedRoom: vi.fn(), schedSaving: false,
  scheduleConflicts: [], scheduleCheckError: '',
  ...over,
});

afterEach(cleanup);

describe('Schedules form clash messages', () => {
  it('lists every clash in an alert inside the form', () => {
    h.ctx = ctx({ scheduleConflicts: [
      'Teacher Ana Reyes already teaches Science in 7-Madrid on Monday 08:00–09:00.',
      'Room 101 is already used by 7-Madrid (Science) on Monday 08:00–09:00.',
    ] });
    render(<SchedulesTab />);
    const alert = within(screen.getByRole('dialog')).getAllByRole('alert')
      .find(el => el.textContent.includes('clashes with'));
    expect(alert.textContent).toContain('Not saved. This period clashes with:');
    expect(within(alert).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'Teacher Ana Reyes already teaches Science in 7-Madrid on Monday 08:00–09:00.',
      'Room 101 is already used by 7-Madrid (Science) on Monday 08:00–09:00.',
    ]);
  });

  it('shows the check failure as an alert', () => {
    h.ctx = ctx({ scheduleCheckError: 'Could not check for schedule conflicts. Try again.' });
    render(<SchedulesTab />);
    const alert = within(screen.getByRole('dialog')).getByText('Could not check for schedule conflicts. Try again.');
    expect(alert.getAttribute('role')).toBe('alert');
  });

  it('shows nothing extra when there is no clash', () => {
    h.ctx = ctx();
    render(<SchedulesTab />);
    expect(screen.queryByText(/clashes with|Could not check/)).toBeNull();
  });
});
