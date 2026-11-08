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

// null when the item has no rule; otherwise whether every set minimum is met.
export function essayRuleMet(value, { minSentences = null, minWords = null } = {}) {
  if (minSentences == null && minWords == null) return null;
  return (minSentences == null || essaySentenceCount(value) >= minSentences)
    && (minWords == null || essayWordCount(value) >= minWords);
}
