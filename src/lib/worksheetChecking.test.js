import { describe, it, expect } from 'vitest';
import { ITEM_TYPES, normalizeAnswer, checkItem, scoreSubmission } from './worksheetChecking';

const mc   = { id: 'i1', item_type: 'multiple_choice', points: 2 };
const tf   = { id: 'i2', item_type: 'true_false',      points: 1 };
const ident= { id: 'i3', item_type: 'identification',  points: 2 };
const enu  = { id: 'i4', item_type: 'enumeration',     points: 3 };
const essay= { id: 'i5', item_type: 'essay',           points: 5 };

describe('ITEM_TYPES', () => {
  it('lists the five supported types', () => {
    expect(ITEM_TYPES).toEqual([
      'multiple_choice', 'true_false', 'identification', 'enumeration', 'essay',
    ]);
  });
});

describe('normalizeAnswer', () => {
  it('lowercases, trims and collapses internal whitespace', () => {
    expect(normalizeAnswer('  Jose   Rizal ')).toBe('jose rizal');
  });

  it('returns an empty string for null and undefined', () => {
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(undefined)).toBe('');
  });

  it('stringifies non-strings', () => {
    expect(normalizeAnswer(1896)).toBe('1896');
  });
});

describe('checkItem — multiple choice and true/false', () => {
  it('awards full points for the correct option', () => {
    expect(checkItem(mc, { correct_answer: 'B' }, 'B')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('awards nothing for the wrong option', () => {
    expect(checkItem(mc, { correct_answer: 'B' }, 'C')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('treats a blank answer as wrong, not as a match', () => {
    expect(checkItem(mc, { correct_answer: 'B' }, '')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('handles true/false the same way', () => {
    expect(checkItem(tf, { correct_answer: 'True' }, 'true')).toEqual({ isCorrect: true, pointsEarned: 1 });
  });
});

describe('checkItem — identification', () => {
  const key = { correct_answer: ['Jose Rizal', 'Rizal'] };

  it('accepts an exact match', () => {
    expect(checkItem(ident, key, 'Jose Rizal')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('ignores case and surrounding whitespace', () => {
    expect(checkItem(ident, key, '  jose rizal ')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('accepts any of the answers the teacher listed', () => {
    expect(checkItem(ident, key, 'rizal')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('rejects an answer that is not on the list', () => {
    expect(checkItem(ident, key, 'Bonifacio')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('rejects a blank answer', () => {
    expect(checkItem(ident, key, '   ')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('accepts a key stored as a single string rather than a list', () => {
    expect(checkItem(ident, { correct_answer: 'Rizal' }, 'rizal')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });
});

describe('checkItem — enumeration', () => {
  const key = { correct_answer: ['Executive', 'Legislative', 'Judicial'] };

  it('awards full points when every answer is present', () => {
    const result = checkItem(enu, key, ['Executive', 'Legislative', 'Judicial']);
    expect(result).toEqual({ isCorrect: true, pointsEarned: 3 });
  });

  it('awards partial credit per matched answer', () => {
    const result = checkItem(enu, key, ['Executive', 'Judicial', 'Barangay']);
    expect(result).toEqual({ isCorrect: false, pointsEarned: 2 });
  });

  it('does not care about order', () => {
    const result = checkItem(enu, key, ['Judicial', 'Executive', 'Legislative']);
    expect(result).toEqual({ isCorrect: true, pointsEarned: 3 });
  });

  it('counts a duplicated answer only once', () => {
    const result = checkItem(enu, key, ['Executive', 'Executive', 'Executive']);
    expect(result).toEqual({ isCorrect: false, pointsEarned: 1 });
  });

  it('never exceeds the item points when extra answers are given', () => {
    const result = checkItem(enu, key, ['Executive', 'Legislative', 'Judicial', 'Executive', 'Extra']);
    expect(result.pointsEarned).toBe(3);
  });

  it('rounds partial credit to two decimals', () => {
    const item = { id: 'x', item_type: 'enumeration', points: 1 };
    const result = checkItem(item, key, ['Executive']);
    expect(result.pointsEarned).toBe(0.33);
  });

  it('awards nothing when the teacher left the key empty', () => {
    expect(checkItem(enu, { correct_answer: [] }, ['Executive'])).toEqual({ isCorrect: false, pointsEarned: 0 });
  });
});

describe('checkItem — essay', () => {
  it('returns nulls so the teacher scores it by hand', () => {
    expect(checkItem(essay, { correct_answer: null }, 'a long answer'))
      .toEqual({ isCorrect: null, pointsEarned: null });
  });
});

describe('checkItem — missing key row (not the same as a blank key)', () => {
  it('multiple choice: returns nulls instead of marking every answer wrong', () => {
    expect(checkItem(mc, undefined, 'B')).toEqual({ isCorrect: null, pointsEarned: null });
    expect(checkItem(mc, null, 'B')).toEqual({ isCorrect: null, pointsEarned: null });
  });

  it('true/false: returns nulls instead of marking every answer wrong', () => {
    expect(checkItem(tf, undefined, 'True')).toEqual({ isCorrect: null, pointsEarned: null });
  });

  it('identification: returns nulls instead of marking every answer wrong', () => {
    expect(checkItem(ident, undefined, 'Rizal')).toEqual({ isCorrect: null, pointsEarned: null });
  });

  it('enumeration: returns nulls instead of marking every answer wrong', () => {
    expect(checkItem(enu, undefined, ['Executive'])).toEqual({ isCorrect: null, pointsEarned: null });
  });
});

describe('scoreSubmission', () => {
  const items = [mc, ident, essay];
  const keys = { i1: { correct_answer: 'B' }, i3: { correct_answer: ['Rizal'] }, i5: { correct_answer: null } };

  it('sums the auto-scored points and reports the full total', () => {
    const answers = { i1: 'B', i3: 'Rizal', i5: 'essay text' };
    const result = scoreSubmission(items, keys, answers);
    expect(result.score).toBe(4);
    expect(result.totalPoints).toBe(9);
  });

  it('returns a per-item breakdown including the unscored essay', () => {
    const answers = { i1: 'C', i3: 'Rizal', i5: 'essay text' };
    const result = scoreSubmission(items, keys, answers);
    expect(result.perItem).toEqual([
      { item_id: 'i1', isCorrect: false, pointsEarned: 0 },
      { item_id: 'i3', isCorrect: true,  pointsEarned: 2 },
      { item_id: 'i5', isCorrect: null,  pointsEarned: null },
    ]);
  });

  it('treats a missing answer as unanswered rather than crashing', () => {
    const result = scoreSubmission(items, keys, {});
    expect(result.score).toBe(0);
    expect(result.totalPoints).toBe(9);
  });

  it('tolerates an empty worksheet', () => {
    expect(scoreSubmission([], {}, {})).toEqual({ score: 0, totalPoints: 0, perItem: [] });
  });

  it('counts a missing key toward totalPoints but not toward score, like an essay', () => {
    // i3 (identification, 2 pts) has no entry in `keys` at all — a partially
    // failed save, not a teacher who left the key blank.
    const result = scoreSubmission(items, { i1: { correct_answer: 'B' } }, { i1: 'B', i3: 'Rizal' });
    expect(result.perItem).toContainEqual({ item_id: 'i3', isCorrect: null, pointsEarned: null });
    expect(result.totalPoints).toBe(9);
    expect(result.score).toBe(2); // only i1's 2 points; i3 and i5 contribute nothing to score
  });
});
