import { describe, it, expect } from 'vitest';
import { isOtherTask } from './otherTask';

describe('isOtherTask', () => {
  it('is Other when the task has no subject_id at all', () => {
    expect(isOtherTask(null, new Set(['math']))).toBe(true);
    expect(isOtherTask(undefined, new Set())).toBe(true);
  });

  it('is Other when the subject is not in the schedule', () => {
    expect(isOtherTask('science', new Set(['math', 'english']))).toBe(true);
  });

  it('is not Other when the subject is in the schedule', () => {
    expect(isOtherTask('math', new Set(['math', 'english']))).toBe(false);
  });

  it('sends every subject-bearing task to Other when the schedule is known to be empty', () => {
    // A real, empty Set: the student is actively enrolled but scheduled
    // into nothing (or not enrolled at all) — genuinely nothing is on
    // their schedule, so nothing but a null-subject task belongs anywhere
    // else.
    expect(isOtherTask('math', new Set())).toBe(true);
  });

  it('falls back to the conservative null-subject_id-only rule when the schedule is unknown', () => {
    // null (not an empty Set) means the schedule read failed — "we don't
    // know", never "nothing is scheduled". Widening Other here would make
    // every task in the list show up under one filter whenever a read
    // hiccups, which is worse than under-showing.
    expect(isOtherTask('math', null)).toBe(false);
    expect(isOtherTask(null, null)).toBe(true);
  });
});
