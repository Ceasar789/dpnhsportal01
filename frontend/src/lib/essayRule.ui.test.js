import { describe, expect, it } from 'vitest';
import { ESSAY_MAX_SENTENCES, ESSAY_MAX_WORDS, essayRuleText, parseEssayMinimum } from './essayRule';

describe('parseEssayMinimum', () => {
  it.each([['', null], ['  ', null], [null, null], [undefined, null], ['1', 1], [' 3 ', 3], [7, 7], ['50', 50]])(
    '%j is accepted as %j', (input, value) => {
      expect(parseEssayMinimum(input, ESSAY_MAX_SENTENCES)).toEqual({ ok: true, value });
    });

  it.each(['0', '-1', '2.5', '1e2', 'abc', '51'])('%j is rejected for sentences', input => {
    expect(parseEssayMinimum(input, ESSAY_MAX_SENTENCES).ok).toBe(false);
  });

  it('words go up to 2000', () => {
    expect(parseEssayMinimum('2000', ESSAY_MAX_WORDS)).toEqual({ ok: true, value: 2000 });
    expect(parseEssayMinimum('2001', ESSAY_MAX_WORDS).ok).toBe(false);
  });
});

describe('essayRuleText', () => {
  it.each([
    [{ minSentences: 3 }, 'Write at least 3 sentences.'],
    [{ minWords: 50 }, 'Write at least 50 words.'],
    [{ minSentences: 1, minWords: 1 }, 'Write at least 1 sentence and 1 word.'],
    [{ minSentences: 2, minWords: 40 }, 'Write at least 2 sentences and 40 words.'],
    [{}, ''],
    [undefined, ''],
  ])('%j -> %j', (rule, text) => { expect(essayRuleText(rule)).toBe(text); });
});
