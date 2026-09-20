// ============================================
// FILE: src/lib/worksheetChecking.js
// Scoring rules for worksheet items. Pure — no React, no Supabase — so the
// rules that decide a student's mark can be tested directly.
//
// This runs in the TEACHER's browser at review time, never the student's:
// it needs the answer key, and a key that reaches a student's client can be
// read off the API no matter what the UI chooses to render.
// ============================================

export const ITEM_TYPES = [
  'multiple_choice', 'true_false', 'identification', 'enumeration', 'essay',
];

// The exact strings a true/false answer key is stored as, and so the exact
// strings any answering UI (teacher builder, student submission form) must
// use — normalizeAnswer is case/whitespace-tolerant, but the two options
// still have to be these two words for a match to ever be possible.
export const TRUE_FALSE_VALUES = ['True', 'False'];

// Normalizes a raw "points" value from the question builder into a safe
// number. An <input type="number"> reports '' the instant it is cleared to
// retype, and Number('') is 0 — finite and >= 0 — so a blank/whitespace
// value must be treated as absent, not as a deliberate 0. A genuine 0 (or
// any other finite, non-negative number) is kept exactly as given.
export function normalizePoints(rawPoints) {
  const raw = typeof rawPoints === 'string' ? rawPoints.trim() : rawPoints;
  const pts = raw === '' || raw === null || raw === undefined ? NaN : Number(raw);
  return Number.isFinite(pts) && pts >= 0 ? pts : 1;
}

// Splits a comma-separated "accepted answers" string (identification /
// enumeration key input) into a clean list. A key of just "," or ", ,"
// passes a simple non-empty check but must not be allowed to produce a real
// key row with zero usable answers — that is unscorable in exactly the way
// a missing key row is, just self-inflicted by the input rather than a
// failed save.
export function splitAcceptedAnswers(raw) {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

export function normalizeAnswer(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

const toList = (value) => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const round2 = (n) => Math.round(n * 100) / 100;

export function checkItem(item, key, answer) {
  const points = Number(item?.points) || 0;

  // An essay has no machine-checkable answer; the teacher types the points.
  if (item?.item_type === 'essay') return { isCorrect: null, pointsEarned: null };

  // A non-essay item with no key row at all (as opposed to a key row with an
  // empty/blank answer) is unscorable, not automatically wrong: a save that
  // partially failed, or a race during item authoring, must not silently
  // mark an entire class incorrect on a question nobody could ever match.
  if (key === null || key === undefined) return { isCorrect: null, pointsEarned: null };

  if (item?.item_type === 'multiple_choice' || item?.item_type === 'true_false') {
    const given = normalizeAnswer(answer);
    const correct = normalizeAnswer(key?.correct_answer);
    const ok = given !== '' && given === correct;
    return { isCorrect: ok, pointsEarned: ok ? points : 0 };
  }

  if (item?.item_type === 'identification') {
    const accepted = toList(key?.correct_answer).map(normalizeAnswer).filter(Boolean);
    const given = normalizeAnswer(answer);
    const ok = given !== '' && accepted.includes(given);
    return { isCorrect: ok, pointsEarned: ok ? points : 0 };
  }

  if (item?.item_type === 'enumeration') {
    const expected = toList(key?.correct_answer).map(normalizeAnswer).filter(Boolean);
    if (expected.length === 0) return { isCorrect: false, pointsEarned: 0 };

    // Order does not matter, and repeating one correct answer earns it once.
    const credited = new Set();
    toList(answer).map(normalizeAnswer).filter(Boolean).forEach((given) => {
      if (expected.includes(given)) credited.add(given);
    });

    const matched = credited.size;
    return {
      isCorrect: matched === expected.length,
      pointsEarned: round2((matched / expected.length) * points),
    };
  }

  return { isCorrect: null, pointsEarned: null };
}

export function scoreSubmission(items, keysByItemId, answersByItemId) {
  const list = Array.isArray(items) ? items : [];

  const perItem = list.map((item) => {
    const { isCorrect, pointsEarned } = checkItem(
      item,
      keysByItemId?.[item.id],
      answersByItemId?.[item.id],
    );
    return { item_id: item.id, isCorrect, pointsEarned };
  });

  // Essays contribute to the total but not to the auto-computed score until
  // the teacher fills them in, so the two are summed separately.
  const score = round2(perItem.reduce((sum, r) => sum + (Number(r.pointsEarned) || 0), 0));
  const totalPoints = round2(list.reduce((sum, i) => sum + (Number(i.points) || 0), 0));

  return { score, totalPoints, perItem };
}
