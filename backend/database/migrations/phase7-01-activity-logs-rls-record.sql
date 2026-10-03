-- ============================================
-- PHASE 7 / 01 — Record the existing activity_logs RLS policies
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS).
-- Idempotent. Re-runnable.
--
-- ── This file changes nothing ────────────────────────────────────────────
--
-- These two policies ALREADY EXIST in the live database. They were created
-- directly in the Supabase dashboard and were never written down anywhere
-- in this repository, so nobody reading the code could know the rules the
-- table enforces. This file is the record.
--
-- Applied to the current database it is a no-op in effect: it drops each
-- policy and recreates it with the same name and the same expression. The
-- value is that the next person to rebuild this schema from the repo gets
-- the same protection, instead of a table that silently accepts anything.
--
-- The policy text below is transcribed from a pg_policy export.
--
-- ── ASSUMPTION, AND IT IS NOT VERIFIED ───────────────────────────────────
--
-- The export did not include each policy's TO clause — the roles it
-- applies to. This file assumes `TO authenticated`, because:
--
--   * both expressions are built on auth.uid(), which is NULL for the anon
--     role, so neither policy can ever pass for an anonymous caller; and
--   * `TO authenticated` is what every other policy in this repository
--     uses — see phase5-03-close-the-rls-gaps.sql.
--
-- If the live policies are actually `TO public` (PostgreSQL's default when
-- no TO clause is given), then applying this file NARROWS them. In practice
-- that changes nothing, for the reason above: an anon caller fails the
-- auth.uid() test either way. But it is a real difference in the catalog,
-- and it is being written down rather than glossed over.
--
-- To check before applying:
--
--   select polname, polroles::regrole[] from pg_policy
--   where polrelid = 'public.activity_logs'::regclass;
--
-- If that returns {0} (meaning PUBLIC) rather than {authenticated}, either
-- change the two TO clauses below to `TO public`, or accept the narrowing
-- deliberately.
--
-- ── What the two policies say ────────────────────────────────────────────
--
-- INSERT: you may only write a row about YOURSELF (user_id must equal your
--   own auth uid), and only if your profile's role is main_admin or admin.
--   A teacher cannot write an audit row, and an admin cannot write one in
--   someone else's name.
--
-- SELECT: only main_admin and admin can read the audit trail at all.
--
-- There are no UPDATE and no DELETE policies, so with RLS enabled nobody
-- can edit or remove a row through PostgREST. For an audit table that is
-- the correct shape and this file does not add any.
-- ============================================

-- RLS is already enabled on this table in the live database. Stated here so
-- that a rebuild from the repo does not create an unprotected table: without
-- it, the policies below would exist but never be consulted.
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ── INSERT ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admins_insert_activity_logs ON activity_logs;
CREATE POLICY admins_insert_activity_logs ON activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    AND (EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role)::text = ANY (
          (ARRAY['main_admin'::character varying, 'admin'::character varying])::text[]
        )
    ))
  );

-- ── SELECT ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admins_select_activity_logs ON activity_logs;
CREATE POLICY admins_select_activity_logs ON activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.role)::text = ANY (
          (ARRAY['main_admin'::character varying, 'admin'::character varying])::text[]
        )
    )
  );

-- ── Verify ───────────────────────────────────────────────────────────────
-- Expect exactly two rows, INSERT and SELECT, matching the above.
--
--   select polname, polcmd,
--          pg_get_expr(polqual, polrelid)      as using_expr,
--          pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy where polrelid = 'public.activity_logs'::regclass
--   order by polname;
