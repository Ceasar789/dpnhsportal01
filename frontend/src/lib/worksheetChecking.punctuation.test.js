import { describe, expect, it } from 'vitest';
import { checkItem, comparableAnswer, normalizeAnswer } from './worksheetChecking';

const ident = { id: 'i', item_type: 'identification', points: 1 };
const enu = { id: 'e', item_type: 'enumeration', points: 2 };
const conflicts = { correct_answer: ['Character vs. Character', 'Character vs. Society'] };
const right = { isCorrect: true, pointsEarned: 1 };
const wrong = { isCorrect: false, pointsEarned: 0 };

describe('identification ignores punctuation differences', () => {
  it.each([
    ['a missing period', 'Character vs. Character', 'Character vs Character'],
    ['a trailing period', 'Photosynthesis', 'Photosynthesis.'],
    ['an apostrophe (removed, so both spellings match)', "Newton's law", 'Newtons law'],
    ['a hyphen used as a space', 'well-known', 'well known'],
    ['an en dash used as a space', 'north-east', 'north–east'],
    ['extra spaces', 'Jose Rizal', '  jose    rizal '],
    ['spaces around a dash', 'cause and effect - chain', 'cause and effect chain'],
    ['quotes', '"Noli Me Tangere"', 'Noli Me Tangere'],
    ['curly quotes and apostrophe', '“Mother’s day”', 'mothers day'],
    ['a comma inside one answer', 'Manila, Philippines', 'Manila Philippines'],
    ['initials with periods', 'U.S.A.', 'USA'],
  ])('%s', (_name, key, answer) => {
    expect(checkItem(ident, { correct_answer: [key] }, answer)).toEqual(right);
  });

  it('keeps Filipino letters and accents, and matches them to themselves', () => {
    expect(comparableAnswer('Niño Señora Ñ')).toBe('niño señora ñ');
    expect(comparableAnswer('Pagbasa at Pagsúlat')).toBe('pagbasa at pagsúlat');
    expect(checkItem(ident, { correct_answer: ['Bayanihan ng mga Niño'] }, 'bayanihan ng mga niño')).toEqual(right);
    expect(checkItem(ident, { correct_answer: ['niño'] }, 'nino')).toEqual(wrong);
  });

  it.each([
    ['a different word', 'Character vs. Character', 'Character vs Society'],
    ['a different word order', 'Character vs. Society', 'Society vs Character'],
    ['a missing word', 'Character vs. Character', 'Character Character'],
    ['a different digit', 'World War 2', 'World War 3'],
    ['a missing digit', 'Grade 10', 'Grade 1'],
    ['punctuation only', 'Rizal', '...'],
  ])('%s stays wrong', (_name, key, answer) => {
    expect(checkItem(ident, { correct_answer: [key] }, answer)).toEqual(wrong);
  });
});

describe('enumeration ignores punctuation differences', () => {
  it('"Character vs Character" without the period earns the item', () => {
    expect(checkItem(enu, conflicts, ['Character vs Character', 'Character vs Society'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('the one-line comma form still scores 2 / 2, and without periods too', () => {
    expect(checkItem(enu, conflicts, ['Character vs. Character, Character vs. Society'])).toEqual({ isCorrect: true, pointsEarned: 2 });
    expect(checkItem(enu, conflicts, ['Character vs Character, Character vs Society.'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('a wrong piece stays wrong', () => {
    expect(checkItem(enu, conflicts, ['Character vs Character, Character vs Nature'])).toEqual({ isCorrect: false, pointsEarned: 1 });
  });

  it('the split happens before commas are removed', () => {
    const places = { correct_answer: ['Paris, France', 'Rome, Italy'] };
    expect(checkItem(enu, places, ['Paris, France', 'Rome, Italy'])).toEqual({ isCorrect: true, pointsEarned: 2 });
    expect(checkItem(enu, places, ['Paris France'])).toEqual({ isCorrect: false, pointsEarned: 1 });
    const letters = { correct_answer: ['A', 'B'] };
    expect(checkItem(enu, letters, ['A, B'])).toEqual({ isCorrect: true, pointsEarned: 2 });
    expect(checkItem(enu, letters, ['A; B.'])).toEqual({ isCorrect: true, pointsEarned: 2 });
  });
});

describe('what stays the same', () => {
  it('normalizeAnswer itself still keeps punctuation', () => {
    expect(normalizeAnswer('Character vs. Character')).toBe('character vs. character');
  });

  it('multiple choice still needs the exact option', () => {
    const mc = { id: 'm', item_type: 'multiple_choice', points: 1 };
    expect(checkItem(mc, { correct_answer: 'Mr. Cruz' }, 'Mr Cruz')).toEqual(wrong);
    expect(checkItem(mc, { correct_answer: 'Mr. Cruz' }, 'mr. cruz')).toEqual(right);
  });
});
