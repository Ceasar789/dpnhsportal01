-- Removes only the attendance save function and the daily unique index, and
-- reloads the API schema. No row, table, policy or other function is changed.
-- Run only if attendance-save.sql must be undone. Safe to run twice.
BEGIN;

DO $guard$
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'attendance_save_requires_postgres';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.eduscribe_attendance_save_v1(uuid, date, jsonb);
DROP INDEX IF EXISTS public.attendance_daily_unique;
NOTIFY pgrst, 'reload schema';
COMMIT;
