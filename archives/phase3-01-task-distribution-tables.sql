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
