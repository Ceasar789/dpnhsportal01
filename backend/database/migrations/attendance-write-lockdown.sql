-- Makes eduscribe_attendance_save_v1 the only way a teacher can write
-- public.attendance. Apply after attendance-save.sql, then run
-- attendance-write-lockdown.selftest.sql. Run as postgres in one transaction.
--
-- Before: attendance_staff_write (FOR ALL) let any adviser or subject teacher of
-- a section insert, update and delete its rows directly through the API.
-- After:
-- 1. attendance_staff_read: admins, a section's subject teachers and its
--    adviser keep SELECT on that section's rows.
-- 2. attendance_admin_write: admins keep full direct access.
-- 3. attendance_student_read is not touched: a student reads their own rows.
-- 4. anon loses INSERT, UPDATE, DELETE and TRUNCATE on the table. authenticated
--    keeps its table privileges because admin writes run as authenticated and
--    are limited by RLS; the save function runs as its owner (postgres) and
--    needs no grant on the table.
-- The last block checks the policy set and raises if it is wrong, so nothing
-- commits unless the result is exactly the three expected policies.
BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'attendance_lockdown_requires_postgres';
  END IF;

  IF pg_catalog.to_regclass('public.attendance') IS NULL THEN
    RAISE EXCEPTION 'attendance_lockdown_missing_table: public.attendance';
  END IF;

  SELECT pg_catalog.string_agg(e.signature, ', ') INTO v_missing
    FROM (VALUES ('public.is_admin()'), ('public.teacher_handles_section(uuid)'),
      ('public.teacher_advises_section(uuid)'),
      ('public.eduscribe_attendance_save_v1(uuid,date,jsonb)')) AS e(signature)
    WHERE pg_catalog.to_regprocedure(e.signature) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_lockdown_missing_functions: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.role_name, ', ') INTO v_missing
    FROM (VALUES ('authenticated'), ('anon')) AS e(role_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = e.role_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_lockdown_missing_roles: %', v_missing;
  END IF;
END
$guard$;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_staff_write ON public.attendance;

DROP POLICY IF EXISTS attendance_staff_read ON public.attendance;
CREATE POLICY attendance_staff_read ON public.attendance FOR SELECT TO authenticated
  USING (public.is_admin() OR public.teacher_handles_section(section_id)
    OR public.teacher_advises_section(section_id));

DROP POLICY IF EXISTS attendance_admin_write ON public.attendance;
CREATE POLICY attendance_admin_write ON public.attendance FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.attendance FROM anon;

NOTIFY pgrst, 'reload schema';

DO $assert$
DECLARE
  v_policies text[];
BEGIN
  SELECT pg_catalog.array_agg(p.policyname::text ORDER BY p.policyname) INTO v_policies
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'attendance';
  IF v_policies IS DISTINCT FROM
      ARRAY['attendance_admin_write', 'attendance_staff_read', 'attendance_student_read'] THEN
    RAISE EXCEPTION 'attendance_lockdown_unexpected_policies: %', v_policies;
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
      WHERE c.oid = 'public.attendance'::regclass) THEN
    RAISE EXCEPTION 'attendance_lockdown_rls_disabled';
  END IF;
END
$assert$;

COMMIT;
