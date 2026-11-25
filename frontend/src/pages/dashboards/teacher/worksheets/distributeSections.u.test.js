// U-PDF-T (Q2): Distribute offers only the sections where the teacher teaches
// the worksheet's subject at its grade; an older worksheet without a stored
// subject or grade is not narrowed on that part (nothing is widened).
import { describe, expect, it } from 'vitest';
import { sectionsForWorksheet } from './distributeSections';

const SECTIONS = [
  { id: 'adv', name: 'Rizal', grade_level: 'Grade 8', isAdviser: true, subjectIds: [] },
  { id: 'm8', name: 'Mabini', grade_level: 'Grade 8', isAdviser: false, subjectIds: ['math'] },
  { id: 's8', name: 'Luna', grade_level: '8', isAdviser: false, subjectIds: ['sci', 'math'] },
  { id: 'm7', name: 'Bonifacio', grade_level: 'Grade 7', isAdviser: false, subjectIds: ['math'] },
];
const ids = rows => rows.map(row => row.id);

describe('sectionsForWorksheet', () => {
  it('grade and subject both match (grade written either way)', () => {
    expect(ids(sectionsForWorksheet(SECTIONS, { subject_id: 'math', grade_level: 'Grade 8' }))).toEqual(['m8', 's8']);
  });
  it('an advisory section without that subject is not offered', () => {
    expect(ids(sectionsForWorksheet(SECTIONS, { subject_id: 'math', grade_level: 'Grade 8' }))).not.toContain('adv');
  });
  it('no stored subject: grade only; no stored grade: subject only; neither: the list as before', () => {
    expect(ids(sectionsForWorksheet(SECTIONS, { subject_id: null, grade_level: 'Grade 8' }))).toEqual(['adv', 'm8', 's8']);
    expect(ids(sectionsForWorksheet(SECTIONS, { subject_id: 'math', grade_level: null }))).toEqual(['m8', 's8', 'm7']);
    expect(ids(sectionsForWorksheet(SECTIONS, {}))).toEqual(['adv', 'm8', 's8', 'm7']);
  });
});
