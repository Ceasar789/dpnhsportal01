import { describe, expect, it } from 'vitest';
import vectors from './scoringVectors.json';
import { checkItem } from './worksheetChecking';
import { essayRuleMet, essaySentenceCount, essayWordCount } from './essayRule';

// The same cases run against the SQL scorer in auto-score-submission.selftest.sql.
const items = vectors.filter(v => v.kind === 'item');
const counts = vectors.filter(v => v.kind === 'essay_counts');

describe('shared scoring vectors', () => {
  it('has enough cases of each kind, with unique ids', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(40);
    expect(new Set(vectors.map(v => v.id)).size).toBe(vectors.length);
    for (const type of ['multiple_choice', 'true_false', 'identification', 'enumeration', 'essay']) {
      expect(items.some(v => v.item_type === type)).toBe(true);
    }
    expect(counts.length).toBeGreaterThanOrEqual(10);
  });

  it.each(items.map(v => [v.id, v]))('item %s', (_id, v) => {
    const key = v.key === null ? (v.item_type === 'essay' ? null : { correct_answer: null }) : { correct_answer: v.key };
    expect(checkItem({ id: v.id, item_type: v.item_type, points: v.points }, key, v.answer))
      .toEqual({ isCorrect: v.expected.correct, pointsEarned: v.expected.points });
  });

  it.each(counts.map(v => [v.id, v]))('counts %s', (_id, v) => {
    expect(essayWordCount(v.text)).toBe(v.words);
    expect(essaySentenceCount(v.text)).toBe(v.sentences);
  });
});

describe('essayRule', () => {
  it('treats a missing or non-text answer as empty', () => {
    for (const value of [null, undefined, 42, ['a b']]) {
      expect(essayWordCount(value)).toBe(0);
      expect(essaySentenceCount(value)).toBe(0);
    }
  });

  it('has no rule when neither minimum is set', () => {
    expect(essayRuleMet('Anything at all.', {})).toBeNull();
    expect(essayRuleMet('Anything at all.')).toBeNull();
    expect(essayRuleMet('Anything at all.', { minSentences: null, minWords: null })).toBeNull();
  });

  it('a sentence minimum alone', () => {
    expect(essayRuleMet('One. Two.', { minSentences: 2 })).toBe(true);
    expect(essayRuleMet('One. Two', { minSentences: 2 })).toBe(true);
    expect(essayRuleMet('Only one.', { minSentences: 2 })).toBe(false);
  });

  it('a word minimum alone', () => {
    expect(essayRuleMet('one two three', { minWords: 3 })).toBe(true);
    expect(essayRuleMet('one two', { minWords: 3 })).toBe(false);
    expect(essayRuleMet('one - two , three', { minWords: 4 })).toBe(false);
  });

  it('both minimums must be met', () => {
    const rule = { minSentences: 2, minWords: 5 };
    expect(essayRuleMet('Plants need light. They grow tall.', rule)).toBe(true);
    expect(essayRuleMet('Plants need light and grow tall', rule)).toBe(false);
    expect(essayRuleMet('Plants. Grow.', rule)).toBe(false);
  });

  it('a decimal does not end a sentence, an ellipsis does', () => {
    expect(essaySentenceCount('It costs 3.50 pesos')).toBe(1);
    expect(essaySentenceCount('Maybe… later')).toBe(2);
    expect(essaySentenceCount('Maybe...later')).toBe(1);
  });

  it('counts accented words', () => {
    expect(essayWordCount('Niño Señora Ñ')).toBe(3);
  });
});
