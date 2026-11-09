import { describe, expect, it } from 'vitest';
import { coverageText, sortPeriods, subjectCoverage, teacherNamesFor } from './classSetup';

const SUBJECTS = ['eng', 'math', 'sci', 'fil', 'ap', 'tle', 'mapeh', 'esp'].map(id => ({ id, name: id }));
const period = (subject_id, over = {}) => ({ id: `${subject_id}-${over.day_of_week || 'Monday'}-${over.start_time || '08:00'}`,
  section_id: 'rizal', subject_id, teacher_id: 'ana', day_of_week: 'Monday', start_time: '08:00:00', ...over });

describe('subjectCoverage', () => {
  it('0 of 8 when nothing is scheduled', () => {
    expect(coverageText(subjectCoverage('rizal', [], SUBJECTS))).toBe('0 of 8 subjects have a teacher');
  });

  it('partial: counts each subject once, only for this section', () => {
    const rows = [period('eng'), period('eng', { day_of_week: 'Tuesday' }), period('math'),
      period('sci', { section_id: 'madrid' }), period('retired')];
    expect(subjectCoverage('rizal', rows, SUBJECTS)).toEqual({ filled: 2, total: 8 });
  });

  it('8 of 8 when every subject has a period', () => {
    expect(coverageText(subjectCoverage('rizal', SUBJECTS.map(s => period(s.id)), SUBJECTS))).toBe('8 of 8 subjects have a teacher');
  });
});

describe('sortPeriods', () => {
  it('orders by school day, then start time (not alphabetically by day)', () => {
    const rows = [
      period('eng', { day_of_week: 'Friday', start_time: '08:00:00' }),
      period('eng', { day_of_week: 'Monday', start_time: '10:00:00' }),
      period('eng', { day_of_week: 'Monday', start_time: '08:00:00' }),
      period('eng', { day_of_week: 'Wednesday', start_time: '09:00:00' }),
    ];
    expect(sortPeriods(rows).map(r => `${r.day_of_week} ${r.start_time}`)).toEqual([
      'Monday 08:00:00', 'Monday 10:00:00', 'Wednesday 09:00:00', 'Friday 08:00:00',
    ]);
  });
});

describe('teacherNamesFor', () => {
  it('lists each teacher once, with a neutral name when one is missing', () => {
    const teachers = [{ id: 'ana', name: 'Ana Reyes' }, { id: 'ben', name: 'Ben Cruz' }];
    const rows = [period('eng'), period('eng', { teacher_id: 'ben' }), period('eng'), period('eng', { teacher_id: 'ghost' })];
    expect(teacherNamesFor(rows, teachers)).toEqual(['Ana Reyes', 'Ben Cruz', 'Unknown teacher']);
  });
});
