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
  -- auth.uid() IS NULL means this write did not come through a user session
  -- at all (Supabase SQL Editor, service role, seed/migration scripts) — it
  -- is not a student bypass, so let it through unguarded.
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

  -- From here on TG_OP = 'UPDATE'.
  IF NEW.score        IS DISTINCT FROM OLD.score
     OR NEW.total_points IS DISTINCT FROM OLD.total_points
     OR NEW.released     IS DISTINCT FROM OLD.released
     OR NEW.checked_by   IS DISTINCT FROM OLD.checked_by
     OR NEW.checked_at   IS DISTINCT FROM OLD.checked_at THEN
    RAISE EXCEPTION 'Only the worksheet owner may set scoring fields';
  END IF;

  IF NEW.remarks      IS DISTINCT FROM OLD.remarks
     OR NEW.source       IS DISTINCT FROM OLD.source
     OR NEW.worksheet_id IS DISTINCT FROM OLD.worksheet_id
     OR NEW.section_id   IS DISTINCT FROM OLD.section_id THEN
    RAISE EXCEPTION 'Students may not change these fields on their submission';
  END IF;

  -- Status may only move in_progress -> in_progress (no-op), in_progress ->
  -- submitted (server sets submitted_at and stamps is_late), or submitted ->
  -- submitted (no-op). Anything else, including submitted -> in_progress, is
  -- rejected.
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
