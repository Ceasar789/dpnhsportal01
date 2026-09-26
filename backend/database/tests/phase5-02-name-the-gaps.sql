-- ============================================
-- PHASE 5 / 02 — Name the two gaps phase5-01 counted
--
-- Run in: Supabase SQL Editor, WITHOUT RLS. Read only.
--
-- The suite reported "9 tables with RLS on and zero policies" and "5 policies
-- granting unconditional access" as counts. A count is not actionable. This
-- names them.
--
-- ── Why each matters ─────────────────────────────────────────────────────
--
-- RLS on with no policy is DEFAULT DENY, not weak security: the table reads
-- as empty for every user, forever, with no error. That is indistinguishable
-- from "no data yet" — the exact failure this project has chased repeatedly
-- — so any feature touching one of those tables is silently broken.
--
-- An unconditional policy (qual or with_check = true) is the opposite
-- mistake: every logged-in account can do that operation on every row. Some
-- are legitimate — a lookup table everybody may read, such as subjects — so
-- these need judgement, not a blanket fix.
-- ============================================

-- ══ 1. Tables with RLS on and no policy — read as empty for everyone ═════
--
-- The `rows` column decides what to do with each:
--   rows > 0, and a screen uses it   → a real bug, the data is unreachable
--   rows = 0, unused feature         → harmless, but turn RLS off or add a
--                                      policy so the next reader is not misled
SELECT
  c.relname                         AS table_name,
  (SELECT n_live_tup FROM pg_stat_user_tables s
    WHERE s.relname = c.relname)    AS approx_rows,
  'RLS on, 0 policies — reads as EMPTY for every user' AS effect
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY approx_rows DESC NULLS LAST, c.relname;

-- ══ 2. Policies that grant unconditional access ══════════════════════════
--
-- `cmd` says how much this gives away. SELECT on a lookup table is usually
-- fine; ALL, INSERT, UPDATE or DELETE without a condition means any
-- logged-in account can write anything in that table.
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  CASE
    WHEN qual = 'true' AND with_check = 'true' THEN 'reads AND writes unconditional'
    WHEN qual = 'true'                          THEN 'reads unconditional'
    ELSE                                             'writes unconditional'
  END AS what_is_open
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY
  CASE cmd WHEN 'ALL' THEN 1 WHEN 'INSERT' THEN 2 WHEN 'UPDATE' THEN 3
           WHEN 'DELETE' THEN 4 ELSE 5 END,
  tablename;

-- ══ 3. Which of the policy-less tables the application actually reads ════
--
-- Cross-check this list against the codebase before deciding anything:
--
--   grep -rn "from('<table>')" frontend/src backend/src
--
-- A table with no policies AND no code touching it is dead weight. A table
-- with no policies that the code DOES read is a feature that silently shows
-- nothing, and that is the one to fix first.
