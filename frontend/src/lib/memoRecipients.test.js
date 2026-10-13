import { describe, expect, it } from 'vitest';
import {
  FIXED_RECIPIENTS, composeOptions, departmentOptions, filterOptions,
} from './memoRecipients';

const staff = [
  { role: 'teacher', department: 'Mathematics' },
  { role: 'teacher', department: 'Science' },
  { role: 'teacher', department: 'Mathematics' },
  { role: 'registrar', department: 'Registrar' },
];

describe('departmentOptions', () => {
  it('lists each department once, sorted', () => {
    expect(departmentOptions(staff)).toEqual(['Mathematics', 'Registrar', 'Science']);
  });

  it('ignores a department on a student profile', () => {
    // The live data has exactly one of these: a student whose department
    // reads "Student". Offering it would spread a data-entry slip.
    const out = departmentOptions([...staff, { role: 'student', department: 'Student' }]);
    expect(out).not.toContain('Student');
  });

  it('ignores blanks and whitespace', () => {
    expect(departmentOptions([
      { role: 'teacher', department: '' },
      { role: 'teacher', department: '   ' },
      { role: 'teacher' },
    ])).toEqual([]);
  });

  it('survives junk', () => {
    expect(departmentOptions()).toEqual([]);
    expect(departmentOptions([null, undefined])).toEqual([]);
  });
});

describe('composeOptions', () => {
  it('offers the fixed groups first, then real departments', () => {
    expect(composeOptions(staff)).toEqual([
      ...FIXED_RECIPIENTS, 'Mathematics', 'Registrar', 'Science',
    ]);
  });

  it('never invents a department', () => {
    // "Science Dept" and "Math Dept" were hardcoded and match nothing in
    // profiles.department. That is the bug this replaces.
    const out = composeOptions(staff);
    expect(out).not.toContain('Science Dept');
    expect(out).not.toContain('Math Dept');
  });

  it('is just the fixed groups when no department is set anywhere', () => {
    expect(composeOptions([])).toEqual(FIXED_RECIPIENTS);
  });
});

describe('filterOptions', () => {
  const memos = [
    { recipient: 'All Faculty' }, { recipient: 'All Faculty' },
    { recipient: 'All' }, { recipient: 'Science' },
  ];

  it('offers only what some memo was actually sent to', () => {
    expect(filterOptions(memos)).toEqual(['All', 'All Faculty', 'Science']);
  });

  it('cannot be set to a group with no memos', () => {
    expect(filterOptions(memos)).not.toContain('All Students');
  });

  it('keeps a recipient that is no longer offered when composing', () => {
    // An old memo addressed to a department since renamed stays
    // findable, because the filter is built from the memos themselves.
    expect(filterOptions([{ recipient: 'Science Dept' }])).toEqual(['Science Dept']);
  });

  it('is empty when there are no memos', () => {
    expect(filterOptions([])).toEqual([]);
    expect(filterOptions()).toEqual([]);
  });
});
