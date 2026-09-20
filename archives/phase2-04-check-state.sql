-- ============================================
-- PHASE 2 / 04 — Read-only state check
--
-- Changes nothing. Run it after phase2-01, 02 and 03 to confirm what the
-- live database actually has, rather than what the files say it should.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

-- A. The important one.
--
-- Look at the `worksheets` row. A table with RLS enabled and no policy for a
-- role is default-deny for that role — this project has been bitten by that
-- repeatedly.
--
--   rls_on = true, and ws_worksheets_student_read is the ONLY policy
--     -> the teacher cannot read their own worksheets. The Worksheets tab is
--        blank. Needs a teacher policy before any testing.
--   rls_on = false
--     -> the policy we added does nothing, and every signed-in user can read
--        every teacher's worksheets. Does not block testing; should be closed
--        before this is submitted.
--   rls_on = true, with teacher/admin policies alongside it
--     -> correct, nothing to do.
--
-- The other six tables should each show rls_on = true and several policies.
SELECT c.relname                              AS table_name,
       c.relrowsecurity                       AS rls_on,
       COALESCE(p.policyname, '(no policy)')  AS policyname,
       p.cmd
FROM pg_class c
LEFT JOIN pg_policies p
       ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname IN ('worksheets','worksheet_sections','worksheet_items',
                    'worksheet_item_keys','worksheet_submissions',
                    'worksheet_answers','attendance')
ORDER BY c.relname, p.cmd, p.policyname;

-- B. Confirms phase2-02 is the current version rather than an earlier one.
-- Expect exactly these two:
--   guard_worksheet_item_delete  on worksheet_items
--   guard_worksheet_submission_write on worksheet_submissions
SELECT c.relname AS on_table, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND c.relname IN ('worksheet_items','worksheet_submissions')
ORDER BY c.relname, t.tgname;

-- C. The eight helper functions phase2-02 defines, plus the four from
-- phase1-03 it depends on. Expect 12 rows.
SELECT proname
FROM pg_proc
WHERE proname IN (
  'teacher_owns_worksheet','teacher_owns_item','student_can_see_worksheet',
  'own_submission','submission_open','item_belongs_to_submission',
  'guard_worksheet_submission_write','guard_worksheet_item_delete',
  'is_admin','student_in_section','teacher_handles_section','teacher_advises_section'
)
ORDER BY proname;

-- D. The student write path on worksheet_submissions.
-- Expect ws_subs_student_insert (INSERT) and ws_subs_student_update (UPDATE).
-- If you see ws_subs_student_write (ALL) instead, phase2-02 is an old copy:
-- that version let a student DELETE their submitted row and start over.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'worksheet_submissions'
ORDER BY policyname;

-- E. Posting a worksheet must be limited to sections the teacher actually
-- teaches or advises. The `qual` below must mention teacher_handles_section.
-- If it only mentions teacher_owns_worksheet, phase2-02 is an old copy and a
-- teacher can post to any section in the school through the API.
SELECT policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'worksheet_sections'
  AND policyname = 'ws_sections_write';
