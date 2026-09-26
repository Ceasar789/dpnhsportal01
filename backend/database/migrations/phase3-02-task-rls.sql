-- ============================================
-- PHASE 3 / 02 — Distribution policies, and lateness
--
-- Phase 2 let a student read a worksheet posted to any section they were
-- enrolled in. Distribution is now per student, so the gate moves: a student
-- reads a task only if they were actually given it.
--
-- Depends on phase3-01 and on phase2-02 having been run. Safe to run twice.
--
-- SUPERSEDES four objects from phase2-02-worksheet-rls.sql: the policies
-- ws_items_read, ws_worksheets_student_read and ws_sections_read, and the
-- body of guard_worksheet_submission_write. Re-running phase2-02 after this
-- file reverts all four to their Phase 2 bodies with no error — if that ever
-- happens, re-run this file again afterwards.
--
-- WARNING: backend/database/migrations/phase3-04-assignee-read-scope.sql supersedes one object
-- this file creates — the policy task_assignees_teacher_all. If phase3-04
-- has already been run against this database, re-running this file reverts
-- that policy to its Phase 3/02 (FOR ALL) body with no error, and phase3-04
-- must be re-run afterwards to restore the split SELECT/INSERT/UPDATE/DELETE
-- policies.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

-- Deliberately does NOT require the student's enrolment (section_students) to
-- still be active: the assignment itself is the grant, made once at
-- distribution time, and a student who has since left the section should not
-- lose read access to work they actually did. Do not add an active-enrolment
-- check here.
CREATE OR REPLACE FUNCTION student_assigned_task(p_task_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignees
    WHERE task_id = p_task_id AND student_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- Same grant as student_assigned_task, but also pins the section: used only
-- on INSERT, where nothing else constrains worksheet_submissions.section_id.
-- task_assignees.section_id already carries the section the student was
-- distributed under, so it is the correct source of truth for this check —
-- not student_in_section, which is the section they currently sit in.
CREATE OR REPLACE FUNCTION student_assigned_task_in_section(p_task_id UUID, p_section_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_assignees
    WHERE task_id = p_task_id AND student_id = auth.uid() AND section_id = p_section_id
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
--
-- The student branch keys on (worksheet_id, section_id) via
-- student_assigned_task_in_section, not worksheet_id alone: a worksheet
-- posted to two of a student's sections has two worksheet_sections rows, one
-- per section, but the student is only assigned under one of them. Gating on
-- worksheet_id alone let them read BOTH postings — a duplicate card on the
-- student surface (which keys one card per posting), where only the posting
-- matching their actual assignee row can be opened and the other fails
-- student_assigned_task_in_section at submission time with a bare RLS error,
-- and where they could see a deadline (due_at) for a section they were never
-- actually given the task under.
DROP POLICY IF EXISTS ws_sections_read ON worksheet_sections;
CREATE POLICY ws_sections_read ON worksheet_sections FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id)
                    OR student_assigned_task_in_section(worksheet_id, section_id));

-- The write side of worksheet_submissions must agree with the read side about
-- who holds a task, or a student who was never assigned can still POST a
-- submission through the API (landing in the teacher's grading roster for
-- work they were never given), and a student who was assigned but has since
-- left the section could read the task yet be unable to submit it. Only the
-- section test is replaced here — student_id = auth.uid() and every scoring
-- pin are unchanged from phase2-02.
--
-- INSERT additionally pins section_id to the one the student was actually
-- distributed under (student_assigned_task_in_section), not merely to a
-- section they currently sit in: nothing else validates section_id on
-- INSERT, and phase2-02's old student_in_section(section_id) check would
-- otherwise have quietly gone missing, letting an assigned student file
-- their submission under any section UUID they choose. The trigger already
-- pins section_id immutable on UPDATE, so checking it once here is enough.
DROP POLICY IF EXISTS ws_subs_student_insert ON worksheet_submissions;
CREATE POLICY ws_subs_student_insert ON worksheet_submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid()
              AND student_assigned_task_in_section(worksheet_id, section_id)
              AND status IN ('in_progress','submitted')
              AND released = FALSE
              AND score IS NULL AND total_points IS NULL
              AND checked_by IS NULL AND checked_at IS NULL);
DROP POLICY IF EXISTS ws_subs_student_update ON worksheet_submissions;
CREATE POLICY ws_subs_student_update ON worksheet_submissions FOR UPDATE TO authenticated
  USING (student_id = auth.uid() AND status <> 'checked')
  WITH CHECK (student_id = auth.uid()
              AND student_assigned_task(worksheet_id)
              AND status IN ('in_progress','submitted')
              AND released = FALSE
              AND score IS NULL AND total_points IS NULL
              AND checked_by IS NULL AND checked_at IS NULL);

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
    -- Pinned false at creation, same reasoning as submitted_at above: the
    -- client must never be the one deciding lateness, not even by omission.
    NEW.is_late := FALSE;
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
    -- Same Manila conversion as is_late below, and for the same reason: this
    -- assigns a timestamptz into a naive TIMESTAMP column, and leaving it as
    -- NOW() would store it in the session's zone (UTC on Supabase) while
    -- due_at/is_late are in Manila wall-clock time. Without this, a teacher
    -- could see a submitted_at that reads hours *before* the deadline sitting
    -- next to is_late = TRUE, which looks like the lateness flag is the bug.
    --
    -- Reminder for the next person: this repo's TIMESTAMP columns are mixed.
    -- due_at, is_late and now submitted_at are Manila wall-clock. But
    -- task_assignees.assigned_at, worksheet_sections.posted_at, and — on
    -- this very row — worksheet_submissions.created_at and .updated_at still
    -- default to CURRENT_TIMESTAMP, which is UTC wall-clock. created_at in
    -- particular sits right next to the now-Manila submitted_at: a
    -- submission started at 01:00 and submitted at 01:30 Manila time will
    -- show created_at from the previous afternoon (UTC) beside
    -- submitted_at = 01:30, making a 30-minute gap look like eight and a
    -- half hours. None of these were touched in this round and are NOT
    -- comparable to due_at/submitted_at/is_late without the same AT TIME
    -- ZONE conversion.
    NEW.submitted_at := (NOW() AT TIME ZONE 'Asia/Manila');
    SELECT due_at INTO v_due FROM task_assignees
      WHERE task_id = NEW.worksheet_id AND student_id = NEW.student_id;
    -- due_at is a naive TIMESTAMP holding the school's local wall-clock time
    -- (taskFormatting.js's combineDateAndTime writes it with no offset), but
    -- NOW() is timestamptz. Comparing them directly lets Postgres coerce
    -- due_at using the session's TimeZone setting, which on Supabase is UTC
    -- — not the school's, which is Asia/Manila (UTC+8). That silently reads
    -- up to 8 hours of genuinely-late submissions as on-time. Converting
    -- NOW() into the same Asia/Manila wall-clock space the column stores
    -- fixes that without depending on a session setting nobody will check.
    NEW.is_late := (v_due IS NOT NULL AND (NOW() AT TIME ZONE 'Asia/Manila') > v_due);
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

-- This file only replaces guard_worksheet_submission_write's BODY; the
-- trigger binding it to worksheet_submissions was created back in
-- phase2-02 and is not recreated here. Confirm it is still attached — on a
-- database where it is missing, every check above can come back green while
-- the entire student write guard (including the is_late stamp) is absent.
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'worksheet_submissions'::regclass AND NOT tgisinternal;
