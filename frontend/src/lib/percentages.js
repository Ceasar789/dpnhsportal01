// ============================================
// FILE: src/lib/percentages.js
//
// Rounding a set of shares to whole percents and having them still add up.
//
// Role Distribution read "58% 25% 9% 5% 5%" — 102%. Each share had been
// rounded on its own, which is correct for any one of them and wrong for
// the set. A reader who adds up a legend and gets 102 is right to wonder
// which number is the broken one.
//
// Largest remainder: floor everything, then hand the leftover points to
// whichever shares were cut by the most. It is the method that keeps every
// value within a point of its true share while the total stays exact.
// ============================================

/**
 * Whole-percent shares of `counts`, summing to exactly 100.
 * An all-zero (or empty) input returns all zeros — there is no distribution
 * to describe, and inventing 100% of nothing would be a lie.
 *
 * @param {number[]} counts
 * @returns {number[]} one integer per count, in the same order
 */
export function wholePercents(counts) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return counts.map(() => 0);

  const exact = counts.map((n) => (n / total) * 100);
  const floors = exact.map(Math.floor);
  let leftover = 100 - floors.reduce((sum, n) => sum + n, 0);

  // Biggest fractional part first; ties go to the earlier entry, so the
  // same input always produces the same output.
  const order = exact
    .map((value, i) => ({ i, frac: value - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = floors.slice();
  for (let k = 0; leftover > 0; k++, leftover--) out[order[k % order.length].i] += 1;
  return out;
}
