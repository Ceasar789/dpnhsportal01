// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const SchedulesTab = (await import('./SchedulesTab')).default;

const YEAR = '2026-2027';
const ctx = (over = {}) => ({
  schoolYear: YEAR, settingsSchoolYear: YEAR, schoolYearSource: 'settings',
  teachers: [{ id: 'ana', name: 'Ana Reyes', email: 'ana@example.com' }], teachersLoading: false, teachersError: false, fetchTeachers: vi.fn(),
  subjects: [{ id: 'math', name: 'Mathematics', code: 'MATH' }], subjectsLoading: false, subjectsError: false, fetchSubjects: vi.fn(),
  sections: [{ id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: YEAR }], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  teachingLoad: [{ id: 'l1', teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7', school_year: YEAR }],
  teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(),
  schedules: [], schedulesLoading: false, schedulesError: false, fetchSchedules: vi.fn(),
  scheduleModal: 'create', openCreateSchedule: vi.fn(), closeScheduleModal: vi.fn(), saveSchedule: vi.fn(), deleteSchedule: vi.fn(),
  schedTeacher: 'ana', setSchedTeacher: vi.fn(), schedSubject: 'math', schedSection: 'rizal',
  schedDay: 'Monday', setSchedDay: vi.fn(), schedStart: '08:30', setSchedStart: vi.fn(),
  schedEnd: '09:30', setSchedEnd: vi.fn(), schedRoom: '', setSchedRoom: vi.fn(), schedSaving: false,
  scheduleConflicts: [], scheduleCheckError: '',
  ...over,
});

let scrolled;
beforeEach(() => {
  scrolled = vi.fn();
  // jsdom has no scrollIntoView; record the calls instead.
  Element.prototype.scrollIntoView = function scrollIntoView(options) { scrolled(this, options); };
});
afterEach(() => { cleanup(); delete Element.prototype.scrollIntoView; });

describe('the clash message is brought into view when it appears', () => {
  it('a clash list scrolls into view, keeping its id and role="alert"', () => {
    h.ctx = ctx({ scheduleConflicts: ['Teacher Ana Reyes already teaches Science in 7-Madrid on Monday 08:00–09:00.'] });
    render(<SchedulesTab />);
    const alert = document.getElementById('schedules-conflict-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('Not saved. This period clashes with:');
    expect(scrolled).toHaveBeenCalledWith(alert, { block: 'nearest' });
  });

  it('a check failure scrolls into view too, with its exact text', () => {
    h.ctx = ctx({ scheduleCheckError: 'Could not check for schedule conflicts. Try again.' });
    render(<SchedulesTab />);
    const alert = within(screen.getByRole('dialog')).getByText('Could not check for schedule conflicts. Try again.');
    expect(alert.id).toBe('schedules-conflict-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(scrolled).toHaveBeenCalledWith(alert, { block: 'nearest' });
  });

  it('nothing scrolls when there is no message', () => {
    h.ctx = ctx();
    render(<SchedulesTab />);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it('works without scrollIntoView (old browsers, jsdom)', () => {
    delete Element.prototype.scrollIntoView;
    h.ctx = ctx({ scheduleCheckError: 'Could not check for schedule conflicts. Try again.' });
    expect(() => render(<SchedulesTab />)).not.toThrow();
    expect(screen.getByText('Could not check for schedule conflicts. Try again.')).toBeTruthy();
  });

  it('the message still sits directly before the form ends, above the Create and Cancel footer', () => {
    h.ctx = ctx({ scheduleConflicts: ['Room 101 is already used by 7-Madrid (Science) on Monday 08:00–09:00.'] });
    render(<SchedulesTab />);
    const alert = document.getElementById('schedules-conflict-error');
    const body = alert.closest('.ux-modal-body');
    expect(body.lastElementChild).toBe(alert);
    expect(body.nextElementSibling.textContent).toMatch(/Cancel\s*Create/);
  });
});

describe('admin header fits a 320px screen', () => {
  it('below 360px only, the logo gap drops from 12px to 8px', () => {
    const file = ['src/pages/dashboards/admin/AdminDashboard.jsx', 'frontend/src/pages/dashboards/admin/AdminDashboard.jsx'].find(existsSync);
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('@media(max-width:359.98px) { .nav-logo { gap: var(--space-8); } }');
    expect(source).toMatch(/\.nav-logo \{\s*display: flex;\s*align-items: center;\s*gap: var\(--space-12\);/);
  });
});
