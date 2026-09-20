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
-- This file also backfills task_assignees from the existing worksheet_sections
-- postings, so that once phase3-02 moves the read gate onto this table,
-- everything already posted to a section keeps working for the students
-- already enrolled in it — without the backfill, task_assignees starts empty
-- and phase3-02 would make every existing task vanish from every student.
--
-- The backfill is a ONE-TIME migration of pre-existing postings, not an
-- ongoing sync: it runs only while task_assignees is still empty (see the
-- WHERE NOT EXISTS guard below). Once Task 6 lets a teacher un-assign a
-- student — deleting their task_assignees row while the worksheet_sections
-- posting and the active enrolment both remain — a plain re-run keyed only
-- on ON CONFLICT DO NOTHING would not see a conflicting row anymore and
-- would silently re-grant a task that was deliberately taken away. Do not
-- remove the WHERE NOT EXISTS guard to "sync" this later; write a real sync
-- as its own file if that is ever needed.
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

-- Backfill: one assignee row per (worksheet, student of a section that
-- worksheet was posted to), carrying over the section's due_at and
-- posted_at. Guarded by WHERE NOT EXISTS (SELECT 1 FROM task_assignees) so
-- it only ever runs against an empty table — see the header note above for
-- why this must not be a repeatable sync. ON CONFLICT DO NOTHING is kept as
-- a second, belt-and-suspenders guard within that single run (e.g. against
-- the FROM/JOIN producing the same (task_id, student_id) pair twice), not as
-- the thing making a second invocation of this whole statement safe — the
-- WHERE NOT EXISTS is what does that.
--
-- A student qualifies either by being actively enrolled in the posted-to
-- section (the general case), or — regardless of current enrolment status —
-- by already having a submission for that worksheet. student_assigned_task()
-- deliberately keeps read access for a student who has since left a section,
-- because the assignment is the grant, not the enrolment; skipping the
-- active check entirely here would honor that for work never touched (wrong
-- — a transferred student should not receive fresh, untouched work), but
-- dropping it for work already done would silently orphan a real submission
-- (a transferred student's already-graded worksheet would lose its items,
-- its posting and its due date, leaving a bare score with nothing behind
-- it). The OR EXISTS clause is that second, narrower case only.
INSERT INTO task_assignees (task_id, student_id, section_id, due_at, assigned_at)
SELECT ws.worksheet_id, ss.student_id, ws.section_id, ws.due_at, ws.posted_at
FROM worksheet_sections ws
JOIN section_students ss ON ss.section_id = ws.section_id
WHERE (ss.status = 'active'
       OR EXISTS (
         SELECT 1 FROM worksheet_submissions s
         WHERE s.worksheet_id = ws.worksheet_id AND s.student_id = ss.student_id
       ))
  AND NOT EXISTS (SELECT 1 FROM task_assignees)
ON CONFLICT (task_id, student_id) DO NOTHING;

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

-- How many assignee rows the backfill produced. Compare against
-- SELECT COUNT(*) FROM worksheet_sections to sanity-check: this will usually
-- be larger (one row per student per posting, not one row per posting).
SELECT COUNT(*) AS task_assignees_backfilled FROM task_assignees;
