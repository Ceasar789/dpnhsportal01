# Worksheet Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give worksheets questions, answering and scoring, then feed the resulting scores into a Student Overview that currently shows nothing but placeholders.

**Architecture:** Five new tables plus a `checking_mode` column extend the existing `worksheets` table. Answer keys live in their own table students cannot read, and auto-checking runs in the teacher's browser at review time, so the key never reaches a student's client. All branching logic lives in one pure module with unit tests. Teacher UI is split into three focused modals rather than growing `WorksheetsTab.jsx`, which is already 370 lines.

**Tech Stack:** React 18, Vite 5, Tailwind, Supabase (Postgres + RLS), lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-student-overview-worksheet-scoring-design.md`

## Global Constraints

- Every fetch-on-mount goes through `withRetry` from `src/lib/supabaseRetry.js`. Never wrap a write (`insert`/`update`/`delete`/`upsert`) — retrying a write risks duplicates.
- A failed read must never render as `0` or an empty list. Keep an error flag per slice and render a distinct "Could not load — check your connection" state with a Retry button. This codebase has had four user-visible incidents from confusing "read failed" with "no data".
- An honest empty result ("no scores yet") and a failed read must not look alike.
- `.modal-overlay` is `display: none`; only `.modal-overlay.open` is visible. This applies to admin-styled modals only — teacher and student dashboards use their own `Modal`/`Card` components.
- Student-facing queries must never select `worksheet_item_keys` or any column holding a correct answer.
- Item types are exactly: `multiple_choice`, `true_false`, `identification`, `enumeration`, `essay`.
- `checking_mode` is exactly `auto` or `manual`, defaulting to `manual`.
- SQL files go in `archives/` with a `phase2-NN-` prefix, matching the repo's convention.
- Run `npx vite build` and `npm test` before every commit. Both must pass. The build emits one pre-existing "chunk larger than 500 kB" warning; that is expected.

---

## Stage A — Data model and checking logic (Tasks 1-4)

### Task 1: Pure worksheet checking module

The only branching logic in the feature. Extracted so it can be tested directly, the way `src/lib/academicRules.js` was in Phase 1.

**Files:**
- Create: `src/lib/worksheetChecking.js`
- Create: `src/lib/worksheetChecking.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ITEM_TYPES: string[]`
  - `normalizeAnswer(value): string`
  - `checkItem(item, key, answer): { isCorrect: boolean|null, pointsEarned: number|null }`
  - `scoreSubmission(items, keysByItemId, answersByItemId): { score: number, totalPoints: number, perItem: Array<{ item_id, isCorrect, pointsEarned }> }`
  - where `item = { id, item_type, points }`, `key = { correct_answer }`, and `answer` is a string for single-value types or an array for `enumeration`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/worksheetChecking.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ITEM_TYPES, normalizeAnswer, checkItem, scoreSubmission } from './worksheetChecking';

const mc   = { id: 'i1', item_type: 'multiple_choice', points: 2 };
const tf   = { id: 'i2', item_type: 'true_false',      points: 1 };
const ident= { id: 'i3', item_type: 'identification',  points: 2 };
const enu  = { id: 'i4', item_type: 'enumeration',     points: 3 };
const essay= { id: 'i5', item_type: 'essay',           points: 5 };

describe('ITEM_TYPES', () => {
  it('lists the five supported types', () => {
    expect(ITEM_TYPES).toEqual([
      'multiple_choice', 'true_false', 'identification', 'enumeration', 'essay',
    ]);
  });
});

describe('normalizeAnswer', () => {
  it('lowercases, trims and collapses internal whitespace', () => {
    expect(normalizeAnswer('  Jose   Rizal ')).toBe('jose rizal');
  });

  it('returns an empty string for null and undefined', () => {
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(undefined)).toBe('');
  });

  it('stringifies non-strings', () => {
    expect(normalizeAnswer(1896)).toBe('1896');
  });
});

describe('checkItem — multiple choice and true/false', () => {
  it('awards full points for the correct option', () => {
    expect(checkItem(mc, { correct_answer: 'B' }, 'B')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('awards nothing for the wrong option', () => {
    expect(checkItem(mc, { correct_answer: 'B' }, 'C')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('treats a blank answer as wrong, not as a match', () => {
    expect(checkItem(mc, { correct_answer: 'B' }, '')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('handles true/false the same way', () => {
    expect(checkItem(tf, { correct_answer: 'True' }, 'true')).toEqual({ isCorrect: true, pointsEarned: 1 });
  });
});

describe('checkItem — identification', () => {
  const key = { correct_answer: ['Jose Rizal', 'Rizal'] };

  it('accepts an exact match', () => {
    expect(checkItem(ident, key, 'Jose Rizal')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('ignores case and surrounding whitespace', () => {
    expect(checkItem(ident, key, '  jose rizal ')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('accepts any of the answers the teacher listed', () => {
    expect(checkItem(ident, key, 'rizal')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });

  it('rejects an answer that is not on the list', () => {
    expect(checkItem(ident, key, 'Bonifacio')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('rejects a blank answer', () => {
    expect(checkItem(ident, key, '   ')).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it('accepts a key stored as a single string rather than a list', () => {
    expect(checkItem(ident, { correct_answer: 'Rizal' }, 'rizal')).toEqual({ isCorrect: true, pointsEarned: 2 });
  });
});

describe('checkItem — enumeration', () => {
  const key = { correct_answer: ['Executive', 'Legislative', 'Judicial'] };

  it('awards full points when every answer is present', () => {
    const result = checkItem(enu, key, ['Executive', 'Legislative', 'Judicial']);
    expect(result).toEqual({ isCorrect: true, pointsEarned: 3 });
  });

  it('awards partial credit per matched answer', () => {
    const result = checkItem(enu, key, ['Executive', 'Judicial', 'Barangay']);
    expect(result).toEqual({ isCorrect: false, pointsEarned: 2 });
  });

  it('does not care about order', () => {
    const result = checkItem(enu, key, ['Judicial', 'Executive', 'Legislative']);
    expect(result).toEqual({ isCorrect: true, pointsEarned: 3 });
  });

  it('counts a duplicated answer only once', () => {
    const result = checkItem(enu, key, ['Executive', 'Executive', 'Executive']);
    expect(result).toEqual({ isCorrect: false, pointsEarned: 1 });
  });

  it('never exceeds the item points when extra answers are given', () => {
    const result = checkItem(enu, key, ['Executive', 'Legislative', 'Judicial', 'Executive', 'Extra']);
    expect(result.pointsEarned).toBe(3);
  });

  it('rounds partial credit to two decimals', () => {
    const item = { id: 'x', item_type: 'enumeration', points: 1 };
    const result = checkItem(item, key, ['Executive']);
    expect(result.pointsEarned).toBe(0.33);
  });

  it('awards nothing when the teacher left the key empty', () => {
    expect(checkItem(enu, { correct_answer: [] }, ['Executive'])).toEqual({ isCorrect: false, pointsEarned: 0 });
  });
});

describe('checkItem — essay', () => {
  it('returns nulls so the teacher scores it by hand', () => {
    expect(checkItem(essay, { correct_answer: null }, 'a long answer'))
      .toEqual({ isCorrect: null, pointsEarned: null });
  });
});

describe('scoreSubmission', () => {
  const items = [mc, ident, essay];
  const keys = { i1: { correct_answer: 'B' }, i3: { correct_answer: ['Rizal'] }, i5: { correct_answer: null } };

  it('sums the auto-scored points and reports the full total', () => {
    const answers = { i1: 'B', i3: 'Rizal', i5: 'essay text' };
    const result = scoreSubmission(items, keys, answers);
    expect(result.score).toBe(4);
    expect(result.totalPoints).toBe(9);
  });

  it('returns a per-item breakdown including the unscored essay', () => {
    const answers = { i1: 'C', i3: 'Rizal', i5: 'essay text' };
    const result = scoreSubmission(items, keys, answers);
    expect(result.perItem).toEqual([
      { item_id: 'i1', isCorrect: false, pointsEarned: 0 },
      { item_id: 'i3', isCorrect: true,  pointsEarned: 2 },
      { item_id: 'i5', isCorrect: null,  pointsEarned: null },
    ]);
  });

  it('treats a missing answer as unanswered rather than crashing', () => {
    const result = scoreSubmission(items, keys, {});
    expect(result.score).toBe(0);
    expect(result.totalPoints).toBe(9);
  });

  it('tolerates an empty worksheet', () => {
    expect(scoreSubmission([], {}, {})).toEqual({ score: 0, totalPoints: 0, perItem: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./worksheetChecking"`

- [ ] **Step 3: Write the implementation**

Create `src/lib/worksheetChecking.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 17 existing tests from Phase 1 plus 24 new ones.

- [ ] **Step 5: Verify the build**

Run: `npx vite build`
Expected: succeeds with only the pre-existing chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add src/lib/worksheetChecking.js src/lib/worksheetChecking.test.js
git commit -m "Add worksheet checking rules with unit tests

Enumeration scores partial credit, order-independent, with a repeated
correct answer credited once and extra answers never pushing the mark
above the item's points."
```

---

### Task 2: Assessment tables

**Files:**
- Create: `archives/phase2-01-worksheet-assessment-tables.sql`

**Interfaces:**
- Consumes: existing `worksheets`, `sections`, `students`, `profiles`
- Produces: `worksheets.checking_mode`; tables `worksheet_sections`, `worksheet_items`, `worksheet_item_keys`, `worksheet_submissions`, `worksheet_answers`

- [ ] **Step 1: Write the migration**

Create `archives/phase2-01-worksheet-assessment-tables.sql`:

```sql
-- ============================================
-- PHASE 2 / 01 — Worksheet assessment tables
--
-- Gives worksheets due dates, questions, answers and scores. The answer key
-- is deliberately NOT a column on worksheet_items: a student has to be able
-- to read the question, and any row they can read they can read entirely,
-- key included. Splitting it into worksheet_item_keys lets RLS deny students
-- the key while still serving them the question.
--
-- checking_mode defaults to 'manual' because the dangerous failure is an
-- auto-checker marking a WRONG answer correct — that looks right on the
-- review screen and slips through, whereas a correct answer marked wrong is
-- obvious and gets fixed. Auto-check is opted into, not inherited.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

ALTER TABLE worksheets ADD COLUMN IF NOT EXISTS checking_mode VARCHAR(10) NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'worksheets_checking_mode_check') THEN
    ALTER TABLE worksheets ADD CONSTRAINT worksheets_checking_mode_check
      CHECK (checking_mode IN ('auto', 'manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS worksheet_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  due_at       TIMESTAMP,
  posted_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, section_id)
);

CREATE TABLE IF NOT EXISTS worksheet_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  position     INT NOT NULL,
  question     TEXT NOT NULL,
  item_type    VARCHAR(20) NOT NULL
               CHECK (item_type IN ('multiple_choice','true_false','identification','enumeration','essay')),
  options      JSONB,
  points       DECIMAL(6,2) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, position)
);

-- Students never read this table. See the banner above.
CREATE TABLE IF NOT EXISTS worksheet_item_keys (
  item_id        UUID PRIMARY KEY REFERENCES worksheet_items(id) ON DELETE CASCADE,
  correct_answer JSONB
);

CREATE TABLE IF NOT EXISTS worksheet_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  source       VARCHAR(10) NOT NULL DEFAULT 'online' CHECK (source IN ('online','manual')),
  status       VARCHAR(15) NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress','submitted','checked')),
  -- The student sees nothing until a teacher has reviewed and released it.
  released     BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMP,
  score        DECIMAL(6,2),
  total_points DECIMAL(6,2),
  remarks      TEXT,
  checked_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, student_id)
);

CREATE TABLE IF NOT EXISTS worksheet_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES worksheet_submissions(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES worksheet_items(id) ON DELETE CASCADE,
  answer        JSONB,
  is_correct    BOOLEAN,
  points_earned DECIMAL(6,2),
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_worksheet_sections_section ON worksheet_sections(section_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_items_worksheet  ON worksheet_items(worksheet_id, position);
CREATE INDEX IF NOT EXISTS idx_worksheet_subs_student     ON worksheet_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_subs_worksheet   ON worksheet_submissions(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_answers_sub      ON worksheet_answers(submission_id);

-- ============================================
-- VERIFY — expect 5 rows, and checking_mode present with default 'manual'.
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('worksheet_sections','worksheet_items','worksheet_item_keys',
                     'worksheet_submissions','worksheet_answers')
ORDER BY table_name;

SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'worksheets' AND column_name = 'checking_mode';
```

- [ ] **Step 2: Ask the user to run it and report the output**

Tell the user: Supabase Dashboard → SQL Editor → New query → paste the whole file → Run **without RLS**, then paste back both result tables.
Expected: 5 table rows, and one `checking_mode` row whose default is `'manual'::character varying`.

Do not continue until the user confirms.

- [ ] **Step 3: Commit**

```bash
git add archives/phase2-01-worksheet-assessment-tables.sql
git commit -m "Add worksheet assessment tables

Answer keys live in their own table so RLS can serve a student the
question while denying them the key."
```

---

### Task 3: RLS for the assessment tables

**Files:**
- Create: `archives/phase2-02-worksheet-rls.sql`

**Interfaces:**
- Consumes: the Phase 1 helpers `is_admin()`, `student_in_section(uuid)`; tables from Task 2
- Produces: SQL functions `teacher_owns_worksheet(uuid)`, `teacher_owns_item(uuid)`, `student_can_see_worksheet(uuid)`, `own_submission(uuid)`, `submission_open(uuid)`; a `guard_worksheet_submission_write()` trigger; policies on all five new tables

- [ ] **Step 1: Write the migration**

Create `archives/phase2-02-worksheet-rls.sql`:

```sql
-- ============================================
-- PHASE 2 / 02 — Row-level security for worksheet assessment
--
-- Shared predicates live in SECURITY DEFINER functions, as in Phase 1: a
-- policy that sub-selects the table it protects recurses, and one that joins
-- through another RLS-protected table silently narrows when that table's own
-- policy changes.
--
-- The scoring columns on worksheet_submissions are guarded by a trigger
-- rather than a policy, because RLS grants or denies a whole row — it cannot
-- say "this student may set status but not score".
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

CREATE OR REPLACE FUNCTION teacher_owns_worksheet(p_worksheet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheets WHERE id = p_worksheet_id AND teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION teacher_owns_item(p_item_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_items wi
    JOIN worksheets w ON w.id = wi.worksheet_id
    WHERE wi.id = p_item_id AND w.teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION student_can_see_worksheet(p_worksheet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_sections ws
    JOIN section_students ss ON ss.section_id = ws.section_id
    WHERE ws.worksheet_id = p_worksheet_id
      AND ss.student_id = auth.uid()
      AND ss.status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION own_submission(p_submission_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_submissions WHERE id = p_submission_id AND student_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION submission_open(p_submission_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_submissions WHERE id = p_submission_id AND status = 'in_progress'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER TABLE worksheet_sections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_item_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_answers      ENABLE ROW LEVEL SECURITY;

-- worksheet_sections — the teacher who owns the worksheet, and the students
-- of the section it was posted to.
DROP POLICY IF EXISTS ws_sections_read  ON worksheet_sections;
DROP POLICY IF EXISTS ws_sections_write ON worksheet_sections;
CREATE POLICY ws_sections_read ON worksheet_sections FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_in_section(section_id));
CREATE POLICY ws_sections_write ON worksheet_sections FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));

-- worksheet_items — questions are readable by the students they were posted to.
DROP POLICY IF EXISTS ws_items_read  ON worksheet_items;
DROP POLICY IF EXISTS ws_items_write ON worksheet_items;
CREATE POLICY ws_items_read ON worksheet_items FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_can_see_worksheet(worksheet_id));
CREATE POLICY ws_items_write ON worksheet_items FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));

-- worksheet_item_keys — no student branch at all, by design.
DROP POLICY IF EXISTS ws_keys_all ON worksheet_item_keys;
CREATE POLICY ws_keys_all ON worksheet_item_keys FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_item(item_id))
  WITH CHECK (is_admin() OR teacher_owns_item(item_id));

-- worksheet_submissions — a student reads and writes only their own row.
-- Which COLUMNS they may change is enforced by the trigger below.
DROP POLICY IF EXISTS ws_subs_read         ON worksheet_submissions;
DROP POLICY IF EXISTS ws_subs_teacher_write ON worksheet_submissions;
DROP POLICY IF EXISTS ws_subs_student_write ON worksheet_submissions;
CREATE POLICY ws_subs_read ON worksheet_submissions FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_id = auth.uid());
CREATE POLICY ws_subs_teacher_write ON worksheet_submissions FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));
CREATE POLICY ws_subs_student_write ON worksheet_submissions FOR ALL TO authenticated
  USING (student_id = auth.uid() AND status <> 'checked')
  WITH CHECK (student_id = auth.uid() AND status IN ('in_progress','submitted') AND released = FALSE);

-- worksheet_answers — a student writes only `answer`, and only while their
-- submission is still open. is_correct and points_earned stay the teacher's.
DROP POLICY IF EXISTS ws_answers_read          ON worksheet_answers;
DROP POLICY IF EXISTS ws_answers_teacher_write ON worksheet_answers;
DROP POLICY IF EXISTS ws_answers_student_write ON worksheet_answers;
CREATE POLICY ws_answers_read ON worksheet_answers FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_item(item_id) OR own_submission(submission_id));
CREATE POLICY ws_answers_teacher_write ON worksheet_answers FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_item(item_id))
  WITH CHECK (is_admin() OR teacher_owns_item(item_id));
CREATE POLICY ws_answers_student_write ON worksheet_answers FOR ALL TO authenticated
  USING (own_submission(submission_id) AND submission_open(submission_id))
  WITH CHECK (own_submission(submission_id) AND submission_open(submission_id)
              AND is_correct IS NULL AND points_earned IS NULL);

-- A student may move their submission in_progress -> submitted, and nothing
-- else. RLS cannot express a column restriction, so this does.
CREATE OR REPLACE FUNCTION guard_worksheet_submission_write()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_admin() OR teacher_owns_worksheet(NEW.worksheet_id) THEN RETURN NEW; END IF;

  IF NEW.score        IS DISTINCT FROM OLD.score
     OR NEW.total_points IS DISTINCT FROM OLD.total_points
     OR NEW.released     IS DISTINCT FROM OLD.released
     OR NEW.checked_by   IS DISTINCT FROM OLD.checked_by
     OR NEW.checked_at   IS DISTINCT FROM OLD.checked_at THEN
    RAISE EXCEPTION 'Only the worksheet owner may set scoring fields';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS guard_worksheet_submission ON worksheet_submissions;
CREATE TRIGGER guard_worksheet_submission
  BEFORE UPDATE ON worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_worksheet_submission_write();

-- ============================================
-- VERIFY — every table below must show rls_on = true and at least one policy.
-- Any policy name you do not recognise should be investigated.
-- ============================================
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname IN ('worksheet_sections','worksheet_items','worksheet_item_keys',
                    'worksheet_submissions','worksheet_answers')
ORDER BY c.relname, p.cmd;

SELECT tgname FROM pg_trigger
WHERE tgrelid = 'worksheet_submissions'::regclass AND NOT tgisinternal;
```

- [ ] **Step 2: Ask the user to run it and report the output**

Expected: every table shows `rls_on = true` with policies listed, and one trigger named `guard_worksheet_submission`.

- [ ] **Step 3: Commit**

```bash
git add archives/phase2-02-worksheet-rls.sql
git commit -m "Add RLS for worksheet assessment tables

Students can read a question but never its key, and a trigger stops them
writing the scoring columns on their own submission — RLS grants whole
rows and cannot express that restriction."
```

---

### Task 4: Fix attendance RLS

Attendance has RLS enabled with a single adviser-SELECT policy and no write policy at all, so no teacher has ever been able to record attendance and no student has ever been able to read their own.

**Files:**
- Create: `archives/phase2-03-attendance-rls.sql`

**Interfaces:**
- Consumes: Phase 1 helpers `is_admin()`, `teacher_handles_section(uuid)`, `teacher_advises_section(uuid)`
- Produces: policies `attendance_student_read`, `attendance_staff_write` on `attendance`

- [ ] **Step 1: Write the migration**

Create `archives/phase2-03-attendance-rls.sql`:

```sql
-- ============================================
-- PHASE 2 / 03 — Attendance read and write policies
--
-- attendance had RLS enabled with exactly one policy: SELECT for a section's
-- adviser. No INSERT, no UPDATE — so every attempt by the teacher's
-- Attendance tab to record a day was denied, silently, and no student could
-- ever read their own record. The Student Overview's attendance percentage
-- cannot be anything but zero until both sides of this exist.
--
-- The original adviser-SELECT policy is left in place; permissive policies OR
-- together, so these widen access rather than replacing it.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

DROP POLICY IF EXISTS attendance_student_read ON attendance;
CREATE POLICY attendance_student_read ON attendance FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS attendance_staff_write ON attendance;
CREATE POLICY attendance_staff_write ON attendance FOR ALL TO authenticated
  USING (is_admin() OR teacher_handles_section(section_id) OR teacher_advises_section(section_id))
  WITH CHECK (is_admin() OR teacher_handles_section(section_id) OR teacher_advises_section(section_id));

-- ============================================
-- VERIFY — expect the original adviser SELECT policy plus the two added here.
-- ============================================
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'attendance'
ORDER BY policyname;
```

- [ ] **Step 2: Ask the user to run it and report the output**

Expected: three policies — the pre-existing `Section teachers view attendance`, plus `attendance_student_read` and `attendance_staff_write`.

- [ ] **Step 3: Commit**

```bash
git add archives/phase2-03-attendance-rls.sql
git commit -m "Let teachers record attendance and students read their own

attendance had RLS enabled with only an adviser SELECT policy, so every
write was denied and the Student Overview percentage could never be
anything but zero."
```

---

## Stage B — Teacher can post, build and check (Tasks 5-7)

### Task 5: Assessment hook and Post-to-Section modal

`WorksheetsTab.jsx` is already 370 lines. The assessment state and its three modals go in a sibling folder rather than growing it further.

**Files:**
- Create: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`
- Create: `src/pages/dashboards/teacher/worksheets/PostToSectionModal.jsx`
- Modify: `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx`

**Interfaces:**
- Consumes: `withRetry`; tables from Task 2; policies from Task 3
- Produces, from `useWorksheetAssessment(showToast)`:
  - `mySections: Array<{ id, name, grade_level }>`, `sectionsError: boolean`, `fetchMySections()`
  - `postings: Array<{ id, worksheet_id, section_id, due_at }>`, `postingsError: boolean`, `fetchPostings()`
  - `postWorksheet(worksheetId, sectionId, dueAt): Promise<boolean>`

- [ ] **Step 1: Create the hook**

Create `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx
// Posting, question and submission state for the Worksheets tab. Kept out of
// WorksheetsTab.jsx, which already carries the upload and CRUD flow.
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../../config/supabase';
import { useAuth } from '../../../../context/AuthContext';
import { withRetry } from '../../../../lib/supabaseRetry';

export const useWorksheetAssessment = (showToast) => {
  const { userData } = useAuth();

  const [mySections, setMySections] = useState([]);
  const [sectionsError, setSectionsError] = useState(false);
  const [postings, setPostings] = useState([]);
  const [postingsError, setPostingsError] = useState(false);

  // Sections this teacher is scheduled into, plus any they advise.
  const fetchMySections = useCallback(async () => {
    if (!userData?.uid) return;

    const { data: sched, error: schedError } = await withRetry(
      () => supabase.from('schedules').select('section_id').eq('teacher_id', userData.uid),
      { label: 'Teacher schedules fetch' }
    );
    if (schedError) {
      console.warn('Teacher schedules fetch failed —', schedError.message);
      setSectionsError(true);
      return;
    }

    const { data: advised, error: advisedError } = await withRetry(
      () => supabase.from('sections').select('id, name, grade_level').eq('adviser_id', userData.uid),
      { label: 'Advised sections fetch' }
    );
    if (advisedError) {
      console.warn('Advised sections fetch failed —', advisedError.message);
      setSectionsError(true);
      return;
    }

    const ids = [...new Set((sched || []).map(s => s.section_id))];
    let scheduled = [];
    if (ids.length > 0) {
      const { data, error } = await withRetry(
        () => supabase.from('sections').select('id, name, grade_level').in('id', ids),
        { label: 'Scheduled sections fetch' }
      );
      if (error) {
        console.warn('Scheduled sections fetch failed —', error.message);
        setSectionsError(true);
        return;
      }
      scheduled = data || [];
    }

    const merged = [...scheduled, ...(advised || [])]
      .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    setSectionsError(false);
    setMySections(merged);
  }, [userData?.uid]);

  const fetchPostings = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('worksheet_sections').select('id, worksheet_id, section_id, due_at'),
      { label: 'Worksheet postings fetch' }
    );
    if (error) {
      console.warn('Worksheet postings fetch failed —', error.message);
      setPostingsError(true);
      return;
    }
    setPostingsError(false);
    setPostings(data || []);
  }, []);

  const postWorksheet = async (worksheetId, sectionId, dueAt) => {
    if (!sectionId) { showToast('Pick a section', 'error'); return false; }
    if (!dueAt) { showToast('Set a due date', 'error'); return false; }

    const { error } = await supabase.from('worksheet_sections').insert([{
      worksheet_id: worksheetId,
      section_id: sectionId,
      due_at: dueAt,
      posted_by: userData?.uid || null,
    }]);

    if (error) {
      // 23505 is unique_violation: already posted to this section.
      showToast(
        error.code === '23505'
          ? 'This worksheet is already posted to that section.'
          : `Could not post: ${error.message}`,
        'error'
      );
      return false;
    }
    showToast('Worksheet posted');
    fetchPostings();
    return true;
  };

  useEffect(() => { fetchMySections(); }, [fetchMySections]);
  useEffect(() => { fetchPostings(); }, [fetchPostings]);

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    postWorksheet,
  };
};
```

- [ ] **Step 2: Create the modal**

Create `src/pages/dashboards/teacher/worksheets/PostToSectionModal.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/PostToSectionModal.jsx
// Posts one worksheet to one section with a due date.
// ============================================

import React, { useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';

const PostToSectionModal = ({ worksheet, sections, sectionsError, onPost, onClose }) => {
  const { dark } = useTheme();
  const [sectionId, setSectionId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
  };

  const submit = async () => {
    setSaving(true);
    const ok = await onPost(worksheet.id, sectionId, dueAt);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Post "${worksheet.title}"`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {sectionsError ? (
          <p className="text-sm" style={{ color: '#dc2626' }}>
            Could not load your sections. Check your connection and reopen this window.
          </p>
        ) : sections.length === 0 ? (
          <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
            You have no sections yet. An administrator assigns these in Schedules.
          </p>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Section</label>
              <select value={sectionId} onChange={e => setSectionId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle}>
                <option value="">Select section…</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade_level})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Due date</label>
              <input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)}
                className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle} />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit}
            disabled={saving || sectionsError || sections.length === 0}>
            {saving ? 'Posting…' : 'Post'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

export default PostToSectionModal;
```

- [ ] **Step 3: Wire it into WorksheetsTab**

In `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx`:

Add the imports:

```jsx
import { useWorksheetAssessment } from '../worksheets/useWorksheetAssessment';
import PostToSectionModal from '../worksheets/PostToSectionModal';
```

Inside the component, beside the existing state:

```jsx
  const assessment = useWorksheetAssessment(showToast);
  const [postingWorksheet, setPostingWorksheet] = useState(null);
```

In the worksheet card's button row, before the delete button:

```jsx
              <button onClick={() => setPostingWorksheet(ws)} className="flex-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', color: dark ? '#cbd5e1' : '#374151', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                Post
              </button>
```

Directly under the card, show where it is already posted:

```jsx
            {assessment.postings.filter(p => p.worksheet_id === ws.id).length > 0 && (
              <p className="text-[11px] mt-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                Posted to {assessment.postings.filter(p => p.worksheet_id === ws.id).length} section(s)
              </p>
            )}
```

At the end of the returned JSX, beside the other modals:

```jsx
      {postingWorksheet && (
        <PostToSectionModal
          worksheet={postingWorksheet}
          sections={assessment.mySections}
          sectionsError={assessment.sectionsError}
          onPost={assessment.postWorksheet}
          onClose={() => setPostingWorksheet(null)}
        />
      )}
```

- [ ] **Step 4: Verify**

Run: `npx vite build` and `npm test`. Both must pass.

Cross-check by name that every property `PostToSectionModal` and the new JSX read is actually returned by `useWorksheetAssessment`. A name referenced but never provided passes the build and throws at runtime; this project lost a debugging session to exactly that.

Browser verification is the user's step — state in your report that you could not perform it.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboards/teacher/worksheets/ src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
git commit -m "Let a teacher post a worksheet to a section with a due date"
```

---

### Task 6: Question builder

**Files:**
- Create: `src/pages/dashboards/teacher/worksheets/QuestionBuilderModal.jsx`
- Modify: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`
- Modify: `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx`

**Interfaces:**
- Consumes: `ITEM_TYPES` from `src/lib/worksheetChecking.js`; the hook from Task 5
- Produces, added to `useWorksheetAssessment`:
  - `loadItems(worksheetId): Promise<{ items, keys }>` where `keys` is `{ [itemId]: correctAnswer }`
  - `saveItems(worksheetId, items): Promise<boolean>` — `items` is `[{ position, question, item_type, options, points, correct_answer }]`; replaces the worksheet's items wholesale
  - `setCheckingMode(worksheetId, mode): Promise<void>`

- [ ] **Step 1: Add the item functions to the hook**

Append inside `useWorksheetAssessment`, before its `return`:

```jsx
  const loadItems = async (worksheetId) => {
    const { data: items, error } = await withRetry(
      () => supabase.from('worksheet_items').select('*').eq('worksheet_id', worksheetId).order('position'),
      { label: 'Worksheet items fetch' }
    );
    if (error) {
      console.warn('Worksheet items fetch failed —', error.message);
      showToast('Could not load the questions. Check your connection.', 'error');
      return null;
    }

    const ids = (items || []).map(i => i.id);
    let keys = {};
    if (ids.length > 0) {
      const { data: keyRows, error: keyError } = await withRetry(
        () => supabase.from('worksheet_item_keys').select('item_id, correct_answer').in('item_id', ids),
        { label: 'Worksheet keys fetch' }
      );
      if (keyError) {
        console.warn('Worksheet keys fetch failed —', keyError.message);
        showToast('Could not load the answer key. Check your connection.', 'error');
        return null;
      }
      keys = Object.fromEntries((keyRows || []).map(k => [k.item_id, k.correct_answer]));
    }

    return { items: items || [], keys };
  };

  // Replaces the worksheet's items wholesale — which means DELETING the old
  // ones, and worksheet_answers.item_id cascades on delete. Once anyone has
  // answered, saving would silently destroy their answers, so this refuses.
  // The check lives here rather than only in the UI because a second caller
  // would otherwise reintroduce the data loss.
  const saveItems = async (worksheetId, items) => {
    const { data: existing, error: checkError } = await withRetry(
      () => supabase.from('worksheet_submissions').select('id').eq('worksheet_id', worksheetId).limit(1),
      { label: 'Worksheet submissions guard fetch' }
    );
    if (checkError) {
      showToast('Could not check for existing answers — not saving.', 'error');
      return false;
    }
    if ((existing || []).length > 0) {
      showToast('Students have already answered this worksheet. Its questions can no longer be changed.', 'error');
      return false;
    }

    const { error: clearError } = await supabase
      .from('worksheet_items').delete().eq('worksheet_id', worksheetId);
    if (clearError) {
      showToast(`Could not save questions: ${clearError.message}`, 'error');
      return false;
    }

    if (items.length === 0) { showToast('Questions saved'); return true; }

    const rows = items.map((it, index) => ({
      worksheet_id: worksheetId,
      position: index + 1,
      question: it.question,
      item_type: it.item_type,
      options: it.options && it.options.length > 0 ? it.options : null,
      points: Number(it.points) || 1,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('worksheet_items').insert(rows).select('id, position');
    if (insertError) {
      showToast(`Could not save questions: ${insertError.message}`, 'error');
      return false;
    }

    const keyRows = (inserted || [])
      .map(row => {
        const source = items[row.position - 1];
        if (source.item_type === 'essay') return null;
        return { item_id: row.id, correct_answer: source.correct_answer ?? null };
      })
      .filter(Boolean);

    if (keyRows.length > 0) {
      const { error: keyError } = await supabase.from('worksheet_item_keys').insert(keyRows);
      if (keyError) {
        showToast(`Questions saved but the answer key failed: ${keyError.message}`, 'error');
        return false;
      }
    }

    showToast('Questions saved');
    return true;
  };

  const setCheckingMode = async (worksheetId, mode) => {
    const { error } = await supabase.from('worksheets').update({ checking_mode: mode }).eq('id', worksheetId);
    if (error) return showToast(`Could not change checking mode: ${error.message}`, 'error');
    showToast(mode === 'auto' ? 'Auto-checking on' : 'Manual checking only');
  };
```

Add `loadItems, saveItems, setCheckingMode` to the hook's returned object.

- [ ] **Step 2: Create the builder**

Create `src/pages/dashboards/teacher/worksheets/QuestionBuilderModal.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/QuestionBuilderModal.jsx
// Builds a worksheet's questions and answer key, and carries the per-worksheet
// auto-check toggle. Manual is the default: an auto-checker that marks a wrong
// answer correct looks right on review and slips through.
// ============================================

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Modal, Btn, Input } from '../shared/ui';
import { useTheme } from '../hooks';
import { ITEM_TYPES } from '../../../../lib/worksheetChecking';

const TYPE_LABELS = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / False',
  identification: 'Identification',
  enumeration: 'Enumeration',
  essay: 'Essay',
};

const blankItem = () => ({
  question: '', item_type: 'multiple_choice',
  options: ['', '', '', ''], correct_answer: '', points: 1,
});

const QuestionBuilderModal = ({ worksheet, loadItems, saveItems, setCheckingMode, onClose }) => {
  const { dark } = useTheme();
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState(worksheet.checking_mode || 'manual');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await loadItems(worksheet.id);
      if (!active) return;
      if (!result) { setLoadFailed(true); setLoading(false); return; }
      setItems(result.items.map(i => ({
        question: i.question,
        item_type: i.item_type,
        options: i.options || ['', '', '', ''],
        correct_answer: result.keys[i.id] ?? '',
        points: i.points,
      })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [worksheet.id, loadItems]);

  const patch = (index, changes) =>
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...changes } : it)));

  const move = (index, delta) => setItems(prev => {
    const next = [...prev];
    const target = index + delta;
    if (target < 0 || target >= next.length) return prev;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const submit = async () => {
    for (const [i, it] of items.entries()) {
      if (!it.question.trim()) return alert(`Question ${i + 1} has no text.`);
      if (it.item_type !== 'essay' && !String(it.correct_answer).trim().length) {
        return alert(`Question ${i + 1} has no answer key.`);
      }
    }
    setSaving(true);
    const ok = await saveItems(worksheet.id, items.map(it => ({
      ...it,
      // Identification and enumeration keys are stored as lists.
      correct_answer: ['identification', 'enumeration'].includes(it.item_type)
        ? String(it.correct_answer).split(',').map(s => s.trim()).filter(Boolean)
        : it.correct_answer,
      options: it.item_type === 'multiple_choice' ? it.options.filter(o => o.trim()) : null,
    })));
    if (ok) await setCheckingMode(worksheet.id, mode);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Questions — ${worksheet.title}`} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
      ) : loadFailed ? (
        <p className="text-sm py-6" style={{ color: '#dc2626' }}>
          Could not load the existing questions. Close this window and try again —
          saving now would replace them with nothing.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
            <input type="checkbox" checked={mode === 'auto'}
              onChange={e => setMode(e.target.checked ? 'auto' : 'manual')} />
            Auto-check this worksheet when reviewing
            <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              (off = you score every item yourself)
            </span>
          </label>

          {items.map((it, index) => (
            <div key={index} className="p-3 rounded-lg flex flex-col gap-2"
              style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>#{index + 1}</span>
                <select value={it.item_type} onChange={e => patch(index, { item_type: e.target.value, correct_answer: '' })}
                  className="h-8 px-2 rounded text-xs outline-none" style={fieldStyle}>
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <input type="number" min="0" step="0.5" value={it.points}
                  onChange={e => patch(index, { points: e.target.value })}
                  className="h-8 w-20 px-2 rounded text-xs outline-none" style={fieldStyle} />
                <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>points</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => move(index, -1)} title="Move up"><ChevronUp size={14} /></button>
                  <button onClick={() => move(index, 1)} title="Move down"><ChevronDown size={14} /></button>
                  <button onClick={() => setItems(prev => prev.filter((_, i) => i !== index))} title="Delete">
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              </div>

              <Input placeholder="Question" value={it.question}
                onChange={e => patch(index, { question: e.target.value })} />

              {it.item_type === 'multiple_choice' && (
                <div className="grid grid-cols-2 gap-2">
                  {it.options.map((opt, oi) => (
                    <Input key={oi} placeholder={`Choice ${oi + 1}`} value={opt}
                      onChange={e => patch(index, {
                        options: it.options.map((o, i) => (i === oi ? e.target.value : o)),
                      })} />
                  ))}
                </div>
              )}

              {it.item_type !== 'essay' && (
                <Input
                  placeholder={
                    it.item_type === 'multiple_choice' ? 'Correct choice (exact text)'
                      : it.item_type === 'true_false' ? 'True or False'
                      : it.item_type === 'identification' ? 'Accepted answers, comma separated'
                      : 'Expected answers, comma separated'
                  }
                  value={it.correct_answer}
                  onChange={e => patch(index, { correct_answer: e.target.value })}
                />
              )}

              {it.item_type === 'essay' && (
                <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  You will score this one by hand when checking.
                </p>
              )}
            </div>
          ))}

          <Btn onClick={() => setItems(prev => [...prev, blankItem()])}>
            <Plus size={14} /> Add question
          </Btn>

          <div className="flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Save questions'}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default QuestionBuilderModal;
```

- [ ] **Step 3: Wire it in**

In `WorksheetsTab.jsx` add `import QuestionBuilderModal from '../worksheets/QuestionBuilderModal';`, the state `const [buildingWorksheet, setBuildingWorksheet] = useState(null);`, a `Questions` button beside `Post` that calls `setBuildingWorksheet(ws)`, and the modal at the end:

```jsx
      {buildingWorksheet && (
        <QuestionBuilderModal
          worksheet={buildingWorksheet}
          loadItems={assessment.loadItems}
          saveItems={assessment.saveItems}
          setCheckingMode={assessment.setCheckingMode}
          onClose={() => { setBuildingWorksheet(null); fetchWorksheets(); }}
        />
      )}
```

- [ ] **Step 4: Verify**

Run `npx vite build` and `npm test`. Cross-check every destructured name against what the hook returns. Report that browser verification was not possible.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboards/teacher/worksheets/ src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
git commit -m "Add the worksheet question builder

Saving replaces the worksheet's items wholesale, and a failed load blocks
saving rather than letting an empty editor wipe the questions."
```

---

### Task 7: Check submissions and release

**Files:**
- Create: `src/pages/dashboards/teacher/worksheets/CheckSubmissionsModal.jsx`
- Modify: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`
- Modify: `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx`

**Interfaces:**
- Consumes: `scoreSubmission` from `src/lib/worksheetChecking.js`
- Produces, added to `useWorksheetAssessment`:
  - `loadSubmissions(worksheetId): Promise<Array<{ id, student_id, status, released, score, total_points, name }>|null>`
  - `loadAnswers(submissionId): Promise<Object|null>` — `{ [itemId]: answer }`
  - `releaseScore(submissionId, worksheetId, score, totalPoints, perItem): Promise<boolean>`
  - `encodeManualScore(worksheetId, sectionId, studentId, score, totalPoints): Promise<boolean>`

- [ ] **Step 1: Add the submission functions to the hook**

Append inside `useWorksheetAssessment`, before its `return`:

```jsx
  const loadSubmissions = async (worksheetId) => {
    const { data: subs, error } = await withRetry(
      () => supabase.from('worksheet_submissions')
        .select('id, student_id, section_id, status, released, score, total_points, source')
        .eq('worksheet_id', worksheetId),
      { label: 'Worksheet submissions fetch' }
    );
    if (error) {
      console.warn('Worksheet submissions fetch failed —', error.message);
      return null;
    }

    const ids = (subs || []).map(s => s.student_id);
    let names = [];
    if (ids.length > 0) {
      // students.id references auth.users, not profiles, so the name has to be
      // fetched separately rather than through a PostgREST embed.
      const { data, error: nameError } = await withRetry(
        () => supabase.from('profiles').select('id, name').in('id', ids),
        { label: 'Submission student names fetch' }
      );
      if (nameError) {
        console.warn('Submission names fetch failed —', nameError.message);
        return null;
      }
      names = data || [];
    }

    return (subs || []).map(s => ({
      ...s,
      name: names.find(n => n.id === s.student_id)?.name || '—',
    }));
  };

  const loadAnswers = async (submissionId) => {
    const { data, error } = await withRetry(
      () => supabase.from('worksheet_answers').select('item_id, answer').eq('submission_id', submissionId),
      { label: 'Worksheet answers fetch' }
    );
    if (error) {
      console.warn('Worksheet answers fetch failed —', error.message);
      return null;
    }
    return Object.fromEntries((data || []).map(a => [a.item_id, a.answer]));
  };

  const releaseScore = async (submissionId, worksheetId, score, totalPoints, perItem) => {
    for (const row of perItem) {
      const { error } = await supabase.from('worksheet_answers')
        .update({ is_correct: row.isCorrect, points_earned: row.pointsEarned })
        .eq('submission_id', submissionId).eq('item_id', row.item_id);
      if (error) {
        showToast(`Could not save item marks: ${error.message}`, 'error');
        return false;
      }
    }

    const { error } = await supabase.from('worksheet_submissions').update({
      status: 'checked',
      released: true,
      score,
      total_points: totalPoints,
      checked_by: userData?.uid || null,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', submissionId);

    if (error) {
      showToast(`Could not release: ${error.message}`, 'error');
      return false;
    }
    showToast('Score released to the student');
    return true;
  };

  const encodeManualScore = async (worksheetId, sectionId, studentId, score, totalPoints) => {
    const { error } = await supabase.from('worksheet_submissions').upsert([{
      worksheet_id: worksheetId,
      student_id: studentId,
      section_id: sectionId,
      source: 'manual',
      status: 'checked',
      released: true,
      score: Number(score),
      total_points: Number(totalPoints),
      checked_by: userData?.uid || null,
      checked_at: new Date().toISOString(),
    }], { onConflict: 'worksheet_id,student_id' });

    if (error) {
      showToast(`Could not save the score: ${error.message}`, 'error');
      return false;
    }
    showToast('Score saved');
    return true;
  };
```

Add `loadSubmissions, loadAnswers, releaseScore, encodeManualScore` to the returned object.

- [ ] **Step 2: Create the review modal**

Create `src/pages/dashboards/teacher/worksheets/CheckSubmissionsModal.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/CheckSubmissionsModal.jsx
// Reviews one student's answers and releases the score. Auto-check runs here,
// in the teacher's browser, because this is the only place the answer key is
// legitimately available.
// ============================================

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { scoreSubmission } from '../../../../lib/worksheetChecking';

const CheckSubmissionsModal = ({
  worksheet, loadItems, loadSubmissions, loadAnswers, releaseScore, onClose,
}) => {
  const { dark } = useTheme();
  const [submissions, setSubmissions] = useState([]);
  const [items, setItems] = useState([]);
  const [keys, setKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState({});
  const [marks, setMarks] = useState({});
  const [autoScored, setAutoScored] = useState({});
  const [saving, setSaving] = useState(false);

  const isAuto = worksheet.checking_mode === 'auto';

  useEffect(() => {
    let alive = true;
    (async () => {
      const [itemResult, subs] = await Promise.all([
        loadItems(worksheet.id),
        loadSubmissions(worksheet.id),
      ]);
      if (!alive) return;
      if (!itemResult || !subs) { setLoadFailed(true); setLoading(false); return; }
      setItems(itemResult.items);
      setKeys(itemResult.keys);
      setSubmissions(subs);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [worksheet.id, loadItems, loadSubmissions]);

  const openSubmission = async (sub) => {
    setActive(sub);
    setMarks({});
    setAutoScored({});
    const loaded = await loadAnswers(sub.id);
    if (!loaded) { setAnswers({}); return; }
    setAnswers(loaded);

    if (isAuto) {
      const keyed = Object.fromEntries(items.map(i => [i.id, { correct_answer: keys[i.id] }]));
      const { perItem } = scoreSubmission(items, keyed, loaded);
      const prefilled = {};
      const flagged = {};
      perItem.forEach(r => {
        if (r.pointsEarned !== null) { prefilled[r.item_id] = r.pointsEarned; flagged[r.item_id] = true; }
      });
      setMarks(prefilled);
      setAutoScored(flagged);
    }
  };

  const total = items.reduce((sum, i) => sum + (Number(i.points) || 0), 0);
  const given = Object.values(marks).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const release = async () => {
    setSaving(true);
    const perItem = items.map(i => ({
      item_id: i.id,
      isCorrect: marks[i.id] === undefined ? null : Number(marks[i.id]) >= Number(i.points),
      pointsEarned: Number(marks[i.id]) || 0,
    }));
    const ok = await releaseScore(active.id, worksheet.id, given, total, perItem);
    setSaving(false);
    if (ok) {
      setSubmissions(prev => prev.map(s =>
        s.id === active.id ? { ...s, status: 'checked', released: true, score: given, total_points: total } : s));
      setActive(null);
    }
  };

  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  return (
    <Modal title={`Submissions — ${worksheet.title}`} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
      ) : loadFailed ? (
        <p className="text-sm py-6" style={{ color: '#dc2626' }}>
          Could not load submissions. Check your connection and reopen this window.
        </p>
      ) : active ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{active.name}</p>
          {!isAuto && (
            <p className="text-xs" style={muted}>
              This worksheet is set to manual checking — every item is yours to score.
            </p>
          )}

          {items.map((it, index) => (
            <div key={it.id} className="p-3 rounded-lg" style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <p className="text-sm font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                {index + 1}. {it.question}
              </p>
              <p className="text-xs mt-1" style={muted}>
                Answer: {Array.isArray(answers[it.id]) ? answers[it.id].join(', ') : (answers[it.id] || '— blank —')}
              </p>
              {it.item_type !== 'essay' && (
                <p className="text-xs" style={muted}>
                  Expected: {Array.isArray(keys[it.id]) ? keys[it.id].join(', ') : String(keys[it.id] ?? '—')}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min="0" max={it.points} step="0.5"
                  value={marks[it.id] ?? ''}
                  onChange={e => { setMarks(p => ({ ...p, [it.id]: e.target.value }));
                                   setAutoScored(p => ({ ...p, [it.id]: false })); }}
                  className="h-8 w-20 px-2 rounded text-xs outline-none"
                  style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                           border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                           color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                <span className="text-xs" style={muted}>/ {it.points}</span>
                {autoScored[it.id] && <span className="text-xs" style={{ color: '#2563eb' }}>auto</span>}
              </div>
            </div>
          ))}

          <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            Total: {given} / {total}
          </p>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setActive(null)}>Back</Btn>
            <Btn variant="primary" onClick={release} disabled={saving}>
              {saving ? 'Releasing…' : 'Save & Release'}
            </Btn>
          </div>
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-sm py-6" style={muted}>
          No one has answered this worksheet in the app yet. If your class answered it
          on paper, use <strong>Encode scores</strong> on the worksheet card instead.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {submissions.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg"
              style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <div>
                <p className="text-sm" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{s.name}</p>
                <p className="text-xs" style={muted}>
                  {s.released ? `Released — ${s.score}/${s.total_points}` : s.status.replace('_', ' ')}
                </p>
              </div>
              <Btn onClick={() => openSubmission(s)} disabled={s.status === 'in_progress'}>
                {s.released ? 'Review again' : 'Check'}
              </Btn>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default CheckSubmissionsModal;
```

- [ ] **Step 3: Wire it in**

In `WorksheetsTab.jsx` add the import, `const [checkingWorksheet, setCheckingWorksheet] = useState(null);`, a `Submissions` button on the card, and:

```jsx
      {checkingWorksheet && (
        <CheckSubmissionsModal
          worksheet={checkingWorksheet}
          loadItems={assessment.loadItems}
          loadSubmissions={assessment.loadSubmissions}
          loadAnswers={assessment.loadAnswers}
          releaseScore={assessment.releaseScore}
          onClose={() => setCheckingWorksheet(null)}
        />
      )}
```

- [ ] **Step 4: Verify**

Run `npx vite build` and `npm test`. Confirm `scoreSubmission` is imported and used rather than the scoring logic being reimplemented inline — the tested version must be the one that runs.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboards/teacher/worksheets/ src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
git commit -m "Add submission review with auto-check and release

Auto-check runs here because this is the only screen where the answer key
is legitimately loaded; pre-filled marks are labelled so the teacher can
see what was machine-scored."
```

---

## Stage C — Student answers in the app (Task 8)

### Task 8: Student Worksheets surface

**Files:**
- Create: `src/pages/dashboards/student/tabs/WorksheetsTab.jsx`
- Modify: `src/pages/dashboards/student/StudentDashboard.jsx`

**Interfaces:**
- Consumes: tables and policies from Tasks 2-3
- Produces: route `/student-dashboard/worksheets`, nav entry `Worksheets`

- [ ] **Step 1: Create the tab**

Create `src/pages/dashboards/student/tabs/WorksheetsTab.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/student/tabs/WorksheetsTab.jsx
// Worksheets posted to this student's section, and the answering surface.
// Never selects worksheet_item_keys — the answer key is not readable here and
// must not be requested.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { FileText, Loader2, RefreshCw, Clock } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';

const StudentWorksheetsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submission, setSubmission] = useState(null);
  const [busy, setBusy] = useState(false);

  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  const fetchWorksheets = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);

    const { data: postings, error } = await withRetry(
      () => supabase.from('worksheet_sections').select('id, worksheet_id, section_id, due_at'),
      { label: 'Student worksheet postings fetch' }
    );
    if (error) {
      console.warn('Student worksheet postings fetch failed —', error.message);
      setLoadError(true); setLoading(false); return;
    }

    const ids = [...new Set((postings || []).map(p => p.worksheet_id))];
    if (ids.length === 0) { setLoadError(false); setRows([]); setLoading(false); return; }

    const [sheetResult, subResult] = await Promise.all([
      withRetry(() => supabase.from('worksheets').select('id, title, subject').in('id', ids),
        { label: 'Student worksheets fetch' }),
      withRetry(() => supabase.from('worksheet_submissions')
        .select('id, worksheet_id, status, released, score, total_points')
        .eq('student_id', userData.uid),
        { label: 'Student submissions fetch' }),
    ]);

    if (sheetResult.error || subResult.error) {
      console.warn('Student worksheets load failed —',
        (sheetResult.error || subResult.error).message);
      setLoadError(true); setLoading(false); return;
    }

    setLoadError(false);
    setRows((postings || []).map(p => ({
      posting: p,
      sheet: (sheetResult.data || []).find(w => w.id === p.worksheet_id),
      submission: (subResult.data || []).find(s => s.worksheet_id === p.worksheet_id) || null,
    })).filter(r => r.sheet));
    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => { fetchWorksheets(); }, [fetchWorksheets]);

  const open = async (row) => {
    setBusy(true);
    const { data: itemRows, error } = await withRetry(
      () => supabase.from('worksheet_items')
        .select('id, position, question, item_type, options, points')
        .eq('worksheet_id', row.sheet.id).order('position'),
      { label: 'Student worksheet items fetch' }
    );
    if (error) {
      showToast('Could not load the questions. Check your connection.', 'error');
      setBusy(false); return;
    }

    let sub = row.submission;
    if (!sub) {
      const { data, error: createError } = await supabase.from('worksheet_submissions').insert([{
        worksheet_id: row.sheet.id,
        student_id: userData.uid,
        section_id: row.posting.section_id,
        source: 'online',
        status: 'in_progress',
      }]).select().single();
      if (createError) {
        showToast(`Could not start: ${createError.message}`, 'error');
        setBusy(false); return;
      }
      sub = data;
    }

    const { data: saved } = await withRetry(
      () => supabase.from('worksheet_answers').select('item_id, answer').eq('submission_id', sub.id),
      { label: 'Student saved answers fetch' }
    );

    setItems(itemRows || []);
    setAnswers(Object.fromEntries((saved || []).map(a => [a.item_id, a.answer])));
    setSubmission(sub);
    setActive(row);
    setBusy(false);
  };

  // Saved as the student works — this project's hosting tier drops
  // connections, and losing a half-finished worksheet would be worse than
  // an extra write per answer.
  const saveAnswer = async (itemId, value) => {
    setAnswers(prev => ({ ...prev, [itemId]: value }));
    await supabase.from('worksheet_answers').upsert([{
      submission_id: submission.id, item_id: itemId, answer: value,
    }], { onConflict: 'submission_id,item_id' });
  };

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.from('worksheet_submissions').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', submission.id);
    setBusy(false);
    if (error) return showToast(`Could not submit: ${error.message}`, 'error');
    showToast('Submitted. Your teacher will check it.');
    setActive(null);
    fetchWorksheets();
  };

  const statusLabel = (row) => {
    const s = row.submission;
    if (!s) return 'Not started';
    if (s.released) return `${s.score}/${s.total_points}`;
    if (s.status === 'submitted' || s.status === 'checked') return 'Submitted — awaiting result';
    return 'In progress';
  };

  if (active) {
    const done = submission?.status !== 'in_progress';
    return (
      <div className="p-6">
        <Toast />
        <button onClick={() => setActive(null)} className="text-sm mb-4" style={muted}>← Back</button>
        <h1 className="text-xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{active.sheet.title}</h1>
        <p className="text-xs mb-4" style={muted}>{active.sheet.subject}</p>

        {items.length === 0 ? (
          <Card className="p-6 text-center">
            <p style={muted}>This worksheet has no questions to answer in the app. Download it from your teacher instead.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it, index) => (
              <Card key={it.id} className="p-4">
                <p className="text-sm font-medium mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                  {index + 1}. {it.question} <span className="text-xs" style={muted}>({it.points} pts)</span>
                </p>

                {it.item_type === 'multiple_choice' && (it.options || []).map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm py-1" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                    <input type="radio" name={it.id} disabled={done} checked={answers[it.id] === opt}
                      onChange={() => saveAnswer(it.id, opt)} />
                    {opt}
                  </label>
                ))}

                {it.item_type === 'true_false' && ['True', 'False'].map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm py-1" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                    <input type="radio" name={it.id} disabled={done} checked={answers[it.id] === opt}
                      onChange={() => saveAnswer(it.id, opt)} />
                    {opt}
                  </label>
                ))}

                {it.item_type === 'identification' && (
                  <input type="text" disabled={done} defaultValue={answers[it.id] || ''}
                    onBlur={e => saveAnswer(it.id, e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}

                {it.item_type === 'enumeration' && (
                  <textarea disabled={done} rows={3}
                    defaultValue={(answers[it.id] || []).join('\n')}
                    onBlur={e => saveAnswer(it.id, e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                    placeholder="One answer per line"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}

                {it.item_type === 'essay' && (
                  <textarea disabled={done} rows={5} defaultValue={answers[it.id] || ''}
                    onBlur={e => saveAnswer(it.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}
              </Card>
            ))}

            {!done && (
              <button onClick={submit} disabled={busy}
                className="h-10 px-5 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#1908DF', color: '#fff' }}>
                {busy ? 'Submitting…' : 'Submit'}
              </button>
            )}
            {done && <p className="text-sm" style={muted}>Submitted. You cannot change your answers now.</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <Toast />
      <div className="flex items-center justify-between mb-6 rounded-lg px-4 py-3"
        style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--banner-text)' }}>My Worksheets</h1>
        <button onClick={fetchWorksheets} className="p-1.5 rounded-lg" style={muted}><RefreshCw size={16} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={muted} /></div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Could not load your worksheets.</p>
          <p className="text-sm mb-3" style={muted}>Check your connection and try again.</p>
          <button onClick={fetchWorksheets} className="h-9 px-4 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p style={muted}>No worksheets have been posted to your section yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <Card key={row.posting.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{row.sheet.title}</p>
                <p className="text-xs" style={muted}>{row.sheet.subject}</p>
                {row.posting.due_at && (
                  <p className="text-xs flex items-center gap-1 mt-1" style={muted}>
                    <Clock size={12} /> Due {new Date(row.posting.due_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="text-right">
                <Badge color="#2563eb" bg="rgba(37,99,235,0.12)">{statusLabel(row)}</Badge>
                <button onClick={() => open(row)} disabled={busy}
                  className="block mt-2 text-xs font-semibold" style={{ color: '#1908DF' }}>
                  {row.submission ? 'Open' : 'Start'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentWorksheetsTab;
```

- [ ] **Step 2: Add the route and nav entry**

In `src/pages/dashboards/student/StudentDashboard.jsx`:

Add `import StudentWorksheetsTab from './tabs/WorksheetsTab';` and add `ClipboardCheck` to the lucide-react import list.

In `navItems`, after the Overview entry:

```jsx
    { path: '/student-dashboard/worksheets', icon: ClipboardCheck, label: 'Worksheets' },
```

In the routes, after the Overview route:

```jsx
            <Route path="/worksheets" element={<StudentWorksheetsTab />} />
```

- [ ] **Step 3: Verify**

Run `npx vite build` and `npm test`.

Grep the new file for `worksheet_item_keys` and `correct_answer` — neither may appear. A student-facing query that requests the key would be denied by RLS, but the request should not exist in the first place.

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboards/student/tabs/WorksheetsTab.jsx src/pages/dashboards/student/StudentDashboard.jsx
git commit -m "Add the student worksheet answering surface

Answers save on blur so a dropped connection does not lose a
half-finished worksheet, and a submitted worksheet becomes read-only."
```

---

## Stage D — The Overview cards (Task 9)

### Task 9: Real Student Overview

**Files:**
- Modify: `src/pages/dashboards/student/tabs/OverviewTab.jsx`

**Interfaces:**
- Consumes: `section_students`, `sections`, `students`, `attendance`, `worksheet_sections`, `worksheet_submissions`
- Produces: nothing other tasks depend on

- [ ] **Step 1: Replace the data layer**

In `src/pages/dashboards/student/tabs/OverviewTab.jsx`, replace the whole `fetchOverview` callback and the `studentInfo` state with:

```jsx
  const [info, setInfo] = useState({
    name: userData?.name || 'Student',
    studentId: null, gradeLevel: null, section: null,
  });
  const [performance, setPerformance] = useState(null);   // { percent, count }
  const [attendance, setAttendance] = useState(null);     // { percent, present, total }
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchOverview = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);

    // Grade level and section come from the enrolment record — profiles has
    // never had year/section/avg_grade/attendance_rate columns, which is why
    // this tab showed dashes and zeros.
    const { data: enrolment, error: enrolError } = await withRetry(
      () => supabase.from('section_students')
        .select('section_id, sections(name, grade_level)')
        .eq('student_id', userData.uid).eq('status', 'active').limit(1),
      { label: 'Student enrolment fetch' }
    );
    if (enrolError) {
      console.warn('Student enrolment fetch failed —', enrolError.message);
      setLoadError(true); setLoading(false); return;
    }

    const enrolled = (enrolment || [])[0] || null;
    const sectionId = enrolled?.section_id || null;

    const [idResult, attResult, subResult, postResult] = await Promise.all([
      withRetry(() => supabase.from('students').select('student_number, lrn').eq('id', userData.uid).maybeSingle(),
        { label: 'Student number fetch' }),
      withRetry(() => supabase.from('attendance').select('status').eq('student_id', userData.uid),
        { label: 'Student attendance fetch' }),
      withRetry(() => supabase.from('worksheet_submissions')
        .select('worksheet_id, score, total_points, released, status')
        .eq('student_id', userData.uid),
        { label: 'Student worksheet submissions fetch' }),
      sectionId
        ? withRetry(() => supabase.from('worksheet_sections')
            .select('id, worksheet_id, due_at').eq('section_id', sectionId),
            { label: 'Student worksheet postings fetch' })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (idResult.error || attResult.error || subResult.error || postResult.error) {
      const first = idResult.error || attResult.error || subResult.error || postResult.error;
      console.warn('Student overview load failed —', first.message);
      setLoadError(true); setLoading(false); return;
    }

    setLoadError(false);
    setInfo({
      name: userData?.name || 'Student',
      studentId: idResult.data?.student_number || idResult.data?.lrn || null,
      gradeLevel: enrolled?.sections?.grade_level || null,
      section: enrolled?.sections?.name || null,
    });

    // Released submissions only — a score the teacher has not released yet is
    // not the student's to see.
    const released = (subResult.data || []).filter(s => s.released && Number(s.total_points) > 0);
    setPerformance(released.length === 0 ? null : {
      percent: Math.round(
        released.reduce((sum, s) => sum + (Number(s.score) / Number(s.total_points)) * 100, 0) / released.length
      ),
      count: released.length,
    });

    const attRows = attResult.data || [];
    setAttendance(attRows.length === 0 ? null : {
      percent: Math.round((attRows.filter(r => r.status === 'Present').length / attRows.length) * 100),
      present: attRows.filter(r => r.status === 'Present').length,
      total: attRows.length,
    });

    // Pending: posted to my section, not yet past due, and I have not
    // submitted it.
    const submittedIds = new Set(
      (subResult.data || []).filter(s => s.status !== 'in_progress').map(s => s.worksheet_id)
    );
    const now = new Date();
    const open = (postResult.data || [])
      .filter(p => !submittedIds.has(p.worksheet_id))
      .filter(p => !p.due_at || new Date(p.due_at) >= now)
      .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));

    const openIds = open.map(p => p.worksheet_id);
    let sheets = [];
    if (openIds.length > 0) {
      const { data, error } = await withRetry(
        () => supabase.from('worksheets').select('id, title, subject').in('id', openIds),
        { label: 'Upcoming worksheets fetch' }
      );
      if (error) {
        console.warn('Upcoming worksheets fetch failed —', error.message);
        setLoadError(true); setLoading(false); return;
      }
      sheets = data || [];
    }

    setUpcoming(open.map(p => ({
      id: p.id,
      title: sheets.find(w => w.id === p.worksheet_id)?.title || 'Worksheet',
      subject: sheets.find(w => w.id === p.worksheet_id)?.subject || '',
      due: p.due_at ? new Date(p.due_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date',
    })));

    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
```

Delete the old realtime `useEffect` that subscribes to `assignments` and `quizzes` — both are filtered by a `student_id` column neither table has.

- [ ] **Step 2: Replace the banner subtitle**

`sections.grade_level` already stores `Grade 7`, so prefixing it again would read "Grade Grade 7-Rizal":

```jsx
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--banner-subtext)' }}>
            {info.gradeLevel && info.section
              ? `${info.gradeLevel} · ${info.section}`
              : 'Not yet enrolled in a section'}
            {info.studentId ? ` · ID: ${info.studentId}` : ''}
          </p>
```

- [ ] **Step 3: Replace the three stat cards**

```jsx
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Worksheet Performance"
          value={loading ? <Loader2 className="animate-spin" size={20} />
            : loadError ? '—'
            : performance ? `${performance.percent}%` : '—'}
          sub={loadError ? 'Could not load'
            : performance ? `${performance.count} worksheet${performance.count === 1 ? '' : 's'}`
            : 'No scores yet'}
          icon={BookOpen}
          color="#2563eb"
        />
        <StatCard
          label="Attendance"
          value={loading ? <Loader2 className="animate-spin" size={20} />
            : loadError ? '—'
            : attendance ? `${attendance.percent}%` : '—'}
          sub={loadError ? 'Could not load'
            : attendance ? `${attendance.present} of ${attendance.total} days`
            : 'Not yet recorded'}
          icon={CalendarCheck}
          color="#16a34a"
        />
        <StatCard
          label="Pending Tasks"
          value={loading ? <Loader2 className="animate-spin" size={20} />
            : loadError ? '—' : upcoming.length.toString()}
          sub={loadError ? 'Could not load' : upcoming.length === 0 ? 'Nothing due' : 'worksheets due'}
          icon={ClipboardList}
          subColor="#d97706"
          color="#d97706"
        />
      </div>
```

- [ ] **Step 4: Add the failed-read branch to Upcoming Tasks**

Inside the Upcoming Tasks card, before the existing `upcoming.length === 0` branch:

```jsx
          {loadError ? (
            <div className="text-center py-8">
              <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Could not load your tasks.</p>
              <p className="mb-3" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Check your connection and try again.</p>
              <button onClick={fetchOverview} className="h-9 px-4 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
            </div>
          ) : loading ? (
```

and change the existing task row to read `task.title`, `task.subject` and `task.due` without the `type`/`status` fields, which no longer exist:

```jsx
            upcoming.map(task => (
              <div key={task.id} className="flex items-center gap-4 p-4 rounded-lg"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: dark ? '#1e3a5f' : '#eff6ff' }}>
                  <FileText size={20} style={{ color: '#3b82f6' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{task.title}</p>
                  <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{task.subject}</p>
                </div>
                <div className="flex items-center gap-1 text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  <Clock size={14} /> Due {task.due}
                </div>
              </div>
            ))
```

Remove `Badge` and `ClipboardList`-as-task-icon usages that become unused, but keep `ClipboardList` if the Pending Tasks StatCard still uses it.

- [ ] **Step 5: Verify**

Run `npx vite build` and `npm test`.

Grep the file for `assignments`, `quizzes`, `avg_grade`, `attendance_rate`, `student_no`, `profile.year` and `profile.section` — none may remain.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboards/student/tabs/OverviewTab.jsx
git commit -m "Give the Student Overview real data

Grade level and section now come from the enrolment record, the
performance card is named for the worksheet scores it averages, and a
failed read renders distinctly from an honest empty result instead of
both showing zero."
```

---


## Stage E — The paper path and cleanup (Tasks 10-11)

### Task 10: Encode scores for worksheets answered on paper

The spec's second answering path. Without this, a worksheet that carries only a
file — no questions — can never produce a score, and Worksheet Performance stays
empty for every class that works on paper.

**Files:**
- Create: `src/pages/dashboards/teacher/worksheets/EncodeScoresModal.jsx`
- Modify: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`
- Modify: `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx`

**Interfaces:**
- Consumes: `encodeManualScore(worksheetId, sectionId, studentId, score, totalPoints)` from Task 7
- Produces, added to `useWorksheetAssessment`:
  - `loadClassList(sectionId): Promise<Array<{ student_id, name }>|null>`

- [ ] **Step 1: Add the class-list loader to the hook**

Append inside `useWorksheetAssessment`, before its `return`:

```jsx
  const loadClassList = async (sectionId) => {
    const { data: rows, error } = await withRetry(
      () => supabase.from('section_students')
        .select('student_id').eq('section_id', sectionId).eq('status', 'active'),
      { label: 'Class list fetch' }
    );
    if (error) {
      console.warn('Class list fetch failed —', error.message);
      return null;
    }

    const ids = (rows || []).map(r => r.student_id);
    if (ids.length === 0) return [];

    // students.id references auth.users, not profiles, so the name comes from a
    // separate query rather than a PostgREST embed.
    const { data: names, error: nameError } = await withRetry(
      () => supabase.from('profiles').select('id, name').in('id', ids),
      { label: 'Class list names fetch' }
    );
    if (nameError) {
      console.warn('Class list names fetch failed —', nameError.message);
      return null;
    }

    return ids.map(id => ({
      student_id: id,
      name: (names || []).find(n => n.id === id)?.name || '—',
    })).sort((a, b) => a.name.localeCompare(b.name));
  };
```

Add `loadClassList` to the returned object.

- [ ] **Step 2: Create the modal**

Create `src/pages/dashboards/teacher/worksheets/EncodeScoresModal.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/EncodeScoresModal.jsx
// The paper path: the class answered on paper, the teacher types the marks.
// Saves as source = 'manual' with no per-item answers.
// ============================================

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';

const EncodeScoresModal = ({
  worksheet, postings, sections, loadClassList, loadSubmissions, encodeManualScore, onClose,
}) => {
  const { dark } = useTheme();
  const posted = postings.filter(p => p.worksheet_id === worksheet.id);

  const [sectionId, setSectionId] = useState(posted[0]?.section_id || '');
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [totalPoints, setTotalPoints] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const muted = { color: dark ? '#64748b' : '#94a3b8' };
  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
  };

  useEffect(() => {
    if (!sectionId) { setStudents([]); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      const [list, subs] = await Promise.all([
        loadClassList(sectionId),
        loadSubmissions(worksheet.id),
      ]);
      if (!alive) return;
      if (!list || !subs) { setLoadFailed(true); setLoading(false); return; }
      setLoadFailed(false);
      setStudents(list);
      // Show what is already recorded so the teacher is editing, not guessing.
      const existing = {};
      subs.forEach(s => { if (s.score !== null) existing[s.student_id] = s.score; });
      setScores(existing);
      const anyTotal = subs.find(s => s.total_points !== null);
      if (anyTotal) setTotalPoints(String(anyTotal.total_points));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [sectionId, worksheet.id, loadClassList, loadSubmissions]);

  const submit = async () => {
    if (!Number(totalPoints)) return alert('Set the total points first.');
    setSaving(true);
    for (const s of students) {
      const raw = scores[s.student_id];
      if (raw === undefined || raw === '') continue;   // blank means not yet scored
      const ok = await encodeManualScore(worksheet.id, sectionId, s.student_id, raw, totalPoints);
      if (!ok) { setSaving(false); return; }
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal title={`Encode scores — ${worksheet.title}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {posted.length === 0 ? (
          <p className="text-sm" style={muted}>
            Post this worksheet to a section first — there is no class to score yet.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <select value={sectionId} onChange={e => setSectionId(e.target.value)}
                className="h-9 px-2 rounded text-sm outline-none flex-1" style={fieldStyle}>
                <option value="">Select section…</option>
                {posted.map(p => (
                  <option key={p.id} value={p.section_id}>
                    {sections.find(s => s.id === p.section_id)?.name || 'Section'}
                  </option>
                ))}
              </select>
              <input type="number" min="1" step="1" placeholder="Total points"
                value={totalPoints} onChange={e => setTotalPoints(e.target.value)}
                className="h-9 w-32 px-2 rounded text-sm outline-none" style={fieldStyle} />
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : loadFailed ? (
              <p className="text-sm" style={{ color: '#dc2626' }}>
                Could not load the class list. Check your connection and reopen this window.
              </p>
            ) : students.length === 0 ? (
              <p className="text-sm" style={muted}>That section has no students yet.</p>
            ) : (
              students.map((s, i) => (
                <div key={s.student_id} className="flex items-center gap-3">
                  <span className="text-xs w-6" style={muted}>{i + 1}</span>
                  <span className="text-sm flex-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{s.name}</span>
                  <input type="number" min="0" step="0.5" value={scores[s.student_id] ?? ''}
                    onChange={e => setScores(p => ({ ...p, [s.student_id]: e.target.value }))}
                    className="h-8 w-20 px-2 rounded text-xs outline-none" style={fieldStyle} />
                  <span className="text-xs" style={muted}>/ {totalPoints || '—'}</span>
                </div>
              ))
            )}

            <div className="flex justify-end gap-2">
              <Btn onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={submit} disabled={saving || loading || loadFailed}>
                {saving ? 'Saving…' : 'Save scores'}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default EncodeScoresModal;
```

- [ ] **Step 3: Wire it in**

In `WorksheetsTab.jsx` add `import EncodeScoresModal from '../worksheets/EncodeScoresModal';`, the state `const [encodingWorksheet, setEncodingWorksheet] = useState(null);`, an `Encode scores` button on the card, and:

```jsx
      {encodingWorksheet && (
        <EncodeScoresModal
          worksheet={encodingWorksheet}
          postings={assessment.postings}
          sections={assessment.mySections}
          loadClassList={assessment.loadClassList}
          loadSubmissions={assessment.loadSubmissions}
          encodeManualScore={assessment.encodeManualScore}
          onClose={() => setEncodingWorksheet(null)}
        />
      )}
```

- [ ] **Step 4: Verify**

Run `npx vite build` and `npm test`. Cross-check every destructured name against the hook's returned object.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboards/teacher/worksheets/ src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
git commit -m "Let a teacher encode scores for worksheets answered on paper"
```

---

### Task 11: Retire the Assessments tab

The spec calls for this. `AssessmentsTab.jsx` queries `assessments`, `assessment_items`, `assessment_submissions` and `submission_answers` — four tables that exist in no SQL file in the repo. Every stat reads zero and the create flow fails with a toast. With worksheets now carrying questions, it is redundant as well as broken, and a panel will click it.

**Files:**
- Delete: `src/pages/dashboards/teacher/tabs/AssessmentsTab.jsx`
- Delete: `src/pages/dashboards/teacher/tabs/AssignmentsTab_UNUSED.jsx`
- Modify: `src/pages/dashboards/teacher/TeacherDashboard.jsx`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Confirm nothing else imports them**

Run: `grep -rn "AssessmentsTab\|AssignmentsTab_UNUSED" src/ --include=*.jsx`
Expected: only `TeacherDashboard.jsx` imports `AssessmentsTab`; `AssignmentsTab_UNUSED` is imported by nothing. If anything else appears, stop and report it rather than deleting.

- [ ] **Step 2: Remove the route and nav entry**

In `src/pages/dashboards/teacher/TeacherDashboard.jsx`, delete the `AssessmentsTab` import, its `navItems` entry (`{ path: '/teacher-dashboard/assignments', icon: FileText, label: 'Assessments' }`) and its `<Route>`. Remove `FileText` from the lucide-react import only if nothing else in the file uses it — check first.

- [ ] **Step 3: Delete the files**

```bash
git rm src/pages/dashboards/teacher/tabs/AssessmentsTab.jsx
git rm src/pages/dashboards/teacher/tabs/AssignmentsTab_UNUSED.jsx
```

- [ ] **Step 4: Verify**

Run: `grep -rn "AssessmentsTab\|AssignmentsTab_UNUSED\|teacher-dashboard/assignments" src/ --include=*.jsx`
Expected: no matches. A dangling import passes nothing — the build will fail — but a dangling route string fails silently at runtime.

Run `npx vite build` and `npm test`. Both must pass.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/dashboards/teacher/
git commit -m "Retire the Assessments tab

It queried four tables that were never created, so every stat read zero
and creating an assessment always failed. Worksheets now carry questions,
which is what it was for."
```

---
## Completion checklist

- [ ] All three SQL files have been run and their verification queries returned the expected output.
- [ ] `npm test` passes, including the 24 new worksheet-checking tests.
- [ ] `npx vite build` passes.
- [ ] A teacher can post a worksheet, build questions, and see submissions.
- [ ] A student sees the worksheet, answers it, and submits.
- [ ] The teacher checks it and releases; only then does the student see a score.
- [ ] The Student Overview shows a real grade level, section, performance, attendance and task list.
- [ ] A teacher can encode scores for a worksheet the class answered on paper.
- [ ] The Assessments tab is gone from the teacher sidebar and no route reaches it.
- [ ] A student cannot read `worksheet_item_keys` — verify by querying it while signed in as a student.
- [ ] Changing a worksheet's questions after someone has answered is refused rather than silently deleting their answers.
