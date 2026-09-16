-- ============================================
-- FIX: Privilege escalation via self-service profile update
--
-- PROBLEM: the policy "Users can update own profile" was
--     FOR UPDATE USING (auth.uid() = id)
-- with no WITH CHECK and no column restriction, so any signed-in user could
-- run  update({ role: 'main_admin' })  on their own profiles row and become
-- an administrator permanently.
--
-- FIX: a BEFORE UPDATE trigger that rejects any change to `role` or `status`
-- unless the caller is already an admin. A trigger is used rather than a
-- WITH CHECK clause because a policy on `profiles` that sub-selects from
-- `profiles` re-enters RLS and recurses infinitely. SECURITY DEFINER lets the
-- admin lookup inside the function bypass RLS safely.
--
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

CREATE OR REPLACE FUNCTION prevent_self_privilege_change()
RETURNS TRIGGER AS $$
BEGIN
  -- No JWT means this is a service-role / server-side connection (migrations,
  -- backup scripts, the SQL editor itself) — those are already trusted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.status IS DISTINCT FROM OLD.status) THEN

    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('main_admin', 'admin')
    ) THEN
      RAISE EXCEPTION 'Only an administrator may change a role or account status';
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS guard_profile_privileges ON profiles;
CREATE TRIGGER guard_profile_privileges
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_self_privilege_change();


-- ============================================
-- VERIFICATION — run these after the above, and read the results.
-- ============================================

-- 1. Confirm the trigger is installed. Expect exactly one row.
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'profiles'::regclass AND NOT tgisinternal;

-- 2. Look for dangerously permissive policies on ANY table.
--    Expect ZERO rows. Any row returned here is a table that every logged-in
--    user can read and write freely — drop those policies.
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true');

-- 3. List every table that has RLS turned OFF entirely.
--    Anything sensitive appearing here is fully exposed.
SELECT tablename FROM pg_tables t
WHERE schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = t.tablename AND c.relrowsecurity
  );
