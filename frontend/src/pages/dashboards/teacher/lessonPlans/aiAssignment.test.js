import { describe, expect, it } from 'vitest';
import { savedAiMetadata } from './aiAssignment';

const year = '2026-2027';
describe('saved AI plan metadata', () => {
  it('does not infer historical metadata from generic subject text or a title', () => {
    expect(savedAiMetadata({ title: 'English 7', subject: 'ILAW Lesson Plan', objectives: '<h2>English 7</h2>' }))
      .toEqual({ subjectId: '', subjectName: '', gradeLevel: '', schoolYear: '' });
    expect(savedAiMetadata({ subject_id: 'english', subject: 'English', grade_level: 'Grade 7', academic_year: year }))
      .toEqual({ subjectId: 'english', subjectName: 'English', gradeLevel: 'Grade 7', schoolYear: year });
  });
});
