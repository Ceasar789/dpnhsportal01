-- ============================================
-- PHASE 2 / 05 — Owner and admin policies on `worksheets`
--
-- Found by running phase2-04 against the live database: `worksheets` has RLS
-- enabled and exactly ONE policy — ws_worksheets_student_read, added by
-- phase2-02. A table with RLS enabled and no policy covering you is
-- default-deny, so the teacher who owns a worksheet could not read it, let
-- alone upload, edit or delete one. The whole Worksheets tab renders empty
-- and nothing can be posted, which blocks every other part of this phase.
--
-- This is not something phase2-02 broke. `worksheets` was already in the
-- "RLS on, zero policies" state this project has hit repeatedly; adding the
-- student read policy simply made it the only one and therefore visible.
--
-- Permissive policies OR together, so these widen access rather than
-- narrowing the student read that already exists.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

ALTER TABLE worksheets ENABLE ROW LEVEL SECURITY;

-- The owning teacher, for everything. worksheets.teacher_id references
-- profiles(id), which is the signed-in user's own id.
DROP POLICY IF EXISTS ws_worksheets_owner_all ON worksheets;
CREATE POLICY ws_worksheets_owner_all ON worksheets FOR ALL TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Admins, for everything. Same SECURITY DEFINER helper Phase 1 established.
DROP POLICY IF EXISTS ws_worksheets_admin_all ON worksheets;
CREATE POLICY ws_worksheets_admin_all ON worksheets FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Deliberately NOT added: a blanket read for every signed-in user. A student
-- reaches a worksheet only through ws_worksheets_student_read, which requires
-- it to have been posted to a section they are actively enrolled in — posting
-- is the gate, and that stays true here.

-- ============================================
-- VERIFY — expect three policies on `worksheets`:
--   ws_worksheets_admin_all     ALL
--   ws_worksheets_owner_all     ALL
--   ws_worksheets_student_read  SELECT
-- and rls_on = true.
-- ============================================
SELECT c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname = 'worksheets'
ORDER BY p.policyname;
