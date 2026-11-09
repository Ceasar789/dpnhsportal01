-- Undoes student-release-notification.sql: drops the trigger and its function.
-- Notifications already sent stay where they are. Run as postgres, only if the
-- migration must be undone. Safe to run twice.
BEGIN;

DO $guard$
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'release_notification_requires_postgres';
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS trg_notify_student_release ON public.worksheet_submissions;
DROP FUNCTION IF EXISTS public.eduscribe_notify_student_release_v1();

NOTIFY pgrst, 'reload schema';
COMMIT;
