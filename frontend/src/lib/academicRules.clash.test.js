import { describe, expect, it } from 'vitest';
import { describeScheduleClashes, findScheduleClashes } from './academicRules';

const YEAR = '2026-2027';
const period = (over = {}) => ({
  section_id: 'rizal', teacher_id: 'ana', subject_id: 'math', day_of_week: 'Monday',
  start_time: '08:00', end_time: '09:00', room_number: null, school_year: YEAR, ...over,
});
// Saved rows come back from the database with seconds.
const saved = (over = {}) => period({ id: 'p1', start_time: '08:00:00', end_time: '09:00:00', ...over });
const types = clashes => clashes.map(c => c.type).sort();

const NAMES = {
  teachers: [{ id: 'ana', name: 'Ana Reyes' }, { id: 'ben', name: 'Ben Cruz' }],
  sections: [{ id: 'rizal', name: '7-Rizal' }, { id: 'madrid', name: '7-Madrid' }],
  subjects: [{ id: 'math', name: 'Mathematics' }, { id: 'sci', name: 'Science' }, { id: 'eng', name: 'English' }],
};

describe('findScheduleClashes', () => {
  it('teacher: the same teacher overlapping in another section', () => {
    const clashes = findScheduleClashes(period(), [saved({ section_id: 'madrid', subject_id: 'sci', start_time: '08:30', end_time: '09:30' })]);
    expect(types(clashes)).toEqual(['teacher']);
  });

  it('room: the same room in another section, trimmed and case-insensitive', () => {
    const other = saved({ section_id: 'madrid', teacher_id: 'ben', room_number: 'room 101 ' });
    expect(types(findScheduleClashes(period({ room_number: ' Room 101' }), [other]))).toEqual(['room']);
  });

  it('room: no room entered means no room clash', () => {
    const other = saved({ section_id: 'madrid', teacher_id: 'ben', room_number: 'Room 101' });
    expect(findScheduleClashes(period({ room_number: '' }), [other])).toEqual([]);
    expect(findScheduleClashes(period({ room_number: '   ' }), [other])).toEqual([]);
    expect(findScheduleClashes(period({ room_number: null }), [other])).toEqual([]);
  });

  it('section: the same section already has an overlapping period', () => {
    const clashes = findScheduleClashes(period(), [saved({ teacher_id: 'ben', subject_id: 'eng' })]);
    expect(types(clashes)).toEqual(['section']);
  });

  it('periods that only touch do not clash', () => {
    expect(findScheduleClashes(period({ start_time: '09:00', end_time: '10:00' }), [saved()])).toEqual([]);
    expect(findScheduleClashes(period({ start_time: '07:00', end_time: '08:00' }), [saved()])).toEqual([]);
  });

  it('a different day or a different school year does not clash', () => {
    expect(findScheduleClashes(period({ day_of_week: 'Tuesday' }), [saved()])).toEqual([]);
    expect(findScheduleClashes(period(), [saved({ school_year: '2025-2026' })])).toEqual([]);
  });

  it('another section\'s period with a different teacher and room does not clash', () => {
    const other = saved({ section_id: 'madrid', teacher_id: 'ben', room_number: 'Room 202' });
    expect(findScheduleClashes(period({ room_number: 'Room 101' }), [other])).toEqual([]);
  });

  it('one existing period can clash in several ways at once', () => {
    const other = saved({ room_number: 'Room 101' });
    expect(types(findScheduleClashes(period({ room_number: 'Room 101' }), [other]))).toEqual(['room', 'section', 'teacher']);
  });

  it('periods with unreadable times are skipped', () => {
    expect(findScheduleClashes(period(), [saved({ start_time: null })])).toEqual([]);
    expect(findScheduleClashes(period({ end_time: '' }), [saved()])).toEqual([]);
  });
});

describe('describeScheduleClashes', () => {
  it('names the other class for each clash type', () => {
    const teacher = { type: 'teacher', other: saved({ section_id: 'rizal', subject_id: 'sci' }) };
    const room = { type: 'room', other: saved({ section_id: 'madrid', subject_id: 'eng', start_time: '08:30:00', end_time: '09:30:00', room_number: 'Room 101' }) };
    const section = { type: 'section', other: saved({ subject_id: 'eng' }) };
    expect(describeScheduleClashes([teacher, room, section], { ...NAMES, room: 'Room 101' })).toEqual([
      'Teacher Ana Reyes already teaches Science in 7-Rizal on Monday 08:00–09:00.',
      'Room 101 is already used by 7-Madrid (English) on Monday 08:30–09:30.',
      '7-Rizal already has English on Monday 08:00–09:00.',
    ]);
  });

  it('writes "Room" in front of a bare room number', () => {
    const room = { type: 'room', other: saved({ section_id: 'madrid', subject_id: 'eng', room_number: '101' }) };
    expect(describeScheduleClashes([room], { ...NAMES, room: '101' })).toEqual([
      'Room 101 is already used by 7-Madrid (English) on Monday 08:00–09:00.',
    ]);
  });

  it('falls back to neutral words when a name is missing', () => {
    const other = saved({ teacher_id: 'ghost', section_id: 'gone', subject_id: 'unknown', room_number: 'Room 9' });
    expect(describeScheduleClashes([
      { type: 'teacher', other }, { type: 'room', other }, { type: 'section', other },
    ], { ...NAMES, room: 'Room 9' })).toEqual([
      'This teacher already teaches another class on Monday 08:00–09:00.',
      'Room 9 is already used by another class on Monday 08:00–09:00.',
      'This section already has another class on Monday 08:00–09:00.',
    ]);
  });

  it('drops duplicate messages', () => {
    const other = saved({ subject_id: 'eng' });
    expect(describeScheduleClashes([{ type: 'section', other }, { type: 'section', other }], NAMES)).toHaveLength(1);
  });
});
