// ============================================
// FILE: src/components/clarity/charts/chartMath.js
// Number handling shared by the Clarity charts: anything that is not a
// finite number becomes null (shown as "no data"), never NaN in the SVG.
// The app has no locale number helper, so numbers use toLocaleString.
// ============================================

export const LOCALE = 'en-PH';

/** A finite number, or null for null, undefined, '', NaN and Infinity. */
export const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const formatNumber = (n) => Math.round(n).toLocaleString(LOCALE);

/**
 * A percentage for drawing: clamped to 0-100. `note` explains the clamp in
 * words when the real value was out of range, and is '' otherwise.
 */
export const percentForDrawing = (value) => {
  const n = toNumber(value);
  if (n === null) return { pct: null, note: '' };
  const pct = Math.min(100, Math.max(0, n));
  const note = pct === n ? '' : ` (recorded value ${formatNumber(n)} percent is outside 0 to 100)`;
  return { pct, note };
};

/** A count for drawing: null when unusable, 0 when negative. */
export const countForDrawing = (value) => {
  const n = toNumber(value);
  if (n === null) return null;
  return n < 0 ? 0 : n;
};

// Series colours: the three Clarity chart tokens, then two neutral tokens.
// Charts never rely on colour alone: every value is also written as text.
export const SERIES = ['var(--cl-c1)', 'var(--cl-c2)', 'var(--cl-c3)', 'var(--cl-mu)', 'var(--cl-dim)'];
export const seriesColour = i => SERIES[i % SERIES.length];

// Status tones for status breakdowns (the same tokens as the Clarity badges).
export const TONES = {
  ok: 'var(--cl-ok)', wa: 'var(--cl-wa)', er: 'var(--cl-er)', in: 'var(--cl-ac)', mu: 'var(--cl-mu)',
};
