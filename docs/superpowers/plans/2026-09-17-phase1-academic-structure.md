# Phase 1 — Academic Structure Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Admin dashboard the four screens that create the school's academic structure — Subjects, Teaching Load, Sections with class lists, and Schedules — and add the RLS policies that let teachers and students read it.

**Architecture:** Four new admin tabs backed by one new hook (`useAcademicLogic`) composed into the existing `AdminContext`, so `useAdminLogic.jsx` (already ~1030 lines) does not grow further. Database work ships as numbered SQL files the user runs in the Supabase SQL Editor, matching how every previous migration in this repo was applied. The one piece of branching logic — whether a teacher may be scheduled to a section — is extracted into a pure module and unit-tested.

**Tech Stack:** React 18, Vite 5, Tailwind, Supabase (Postgres + RLS), lucide-react icons, vitest (added by Task 1).

**Spec:** `docs/superpowers/specs/2026-09-17-teacher-academic-structure-design.md`

## Global Constraints

- Every fetch-on-mount must go through `withRetry` from `src/lib/supabaseRetry.js`. Never wrap writes (`insert`/`update`/`delete`/`upsert`) — retrying a write risks duplicates.
- A failed read must never render as `0` or an empty list. Keep the previous value and warn; a failure must stay distinguishable from a legitimately empty result.
- Follow the existing admin CSS classes defined in `AdminDashboard.jsx`'s `<style>` block: `page-title`, `page-sub`, `toolbar`, `form-row`, `form-label`, `form-input`, `modal-actions`, `btn btn-primary`, `btn btn-ghost`, `sidebar-item`, `sidebar-icon`. Do not introduce a parallel styling system.
- Canonical grade levels are exactly: `Grade 7`, `Grade 8`, `Grade 9`, `Grade 10`, `Grade 11`, `Grade 12`.
- Canonical school year format is `YYYY-YYYY`, e.g. `2025-2026`.
- SQL files go in `archives/` with a `phase1-NN-` prefix, matching the repo's existing convention of keeping runnable migrations there.
- Run `npx vite build` before every commit. It must pass.

---

### Task 1: Pure academic rules + test infrastructure

The only real branching logic in this phase is whether a teacher may be scheduled to a section. Extracting it makes it testable and keeps it out of the UI.

**Files:**
- Create: `vitest.config.js`
- Create: `src/lib/academicRules.js`
- Create: `src/lib/academicRules.test.js`
- Modify: `package.json` (add vitest devDependency and `test` script)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `GRADE_LEVELS: string[]` — the six canonical grade levels
  - `normalizeGradeLevel(value: string): string | null`
  - `teacherLoadFor(load: LoadRow[], schoolYear: string): LoadRow[]`
  - `subjectsTeacherHolds(load: LoadRow[], schoolYear: string): string[]` — unique `subject_id`s
  - `canTeachSection(load: LoadRow[], subjectId: string, section: {grade_level, school_year}): {ok: boolean, reason: string | null}`
  - where `LoadRow = { subject_id: string, grade_level: string, school_year: string }`

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest@^2.1.0
```

- [ ] **Step 2: Create the vitest config**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write the failing tests**

Create `src/lib/academicRules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  GRADE_LEVELS,
  normalizeGradeLevel,
  teacherLoadFor,
  subjectsTeacherHolds,
  canTeachSection,
} from './academicRules';

const MATH = 'subject-math';
const ENGLISH = 'subject-english';

const load = [
  { subject_id: MATH,    grade_level: 'Grade 7', school_year: '2025-2026' },
  { subject_id: ENGLISH, grade_level: 'Grade 7', school_year: '2025-2026' },
  { subject_id: ENGLISH, grade_level: 'Grade 8', school_year: '2025-2026' },
  { subject_id: MATH,    grade_level: 'Grade 9', school_year: '2024-2025' },
];

describe('GRADE_LEVELS', () => {
  it('lists the six canonical levels in order', () => {
    expect(GRADE_LEVELS).toEqual([
      'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    ]);
  });
});

describe('normalizeGradeLevel', () => {
  it('accepts a canonical value unchanged', () => {
    expect(normalizeGradeLevel('Grade 7')).toBe('Grade 7');
  });

  it('accepts a bare number', () => {
    expect(normalizeGradeLevel('7')).toBe('Grade 7');
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeGradeLevel('  grade 10 ')).toBe('Grade 10');
  });

  it('returns null for a level outside the canonical set', () => {
    expect(normalizeGradeLevel('Grade 13')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeGradeLevel('')).toBeNull();
    expect(normalizeGradeLevel(null)).toBeNull();
  });
});

describe('teacherLoadFor', () => {
  it('keeps only rows for the requested school year', () => {
    const rows = teacherLoadFor(load, '2025-2026');
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.school_year === '2025-2026')).toBe(true);
  });

  it('returns an empty array when the year has no rows', () => {
    expect(teacherLoadFor(load, '2030-2031')).toEqual([]);
  });

  it('tolerates a missing load', () => {
    expect(teacherLoadFor(null, '2025-2026')).toEqual([]);
  });
});

describe('subjectsTeacherHolds', () => {
  it('returns each subject once even when held at several grade levels', () => {
    const ids = subjectsTeacherHolds(load, '2025-2026');
    expect(ids).toHaveLength(2);
    expect(ids).toContain(MATH);
    expect(ids).toContain(ENGLISH);
  });

  it('excludes subjects held only in another school year', () => {
    expect(subjectsTeacherHolds(load, '2026-2027')).toEqual([]);
  });
});

describe('canTeachSection', () => {
  const g7 = { grade_level: 'Grade 7', school_year: '2025-2026' };
  const g8 = { grade_level: 'Grade 8', school_year: '2025-2026' };

  it('allows a subject and grade level the teacher holds', () => {
    expect(canTeachSection(load, MATH, g7)).toEqual({ ok: true, reason: null });
  });

  it('rejects the right subject at the wrong grade level', () => {
    const result = canTeachSection(load, MATH, g8);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Grade 8/);
  });

  it('rejects a subject the teacher does not hold at all', () => {
    const result = canTeachSection(load, 'subject-science', g7);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not assigned/i);
  });

  it('rejects when the load belongs to a different school year', () => {
    const result = canTeachSection(load, MATH, { grade_level: 'Grade 9', school_year: '2025-2026' });
    expect(result.ok).toBe(false);
  });

  it('rejects when the teacher has no load at all', () => {
    const result = canTeachSection([], MATH, g7);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no teaching load/i);
  });

  it('matches grade levels that differ only in formatting', () => {
    const result = canTeachSection(load, MATH, { grade_level: '7', school_year: '2025-2026' });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./academicRules"`

- [ ] **Step 6: Write the implementation**

Create `src/lib/academicRules.js`:

```js
// ============================================
// FILE: src/lib/academicRules.js
// Pure rules governing what a teacher may be scheduled to teach.
// Kept free of React and Supabase so it can be unit-tested directly.
// ============================================

export const GRADE_LEVELS = [
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];

// sections.grade_level is an unconstrained VARCHAR, so values arriving from the
// database may not match the canonical spelling. Everything compares through here.
export function normalizeGradeLevel(value) {
  if (!value) return null;
  const digits = value.toString().match(/\d+/);
  if (!digits) return null;
  const candidate = `Grade ${digits[0]}`;
  return GRADE_LEVELS.includes(candidate) ? candidate : null;
}

export function teacherLoadFor(load, schoolYear) {
  if (!Array.isArray(load)) return [];
  return load.filter(row => row.school_year === schoolYear);
}

export function subjectsTeacherHolds(load, schoolYear) {
  const rows = teacherLoadFor(load, schoolYear);
  return [...new Set(rows.map(row => row.subject_id))];
}

export function canTeachSection(load, subjectId, section) {
  const yearRows = teacherLoadFor(load, section?.school_year);

  if (yearRows.length === 0) {
    return { ok: false, reason: 'This teacher has no teaching load for this school year.' };
  }

  const subjectRows = yearRows.filter(row => row.subject_id === subjectId);
  if (subjectRows.length === 0) {
    return { ok: false, reason: 'This teacher is not assigned to this subject.' };
  }

  const wanted = normalizeGradeLevel(section?.grade_level);
  const held = subjectRows
    .map(row => normalizeGradeLevel(row.grade_level))
    .filter(Boolean);

  if (!wanted || !held.includes(wanted)) {
    return {
      ok: false,
      reason: `This teacher does not handle this subject for ${section?.grade_level || 'that grade level'}.`,
    };
  }

  return { ok: true, reason: null };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 17 tests

- [ ] **Step 8: Verify the build still passes**

Run: `npx vite build`
Expected: succeeds, only the pre-existing chunk-size warning

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/lib/academicRules.js src/lib/academicRules.test.js
git commit -m "Add academic scheduling rules with unit tests

Extracts the teaching-load guard into a pure module so the rule that a
teacher may only be scheduled to a subject and grade level they hold is
testable, and adds vitest to run it."
```

---

### Task 2: Create the subjects and teaching load tables

**Files:**
- Create: `archives/phase1-01-academic-tables.sql`

**Interfaces:**
- Consumes: existing `profiles` table
- Produces: tables `subjects` and `teacher_subjects`, seeded with eight subjects

- [ ] **Step 1: Write the migration**

Create `archives/phase1-01-academic-tables.sql`:

```sql
-- ============================================
-- PHASE 1 / 01 — Subjects registry and teaching load
--
-- `subjects` replaces the free-text subject column used across schedules,
-- lesson_plans and worksheets. Grade level is deliberately NOT part of a
-- subject: folding it in would turn 8 rows into 32 and make the list hard to
-- maintain. Grade level lives on teacher_subjects and on sections instead.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- The teaching load: who teaches what, at which grade level, in which year.
-- A teacher holding Mathematics for Grade 7 and Grade 8 has two rows here.
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_level VARCHAR(50) NOT NULL,
  school_year VARCHAR(20) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, subject_id, grade_level, school_year)
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher
  ON teacher_subjects(teacher_id, school_year);

-- The eight subjects taught at this school.
INSERT INTO subjects (name, code) VALUES
  ('Mathematics',                        'MATH'),
  ('English',                            'ENG'),
  ('Science',                            'SCI'),
  ('Filipino',                           'FIL'),
  ('Araling Panlipunan',                 'AP'),
  ('Technology and Livelihood Education','TLE'),
  ('MAPEH',                              'MAPEH'),
  ('Edukasyon sa Pagpapakatao',          'ESP')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- VERIFY — expect 8 rows, and an empty teaching load.
-- ============================================
SELECT code, name FROM subjects ORDER BY name;
SELECT COUNT(*) AS teaching_load_rows FROM teacher_subjects;
```

- [ ] **Step 2: Ask the user to run it and report the output**

Tell the user: open Supabase Dashboard -> SQL Editor -> New query, paste the whole file, Run, and paste back the two result tables.
Expected: 8 subject rows; `teaching_load_rows = 0`.

Do not continue until the user confirms 8 rows.

- [ ] **Step 3: Commit**

```bash
git add archives/phase1-01-academic-tables.sql
git commit -m "Add subjects registry and teaching load tables

Replaces free-text subject names with a real registry so 'same subject'
comparisons are reliable, and records teaching load per grade level per
school year."
```

---

### Task 3: Point schedules, lesson plans and worksheets at the registry

**Files:**
- Create: `archives/phase1-02-subject-id-columns.sql`

**Interfaces:**
- Consumes: `subjects` from Task 2
- Produces: `subject_id` column on `schedules`, `lesson_plans`, `worksheets`

- [ ] **Step 1: Write the migration**

Create `archives/phase1-02-subject-id-columns.sql`:

```sql
-- ============================================
-- PHASE 1 / 02 — Link existing tables to the subjects registry
--
-- schedules.subject is currently NOT NULL free text. Any existing rows must be
-- matched to a subject before the constraint is relaxed, or the migration
-- leaves rows that satisfy neither the old nor the new rule.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

ALTER TABLE schedules     ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);
ALTER TABLE lesson_plans  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);
ALTER TABLE worksheets    ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);

-- Best-effort backfill for any rows that already exist. Matches on the exact
-- name or the code, case-insensitively.
UPDATE schedules s SET subject_id = sub.id
FROM subjects sub
WHERE s.subject_id IS NULL
  AND (LOWER(TRIM(s.subject)) = LOWER(sub.name) OR LOWER(TRIM(s.subject)) = LOWER(sub.code));

UPDATE lesson_plans lp SET subject_id = sub.id
FROM subjects sub
WHERE lp.subject_id IS NULL
  AND (LOWER(TRIM(lp.subject)) = LOWER(sub.name) OR LOWER(TRIM(lp.subject)) = LOWER(sub.code));

UPDATE worksheets w SET subject_id = sub.id
FROM subjects sub
WHERE w.subject_id IS NULL
  AND (LOWER(TRIM(w.subject)) = LOWER(sub.name) OR LOWER(TRIM(w.subject)) = LOWER(sub.code));

-- Only now is it safe to stop requiring the legacy text column.
ALTER TABLE schedules ALTER COLUMN subject DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_teacher    ON schedules(teacher_id, school_year);
CREATE INDEX IF NOT EXISTS idx_schedules_section    ON schedules(section_id);

-- ============================================
-- VERIFY — any row listed here has a subject name that matched nothing in the
-- registry and needs to be fixed by hand.
-- ============================================
SELECT 'schedules' AS source, id, subject FROM schedules    WHERE subject_id IS NULL AND subject IS NOT NULL
UNION ALL
SELECT 'lesson_plans',        id, subject FROM lesson_plans WHERE subject_id IS NULL AND subject IS NOT NULL
UNION ALL
SELECT 'worksheets',          id, subject FROM worksheets   WHERE subject_id IS NULL AND subject IS NOT NULL;
```

- [ ] **Step 2: Ask the user to run it and report the output**

Expected: the verification query returns zero rows. If it returns rows, those records have subject names outside the registry — show them to the user and agree on a mapping before continuing.

- [ ] **Step 3: Commit**

```bash
git add archives/phase1-02-subject-id-columns.sql
git commit -m "Link schedules, lesson plans and worksheets to the subjects registry

Backfills subject_id from the legacy text column before relaxing the NOT
NULL constraint, so no row is left satisfying neither rule."
```

---

### Task 4: RLS helpers and policies for the academic tables

This is the task that makes the teacher's existing Students tab come alive.

**Files:**
- Create: `archives/phase1-03-rls-academic.sql`

**Interfaces:**
- Consumes: `subjects`, `teacher_subjects` from Task 2
- Produces: SQL functions `is_admin()`, `teacher_handles_section(uuid)`, `student_in_section(uuid)`; policies on `subjects`, `teacher_subjects`, `sections`, `section_students`, `schedules`

- [ ] **Step 1: Write the migration**

Create `archives/phase1-03-rls-academic.sql`:

```sql
-- ============================================
-- PHASE 1 / 03 — Row-level security for the academic structure
--
-- These five tables have RLS enabled with no policies, so Postgres denies every
-- read. That is why the teacher's Students tab has always rendered empty.
--
-- The shared predicates live in SECURITY DEFINER functions because a policy on
-- a table that sub-selects that same table recurses infinitely. SECURITY
-- DEFINER lets the lookup inside run without re-entering RLS.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('main_admin', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION teacher_handles_section(p_section_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM schedules
    WHERE section_id = p_section_id AND teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION student_in_section(p_section_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM section_students
    WHERE section_id = p_section_id
      AND student_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER TABLE subjects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;

-- students — section_students.student_id points here, so admin must be able to
-- write this table before anyone can be placed in a class list.
DROP POLICY IF EXISTS students_read  ON students;
DROP POLICY IF EXISTS students_write ON students;
CREATE POLICY students_read  ON students FOR SELECT TO authenticated
  USING (
    is_admin()
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM section_students ss
      WHERE ss.student_id = students.id AND teacher_handles_section(ss.section_id)
    )
  );
CREATE POLICY students_write ON students FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- subjects — everyone signed in may read the registry; only admin maintains it.
DROP POLICY IF EXISTS subjects_read  ON subjects;
DROP POLICY IF EXISTS subjects_write ON subjects;
CREATE POLICY subjects_read  ON subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY subjects_write ON subjects FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- teacher_subjects — a teacher sees their own load.
DROP POLICY IF EXISTS teacher_subjects_read  ON teacher_subjects;
DROP POLICY IF EXISTS teacher_subjects_write ON teacher_subjects;
CREATE POLICY teacher_subjects_read  ON teacher_subjects FOR SELECT TO authenticated
  USING (is_admin() OR teacher_id = auth.uid());
CREATE POLICY teacher_subjects_write ON teacher_subjects FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- sections — the adviser, any teacher scheduled into it, and its students.
DROP POLICY IF EXISTS sections_read  ON sections;
DROP POLICY IF EXISTS sections_write ON sections;
CREATE POLICY sections_read  ON sections FOR SELECT TO authenticated
  USING (is_admin() OR adviser_id = auth.uid() OR teacher_handles_section(id) OR student_in_section(id));
CREATE POLICY sections_write ON sections FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- section_students — the class list. A student sees only their own row.
DROP POLICY IF EXISTS section_students_read  ON section_students;
DROP POLICY IF EXISTS section_students_write ON section_students;
CREATE POLICY section_students_read  ON section_students FOR SELECT TO authenticated
  USING (is_admin() OR teacher_handles_section(section_id) OR student_id = auth.uid());
CREATE POLICY section_students_write ON section_students FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- schedules — a teacher sees their own; a student sees their section's.
DROP POLICY IF EXISTS schedules_read  ON schedules;
DROP POLICY IF EXISTS schedules_write ON schedules;
CREATE POLICY schedules_read  ON schedules FOR SELECT TO authenticated
  USING (is_admin() OR teacher_id = auth.uid() OR student_in_section(section_id));
CREATE POLICY schedules_write ON schedules FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- VERIFY — every table below must show policies for both SELECT and ALL.
-- ============================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('subjects','teacher_subjects','sections','section_students','schedules','students')
ORDER BY tablename, cmd;
```

- [ ] **Step 2: Ask the user to run it and report the output**

Expected: twelve rows — a SELECT policy and an ALL policy for each of the six tables.

- [ ] **Step 3: Commit**

```bash
git add archives/phase1-03-rls-academic.sql
git commit -m "Add RLS policies for the academic structure tables

These five tables had RLS enabled with no policies, so Postgres denied
every read. Shared predicates use SECURITY DEFINER functions to avoid the
infinite recursion a self-referencing policy would cause."
```

---

### Task 5: Subjects tab

Establishes `useAcademicLogic` — the hook every later tab extends — and proves the whole chain works end to end on the simplest screen.

**Files:**
- Create: `src/pages/dashboards/admin/useAcademicLogic.jsx`
- Create: `src/pages/dashboards/admin/tabs/SubjectsTab.jsx`
- Modify: `src/pages/dashboards/admin/AdminContext.jsx`
- Modify: `src/pages/dashboards/admin/AdminDashboard.jsx` (sidebar entry + page route + icon import)

**Interfaces:**
- Consumes: `subjects` table (Task 2), its RLS policies (Task 4), `withRetry` from `src/lib/supabaseRetry.js`
- Produces, on the admin context:
  - `subjects: Subject[]`, `subjectsLoading: boolean`
  - `fetchSubjects(): Promise<void>`
  - `subjectModal: 'create' | 'edit' | null`, `editingSubject: Subject | null`
  - `sName, setSName, sCode, setSCode, sActive, setSActive, sSaving`
  - `openCreateSubject()`, `openEditSubject(subject)`, `closeSubjectModal()`, `saveSubject()`, `deleteSubject(id)`
  - where `Subject = { id, name, code, description, is_active }`

- [ ] **Step 1: Create the hook**

Create `src/pages/dashboards/admin/useAcademicLogic.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/admin/useAcademicLogic.jsx
// State and handlers for the academic structure tabs (Subjects, Teaching
// Load, Sections, Schedules). Kept separate from useAdminLogic.jsx, which is
// already ~1030 lines and covers users, news, calendar, memos and settings.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';

export const useAcademicLogic = (showToast) => {
  // ── Subjects ──────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const [subjectModal, setSubjectModal] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [sName, setSName] = useState('');
  const [sCode, setSCode] = useState('');
  const [sActive, setSActive] = useState(true);
  const [sSaving, setSSaving] = useState(false);

  const fetchSubjects = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('subjects').select('*').order('name'),
      { label: 'Subjects fetch' }
    );
    // A failed read keeps the previous list. Rendering an empty table here
    // would read as "this school has no subjects".
    if (error) {
      console.warn('Subjects fetch failed —', error.message);
      setSubjectsLoading(false);
      return;
    }
    setSubjects(data || []);
    setSubjectsLoading(false);
  }, []);

  const openCreateSubject = () => {
    setEditingSubject(null);
    setSName(''); setSCode(''); setSActive(true);
    setSubjectModal('create');
  };

  const openEditSubject = (subject) => {
    setEditingSubject(subject);
    setSName(subject.name || '');
    setSCode(subject.code || '');
    setSActive(subject.is_active !== false);
    setSubjectModal('edit');
  };

  const closeSubjectModal = () => setSubjectModal(null);

  const saveSubject = async () => {
    const name = sName.trim();
    const code = sCode.trim().toUpperCase();
    if (!name) return showToast('Subject name is required', 'error');
    if (!code) return showToast('Subject code is required', 'error');

    setSSaving(true);
    const payload = { name, code, is_active: sActive, updated_at: new Date().toISOString() };

    const { error } = editingSubject
      ? await supabase.from('subjects').update(payload).eq('id', editingSubject.id)
      : await supabase.from('subjects').insert([payload]);

    setSSaving(false);
    if (error) return showToast(`Could not save subject: ${error.message}`, 'error');

    showToast(editingSubject ? 'Subject updated' : 'Subject created');
    setSubjectModal(null);
    fetchSubjects();
  };

  const deleteSubject = async (id) => {
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) return showToast(`Could not delete subject: ${error.message}`, 'error');
    showToast('Subject deleted');
    fetchSubjects();
  };

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);

  return {
    subjects, subjectsLoading, fetchSubjects,
    subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
  };
};
```

- [ ] **Step 2: Compose the hook into the admin context**

In `src/pages/dashboards/admin/AdminContext.jsx`, replace the `AdminProvider` body:

```jsx
import React, { createContext, useContext } from 'react';
import { useAdminLogic } from './useAdminLogic';
import { useAcademicLogic } from './useAcademicLogic';

export const AdminContext = createContext(null);

export const useAdminContext = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdminContext must be used within an <AdminProvider>');
  }
  return ctx;
};

export const AdminProvider = ({ userData, children }) => {
  const adminLogic = useAdminLogic(userData);
  // Reuses the toast already owned by useAdminLogic so both halves of the
  // dashboard surface messages the same way.
  const academicLogic = useAcademicLogic(adminLogic.showToast);

  return (
    <AdminContext.Provider value={{ ...adminLogic, ...academicLogic }}>
      {children}
    </AdminContext.Provider>
  );
};
```

- [ ] **Step 3: Confirm showToast is exported from useAdminLogic**

Run: `grep -n "showToast" src/pages/dashboards/admin/useAdminLogic.jsx | tail -3`
Expected: `showToast` appears in the returned object. If it does not, add it to the return before continuing — `useAcademicLogic` cannot report errors without it.

- [ ] **Step 4: Create the tab**

Create `src/pages/dashboards/admin/tabs/SubjectsTab.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/admin/tabs/SubjectsTab.jsx
// The subject registry every schedule, lesson plan and worksheet refers to.
// ============================================

import React from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../AdminContext';

const SubjectsTab = () => {
  const {
    subjects, subjectsLoading, subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
    handleOverlayClick,
  } = useAdminContext();

  return (
    <>
      <div>
        <div className="page-title">Subjects</div>
        <div className="page-sub">The subjects taught at this school. Schedules and lesson plans refer to this list.</div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSubject}>
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Subject
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Code</th><th>Subject</th><th>Status</th><th style={{ width: 110 }}>Actions</th></tr>
          </thead>
          <tbody>
            {subjectsLoading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>Loading subjects…</td></tr>
            ) : subjects.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>No subjects yet. Add the first one.</td></tr>
            ) : subjects.map(s => (
              <tr key={s.id}>
                <td><strong>{s.code}</strong></td>
                <td>{s.name}</td>
                <td>{s.is_active === false ? 'Inactive' : 'Active'}</td>
                <td>
                  <button className="icon-action" title="Edit" onClick={() => openEditSubject(s)}><Pencil size={15} /></button>
                  <button className="icon-action" title="Delete" onClick={() => deleteSubject(s.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {subjectModal && (
        <div className="modal-overlay open" onClick={handleOverlayClick}>
          <div className="modal">
            <div className="modal-title">{editingSubject ? 'Edit Subject' : 'Add Subject'}</div>

            <div className="form-row">
              <label className="form-label">Subject Name</label>
              <input className="form-input" value={sName} onChange={e => setSName(e.target.value)} placeholder="e.g. Mathematics" />
            </div>

            <div className="form-row">
              <label className="form-label">Code</label>
              <input className="form-input" value={sCode} onChange={e => setSCode(e.target.value)} placeholder="e.g. MATH" />
            </div>

            <div className="form-row">
              <label className="form-label">Status</label>
              <select className="form-input" value={sActive ? 'active' : 'inactive'} onChange={e => setSActive(e.target.value === 'active')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeSubjectModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSubject} disabled={sSaving}>
                {editingSubject ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubjectsTab;
```

- [ ] **Step 5: Confirm the CSS classes used above exist**

Run: `grep -cE "\.table-card|\.icon-action|\.modal-overlay|\.modal-title" src/pages/dashboards/admin/AdminDashboard.jsx`
Expected: 4 or more. These classes already exist and are the ones `UsersTab.jsx` and `MemosTab.jsx` use — a `.table-card` wrapper around a bare `<table>`, and `.icon-action` for row buttons. Do not invent new table or button classes; the admin dashboard has one styling system and it must stay that way.

- [ ] **Step 6: Wire the tab into the sidebar and page switch**

In `src/pages/dashboards/admin/AdminDashboard.jsx`:

Add to the lucide-react import list: `BookMarked`.

Add the import: `import SubjectsTab from './tabs/SubjectsTab';`

In the sidebar array, after the `['users', 'User Management', Users]` entry, add:

```jsx
['subjects',  'Subjects', BookMarked],
```

In the page switch block, after the `UsersTab` line, add:

```jsx
{page === 'subjects' && <SubjectsTab />}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`

Then, signed in as admin:
1. "Subjects" appears in the sidebar and opens.
2. The table lists the eight seeded subjects.
3. "Add Subject" creates a ninth; it appears without a manual refresh.
4. Editing a subject persists after a page reload.
5. Deleting the subject you created removes it.
6. The browser console shows no errors.

- [ ] **Step 8: Verify the build**

Run: `npx vite build` and `npm test`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add src/pages/dashboards/admin/useAcademicLogic.jsx src/pages/dashboards/admin/tabs/SubjectsTab.jsx src/pages/dashboards/admin/AdminContext.jsx src/pages/dashboards/admin/AdminDashboard.jsx
git commit -m "Add admin Subjects tab

Introduces useAcademicLogic, composed into AdminContext alongside
useAdminLogic, so the four academic-structure tabs do not grow a file that
is already ~1030 lines."
```

---

### Task 6: Teaching Load tab

**Files:**
- Modify: `src/pages/dashboards/admin/useAcademicLogic.jsx`
- Create: `src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx`
- Modify: `src/pages/dashboards/admin/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `subjects` (Task 5), `GRADE_LEVELS` from `src/lib/academicRules.js` (Task 1), `teacher_subjects` table (Task 2)
- Produces, on the admin context:
  - `schoolYear: string`, `setSchoolYear(year)`
  - `teachingLoad: LoadRow[]`, `teachingLoadLoading: boolean`, `fetchTeachingLoad()`
  - `teachers: Profile[]` — profiles with role `teacher`
  - `addLoad(teacherId, subjectId, gradeLevel)`, `removeLoad(id)`
  - `copyLoadFromYear(fromYear): Promise<number>` — returns rows copied
  - where `LoadRow = { id, teacher_id, subject_id, grade_level, school_year }`

- [ ] **Step 1: Add the teaching load slice to the hook**

Append inside `useAcademicLogic`, before the `return`:

```jsx
  // ── School year ───────────────────────────────────────────────────────────
  // Every academic record is scoped by year, so one selector drives the
  // Teaching Load, Sections and Schedules screens.
  const currentSchoolYear = () => {
    const now = new Date();
    // The DepEd school year opens in June; before then we are still in the
    // year that began last calendar year.
    const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
  };
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());

  // ── Teaching load ─────────────────────────────────────────────────────────
  const [teachingLoad, setTeachingLoad] = useState([]);
  const [teachingLoadLoading, setTeachingLoadLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);

  const fetchTeachers = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('profiles').select('id, name, email').eq('role', 'teacher').order('name'),
      { label: 'Teachers fetch' }
    );
    if (error) { console.warn('Teachers fetch failed —', error.message); return; }
    setTeachers(data || []);
  }, []);

  const fetchTeachingLoad = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects').select('*').eq('school_year', schoolYear),
      { label: 'Teaching load fetch' }
    );
    if (error) {
      console.warn('Teaching load fetch failed —', error.message);
      setTeachingLoadLoading(false);
      return;
    }
    setTeachingLoad(data || []);
    setTeachingLoadLoading(false);
  }, [schoolYear]);

  const addLoad = async (teacherId, subjectId, gradeLevel) => {
    if (!teacherId || !subjectId || !gradeLevel) {
      return showToast('Pick a teacher, a subject and a grade level', 'error');
    }
    const { error } = await supabase.from('teacher_subjects').insert([{
      teacher_id: teacherId, subject_id: subjectId,
      grade_level: gradeLevel, school_year: schoolYear,
    }]);
    // 23505 is unique_violation: this teacher already holds that subject and grade.
    if (error) {
      return showToast(
        error.code === '23505'
          ? 'That teacher already holds this subject at this grade level.'
          : `Could not add: ${error.message}`,
        'error'
      );
    }
    showToast('Teaching load added');
    fetchTeachingLoad();
  };

  const removeLoad = async (id) => {
    const { error } = await supabase.from('teacher_subjects').delete().eq('id', id);
    if (error) return showToast(`Could not remove: ${error.message}`, 'error');
    showToast('Teaching load removed');
    fetchTeachingLoad();
  };

  const copyLoadFromYear = async (fromYear) => {
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects').select('teacher_id, subject_id, grade_level').eq('school_year', fromYear),
      { label: 'Teaching load copy read' }
    );
    if (error) { showToast(`Could not read ${fromYear}: ${error.message}`, 'error'); return 0; }
    if (!data || data.length === 0) { showToast(`No teaching load found for ${fromYear}`, 'error'); return 0; }

    const rows = data.map(r => ({ ...r, school_year: schoolYear }));
    // Rows already present in the target year are skipped rather than failing
    // the whole copy, so the button is safe to press twice.
    const { error: insertError } = await supabase
      .from('teacher_subjects')
      .upsert(rows, { onConflict: 'teacher_id,subject_id,grade_level,school_year', ignoreDuplicates: true });

    if (insertError) { showToast(`Could not copy: ${insertError.message}`, 'error'); return 0; }

    showToast(`Copied ${rows.length} entries from ${fromYear}`);
    fetchTeachingLoad();
    return rows.length;
  };

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);
  useEffect(() => { fetchTeachingLoad(); }, [fetchTeachingLoad]);
```

Add to the hook's returned object:

```jsx
    schoolYear, setSchoolYear,
    teachingLoad, teachingLoadLoading, fetchTeachingLoad,
    teachers, addLoad, removeLoad, copyLoadFromYear,
```

- [ ] **Step 2: Create the tab**

Create `src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// Which teacher holds which subject, at which grade level, for a school year.
// Recorded separately from the schedule so a teacher can be established before
// any class exists, and so the schedule form can constrain its subject picker.
// ============================================

import React, { useState } from 'react';
import { Plus, X, Copy } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

const TeachingLoadTab = () => {
  const {
    schoolYear, setSchoolYear, teachers, subjects,
    teachingLoad, teachingLoadLoading, addLoad, removeLoad, copyLoadFromYear,
  } = useAdminContext();

  const [rowTeacher, setRowTeacher] = useState('');
  const [rowSubject, setRowSubject] = useState('');
  const [rowGrade, setRowGrade] = useState('');

  const subjectName = (id) => subjects.find(s => s.id === id)?.code || '—';

  const previousYear = () => {
    const start = parseInt(schoolYear.split('-')[0], 10) - 1;
    return `${start}-${start + 1}`;
  };

  return (
    <div>
      <div className="page-title">Teaching Load</div>
      <div className="page-sub">Which subjects each teacher holds, and at which grade level.</div>

      <div className="toolbar">
        <label className="form-label" style={{ marginRight: 8 }}>School Year</label>
        <input className="form-input" style={{ width: 140 }} value={schoolYear}
          onChange={e => setSchoolYear(e.target.value)} placeholder="2025-2026" />
        <button className="btn btn-ghost" onClick={() => copyLoadFromYear(previousYear())}>
          <Copy size={15} style={{ marginRight: 6 }} />
          Copy from {previousYear()}
        </button>
      </div>

      <div className="form-row" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 220 }} value={rowTeacher} onChange={e => setRowTeacher(e.target.value)}>
          <option value="">Select teacher…</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
        </select>

        <select className="form-input" style={{ width: 180 }} value={rowSubject} onChange={e => setRowSubject(e.target.value)}>
          <option value="">Select subject…</option>
          {subjects.filter(s => s.is_active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select className="form-input" style={{ width: 140 }} value={rowGrade} onChange={e => setRowGrade(e.target.value)}>
          <option value="">Grade level…</option>
          {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <button className="btn btn-primary" onClick={async () => {
          await addLoad(rowTeacher, rowSubject, rowGrade);
          setRowSubject(''); setRowGrade('');
        }}>
          <Plus size={15} style={{ marginRight: 6 }} />
          Add
        </button>
      </div>

      <div className="table-card"><table>
        <thead><tr><th>Teacher</th><th>Holds</th></tr></thead>
        <tbody>
          {teachingLoadLoading ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>Loading teaching load…</td></tr>
          ) : teachers.length === 0 ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>No teachers yet. Create teacher accounts in User Management first.</td></tr>
          ) : teachers.map(t => {
            const rows = teachingLoad.filter(l => l.teacher_id === t.id);
            return (
              <tr key={t.id}>
                <td>{t.name || t.email}</td>
                <td>
                  {rows.length === 0
                    ? <span style={{ color: 'var(--text-muted)' }}>— not yet assigned —</span>
                    : rows.map(l => (
                      <span key={l.id} className="chip">
                        {subjectName(l.subject_id)} · {l.grade_level}
                        <button className="chip-x" title="Remove" onClick={() => removeLoad(l.id)}><X size={12} /></button>
                      </span>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
};

export default TeachingLoadTab;
```

- [ ] **Step 3: Add the chip styles**

A removable pill is the one piece of UI the admin dashboard does not already
have — `.badge` has no remove affordance. Define `.chip` to borrow `.badge`'s
visual language (line 324 of `AdminDashboard.jsx`) so it reads as part of the
same system rather than a second one. Add beside the badge rules:

```css
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; margin: 2px 4px 2px 0; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; color: #60a5fa; border: 1px solid #1d4ed8; background: rgba(59,130,246,0.1); }
.chip-x { background: none; border: none; cursor: pointer; color: inherit; display: flex; padding: 0; opacity: .7; }
.chip-x:hover { opacity: 1; }
```

- [ ] **Step 4: Wire into the sidebar and page switch**

Add `GraduationCap` to the lucide-react import list, then:

```jsx
import TeachingLoadTab from './tabs/TeachingLoadTab';
```

Sidebar array, after the `subjects` entry:

```jsx
['teaching-load', 'Teaching Load', GraduationCap],
```

Page switch:

```jsx
{page === 'teaching-load' && <TeachingLoadTab />}
```

- [ ] **Step 5: Verify in the browser**

Signed in as admin:
1. Teaching Load opens and lists every teacher account, each showing "not yet assigned".
2. Adding Mathematics / Grade 7 to a teacher shows a `MATH · Grade 7` chip immediately.
3. Adding the same pair again shows "That teacher already holds this subject at this grade level."
4. Adding Mathematics / Grade 8 to the same teacher adds a second chip.
5. Removing a chip removes it, and it stays gone after a reload.
6. Changing the school year to `2026-2027` empties the table; "Copy from 2025-2026" repopulates it.
7. Pressing Copy twice does not duplicate rows.

- [ ] **Step 6: Verify the build**

Run: `npx vite build` and `npm test`

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboards/admin/useAcademicLogic.jsx src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx src/pages/dashboards/admin/AdminDashboard.jsx
git commit -m "Add admin Teaching Load tab

Records teaching load per subject, grade level and school year, with a
copy-from-previous-year action so a new year starts from last year's
assignments rather than from nothing."
```

---

### Task 7: Sections tab with class list

**Files:**
- Modify: `src/pages/dashboards/admin/useAcademicLogic.jsx`
- Create: `src/pages/dashboards/admin/tabs/SectionsTab.jsx`
- Modify: `src/pages/dashboards/admin/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `teachers` and `schoolYear` (Task 6), `GRADE_LEVELS` (Task 1), `sections` and `section_students` tables with policies (Task 4)
- Produces, on the admin context:
  - `sections: Section[]`, `sectionsLoading`, `fetchSections()`
  - `sectionModal`, `editingSection`, `secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser, secCapacity, setSecCapacity, secSaving`
  - `openCreateSection()`, `openEditSection(section)`, `closeSectionModal()`, `saveSection()`, `deleteSection(id)`
  - `classList: ClassRow[]`, `classListLoading`, `openClassList(section)`, `closeClassList()`, `activeSection: Section | null`
  - `unassignedStudents: Profile[]`, `addStudentToSection(studentId)`, `removeStudentFromSection(rowId)`
  - where `Section = { id, name, grade_level, adviser_id, school_year, capacity }`
  - and `ClassRow = { id, student_id, name, email }`

- [ ] **Step 1: Add the sections slice to the hook**

Append inside `useAcademicLogic`, before the `return`:

```jsx
  // ── Sections ──────────────────────────────────────────────────────────────
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionModal, setSectionModal] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [secName, setSecName] = useState('');
  const [secGrade, setSecGrade] = useState('');
  const [secAdviser, setSecAdviser] = useState('');
  const [secCapacity, setSecCapacity] = useState('40');
  const [secSaving, setSecSaving] = useState(false);

  const fetchSections = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('sections').select('*').eq('school_year', schoolYear).order('grade_level').order('name'),
      { label: 'Sections fetch' }
    );
    if (error) {
      console.warn('Sections fetch failed —', error.message);
      setSectionsLoading(false);
      return;
    }
    setSections(data || []);
    setSectionsLoading(false);
  }, [schoolYear]);

  const openCreateSection = () => {
    setEditingSection(null);
    setSecName(''); setSecGrade(''); setSecAdviser(''); setSecCapacity('40');
    setSectionModal('create');
  };

  const openEditSection = (section) => {
    setEditingSection(section);
    setSecName(section.name || '');
    setSecGrade(section.grade_level || '');
    setSecAdviser(section.adviser_id || '');
    setSecCapacity(String(section.capacity ?? 40));
    setSectionModal('edit');
  };

  const closeSectionModal = () => setSectionModal(null);

  const saveSection = async () => {
    const name = secName.trim();
    if (!name) return showToast('Section name is required', 'error');
    if (!secGrade) return showToast('Grade level is required', 'error');

    setSecSaving(true);
    const payload = {
      name,
      grade_level: secGrade,
      adviser_id: secAdviser || null,
      capacity: parseInt(secCapacity, 10) || 40,
      school_year: schoolYear,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingSection
      ? await supabase.from('sections').update(payload).eq('id', editingSection.id)
      : await supabase.from('sections').insert([payload]);

    setSecSaving(false);
    if (error) {
      return showToast(
        error.code === '23505'
          ? 'A section with that name already exists.'
          : `Could not save section: ${error.message}`,
        'error'
      );
    }
    showToast(editingSection ? 'Section updated' : 'Section created');
    setSectionModal(null);
    fetchSections();
  };

  const deleteSection = async (id) => {
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) return showToast(`Could not delete section: ${error.message}`, 'error');
    showToast('Section deleted');
    fetchSections();
  };

  // ── Class list ────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState(null);
  const [classList, setClassList] = useState([]);
  const [classListLoading, setClassListLoading] = useState(false);
  const [unassignedStudents, setUnassignedStudents] = useState([]);

  const loadClassList = useCallback(async (section) => {
    setClassListLoading(true);

    const { data: rows, error } = await withRetry(
      () => supabase.from('section_students').select('id, student_id').eq('section_id', section.id).eq('status', 'active'),
      { label: 'Class list fetch' }
    );
    if (error) {
      console.warn('Class list fetch failed —', error.message);
      setClassListLoading(false);
      return;
    }

    // students.id references auth.users, not profiles, so the name has to be
    // fetched separately rather than through a PostgREST embed.
    const ids = (rows || []).map(r => r.student_id);
    let names = [];
    if (ids.length > 0) {
      const { data: profiles } = await withRetry(
        () => supabase.from('profiles').select('id, name, email').in('id', ids),
        { label: 'Class list profiles fetch' }
      );
      names = profiles || [];
    }

    setClassList((rows || []).map(r => {
      const p = names.find(n => n.id === r.student_id);
      return { id: r.id, student_id: r.student_id, name: p?.name || '—', email: p?.email || '' };
    }));

    const { data: allStudents } = await withRetry(
      () => supabase.from('profiles').select('id, name, email').eq('role', 'student').eq('status', 'active').order('name'),
      { label: 'Student pool fetch' }
    );
    setUnassignedStudents((allStudents || []).filter(s => !ids.includes(s.id)));
    setClassListLoading(false);
  }, []);

  const openClassList = (section) => { setActiveSection(section); loadClassList(section); };
  const closeClassList = () => { setActiveSection(null); setClassList([]); };

  const addStudentToSection = async (studentId) => {
    if (!activeSection) return;

    // section_students.student_id is a foreign key to students(id), but nothing
    // in this app has ever written that table — a student exists only in
    // profiles. Without this row the insert below fails with a foreign key
    // violation for every student. students.id references auth.users(id), the
    // same id profiles uses, so the row can be created from the id alone.
    const { error: studentRowError } = await supabase
      .from('students')
      .upsert([{ id: studentId }], { onConflict: 'id', ignoreDuplicates: true });

    if (studentRowError) {
      return showToast(`Could not prepare student record: ${studentRowError.message}`, 'error');
    }

    const { error } = await supabase.from('section_students').insert([{
      section_id: activeSection.id, student_id: studentId, status: 'active',
    }]);
    if (error) {
      return showToast(
        error.code === '23505'
          ? 'That student is already in this section.'
          : `Could not add student: ${error.message}`,
        'error'
      );
    }
    showToast('Student added to section');
    loadClassList(activeSection);
  };

  const removeStudentFromSection = async (rowId) => {
    const { error } = await supabase.from('section_students').delete().eq('id', rowId);
    if (error) return showToast(`Could not remove student: ${error.message}`, 'error');
    showToast('Student removed from section');
    loadClassList(activeSection);
  };

  useEffect(() => { fetchSections(); }, [fetchSections]);
```

Add to the returned object:

```jsx
    sections, sectionsLoading, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList, classListLoading, unassignedStudents,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
```

- [ ] **Step 2: Create the tab**

Create `src/pages/dashboards/admin/tabs/SectionsTab.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/admin/tabs/SectionsTab.jsx
// Class sections and their student rosters. A section plus its schedule is
// what makes a teacher's My Students screen show anything.
// ============================================

import React, { useState } from 'react';
import { Pencil, Trash2, Plus, Users, X } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

const SectionsTab = () => {
  const {
    schoolYear, teachers, sections, sectionsLoading,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList, classListLoading, unassignedStudents,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
    handleOverlayClick,
  } = useAdminContext();

  const [pick, setPick] = useState('');
  const adviserName = (id) => teachers.find(t => t.id === id)?.name || '—';

  return (
    <>
      <div>
        <div className="page-title">Sections</div>
        <div className="page-sub">Class sections for {schoolYear}, their advisers, and their student rosters.</div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSection}>
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Section
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Section</th><th>Grade Level</th><th>Adviser</th><th>Capacity</th><th style={{ width: 160 }}>Actions</th></tr>
          </thead>
          <tbody>
            {sectionsLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Loading sections…</td></tr>
            ) : sections.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No sections for {schoolYear} yet.</td></tr>
            ) : sections.map(s => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td>{s.grade_level}</td>
                <td>{adviserName(s.adviser_id)}</td>
                <td>{s.capacity}</td>
                <td>
                  <button className="icon-action" title="Class list" onClick={() => openClassList(s)}><Users size={15} /></button>
                  <button className="icon-action" title="Edit" onClick={() => openEditSection(s)}><Pencil size={15} /></button>
                  <button className="icon-action" title="Delete" onClick={() => deleteSection(s.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {sectionModal && (
        <div className="modal-overlay open" onClick={handleOverlayClick}>
          <div className="modal">
            <div className="modal-title">{editingSection ? 'Edit Section' : 'Add Section'}</div>

            <div className="form-row">
              <label className="form-label">Section Name</label>
              <input className="form-input" value={secName} onChange={e => setSecName(e.target.value)} placeholder="e.g. 7-Rizal" />
            </div>

            <div className="form-row">
              <label className="form-label">Grade Level</label>
              <select className="form-input" value={secGrade} onChange={e => setSecGrade(e.target.value)}>
                <option value="">Select…</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Adviser</label>
              <select className="form-input" value={secAdviser} onChange={e => setSecAdviser(e.target.value)}>
                <option value="">No adviser yet</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Capacity</label>
              <input className="form-input" type="number" value={secCapacity} onChange={e => setSecCapacity(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeSectionModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSection} disabled={secSaving}>
                {editingSection ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSection && (
        <div className="modal-overlay open" onClick={handleOverlayClick}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-title">{activeSection.name} — Class List</div>

            <div className="form-row" style={{ display: 'flex', gap: 8 }}>
              <select className="form-input" value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Add a student…</option>
                {unassignedStudents.map(s => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!pick} onClick={async () => {
                await addStudentToSection(pick);
                setPick('');
              }}>Add</button>
            </div>

            <div className="table-card"><table>
              <thead><tr><th>#</th><th>Student</th><th>Email</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {classListLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>Loading class list…</td></tr>
                ) : classList.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>No students in this section yet.</td></tr>
                ) : classList.map((c, i) => (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>{c.name}</td>
                    <td>{c.email}</td>
                    <td><button className="icon-action" title="Remove" onClick={() => removeStudentFromSection(c.id)}><X size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeClassList}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SectionsTab;
```

- [ ] **Step 3: Wire into the sidebar and page switch**

Add `Columns` to the lucide-react import list, then:

```jsx
import SectionsTab from './tabs/SectionsTab';
```

Sidebar array, after the `teaching-load` entry:

```jsx
['sections', 'Sections', Columns],
```

Page switch:

```jsx
{page === 'sections' && <SectionsTab />}
```

- [ ] **Step 4: Verify in the browser**

Signed in as admin:
1. Create a section named `7-Rizal`, Grade 7, with an adviser. It appears in the table.
2. Creating a second section with the same name shows "A section with that name already exists."
3. The class list icon opens the roster modal; it starts empty.
4. Adding a student moves them out of the "Add a student…" picker and into the numbered list. Watch for a foreign key error here — it means the `students` row upsert did not run.
5. Adding the same student twice is impossible — they are no longer in the picker.
6. Removing a student returns them to the picker.
7. The roster survives a page reload.
8. In the Supabase SQL Editor, `SELECT COUNT(*) FROM students;` is now non-zero — the roster created the missing student records.

- [ ] **Step 5: Verify the build**

Run: `npx vite build` and `npm test`

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboards/admin/useAcademicLogic.jsx src/pages/dashboards/admin/tabs/SectionsTab.jsx src/pages/dashboards/admin/AdminDashboard.jsx
git commit -m "Add admin Sections tab with class lists

Sections and their rosters had no producer anywhere in the app, which is
why the teacher's Students tab has always rendered empty."
```

---

### Task 8: Schedules tab

The screen that ties everything together, and the only one that enforces the teaching-load guard.

**Files:**
- Modify: `src/pages/dashboards/admin/useAcademicLogic.jsx`
- Create: `src/pages/dashboards/admin/tabs/SchedulesTab.jsx`
- Modify: `src/pages/dashboards/admin/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `canTeachSection` and `subjectsTeacherHolds` from `src/lib/academicRules.js` (Task 1); `teachingLoad` (Task 6); `sections` (Task 7); `subjects` (Task 5)
- Produces, on the admin context:
  - `schedules: Schedule[]`, `schedulesLoading`, `fetchSchedules()`
  - `scheduleModal`, `schedTeacher, setSchedTeacher, schedSubject, setSchedSubject, schedSection, setSchedSection, schedDay, setSchedDay, schedStart, setSchedStart, schedEnd, setSchedEnd, schedRoom, setSchedRoom, schedSaving`
  - `openCreateSchedule()`, `closeScheduleModal()`, `saveSchedule()`, `deleteSchedule(id)`
  - where `Schedule = { id, section_id, teacher_id, subject_id, day_of_week, start_time, end_time, room_number, school_year }`

- [ ] **Step 1: Add the schedules slice to the hook**

Add this import at the top of `useAcademicLogic.jsx`:

```jsx
import { canTeachSection } from '../../../lib/academicRules';
```

Append inside `useAcademicLogic`, before the `return`:

```jsx
  // ── Schedules ─────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [schedTeacher, setSchedTeacher] = useState('');
  const [schedSubject, setSchedSubject] = useState('');
  const [schedSection, setSchedSection] = useState('');
  const [schedDay, setSchedDay] = useState('Monday');
  const [schedStart, setSchedStart] = useState('08:00');
  const [schedEnd, setSchedEnd] = useState('09:00');
  const [schedRoom, setSchedRoom] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);

  const fetchSchedules = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('schedules').select('*').eq('school_year', schoolYear).order('day_of_week').order('start_time'),
      { label: 'Schedules fetch' }
    );
    if (error) {
      console.warn('Schedules fetch failed —', error.message);
      setSchedulesLoading(false);
      return;
    }
    setSchedules(data || []);
    setSchedulesLoading(false);
  }, [schoolYear]);

  const openCreateSchedule = () => {
    setSchedTeacher(''); setSchedSubject(''); setSchedSection('');
    setSchedDay('Monday'); setSchedStart('08:00'); setSchedEnd('09:00'); setSchedRoom('');
    setScheduleModal('create');
  };

  const closeScheduleModal = () => setScheduleModal(null);

  const saveSchedule = async () => {
    if (!schedTeacher || !schedSubject || !schedSection) {
      return showToast('Teacher, subject and section are all required', 'error');
    }
    if (schedEnd <= schedStart) {
      return showToast('End time must be after start time', 'error');
    }

    const section = sections.find(s => s.id === schedSection);
    const teacherLoad = teachingLoad.filter(l => l.teacher_id === schedTeacher);

    // The guard: a teacher may only be scheduled to a subject and grade level
    // they actually hold. Tested in src/lib/academicRules.test.js.
    const verdict = canTeachSection(teacherLoad, schedSubject, section);
    if (!verdict.ok) return showToast(verdict.reason, 'error');

    setSchedSaving(true);
    const { error } = await supabase.from('schedules').insert([{
      section_id: schedSection,
      teacher_id: schedTeacher,
      subject_id: schedSubject,
      day_of_week: schedDay,
      start_time: schedStart,
      end_time: schedEnd,
      room_number: schedRoom.trim() || null,
      school_year: schoolYear,
    }]);
    setSchedSaving(false);

    if (error) return showToast(`Could not save schedule: ${error.message}`, 'error');
    showToast('Schedule created');
    setScheduleModal(null);
    fetchSchedules();
  };

  const deleteSchedule = async (id) => {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) return showToast(`Could not delete schedule: ${error.message}`, 'error');
    showToast('Schedule deleted');
    fetchSchedules();
  };

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);
```

Add to the returned object:

```jsx
    schedules, schedulesLoading, fetchSchedules,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject, setSchedSubject,
    schedSection, setSchedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
```

- [ ] **Step 2: Create the tab**

Create `src/pages/dashboards/admin/tabs/SchedulesTab.jsx`:

```jsx
// ============================================
// FILE: src/pages/dashboards/admin/tabs/SchedulesTab.jsx
// Ties a teacher, a subject, a section and a time together. This is the record
// the teacher dashboard reads to know what it is meant to show.
// ============================================

import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { subjectsTeacherHolds } from '../../../../lib/academicRules';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SchedulesTab = () => {
  const {
    schoolYear, teachers, subjects, sections, teachingLoad,
    schedules, schedulesLoading,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject, setSchedSubject,
    schedSection, setSchedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
    handleOverlayClick,
  } = useAdminContext();

  const nameOf = (list, id, field = 'name') => list.find(x => x.id === id)?.[field] || '—';

  // The subject picker offers only what this teacher holds, so an invalid
  // pairing cannot be chosen in the first place. saveSchedule still checks,
  // because the grade level of the chosen section matters too.
  const heldSubjectIds = schedTeacher
    ? subjectsTeacherHolds(teachingLoad.filter(l => l.teacher_id === schedTeacher), schoolYear)
    : [];

  return (
    <>
      <div>
        <div className="page-title">Schedules</div>
        <div className="page-sub">Who teaches what, to which section, and when — for {schoolYear}.</div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSchedule}>
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Schedule
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Day</th><th>Time</th><th>Room</th><th style={{ width: 60 }}></th></tr>
          </thead>
          <tbody>
            {schedulesLoading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Loading schedules…</td></tr>
            ) : schedules.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No schedules for {schoolYear} yet.</td></tr>
            ) : schedules.map(s => (
              <tr key={s.id}>
                <td><strong>{nameOf(sections, s.section_id)}</strong></td>
                <td>{nameOf(subjects, s.subject_id, 'code')}</td>
                <td>{nameOf(teachers, s.teacher_id)}</td>
                <td>{s.day_of_week}</td>
                <td>{String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}</td>
                <td>{s.room_number || '—'}</td>
                <td><button className="icon-action" title="Delete" onClick={() => deleteSchedule(s.id)}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {scheduleModal && (
        <div className="modal-overlay open" onClick={handleOverlayClick}>
          <div className="modal">
            <div className="modal-title">Add Schedule</div>

            <div className="form-row">
              <label className="form-label">Teacher</label>
              <select className="form-input" value={schedTeacher} onChange={e => { setSchedTeacher(e.target.value); setSchedSubject(''); }}>
                <option value="">Select teacher…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Subject</label>
              <select className="form-input" value={schedSubject} onChange={e => setSchedSubject(e.target.value)} disabled={!schedTeacher}>
                <option value="">
                  {!schedTeacher ? 'Pick a teacher first…'
                    : heldSubjectIds.length === 0 ? 'This teacher has no teaching load yet'
                    : 'Select subject…'}
                </option>
                {subjects.filter(s => heldSubjectIds.includes(s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Section</label>
              <select className="form-input" value={schedSection} onChange={e => setSchedSection(e.target.value)}>
                <option value="">Select section…</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade_level})</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Day</label>
              <select className="form-input" value={schedDay} onChange={e => setSchedDay(e.target.value)}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="form-row" style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Start</label>
                <input className="form-input" type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">End</label>
                <input className="form-input" type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">Room</label>
              <input className="form-input" value={schedRoom} onChange={e => setSchedRoom(e.target.value)} placeholder="e.g. Room 201" />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeScheduleModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSchedule} disabled={schedSaving}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SchedulesTab;
```

- [ ] **Step 3: Wire into the sidebar and page switch**

Add `CalendarClock` to the lucide-react import list, then:

```jsx
import SchedulesTab from './tabs/SchedulesTab';
```

Sidebar array, after the `sections` entry:

```jsx
['schedules', 'Schedules', CalendarClock],
```

Page switch:

```jsx
{page === 'schedules' && <SchedulesTab />}
```

- [ ] **Step 4: Verify the guard in the browser**

This is the most important verification in the phase. Set up: a teacher holding Mathematics for Grade 7 only, a Grade 7 section, and a Grade 8 section.

1. Open Add Schedule. The subject picker is disabled until a teacher is chosen.
2. Choose that teacher — only Mathematics appears in the subject picker, not all eight subjects.
3. Choose the Grade 7 section and save. It succeeds and appears in the table.
4. Add another schedule: same teacher, Mathematics, but the **Grade 8** section. Saving is refused with "This teacher does not handle this subject for Grade 8."
5. Choose a teacher with no teaching load — the picker reads "This teacher has no teaching load yet".
6. Set the end time earlier than the start time — saving is refused.

- [ ] **Step 5: Verify the teacher dashboard came alive**

Sign in as the teacher you scheduled. Open the Students tab — the section and its students now appear, with no change made to that file.

This is the proof that Phase 1 succeeded.

- [ ] **Step 6: Verify the build**

Run: `npx vite build` and `npm test`

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboards/admin/useAcademicLogic.jsx src/pages/dashboards/admin/tabs/SchedulesTab.jsx src/pages/dashboards/admin/AdminDashboard.jsx
git commit -m "Add admin Schedules tab with teaching-load guard

The subject picker offers only what the chosen teacher holds, and saving
re-checks that the section's grade level matches that teaching load."
```

---

### Task 9: Make the Registrar Scheduling tab read-only

Two screens that can both author the same data invite disagreement about which is authoritative. Admin now owns schedules, so the Registrar view stops mutating them.

**Files:**
- Modify: `src/pages/dashboards/registrar/tabs/SchedulingTab.jsx`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new

- [ ] **Step 1: Find the delete path**

Run: `grep -n "delete\|Trash\|handleDelete" src/pages/dashboards/registrar/tabs/SchedulingTab.jsx`

- [ ] **Step 2: Remove the delete action**

Delete the delete handler function, the delete button in the table rows, and the now-unused `Trash2` (or equivalent) import.

- [ ] **Step 3: Tell the reader why the screen is read-only**

Under the page header, add:

```jsx
<div className="page-sub" style={{ marginTop: 4 }}>
  Schedules are managed by the Administrator. This view is read-only.
</div>
```

- [ ] **Step 4: Verify in the browser**

Signed in as registrar: the Scheduling tab still lists schedules, shows the read-only note, and offers no delete control. No console errors.

- [ ] **Step 5: Verify the build**

Run: `npx vite build` and `npm test`

- [ ] **Step 6: Commit**

```bash
git add src/pages/dashboards/registrar/tabs/SchedulingTab.jsx
git commit -m "Make the registrar Scheduling tab read-only

Admin now owns schedule authoring; two screens able to mutate the same
data would leave no single answer to which one is authoritative."
```

---

## Phase 1 completion checklist

- [ ] All four SQL files have been run against the live database and their verification queries returned the expected output.
- [ ] `npm test` passes.
- [ ] `npx vite build` passes.
- [ ] An admin can create a subject, a teaching load entry, a section with students, and a schedule.
- [ ] A teacher scheduled to a section sees that section and its students in the existing Students tab, which was never modified.
- [ ] A student placed in a section can read their own section and schedule, and cannot read another section's roster.
