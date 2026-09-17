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

CREATE OR REPLACE FUNCTION is_school_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('main_admin', 'admin', 'registrar')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION teacher_advises_section(p_section_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM sections
    WHERE id = p_section_id AND adviser_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION staff_can_see_student(p_student_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM section_students ss
    JOIN sections s ON s.id = ss.section_id
    WHERE ss.student_id = p_student_id
      AND (
        s.adviser_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM schedules sc
          WHERE sc.section_id = ss.section_id AND sc.teacher_id = auth.uid()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER TABLE subjects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules        ENABLE ROW LEVEL SECURITY;

-- students — section_students.student_id points here, so admin must be able to
-- write this table before anyone can be placed in a class list.
DROP POLICY IF EXISTS students_read  ON students;
DROP POLICY IF EXISTS students_write ON students;
CREATE POLICY students_read  ON students FOR SELECT TO authenticated
  USING (is_school_staff() OR id = auth.uid() OR staff_can_see_student(id));
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
  USING (is_school_staff() OR adviser_id = auth.uid() OR teacher_handles_section(id) OR student_in_section(id));
CREATE POLICY sections_write ON sections FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- section_students — the class list. A student sees only their own row.
DROP POLICY IF EXISTS section_students_read  ON section_students;
DROP POLICY IF EXISTS section_students_write ON section_students;
CREATE POLICY section_students_read  ON section_students FOR SELECT TO authenticated
  USING (is_school_staff() OR teacher_handles_section(section_id) OR teacher_advises_section(section_id) OR student_id = auth.uid());
CREATE POLICY section_students_write ON section_students FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- schedules — a teacher sees their own; a student sees their section's.
DROP POLICY IF EXISTS schedules_read  ON schedules;
DROP POLICY IF EXISTS schedules_write ON schedules;
CREATE POLICY schedules_read  ON schedules FOR SELECT TO authenticated
  USING (is_school_staff() OR teacher_id = auth.uid() OR student_in_section(section_id));
CREATE POLICY schedules_write ON schedules FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- VERIFY — every table below must show policies for both SELECT and ALL.
-- Any policy name you do not recognise should be investigated before trusting the lockdown.
-- ============================================
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname IN ('subjects','teacher_subjects','sections','section_students','schedules','students')
ORDER BY c.relname, p.cmd;
