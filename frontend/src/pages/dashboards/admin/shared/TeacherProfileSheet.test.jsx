// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: null }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const { default: TeacherProfileSheet } = await import('./TeacherProfileSheet');

const YEAR = '2026-2027';
const ANA = { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test', status: 'active', department: '' };
const ENG = { id: 'eng', name: 'English' };
const MATH = { id: 'math', name: 'Mathematics' };
const RIZAL = { id: 'rizal', name: '7-Rizal', grade_level: 'Grade 7', school_year: YEAR, adviser_id: 'ana' };
const LUNA = { id: 'luna', name: '8-Luna', grade_level: 'Grade 8', school_year: YEAR, adviser_id: 'ana' };
const BONI = { id: 'boni', name: '7-Bonifacio', grade_level: 'Grade 7', school_year: YEAR, adviser_id: 'ben' };
const period = (id, section_id, subject_id, day_of_week, start_time, room_number = null) => ({
  id, section_id, subject_id, teacher_id: 'ana', day_of_week, start_time, end_time: start_time.replace(/^(\d\d)/, (_, hh) => String(Number(hh) + 1).padStart(2, '0')), room_number,
});

const ctx = (over = {}) => ({
  schoolYear: YEAR,
  sections: [BONI], sectionsLoading: false, sectionsError: false, fetchSections: vi.fn(),
  teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(),
  schedules: [], schedulesLoading: false, schedulesError: false, fetchSchedules: vi.fn(),
  subjects: [ENG, MATH], subjectsLoading: false, subjectsError: false, fetchSubjects: vi.fn(),
  ...over,
});
const items = name => within(screen.getByRole('list', { name })).getAllByRole('listitem').map(li => li.textContent);
const pairValue = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent;

afterEach(cleanup);

describe('teacher profile', () => {
  it('names the dialog, shows the header, and says "Not set" for no department', () => {
    h.ctx = ctx();
    const onClose = vi.fn();
    render(<TeacherProfileSheet teacher={ANA} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Teacher profile: Ana Reyes' })).toBeTruthy();
    expect(pairValue('Email')).toBe('ana@example.test');
    expect(pairValue('Account status')).toBe('Active');
    expect(pairValue('Department')).toBe('Not set');
    expect(screen.getByRole('heading', { name: `Advisory (${YEAR})` })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('advisory: none', () => {
    h.ctx = ctx();
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(screen.getByText('No advisory section this school year.')).toBeTruthy();
  });

  it('advisory: one', () => {
    h.ctx = ctx({ sections: [RIZAL, BONI] });
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(items('Advisory')).toEqual(['7-Rizal · Grade 7']);
  });

  it('advisory: several, all listed', () => {
    h.ctx = ctx({ sections: [LUNA, BONI, RIZAL] });
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(items('Advisory')).toEqual(['7-Rizal · Grade 7', '8-Luna · Grade 8']);
  });

  it('teaching load by grade, and the empty text when there is none', () => {
    h.ctx = ctx({ teachingLoad: [
      { id: 'l1', teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 8' },
      { id: 'l2', teacher_id: 'ana', subject_id: 'math', grade_level: 'Grade 7' },
      { id: 'l3', teacher_id: 'ana', subject_id: 'eng', grade_level: 'Grade 7' },
      { id: 'l4', teacher_id: 'ben', subject_id: 'eng', grade_level: 'Grade 9' },
    ] });
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(items('Teaching load')).toEqual(['Grade 7English, Mathematics', 'Grade 8Mathematics']);
    cleanup();
    h.ctx = ctx();
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(screen.getByText('No teaching load yet.')).toBeTruthy();
  });

  it('handled classes sorted by section, then day, then time', () => {
    h.ctx = ctx({ sections: [RIZAL, LUNA], schedules: [
      period('p1', 'rizal', 'eng', 'Friday', '08:00:00'),
      period('p2', 'luna', 'math', 'Tuesday', '10:00:00', 'Room 2'),
      period('p3', 'rizal', 'math', 'Monday', '10:00:00', 'Room 101'),
      period('p4', 'rizal', 'eng', 'Monday', '08:00:00'),
      { ...period('p5', 'rizal', 'eng', 'Monday', '07:00:00'), teacher_id: 'ben' },
    ] });
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(items('Handled classes')).toEqual([
      '7-Rizal · EnglishMonday · 08:00–09:00 · No room',
      '7-Rizal · MathematicsMonday · 10:00–11:00 · Room 101',
      '7-Rizal · EnglishFriday · 08:00–09:00 · No room',
      '8-Luna · MathematicsTuesday · 10:00–11:00 · Room 2',
    ]);
  });

  it('no classes says so', () => {
    h.ctx = ctx();
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(screen.getByText('No classes scheduled yet.')).toBeTruthy();
  });

  it('failed loads show errors with Retry, never the empty text', () => {
    h.ctx = ctx({ sectionsError: true, sections: [], teachingLoadError: true, schedulesError: true });
    render(<TeacherProfileSheet teacher={ANA} onClose={vi.fn()} />);
    expect(screen.getByText('Could not load sections.')).toBeTruthy();
    expect(screen.getByText('Could not load the teaching load.')).toBeTruthy();
    expect(screen.getByText('Could not load the classes.')).toBeTruthy();
    expect(screen.queryByText(/No advisory|No teaching load|No classes/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[1]);
    expect(h.ctx.fetchTeachingLoad).toHaveBeenCalled();
  });
});
