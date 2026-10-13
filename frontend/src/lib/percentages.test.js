import { describe, expect, it } from 'vitest';
import { wholePercents } from './percentages';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('wholePercents', () => {
  it('fixes the case that prompted it', () => {
    // Rounded one by one these give 58+25+9+5+5 = 102.
    const out = wholePercents([93, 40, 15, 8, 8]);
    expect(sum(out)).toBe(100);
  });

  it('always totals 100, whatever the split', () => {
    for (const counts of [[1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [2, 1], [10, 10, 10, 1], [7]]) {
      expect(sum(wholePercents(counts)), String(counts)).toBe(100);
    }
  });

  it('gives the leftover point to the share that lost the most', () => {
    // Thirds: 33.33 each, two points over. The first two by tie order.
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('stays within a point of the true share', () => {
    const counts = [93, 40, 15, 8, 8];
    const total = sum(counts);
    wholePercents(counts).forEach((pct, i) => {
      expect(Math.abs(pct - (counts[i] / total) * 100)).toBeLessThan(1);
    });
  });

  it('describes nothing as nothing', () => {
    expect(wholePercents([])).toEqual([]);
    expect(wholePercents([0, 0])).toEqual([0, 0]);
  });

  it('leaves an exact split alone', () => {
    expect(wholePercents([1, 1, 1, 1])).toEqual([25, 25, 25, 25]);
    expect(wholePercents([3, 1])).toEqual([75, 25]);
  });
});
