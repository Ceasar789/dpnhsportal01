-- Undoes attendance-write-lockdown.sql: restores attendance_staff_write exactly
-- as phase2-03-attendance-rls.sql created it (FOR ALL, TO authenticated, same
-- USING and WITH CHECK) and drops attendance_staff_read and
-- attendance_admin_write. Nothing else changes: attendance_student_read, RLS
-- and the anon privileges stay as they are. Run only if the lockdown must be
-- undone, as postgres. Safe to run twice.
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
      ('public.teacher_advises_section(uuid)')) AS e(signature)
    WHERE pg_catalog.to_regprocedure(e.signature) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_lockdown_missing_functions: %', v_missing;
  END IF;
END
$guard$;

DROP POLICY IF EXISTS attendance_staff_read ON public.attendance;
DROP POLICY IF EXISTS attendance_admin_write ON public.attendance;

DROP POLICY IF EXISTS attendance_staff_write ON public.attendance;
CREATE POLICY attendance_staff_write ON public.attendance FOR ALL TO authenticated
  USING (public.is_admin() OR public.teacher_handles_section(section_id)
    OR public.teacher_advises_section(section_id))
  WITH CHECK (public.is_admin() OR public.teacher_handles_section(section_id)
    OR public.teacher_advises_section(section_id));

NOTIFY pgrst, 'reload schema';
COMMIT;
