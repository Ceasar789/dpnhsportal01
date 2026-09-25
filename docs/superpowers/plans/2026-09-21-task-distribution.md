# Task Distribution & Subject Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher distributes a typed task to chosen students with a dated and timed deadline, and the student sees their work grouped into per-subject cards with a live countdown.

**Architecture:** One task system, not four. `worksheets` gains a `task_type` label and finally uses the `subject_id` column Phase 1 added; a new `task_assignees` table holds one row per student who was given the task, carrying that student's deadline. Checking, scoring and release are Phase 2's and are not touched. Two notification producers fire from actions already happening in the browser.

**Tech Stack:** React 18, Vite 5, Tailwind, Supabase (Postgres + Auth + Storage + RLS), vitest. No custom backend — every write originates in a browser.

**Spec:** `docs/superpowers/specs/2026-09-21-task-distribution-design.md`

## Global Constraints

- **A failed read must never render as `0` or an empty list.** Every read gets its own error flag, a visually distinct "could not load" state, and a Retry that calls a function the hook genuinely returns. An honest zero shows an empty state that says so. The two must never look alike.
- Wrap reads in `withRetry(fn, { label })` from `src/lib/supabaseRetry.js`. **Never wrap a write** — retrying a write risks duplicates.
- supabase-js resolves rather than throws. Destructure and check `error` on every query; a bare try/catch catches nothing.
- RLS is the only authorization boundary. Anything a policy returns is readable through the public REST API regardless of what the UI renders.
- Every `SECURITY DEFINER` function sets `SET search_path = public, pg_temp`.
- SQL files are run by hand by the user in the Supabase SQL Editor, in numbered order, and must be safe to run twice.
- Teacher-side styling follows the neighbouring files: `dark ? '#hex' : '#hex'` with `useTheme()`, not CSS variables. Student tabs match `student/tabs/AttendanceTab.jsx`, including its `var(--banner-bg)` page header.
- A student who was not assigned a task must not be able to read it — not the row, not its questions, and never `worksheet_item_keys`.
- Nothing assigned to a student may fail to appear somewhere. A task with no subject, or a subject absent from the student's schedule, belongs to the `Other` card.
- Never import `checkItem`, `scoreSubmission` or `normalizeAnswer` into a student file.

---

## File Structure

**Create**
- `archives/phase3-01-task-distribution-tables.sql` — `task_assignees`, `worksheets.task_type`, `worksheet_submissions.is_late`
- `archives/phase3-02-task-rls.sql` — `task_assignees` policies, tightened student read path, `is_late` in the existing submission trigger
- `archives/phase3-03-notifications-rls.sql` — notification policies, written for an unknown starting state
- `src/lib/taskFormatting.js` + `.test.js` — pure countdown, lateness and label logic
- `src/pages/dashboards/teacher/worksheets/DistributeModal.jsx` — replaces `PostToSectionModal.jsx`
- `src/pages/dashboards/student/tabs/TasksTab.jsx` — the student's task list, from the existing `student/tabs/WorksheetsTab.jsx`
- `src/pages/dashboards/student/SubjectCards.jsx` — the Overview cards

**Modify**
- `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx` — `mySubject`, `distributeTask`, `loadAssignees`, notification writes
- `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx` — type selector, locked subject, Distribute replaces Post, old Distribute deleted
- `src/pages/dashboards/student/tabs/OverviewTab.jsx` — subject cards replace the flat list
- `src/pages/dashboards/student/StudentDashboard.jsx` — nav and routes

**Delete**
- `src/pages/dashboards/teacher/worksheets/PostToSectionModal.jsx`
- `src/pages/dashboards/student/tabs/AssignmentsTab.jsx`, `src/pages/dashboards/student/tabs/QuizzesTab.jsx`

---

### Task 1: Pure task formatting logic

**Files:**
- Create: `src/lib/taskFormatting.js`
- Test: `src/lib/taskFormatting.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `TASK_TYPES`, `TASK_TYPE_LABELS`, `DEFAULT_DUE_TIME`, `formatCountdown(dueAt, now)`, `combineDateAndTime(dateStr, timeStr)`.

`formatCountdown` returns `{ text, tone, isLate }` where `tone` is one of `'late' | 'urgent' | 'soon' | 'normal' | 'none'`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import {
  TASK_TYPES, TASK_TYPE_LABELS, DEFAULT_DUE_TIME,
  formatCountdown, combineDateAndTime,
} from './taskFormatting';

const NOW = new Date('2026-09-21T10:00:00');

describe('TASK_TYPES', () => {
  it('is the four types the database allows, in display order', () => {
    expect(TASK_TYPES).toEqual(['worksheet', 'assignment', 'quiz', 'project']);
  });

  it('has a label for every type', () => {
    TASK_TYPES.forEach(t => expect(typeof TASK_TYPE_LABELS[t]).toBe('string'));
  });
});

describe('combineDateAndTime', () => {
  it('joins a date and a time into a local timestamp string', () => {
    expect(combineDateAndTime('2026-09-25', '17:00')).toBe('2026-09-25T17:00:00');
  });

  it('falls back to the default time when none is given', () => {
    expect(combineDateAndTime('2026-09-25', '')).toBe(`2026-09-25T${DEFAULT_DUE_TIME}:00`);
  });

  it('returns null without a date, because a deadline needs a day', () => {
    expect(combineDateAndTime('', '17:00')).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('says so when there is no deadline at all', () => {
    const r = formatCountdown(null, NOW);
    expect(r.tone).toBe('none');
    expect(r.isLate).toBe(false);
    expect(r.text).toBe('No deadline');
  });

  it('counts days and hours when the deadline is far off', () => {
    const r = formatCountdown('2026-09-25T00:00:00', NOW);
    expect(r.text).toBe('3d 14h left');
    expect(r.tone).toBe('normal');
    expect(r.isLate).toBe(false);
  });

  it('is urgent inside twenty-four hours', () => {
    const r = formatCountdown('2026-09-21T15:22:00', NOW);
    expect(r.text).toBe('5h 22m left');
    expect(r.tone).toBe('urgent');
  });

  it('is soon between one and three days', () => {
    expect(formatCountdown('2026-09-23T10:00:00', NOW).tone).toBe('soon');
  });

  it('counts minutes only in the last hour', () => {
    expect(formatCountdown('2026-09-21T10:45:00', NOW).text).toBe('45m left');
  });

  it('reports seconds in the last minute, so the clock keeps moving', () => {
    expect(formatCountdown('2026-09-21T10:00:30', NOW).text).toBe('30s left');
  });

  it('flips to late once the deadline passes', () => {
    const r = formatCountdown('2026-09-21T07:45:00', NOW);
    expect(r.isLate).toBe(true);
    expect(r.tone).toBe('late');
    expect(r.text).toBe('Late by 2h 15m');
  });

  it('counts late in days once it has been that long', () => {
    expect(formatCountdown('2026-09-18T10:00:00', NOW).text).toBe('Late by 3d 0h');
  });

  it('treats the exact deadline instant as not yet late', () => {
    const r = formatCountdown('2026-09-21T10:00:00', NOW);
    expect(r.isLate).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/taskFormatting.test.js`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the implementation**

```js
// ============================================
// FILE: src/lib/taskFormatting.js
// How a deadline is described to a student, and how the builder's date and
// time inputs become one timestamp. Pure — no React, no Supabase — because
// the countdown is the most visible thing on the dashboard and getting it
// wrong is the kind of error a reader trusts rather than questions.
// ============================================

export const TASK_TYPES = ['worksheet', 'assignment', 'quiz', 'project'];

export const TASK_TYPE_LABELS = {
  worksheet: 'Worksheet',
  assignment: 'Assignment',
  quiz: 'Quiz',
  project: 'Project',
};

// What "due Sep 25" means when the teacher sets a date and leaves the time.
export const DEFAULT_DUE_TIME = '23:59';

// A plain local timestamp string, deliberately without a timezone offset:
// due_at is a TIMESTAMP WITHOUT TIME ZONE, and the whole school is in one
// timezone. Sending an offset would store a shifted wall-clock time.
export function combineDateAndTime(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  if (!date) return null;
  const time = String(timeStr || '').trim() || DEFAULT_DUE_TIME;
  return `${date}T${time}:00`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatCountdown(dueAt, now = new Date()) {
  if (!dueAt) return { text: 'No deadline', tone: 'none', isLate: false };

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return { text: 'No deadline', tone: 'none', isLate: false };
  }

  const ms = due.getTime() - new Date(now).getTime();

  // Exactly on the deadline is not yet late — the student had that instant.
  if (ms < 0) {
    const late = Math.abs(ms);
    const text = late >= DAY
      ? `Late by ${Math.floor(late / DAY)}d ${Math.floor((late % DAY) / HOUR)}h`
      : late >= HOUR
        ? `Late by ${Math.floor(late / HOUR)}h ${Math.floor((late % HOUR) / MINUTE)}m`
        : `Late by ${Math.max(1, Math.floor(late / MINUTE))}m`;
    return { text, tone: 'late', isLate: true };
  }

  const text = ms >= DAY
    ? `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h left`
    : ms >= HOUR
      ? `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m left`
      : ms >= MINUTE
        ? `${Math.floor(ms / MINUTE)}m left`
        : `${Math.floor(ms / 1000)}s left`;

  const tone = ms < DAY ? 'urgent' : ms < 3 * DAY ? 'soon' : 'normal';
  return { text, tone, isLate: false };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run`
Expected: every previously passing test still passes, plus the new file's.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskFormatting.js src/lib/taskFormatting.test.js
git commit -m "Add task type labels and deadline countdown formatting"
```

---

### Task 2: Distribution tables

**Files:**
- Create: `archives/phase3-01-task-distribution-tables.sql`

**Interfaces:**
- Consumes: existing `worksheets`, `sections`, `students`, `profiles`, `worksheet_submissions`.
- Produces: `task_assignees`; `worksheets.task_type`; `worksheet_submissions.is_late`. Tasks 3, 6, 9 and 10 read these.

The user runs this file. Do not attempt to execute SQL.

- [ ] **Step 1: Write the file**

```sql
-- ============================================
-- PHASE 3 / 01 — Per-student task distribution
--
-- A task went to a whole section or to nobody. task_assignees holds one row
-- per student who was actually given it, and carries that student's deadline
-- — on the assignee rather than the worksheet, so the same task can go to two
-- sections on different days, which posting to sections already allowed.
--
-- A student with no row here cannot see the task at all. Not "sees it, cannot
-- open it" — cannot see it.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

-- The type is a label on one system, not four systems. A quiz and a worksheet
-- differ in what the teacher calls them, not in how the software treats them.
ALTER TABLE worksheets ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) NOT NULL DEFAULT 'worksheet';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'worksheets_task_type_check'
      AND conrelid = 'worksheets'::regclass
  ) THEN
    ALTER TABLE worksheets ADD CONSTRAINT worksheets_task_type_check
      CHECK (task_type IN ('worksheet','assignment','quiz','project'));
  END IF;
END $$;

-- Set by the submission guard trigger at the moment of submitting, never by
-- the client: a student's own clock must not decide whether they were late.
ALTER TABLE worksheet_submissions ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS task_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  -- The section they were in when this was distributed. Kept even if they
  -- move later, so the teacher's roster view still makes sense.
  section_id  UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  due_at      TIMESTAMP,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_student ON task_assignees(student_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task    ON task_assignees(task_id);

-- ============================================
-- VERIFY — expect the table, the two new columns, and the CHECK.
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'task_assignees';

SELECT table_name, column_name, column_default, is_nullable
FROM information_schema.columns
WHERE (table_name = 'worksheets' AND column_name = 'task_type')
   OR (table_name = 'worksheet_submissions' AND column_name = 'is_late')
ORDER BY table_name;

SELECT conname FROM pg_constraint
WHERE conrelid = 'worksheets'::regclass AND conname = 'worksheets_task_type_check';
```

- [ ] **Step 2: Re-read the file against the existing schema**

Open `archives/phase2-01-worksheet-assessment-tables.sql`. Confirm every table this file references (`worksheets`, `sections`, `students`, `profiles`, `worksheet_submissions`) exists with the column names used, and that `students(id)` is the right foreign-key target for `student_id` — **not** `profiles`. State the result in your report.

- [ ] **Step 3: Commit**

```bash
git add archives/phase3-01-task-distribution-tables.sql
git commit -m "Add per-student task distribution tables"
```

---

### Task 3: Distribution RLS, and lateness in the trigger

**Files:**
- Create: `archives/phase3-02-task-rls.sql`

**Interfaces:**
- Consumes: `task_assignees` from Task 2; the Phase 1 helpers `is_admin()`, `teacher_handles_section()`, `teacher_advises_section()`; the Phase 2 helper `teacher_owns_worksheet()` and trigger function `guard_worksheet_submission_write()`.
- Produces: `student_assigned_task(uuid)`; tightened read policies. Task 9's student reads depend on these.

**This task rewrites two things that already exist.** Read `archives/phase2-02-worksheet-rls.sql` in full before writing a line. You are replacing `ws_items_read`, `ws_worksheets_student_read` and the body of `guard_worksheet_submission_write`. Everything else in that file stays exactly as it is.

- [ ] **Step 1: Write the file**

```sql
-- ============================================
-- PHASE 3 / 02 — Distribution policies, and lateness
--
-- Phase 2 let a student read a worksheet posted to any section they were
-- enrolled in. Distribution is now per student, so the gate moves: a student
-- reads a task only if they were actually given it.
--
-- Depends on phase3-01 and on phase2-02 having been run. Safe to run twice.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

CREATE OR REPLACE FUNCTION student_assigned_task(p_task_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignees
    WHERE task_id = p_task_id AND student_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_assignees_teacher_all ON task_assignees;
CREATE POLICY task_assignees_teacher_all ON task_assignees FOR ALL TO authenticated
  USING (is_admin() OR (teacher_owns_worksheet(task_id)
                        AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))))
  WITH CHECK (is_admin() OR (teacher_owns_worksheet(task_id)
                             AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))));

-- A student reads only their own assignment rows. They have no write path at
-- all: who is given a task is the teacher's decision.
DROP POLICY IF EXISTS task_assignees_student_read ON task_assignees;
CREATE POLICY task_assignees_student_read ON task_assignees FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Replaces the Phase 2 versions. Being enrolled in a section the task was
-- posted to is no longer enough — a student who was not ticked must not be
-- able to read the questions, and RLS is the only thing that can stop them.
DROP POLICY IF EXISTS ws_items_read ON worksheet_items;
CREATE POLICY ws_items_read ON worksheet_items FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_assigned_task(worksheet_id));

DROP POLICY IF EXISTS ws_worksheets_student_read ON worksheets;
CREATE POLICY ws_worksheets_student_read ON worksheets FOR SELECT TO authenticated
  USING (student_assigned_task(id));

-- Same move for the postings table. Left on student_in_section, an unassigned
-- student could still enumerate which tasks exist for their section through
-- the API — which contradicts "cannot see the task at all". The teacher branch
-- is unchanged.
DROP POLICY IF EXISTS ws_sections_read ON worksheet_sections;
CREATE POLICY ws_sections_read ON worksheet_sections FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_assigned_task(worksheet_id));

-- Rewritten from phase2-02 with one addition: the transition into 'submitted'
-- now also stamps is_late, from the student's own assignee row. Everything
-- else — the status machine, the pinned columns, the teacher early-out — is
-- carried over unchanged. Re-read phase2-02's version alongside this one and
-- confirm nothing was dropped.
CREATE OR REPLACE FUNCTION guard_worksheet_submission_write()
RETURNS TRIGGER AS $$
DECLARE
  v_due TIMESTAMP;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_admin() OR teacher_owns_worksheet(NEW.worksheet_id) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.remarks IS NOT NULL
       OR NEW.status <> 'in_progress'
       OR NEW.source <> 'online' THEN
      RAISE EXCEPTION 'Students may only start a submission, not create a finished one';
    END IF;
    NEW.submitted_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.remarks      IS DISTINCT FROM OLD.remarks
     OR NEW.source       IS DISTINCT FROM OLD.source
     OR NEW.worksheet_id IS DISTINCT FROM OLD.worksheet_id
     OR NEW.section_id   IS DISTINCT FROM OLD.section_id THEN
    RAISE EXCEPTION 'Students may not change these fields on their submission';
  END IF;

  IF OLD.status = 'in_progress' AND NEW.status = 'submitted' THEN
    NEW.submitted_at := NOW();
    SELECT due_at INTO v_due FROM task_assignees
      WHERE task_id = NEW.worksheet_id AND student_id = NEW.student_id;
    NEW.is_late := (v_due IS NOT NULL AND NOW() > v_due);
  ELSIF (OLD.status = 'in_progress' AND NEW.status = 'in_progress')
     OR (OLD.status = 'submitted'   AND NEW.status = 'submitted') THEN
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Students may not set their own submission time';
    END IF;
    NEW.is_late := OLD.is_late;
  ELSE
    RAISE EXCEPTION 'Students may not move a submission from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.released IS DISTINCT FROM FALSE
     OR NEW.score IS NOT NULL OR NEW.total_points IS NOT NULL
     OR NEW.checked_by IS NOT NULL OR NEW.checked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Students may not score or release their own submission';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================
-- VERIFY — task_assignees must show rls_on = true with two policies; the two
-- rewritten read policies must mention student_assigned_task.
-- ============================================
SELECT c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname = 'task_assignees' ORDER BY p.policyname;

SELECT tablename, policyname, qual FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('ws_items_read','ws_worksheets_student_read')
ORDER BY tablename;
```

- [ ] **Step 2: Diff the trigger against the Phase 2 version**

Put `archives/phase2-02-worksheet-rls.sql`'s `guard_worksheet_submission_write` beside the one above, line by line. Every guard in the old one must still be present. Name in your report anything you changed beyond the two `is_late` lines and the `v_due` declaration.

- [ ] **Step 3: Commit**

```bash
git add archives/phase3-02-task-rls.sql
git commit -m "Gate task reads on assignment, and stamp lateness at submit"
```

---

### Task 4: Notification policies

**Files:**
- Create: `archives/phase3-03-notifications-rls.sql`

**Interfaces:**
- Produces: policies on `notifications`. Task 8's writes depend on them.

No archived SQL file contains a single policy for `notifications`, so its live state is unknown. This file must be correct whether the table currently has no policies, partial ones, or RLS switched off.

- [ ] **Step 1: Write the file**

```sql
-- ============================================
-- PHASE 3 / 03 — Notification policies
--
-- No file in archives/ creates a policy for this table, so what is live
-- cannot be assumed. This enables RLS explicitly and creates every policy the
-- table needs from scratch. Safe to run whatever state it starts in.
--
-- The interesting one is the teacher INSERT: a notification is a write on
-- behalf of somebody else. Without a predicate, any signed-in user could
-- post a notification to anyone in the school. It is limited to a student
-- the teacher actually teaches or advises, and to INSERT only — a teacher
-- has no business reading or editing anyone else's notifications.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

CREATE OR REPLACE FUNCTION teaches_student(p_student_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM section_students ss
    WHERE ss.student_id = p_student_id
      AND ss.status = 'active'
      AND (teacher_handles_section(ss.section_id) OR teacher_advises_section(ss.section_id))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_own_read ON notifications;
CREATE POLICY notifications_own_read ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- Marking read is the only thing a recipient may change.
DROP POLICY IF EXISTS notifications_own_update ON notifications;
CREATE POLICY notifications_own_update ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- is_school_staff() is included because the registrar already writes here:
-- PreEnrollmentTab.jsx notifies a student three times during enrolment, and a
-- registrar is neither an admin nor a teacher of that student. Without this
-- branch, enabling RLS would silently break enrolment notifications that work
-- today.
DROP POLICY IF EXISTS notifications_teacher_insert ON notifications;
CREATE POLICY notifications_teacher_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (teaches_student(user_id) OR is_school_staff());

DROP POLICY IF EXISTS notifications_admin_all ON notifications;
CREATE POLICY notifications_admin_all ON notifications FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- VERIFY — expect rls_on = true and four policies.
-- ============================================
SELECT c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname = 'notifications' ORDER BY p.policyname;
```

- [ ] **Step 2: Check what this breaks**

Grep `src/` for `from('notifications')`. Every existing producer — `admin/useAdminLogic.jsx` `saveNews()`, `registrar/tabs/PreEnrollmentTab.jsx` — now has to satisfy one of these policies. Work out for each whether it still passes, and say so in your report. If an admin or registrar write would now be refused, say which and stop; do not widen the policies to make it pass without flagging it.

- [ ] **Step 3: Commit**

```bash
git add archives/phase3-03-notifications-rls.sql
git commit -m "Give notifications the policies it never had"
```

---

### Task 5: The teacher's subject, from the teaching load

**Files:**
- Modify: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`
- Modify: `src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx`

**Interfaces:**
- Consumes: `teacher_subjects`, `subjects` (Phase 1).
- Produces: hook exports `mySubject` (`{ id, name } | null`), `subjectError` (`boolean`), `subjectConflict` (`boolean`), `fetchMySubject()`. Task 6 and Task 7 read `mySubject`.

- [ ] **Step 1: Add the subject lookup to the hook**

Append before the hook's `return`, and add the four names to it. Do not rename anything already there.

```jsx
  const [mySubject, setMySubject] = useState(null);
  const [subjectError, setSubjectError] = useState(false);
  // More than one subject assigned. Not an error in the data — a small school
  // may well do this — but the design says one per teacher, and guessing which
  // one a task belongs to would file work under the wrong heading silently.
  const [subjectConflict, setSubjectConflict] = useState(false);

  const fetchMySubject = useCallback(async () => {
    if (!userData?.uid) return;
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects')
        .select('subject_id, subjects(id, name)')
        .eq('teacher_id', userData.uid),
      { label: 'Teaching load fetch' }
    );
    if (error) {
      console.warn('Teaching load fetch failed —', error.message);
      setSubjectError(true);
      return;
    }
    // One row per grade level, so the same subject appears more than once.
    const unique = [];
    (data || []).forEach(r => {
      if (r.subjects?.id && !unique.some(u => u.id === r.subjects.id)) {
        unique.push({ id: r.subjects.id, name: r.subjects.name });
      }
    });
    setSubjectError(false);
    setSubjectConflict(unique.length > 1);
    setMySubject(unique.length === 1 ? unique[0] : null);
  }, [userData?.uid]);

  useEffect(() => { fetchMySubject(); }, [fetchMySubject]);
```

- [ ] **Step 2: Lock the subject in the create form**

In `WorksheetsTab.jsx`, replace the subject `<select>` in the Create Worksheet modal with a read-only label, and add the type selector. Import `TASK_TYPES` and `TASK_TYPE_LABELS` from `../../../../lib/taskFormatting`.

```jsx
<div>
  <label className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Type</label>
  <select value={formData.task_type}
    onChange={e => setFormData({ ...formData, task_type: e.target.value })}
    className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1"
    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
             color: dark ? '#f1f5f9' : '#1a2b4a' }}>
    {TASK_TYPES.map(t => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
  </select>
</div>

<p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
  Subject: <strong style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
    {assessment.mySubject?.name || '—'}
  </strong> (from your teaching load)
</p>
```

Add `task_type: 'worksheet'` to `formData`'s initial state and to the reset after a successful save.

- [ ] **Step 3: Refuse to create a task with no subject**

At the top of `handleAddWorksheet`, and before the upload handler does any work:

```jsx
if (assessment.subjectError) {
  showToast('Could not load your teaching load. Check your connection and try again.', 'error');
  return;
}
if (assessment.subjectConflict) {
  showToast('You are assigned more than one subject. Ask your admin to correct your teaching load — a task has to belong to exactly one subject.', 'error');
  return;
}
if (!assessment.mySubject) {
  showToast('No subject is assigned to you yet. Ask your admin to set your teaching load before creating tasks.', 'error');
  return;
}
```

Then include both columns in the insert, in `handleAddWorksheet` and in `handleUploadWorksheet`:

```jsx
subject: assessment.mySubject.name,
subject_id: assessment.mySubject.id,
task_type: formData.task_type,
```

In the upload path use `task_type: 'worksheet'` and drop `subject: 'Uploaded Document'` entirely.

- [ ] **Step 4: Build and test**

Run: `npm run build` then `npx vitest run`
Expected: build clean, every test passing.

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboards/teacher
git commit -m "Take a task's subject from the teaching load instead of asking"
```

---

### Task 6: Distribute to chosen students

**Files:**
- Create: `src/pages/dashboards/teacher/worksheets/DistributeModal.jsx`
- Modify: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`
- Delete: `src/pages/dashboards/teacher/worksheets/PostToSectionModal.jsx`

**Interfaces:**
- Consumes: `mySections`, `sectionsError`, `fetchMySections`, `loadClassList(sectionId)` (returns `[{ id, name }] | null`).
- Produces: hook exports `loadAssignees(taskId)` → `[{ student_id, section_id, due_at }] | null`, and `distributeTask(taskId, sectionId, studentIds, dueAt)` → `{ ok, added, skipped, message }`.

- [ ] **Step 1: Add the hook functions**

```jsx
  const loadAssignees = useCallback(async (taskId) => {
    const { data, error } = await withRetry(
      () => supabase.from('task_assignees')
        .select('student_id, section_id, due_at').eq('task_id', taskId),
      { label: 'Task assignees fetch' }
    );
    if (error) {
      console.warn('Task assignees fetch failed —', error.message);
      return null;
    }
    return data || [];
  }, []);

  // Writes the section posting and one assignee row per student. Students
  // already assigned are skipped rather than re-inserted, so re-opening the
  // modal to add a latecomer does not disturb anybody else or notify them
  // twice. Returns the ids actually added so the caller can notify exactly
  // those and nobody else.
  const distributeTask = async (taskId, sectionId, studentIds, dueAt) => {
    if (!sectionId) return { ok: false, message: 'Pick a section first.' };
    if (!dueAt) return { ok: false, message: 'Set a deadline first.' };
    if (studentIds.length === 0) return { ok: false, message: 'Tick at least one student.' };

    const existing = await loadAssignees(taskId);
    if (existing === null) {
      return { ok: false, message: 'Could not check who already has this task — nothing was sent.' };
    }
    const already = new Set(existing.map(a => a.student_id));
    const toAdd = studentIds.filter(id => !already.has(id));

    // Records that the task reached this section. Phase 2's teacher-facing
    // summary reads it; the student's own access comes from task_assignees.
    const { error: sectionError } = await supabase.from('worksheet_sections').upsert([{
      worksheet_id: taskId, section_id: sectionId, due_at: dueAt, posted_by: userData?.uid || null,
    }], { onConflict: 'worksheet_id,section_id' });
    if (sectionError) {
      return { ok: false, message: `Could not record the posting: ${sectionError.message}` };
    }

    if (toAdd.length === 0) {
      return { ok: true, added: [], skipped: studentIds.length, message: 'Everyone ticked already has this task.' };
    }

    const { error } = await supabase.from('task_assignees').insert(
      toAdd.map(id => ({
        task_id: taskId, student_id: id, section_id: sectionId,
        due_at: dueAt, assigned_by: userData?.uid || null,
      }))
    );
    if (error) {
      const message = error.code === '23503'
        ? 'One of these students is not on the class list yet. Ask your admin to add them to the section first.'
        : `Could not distribute: ${error.message}`;
      return { ok: false, message };
    }

    fetchPostings();
    return { ok: true, added: toAdd, skipped: studentIds.length - toAdd.length, message: '' };
  };
```

- [ ] **Step 2: Write the modal**

`DistributeModal.jsx` takes `{ task, sections, sectionsError, onRetrySections, loadClassList, loadAssignees, loadSubmissions, distributeTask, onClose }`.

It must:
- offer the advisory section first when one exists, then the sections they teach
- take a date and a time, defaulting the time to `DEFAULT_DUE_TIME`, and combine them with `combineDateAndTime`
- load the roster with `loadClassList` and start with every box ticked
- show a running `N of M will receive this`
- show which students already have the task, and leave those ticked and disabled
- **refuse to untick a student who has already started** — cross-reference `loadSubmissions(task.id)` and, for any student with a submission, disable the box with a note reading `Already started — clear their submission first`
- render a distinct error state with a working Retry when either the roster or the assignee read fails, never an empty roster
- disable the section select, the date, the time and the boxes while saving

Use the shared `Modal` with `size="max-w-2xl"`.

- [ ] **Step 3: Replace the buttons on the card**

In `WorksheetsTab.jsx`: delete `handleDistribute` and its button entirely, rename the **Post** button to **Distribute**, point it at `setDistributingTask(ws)`, and mount `DistributeModal` in place of `PostToSectionModal`. Delete `PostToSectionModal.jsx` and its import.

- [ ] **Step 4: Build and test**

Run: `npm run build` then `npx vitest run`
Expected: clean; no reference to `PostToSectionModal` or `handleDistribute` remains. Grep to confirm.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/dashboards/teacher
git commit -m "Distribute a task to chosen students with a dated and timed deadline"
```

---

### Task 7: Notify on distribution and on release

**Files:**
- Modify: `src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx`

**Interfaces:**
- Consumes: `distributeTask`'s returned `added` list; `releaseScore` from Phase 2.
- Produces: `notifyStudents(studentIds, { title, message, taskId })` → `boolean`.

- [ ] **Step 1: Add the writer**

```jsx
  // Best-effort by design: a failed notification must never roll back the
  // distribution or the release that caused it. The caller reports that the
  // work went out but the message did not, which is the truth.
  const notifyStudents = async (studentIds, { title, message, taskId }) => {
    if (!studentIds || studentIds.length === 0) return true;
    const { error } = await supabase.from('notifications').insert(
      studentIds.map(id => ({
        user_id: id,
        title,
        message,
        notification_type: 'task',
        related_entity_type: 'worksheet',
        related_entity_id: taskId,
        action_url: '/student-dashboard/tasks',
      }))
    );
    if (error) {
      console.warn('Notification write failed —', error.message);
      return false;
    }
    return true;
  };
```

- [ ] **Step 2: Call it from distribution**

In `distributeTask`, after a successful insert and before the return, notify exactly `toAdd`. The title names the type and subject; the message carries the deadline. Return a `notified: false` flag when the notification failed so the modal can say the task went out but the message did not.

- [ ] **Step 3: Call it from release**

In `releaseScore`, after `released` is set and before the success toast, notify the one student. Look up `student_id` from the submission if the function does not already have it. A failed notification must not turn a successful release into a failure — the score is released either way.

- [ ] **Step 4: Build and test**

Run: `npm run build` then `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboards/teacher
git commit -m "Tell a student when a task arrives and when a score is released"
```

---

### Task 8: The student's Tasks tab

**Files:**
- Create: `src/pages/dashboards/student/tabs/TasksTab.jsx` (from `student/tabs/WorksheetsTab.jsx`)
- Delete: `src/pages/dashboards/student/tabs/WorksheetsTab.jsx`
- Modify: `src/pages/dashboards/student/StudentDashboard.jsx`

**Interfaces:**
- Consumes: `task_assignees`, `worksheets.task_type`, `worksheets.subject_id`, `formatCountdown`, `TASK_TYPE_LABELS`.
- Produces: the route `/student-dashboard/tasks`, accepting `?subject=<id>` — Task 9's cards link to it.

Start from the existing student `WorksheetsTab.jsx` and keep everything Phase 2 hardened: the answering view, the autosave bookkeeping, the submit flush, the release gate, the three-way load states. **Do not rewrite those.** This task changes where the list comes from and how each row is presented.

- [ ] **Step 1: Read from assignments, not postings**

Replace the `worksheet_sections` read with `task_assignees` for this student, selecting `task_id, due_at, assigned_at`. Then read the tasks by id, now also selecting `task_type` and `subject_id`, and the subject names for those ids. Sort by `assigned_at`, newest first.

- [ ] **Step 2: Add the type badge, the countdown and the subject filter**

Each row carries the type badge from `TASK_TYPE_LABELS`, the distribution date, a live countdown from `formatCountdown`, and the deadline in full. A `?subject=` query parameter filters the list; `?subject=other` shows tasks with no `subject_id`.

The countdown re-renders every second from a single interval for the whole list:

```jsx
const [now, setNow] = useState(() => new Date());
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 1000);
  return () => clearInterval(id);
}, []);
```

One interval, not one per row — a class with thirty tasks would otherwise hold thirty timers.

- [ ] **Step 3: Rename the route and the nav entry**

In `StudentDashboard.jsx`: `/worksheets` becomes `/tasks`, the label `Worksheets` becomes `Tasks`, and the import points at `TasksTab`.

- [ ] **Step 4: Build and test**

Run: `npm run build` then `npx vitest run`
Expected: clean. Grep `src/` for `student/tabs/WorksheetsTab` and confirm nothing references it.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/dashboards/student
git commit -m "Show the student their assigned tasks, typed and counting down"
```

---

### Task 9: Subject cards on the Overview

**Files:**
- Create: `src/pages/dashboards/student/SubjectCards.jsx`
- Modify: `src/pages/dashboards/student/tabs/OverviewTab.jsx`

**Interfaces:**
- Consumes: `schedules.subject_id` for the student's section, `task_assignees`, `formatCountdown`.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Build the card list**

`SubjectCards.jsx` takes `{ subjects, tasksBySubject, loading, loadError, onRetry, onOpen }` and renders one card per subject: name, pending count, and the nearest deadline as a live countdown coloured by `tone`. A subject with no tasks reads `No tasks`. An `Other` card appears only when something is in it.

The interval lives here, once, as in Task 8.

- [ ] **Step 2: Source the subjects**

In `OverviewTab.jsx`, read the subjects scheduled for the student's section(s), then their `task_assignees` rows joined to the tasks. Bucket every task by `subject_id`; anything null, or naming a subject not in the schedule, goes to `Other`.

Pending means: assigned, and no submission with status other than `in_progress`.

The existing `endOfDueDay` helper goes: deadlines now carry a real time, so the reason it existed is gone.

- [ ] **Step 3: Distinguish the empty states**

Three different things must read differently: the read failed; the section has no subjects scheduled yet; the student has no tasks. The first gets a Retry.

- [ ] **Step 4: Build and test**

Run: `npm run build` then `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/dashboards/student
git commit -m "Group the student's work into per-subject cards with a live countdown"
```

---

### Task 10: Retire the Assignments and Quizzes tabs

**Files:**
- Delete: `src/pages/dashboards/student/tabs/AssignmentsTab.jsx`, `src/pages/dashboards/student/tabs/QuizzesTab.jsx`
- Modify: `src/pages/dashboards/student/StudentDashboard.jsx`

- [ ] **Step 1: Remove them**

Delete both files, their imports, their routes and their nav entries. Drop any lucide import left unused.

- [ ] **Step 2: Check for dangling links**

```bash
grep -rn "student-dashboard/assignments\|student-dashboard/quizzes\|AssignmentsTab\|QuizzesTab" src/ | grep -v archives
```

Expected: no output. Anything that appears is a link to a route that no longer exists — fix it rather than leaving it.

- [ ] **Step 3: Build and test**

Run: `npm run build` then `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/dashboards/student
git commit -m "Retire the student Assignments and Quizzes tabs"
```

---

## Self-Review

**Spec coverage.** Per-student distribution → Tasks 2, 3, 6. Advisory/handled choice and checkboxes → Task 6. Date and time → Tasks 1, 6. `task_type` → Tasks 1, 2, 5, 8. Subject from teaching load → Task 5. One-subject rule → Task 5. Late marking → Tasks 1, 2, 3. Notifications and their policies → Tasks 4, 7. Subject cards with countdown → Task 9. `Other` card → Task 9. Tasks tab → Task 8. Retiring two tabs → Task 10. Distribute replacing Post → Task 6. Tightened student read path → Task 3.

**Placeholders.** Tasks 6, 8 and 9 describe behaviour in prose where the file is long and the surrounding code must be preserved; each names the exact file, the exact reads, and the exact states required. Tasks 1-5, 7 and 10 carry complete code.

**Type consistency.** `mySubject` is `{ id, name } | null` in Task 5 and read as `.name`/`.id` in Task 5 only. `loadAssignees` returns an array or `null` in Task 6 and its `null` is handled in `distributeTask`. `distributeTask` returns `{ ok, added, skipped, message }` and Task 7 consumes `added`. `formatCountdown` returns `{ text, tone, isLate }` in Task 1 and is read for `tone` in Tasks 8 and 9.

**Known ordering risk.** Task 3 replaces `ws_worksheets_student_read` with a policy keyed on `task_assignees`, so between running phase3-02 and a teacher distributing anything, students see no tasks. That is correct — nothing has been assigned yet — but the user should be told before running it, not after.
