// ============================================
// FILE: src/lib/essayRule.js
// The teacher's essay rule: a minimum number of sentences and/or words. The
// database scorer (backend/database/migrations/auto-score-submission.sql)
// counts the same way; scoringVectors.json keeps the two in step.
// ============================================

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const asText = value => (typeof value === 'string' ? value : '');

// Pieces of the trimmed text between whitespace that hold a letter or digit.
export function essayWordCount(value) {
  const text = asText(value).trim();
  return text ? text.split(/\s+/).filter(piece => LETTER_OR_DIGIT.test(piece)).length : 0;
}

// Pieces between one or more of . ! ? … followed by whitespace or the end, that
// hold a letter or digit. "3.5" does not split, and a last sentence without a
// full stop still counts.
export function essaySentenceCount(value) {
  return asText(value).split(/[.!?…]+(?:\s+|$)/u).filter(piece => LETTER_OR_DIGIT.test(piece)).length;
}

// The limits worksheet_items enforces (auto-score-submission.sql).
export const ESSAY_MAX_SENTENCES = 50;
export const ESSAY_MAX_WORDS = 2000;

// An editor value as a stored minimum: '' or null means no rule; otherwise a
// whole number from 1 to max, or ok: false.
export function parseEssayMinimum(value, max) {
  const text = value == null ? '' : String(value).trim();
  if (text === '') return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, value: null };
  const number = Number(text);
  return number >= 1 && number <= max ? { ok: true, value: number } : { ok: false, value: null };
}

// What the student is told under an essay question; '' when there is no rule.
export function essayRuleText({ minSentences = null, minWords = null } = {}) {
  const parts = [];
  if (minSentences != null) parts.push(`${minSentences} ${minSentences === 1 ? 'sentence' : 'sentences'}`);
  if (minWords != null) parts.push(`${minWords} ${minWords === 1 ? 'word' : 'words'}`);
  return parts.length ? `Write at least ${parts.join(' and ')}.` : '';
}

// null when the item has no rule; otherwise whether every set minimum is met.
export function essayRuleMet(value, { minSentences = null, minWords = null } = {}) {
  if (minSentences == null && minWords == null) return null;
  return (minSentences == null || essaySentenceCount(value) >= minSentences)
    && (minWords == null || essayWordCount(value) >= minWords);
}
