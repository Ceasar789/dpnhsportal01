-- ============================================================
-- PHASE 8 / 01 — Profile authorization hardening
--
-- Apply only after the isolated Phase 8 authorization suite passes. Profile
-- creation, deletion, and trusted activation remain owned by the Express
-- service-role client; authenticated browsers receive no INSERT/DELETE policy.
-- ============================================================

BEGIN;

-- Refuse to proceed if an unreviewed permissive policy has appeared since the
-- live baseline was captured. Silently leaving one behind could OR it with the
-- replacements below and reopen access.
DO $$
DECLARE
  unexpected_policies text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO unexpected_policies
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname NOT IN (
      'admins_manage_profiles',
      'Users can view own profile',
      'admins_select_profiles',
      'profiles_read',
      'Users can update own profile',
      'admins_update_profiles',
      'profiles_owner_update',
      'profiles_main_admin_update'
    );

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Unreviewed profiles policies must be assessed before migration: %', unexpected_policies;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_main_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'main_admin'
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_profile_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('main_admin', 'admin', 'registrar', 'teacher', 'faculty')
      AND status = 'active'
  );
$$;

-- Establish the complete callable ACL instead of relying on function defaults
-- or grants retained by CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public.is_main_admin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_active_profile_staff() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_main_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_profile_staff() TO authenticated;

-- PostgreSQL ORs permissive policies. Remove every reviewed live/historical
-- policy before installing the operation-specific set.
DROP POLICY IF EXISTS "admins_manage_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "admins_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "admins_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_owner_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_main_admin_update" ON public.profiles;

CREATE POLICY profiles_read
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_active_profile_staff()
);

CREATE POLICY profiles_owner_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_main_admin_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_main_admin())
WITH CHECK (public.is_main_admin());

-- One authoritative BEFORE trigger handles field ownership, privilege changes,
-- photo-limit accounting, and updated_at. Consolidating these rules avoids any
-- dependency on PostgreSQL's alphabetical ordering of same-kind triggers.
CREATE OR REPLACE FUNCTION public.enforce_profile_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_is_main_admin boolean := false;
BEGIN
  IF caller_id IS NOT NULL THEN
    caller_is_main_admin := public.is_main_admin();

    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Profile account ownership cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Email and profile audit fields are managed by the system'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.photo_change_count IS DISTINCT FROM OLD.photo_change_count
       OR NEW.photo_change_window_start IS DISTINCT FROM OLD.photo_change_window_start THEN
      RAISE EXCEPTION 'Profile photo tracking fields are managed by the system'
        USING ERRCODE = '42501';
    END IF;

    -- A Main Admin may manage another account's assigned department, role, and
    -- status. Self role/status changes remain forbidden to prevent direct
    -- promotion, self-demotion, and status-based policy inconsistencies.
    IF NEW.department IS DISTINCT FROM OLD.department
       AND NOT caller_is_main_admin THEN
      RAISE EXCEPTION 'Only an active main administrator may change a department'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT caller_is_main_admin OR caller_id = OLD.id THEN
        RAISE EXCEPTION 'Only an active main administrator may change another account role or status'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- The tracking columns were validated above before this function changes
  -- them. Clients therefore cannot reset the counter, while legitimate photo
  -- changes still receive the same rolling seven-day enforcement as live.
  IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    IF now() - OLD.photo_change_window_start > interval '7 days' THEN
      NEW.photo_change_count := 1;
      NEW.photo_change_window_start := now();
    ELSIF OLD.photo_change_count >= 3 THEN
      RAISE EXCEPTION 'Photo change limit reached (3 per 7 days). Try again after %.',
        to_char(OLD.photo_change_window_start + interval '7 days', 'Mon DD, YYYY');
    ELSE
      NEW.photo_change_count := OLD.photo_change_count + 1;
      NEW.photo_change_window_start := OLD.photo_change_window_start;
    END IF;
  END IF;

  -- Ignore caller-supplied updated_at and always generate it in the database.
  -- This remains compatible with existing clients that currently send it.
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_update_rules() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_profile_privileges ON public.profiles;
DROP TRIGGER IF EXISTS trg_enforce_photo_change_limit ON public.profiles;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS enforce_profile_update_rules ON public.profiles;

-- Retire the two superseded trigger functions after their triggers are gone.
-- update_updated_at_column() is shared elsewhere and is intentionally kept.
DROP FUNCTION IF EXISTS public.prevent_self_privilege_change();
DROP FUNCTION IF EXISTS public.enforce_photo_change_limit();

CREATE TRIGGER enforce_profile_update_rules
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_update_rules();

-- Postflight assertions make an incomplete policy replacement fail the same
-- transaction instead of deploying a partially understood authorization set.
DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles';

  IF policy_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly 3 profiles policies after migration, found %', policy_count;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND tablename = 'profiles'
         AND policyname = 'profiles_read' AND cmd = 'SELECT'
         AND roles = ARRAY['authenticated'::name]
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND tablename = 'profiles'
         AND policyname = 'profiles_owner_update' AND cmd = 'UPDATE'
         AND roles = ARRAY['authenticated'::name]
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND tablename = 'profiles'
         AND policyname = 'profiles_main_admin_update' AND cmd = 'UPDATE'
         AND roles = ARRAY['authenticated'::name]
     ) THEN
    RAISE EXCEPTION 'Profiles policy names, operations, or target roles do not match the approved set';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND cmd IN ('ALL', 'INSERT', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'Authenticated profile INSERT, DELETE, or ALL policy remains after migration';
  END IF;
END;
$$;

COMMIT;
