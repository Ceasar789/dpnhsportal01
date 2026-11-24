// R52 (4c): the DepEd links per grade, exactly as in the workbook, teachers only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPED_MODULES } from './depedModules';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

const here = dirname(fileURLToPath(import.meta.url));
const src = rel => readFileSync(resolve(here, rel), 'utf8');

describe('DEPED_MODULES', () => {
  it('one entry per school grade (Grade 7-10), in order', () => {
    expect(DEPED_MODULES.map(m => m.grade)).toEqual(GRADE_LEVELS);
  });
  it('the official LR-portal budget-of-work link for each grade', () => {
    DEPED_MODULES.forEach((m, i) => expect(m.url).toBe(
      `https://sites.google.com/deped.gov.ph/deped-lrportal/three-term-budget-of-work-bow/grade-${7 + i}?authuser=0`));
  });
  it('subject lists as in the Nov-23 workbook: 8 / 8 / 29 / 8, no duplicates', () => {
    expect(DEPED_MODULES.map(m => m.subjects.length)).toEqual([8, 8, 29, 8]);
    DEPED_MODULES.forEach(m => expect(new Set(m.subjects).size).toBe(m.subjects.length));
    expect(DEPED_MODULES[3].subjects.at(-1)).toBe('TLE_AFA- Agriculture Crop Production');
    expect(DEPED_MODULES[0].subjects.at(-1)).toBe('TLE ICT');
  });
});

describe('where it is shown', () => {
  it('the teacher Learning Materials tab opens each link in a new tab, safely', () => {
    const tab = src('../ClarityTeacherMaterialsTab.jsx');
    expect(tab).toContain("import { DEPED_MODULES } from './materials/depedModules';");
    expect(tab).toMatch(/href=\{module\.url\} target="_blank" rel="noopener noreferrer"/);
  });
  it('no student screen uses it (teachers only)', () => {
    const student = ['../../student/ClarityStudentLayout.jsx', '../../student/ClarityStudentOverviewTab.jsx'];
    student.forEach(file => expect(src(file)).not.toContain('depedModules'));
  });
});
