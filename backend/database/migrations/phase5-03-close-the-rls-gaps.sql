-- ============================================
-- PHASE 5 / 03 — Close the gaps phase5-01 found
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS).
-- Idempotent. Re-runnable.
--
-- Five things, from one run of the RLS test suite.
--
-- ── Three features that never worked ─────────────────────────────────────
--
-- pre_enrollment, documents and grades each had RLS switched ON and not a
-- single policy. That is not weak security, it is DEFAULT DENY on every
-- command: nobody could read them and nobody could write them. All three
-- were empty, and the reason they were empty is that the database refused
-- every insert — the registrar's enrolment queue, the registrar's document
-- records and the teacher's grade sheet, all reachable in the UI, all
-- silently doing nothing since the day RLS was enabled.
--
-- No unit test could have caught this. The application code is correct.
--
-- ── Two policies that gave away too much ─────────────────────────────────
--
-- profiles was readable in full by every authenticated account. The table
-- holds phone, date_of_birth and address, so any of the sixty seeded
-- students could read every classmate's and every teacher's home address.
--
-- memos was readable by every authenticated account, although the table has
-- sender_id and recipient_id — the messages are addressed, not broadcast,
-- so students could read staff correspondence not sent to them.
--
-- ── What this does NOT fix, stated plainly ───────────────────────────────
--
-- RLS is row-level. It cannot hide `phone` while showing `name`. Hiding
-- columns needs column privileges, and five places in the app call
-- select('*') on profiles — revoking a column would fail those with
-- "permission denied for column" rather than omitting it quietly.
--
-- So this narrows WHICH ROWS a student may read, not which columns. A
-- student can no longer enumerate the whole school; they see themselves,
-- the staff they need names for, and their own classmates. Their
-- classmates' phone numbers are still visible to them. Closing that
-- properly means a view with a narrowed column list and changing every
-- select('*') to name its columns — worth doing, bigger than this file.
-- ============================================


-- ── Helpers ───────────────────────────────────────────────────────────────

-- is_school_staff() deliberately excludes teachers (it is used where only
-- office staff belong). Profile and memo visibility needs the wider set:
-- anyone who works here.
CREATE OR REPLACE FUNCTION is_any_staff()
RETURNS BOOLEAN AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('main_admin', 'admin', 'registrar', 'teacher', 'faculty')
  );
$fn$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- SECURITY DEFINER because a policy on profiles that reads section_students
-- directly would re-enter that table's own policies, and section_students'
-- policy reads profiles. The recursion is not theoretical — Postgres raises
-- "infinite recursion detected in policy". Every existing helper in this
-- schema is written this way for the same reason.
CREATE OR REPLACE FUNCTION shares_section_with(p_other UUID)
RETURNS BOOLEAN AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM section_students mine
    JOIN section_students theirs ON theirs.section_id = mine.section_id
    WHERE mine.student_id = auth.uid() AND mine.status = 'active'
      AND theirs.student_id = p_other  AND theirs.status = 'active'
  );
$fn$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;


-- ══ 1. profiles — narrow the unconditional read ═══════════════════════════
DROP POLICY IF EXISTS authenticated_users_view_profiles ON profiles;
DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()                     -- your own record
    OR is_any_staff()                   -- staff need the whole directory
    -- Staff are directory-visible to everyone: a student has to be able to
    -- see their teacher's name on a task, an adviser's name on a section.
    OR role IN ('main_admin', 'admin', 'registrar', 'teacher', 'faculty')
    OR shares_section_with(id)          -- a student sees their own classmates
  );

-- Writes were already guarded: profiles_update_own and the
-- guard_profile_privileges trigger from fix-privilege-escalation.sql. Left
-- untouched — this file only narrows the read.


-- ══ 2. memos — addressed mail, not a noticeboard ══════════════════════════
DROP POLICY IF EXISTS authenticated_view_memos ON memos;
DROP POLICY IF EXISTS memos_read ON memos;
CREATE POLICY memos_read ON memos FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS memos_write ON memos;
CREATE POLICY memos_write ON memos FOR ALL TO authenticated
  USING (sender_id = auth.uid() OR is_admin())
  WITH CHECK (sender_id = auth.uid() OR is_admin());


-- ══ 3. pre_enrollment — the registrar's queue ═════════════════════════════
-- Read by the registrar and by faculty (both have a PreEnrollmentTab), and
-- by the applicant themselves. Written by the registrar and admin, who are
-- the only ones who may approve or reject.
DROP POLICY IF EXISTS pre_enrollment_read ON pre_enrollment;
CREATE POLICY pre_enrollment_read ON pre_enrollment FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_any_staff());

DROP POLICY IF EXISTS pre_enrollment_write ON pre_enrollment;
CREATE POLICY pre_enrollment_write ON pre_enrollment FOR ALL TO authenticated
  USING (is_school_staff())
  WITH CHECK (is_school_staff());


-- ══ 4. documents — a student's records ════════════════════════════════════
-- The student may see their own; office staff may see and manage all. A
-- teacher is deliberately excluded: these are registrar records, not
-- classroom material.
DROP POLICY IF EXISTS documents_read ON documents;
CREATE POLICY documents_read ON documents FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_school_staff());

DROP POLICY IF EXISTS documents_write ON documents;
CREATE POLICY documents_write ON documents FOR ALL TO authenticated
  USING (is_school_staff())
  WITH CHECK (is_school_staff());


-- ══ 5. grades ═════════════════════════════════════════════════════════════
-- A student reads their own. A teacher reads and writes the grades of
-- students they actually teach — teaches_student() checks the section
-- roster, so a teacher cannot grade a class that is not theirs. Admin has
-- the lot.
--
-- Note this table is separate from worksheet scoring, which lives in
-- worksheet_submissions and has its own policies. The capstone's approved
-- scope excludes a full gradebook; these policies make the existing screen
-- work rather than expanding it.
DROP POLICY IF EXISTS grades_read ON grades;
CREATE POLICY grades_read ON grades FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR teacher_id = auth.uid()
    OR teaches_student(student_id)
    OR is_admin()
  );

DROP POLICY IF EXISTS grades_write ON grades;
CREATE POLICY grades_write ON grades FOR ALL TO authenticated
  USING (teacher_id = auth.uid() OR teaches_student(student_id) OR is_admin())
  WITH CHECK (teacher_id = auth.uid() OR teaches_student(student_id) OR is_admin());


-- ══ 6. The six dead tables ════════════════════════════════════════════════
-- assignments, assignment_submissions, quizzes, quiz_results,
-- class_announcements and ilaw_lesson_plans also have RLS on with no
-- policies. Deliberately left that way.
--
-- Nothing reads them. The only references are src/lib/db.js, which nothing
-- imports, and two .orig backup files. Four of them were superseded by
-- worksheets and task_assignees in Phase 3.
--
-- Default deny on an unused table is the safe state. Adding policies would
-- open tables no feature needs; dropping the tables is a decision for
-- whoever confirms the features are gone for good.


-- ============================================
-- VERIFY — expect ZERO rows from the first, and the five tables listed in
-- the second with their new policies.
-- ============================================

-- Any table still RLS-on-with-no-policy that the application actually uses.
-- The six dead ones are expected here; anything else is a new gap.
SELECT c.relname AS table_still_denying_everything
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname)
  AND c.relname NOT IN ('assignments', 'assignment_submissions', 'quizzes',
                        'quiz_results', 'class_announcements', 'ilaw_lesson_plans')
ORDER BY c.relname;

-- The policies this file created.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'memos', 'pre_enrollment', 'documents', 'grades')
ORDER BY tablename, cmd, policyname;

-- Unconditional policies remaining. Expect three, all SELECT, all
-- legitimate: calendar_events and school_settings are public by design, and
-- subjects is a lookup table everyone must read.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename;
