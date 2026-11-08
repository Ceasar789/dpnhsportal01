import { describe, expect, it } from 'vitest';
import { checkItem } from './worksheetChecking';

// Real app case: English 7 Monday Quiz, items 9 and 10, 2 points each.
const item = { id: 'i9', item_type: 'enumeration', points: 2 };
const key = { correct_answer: ['Character vs. Character', 'Character vs. Society'] };

describe('enumeration reproduction cases', () => {
  it('item 9, one answer per line: full points', () => {
    expect(checkItem(item, key, ['Character vs. Character', 'Character vs. Society'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('item 9, both answers on one line with a comma: full points', () => {
    expect(checkItem(item, key, ['Character vs. Character, Character vs. Society'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('item 10, one answer per line: half points', () => {
    expect(checkItem(item, key, ['Character vs. Character', 'Character vs. Environment'])).toEqual({ isCorrect: false, pointsEarned: 1 });
  });

  it('item 10, both answers on one line with a comma: half points', () => {
    expect(checkItem(item, key, ['Character vs. Character, Character vs. Environment'])).toEqual({ isCorrect: false, pointsEarned: 1 });
  });
});

describe('enumeration answers on one line', () => {
  it('a key that contains a comma still matches the whole line', () => {
    const cities = { correct_answer: ['Paris, France', 'Rome, Italy'] };
    expect(checkItem(item, cities, ['Paris, France', 'Rome, Italy'])).toEqual({ isCorrect: true, pointsEarned: 2 });
    expect(checkItem(item, cities, ['Paris, France'])).toEqual({ isCorrect: false, pointsEarned: 1 });
  });

  it('counts a duplicated answer once', () => {
    expect(checkItem(item, key, ['Character vs. Character, Character vs. Character'])).toEqual({ isCorrect: false, pointsEarned: 1 });
    expect(checkItem(item, key, ['Character vs. Character', 'Character vs. Character, Character vs. Character'])).toEqual({ isCorrect: false, pointsEarned: 1 });
  });

  it('an extra wrong piece does not reduce the points', () => {
    expect(checkItem(item, key, ['Character vs. Character, Character vs. Nature, Character vs. Society'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('ignores empty pieces', () => {
    expect(checkItem(item, key, [', Character vs. Character,, ;Character vs. Society,'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('accepts semicolons', () => {
    expect(checkItem(item, key, ['Character vs. Character; Character vs. Society'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('tolerates case and extra spaces', () => {
    expect(checkItem(item, key, ['  character   VS. character ,CHARACTER vs.   society  '])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('a different type of conflict stays wrong', () => {
    expect(checkItem(item, key, ['Character vs. Nature, Character vs. Self'])).toEqual({ isCorrect: false, pointsEarned: 0 });
    expect(checkItem(item, key, ['Character vs. Societies, Character vs Character'])).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('a mixed list of pieces does not count as one whole answer', () => {
    const one = { correct_answer: ['Character vs. Character'] };
    expect(checkItem(item, one, ['Character vs. Character, nonsense'])).toEqual({ isCorrect: true, pointsEarned: 2 });
    expect(checkItem(item, one, ['nonsense, more nonsense'])).toEqual({ isCorrect: false, pointsEarned: 0 });
  });
});
