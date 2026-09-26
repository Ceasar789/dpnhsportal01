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
