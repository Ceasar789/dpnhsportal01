-- ============================================
-- PHASE 3 / 04 — Decouple task_assignees reads from the teacher's CURRENT
-- schedule
--
-- SUPERSEDES one object from phase3-02-task-rls.sql: the policy
-- task_assignees_teacher_all. Re-running phase3-02 after this file reverts
-- that policy to its Phase 3/02 body with no error — if that ever happens,
-- re-run this file again afterwards. (Same warning phase3-02 and phase2-02
-- already carry about each other, extended to this file.)
--
-- Depends on phase3-01 and phase3-02 having been run. Safe to run twice.
--
-- THE BUG: task_assignees_teacher_all was FOR ALL, gated on
--   teacher_owns_worksheet(task_id)
--   AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))
-- teacher_handles_section/teacher_advises_section read the teacher's CURRENT
-- row in `schedules`/`sections`, not their schedule at the moment they
-- distributed the task. Because the policy was FOR ALL, that currency test
-- governed SELECT as well as the writes it was meant for.
--
-- Ordinary schedule maintenance — an admin moving a teacher off a section
-- next grading period — silently narrows what task_assignees returns to
-- that teacher for a task they still own and already sent. Every read
-- (the assignee count on the worksheet card, "already assigned" state when
-- re-opening Distribute) then reports fewer students than were actually
-- assigned. That is not a failed read the UI's error states can catch — it
-- is a successful read of an incomplete set, so it renders as a plain wrong
-- number ("Not distributed" for a task that plainly went out), and
-- re-ticking students who were already assigned makes the INSERT collide
-- with UNIQUE(task_id, student_id) (Postgres 23505), which the teacher then
-- sees as raw error text.
--
-- THE FIX: split the single FOR ALL policy into a SELECT policy gated on
-- ownership alone, and separate write policies (INSERT/UPDATE/DELETE — there
-- is no "ALL except SELECT" in Postgres) that keep the section-currency
-- check. That check protects something real on write — it stops a teacher
-- assigning students to a section they no longer teach or advise — so it
-- stays there. On read it was only ever hiding the teacher's own past
-- distributions, which is the defect this file removes.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

DROP POLICY IF EXISTS task_assignees_teacher_all ON task_assignees;

-- A teacher (or admin) may always SEE every assignee row for a worksheet
-- they own, regardless of whether they still handle or advise the section
-- that row's section_id points to. Ownership of the worksheet is the only
-- thing that should gate visibility of "who did I give this to" — a
-- teacher's own distribution history must not depend on their live
-- schedule.
DROP POLICY IF EXISTS task_assignees_teacher_select ON task_assignees;
CREATE POLICY task_assignees_teacher_select ON task_assignees FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(task_id));

-- Creating an assignee row (distributing to a student) still requires the
-- teacher currently handle or advise the section that student is being
-- assigned under — this is the guard that stops a teacher assigning
-- students to a section they no longer teach.
DROP POLICY IF EXISTS task_assignees_teacher_insert ON task_assignees;
CREATE POLICY task_assignees_teacher_insert ON task_assignees FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR (teacher_owns_worksheet(task_id)
                             AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))));

-- Same section-currency guard on UPDATE (e.g. changing due_at on an
-- assignee row): both the row being touched (USING) and its result
-- (WITH CHECK) must satisfy it.
DROP POLICY IF EXISTS task_assignees_teacher_update ON task_assignees;
CREATE POLICY task_assignees_teacher_update ON task_assignees FOR UPDATE TO authenticated
  USING (is_admin() OR (teacher_owns_worksheet(task_id)
                        AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))))
  WITH CHECK (is_admin() OR (teacher_owns_worksheet(task_id)
                             AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))));

-- Same section-currency guard on DELETE (unassigning a student).
DROP POLICY IF EXISTS task_assignees_teacher_delete ON task_assignees;
CREATE POLICY task_assignees_teacher_delete ON task_assignees FOR DELETE TO authenticated
  USING (is_admin() OR (teacher_owns_worksheet(task_id)
                        AND (teacher_handles_section(section_id) OR teacher_advises_section(section_id))));

-- task_assignees_student_read (a student reads only their own row) is
-- untouched by this file — it was never part of the bug.

-- ============================================
-- VERIFY — task_assignees should now show FIVE policies: the old
-- task_assignees_teacher_all must be gone, and task_assignees_teacher_select
-- must NOT mention teacher_handles_section or teacher_advises_section (those
-- two must appear only on the insert/update/delete policies).
-- ============================================
SELECT c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname = 'task_assignees' ORDER BY p.policyname;

SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'task_assignees'
ORDER BY policyname;
