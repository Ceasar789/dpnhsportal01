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
