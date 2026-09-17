-- ============================================
-- PHASE 1 / 05 — RLS policy for school_settings
--
-- school_settings has RLS enabled with no policy, so every read returns zero
-- rows regardless of who asks. AuthContext.jsx fetches it on every app load
-- (even before login, to read the session-timeout setting) using
-- `.eq('id', 1).single()`. Zero rows makes `.single()` fail with
-- "Cannot coerce the result to a single JSON object" (HTTP 406), which the
-- app retries once before falling back to a default — adding a few seconds
-- of visible delay to every single page load and login.
--
-- This table holds one row of institution-level information (school name,
-- address, session timeout) — nothing student- or account-specific — so it
-- is readable by anyone, including a visitor who has not logged in yet.
-- Only an admin may change it.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_settings_read  ON school_settings;
DROP POLICY IF EXISTS school_settings_write ON school_settings;

CREATE POLICY school_settings_read ON school_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY school_settings_write ON school_settings FOR ALL
  TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- If no row exists yet, `.single()` still fails even with the policy above —
-- this seeds the one expected row so every reader gets a real result.
INSERT INTO school_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- VERIFY — expect one row here, and one row back from the row check below.
-- ============================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'school_settings';

SELECT COUNT(*) AS school_settings_rows FROM school_settings;
