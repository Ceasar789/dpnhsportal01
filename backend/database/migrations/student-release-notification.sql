-- Notifies a student when a teacher releases their result. Apply after
-- worksheet-score-release.sql and auto-score-submission.sql, then run
-- student-release-notification.selftest.sql. Run as postgres in one transaction.
--
-- One AFTER UPDATE trigger on worksheet_submissions, fired only when released
-- goes from not-true to true. Every teacher release (Release, Release all, and
-- Release after "Accept provisional marks") goes through
-- eduscribe_worksheet_score_release_v1, which is such an UPDATE, so one trigger
-- covers them all without editing that function.
--
-- Not notified:
-- * the instant auto-release when a student submits an Auto worksheet with no
--   essay: the scorer runs inside the submit trigger and turns the
--   transaction-local flag eduscribe.auto_score on around its own UPDATE, the
--   same test guard_worksheet_submission_write uses (flag on AND
--   pg_trigger_depth() > 1, which a client cannot arrange). The student already
--   sees the score in the submit toast.
-- * a row inserted with released already true (the trigger is UPDATE only).
-- * a second release of the same submission: the trigger needs released to
--   change, and a submission that already has its release notification never
--   gets another.
--
-- The message names only the worksheet title: no score, answers or key. If the
-- notification cannot be written, the release still succeeds (it is skipped
-- with a warning, never an error).
BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'release_notification_requires_postgres';
  END IF;

  SELECT pg_catalog.string_agg(e.object_name, ', ') INTO v_missing
    FROM (VALUES ('public.worksheet_submissions'), ('public.worksheets'), ('public.notifications'))
      AS e(object_name)
    WHERE pg_catalog.to_regclass(e.object_name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'release_notification_missing_tables: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.table_name || '.' || e.column_name, ', ') INTO v_missing
    FROM (VALUES
      ('worksheet_submissions', 'id'), ('worksheet_submissions', 'worksheet_id'),
      ('worksheet_submissions', 'student_id'), ('worksheet_submissions', 'released'),
      ('worksheets', 'id'), ('worksheets', 'title'),
      ('notifications', 'user_id'), ('notifications', 'title'), ('notifications', 'message'),
      ('notifications', 'notification_type'), ('notifications', 'related_entity_type'),
      ('notifications', 'related_entity_id'), ('notifications', 'action_url')) AS e(table_name, column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = e.table_name
        AND c.column_name = e.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'release_notification_missing_columns: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.signature, ', ') INTO v_missing
    FROM (VALUES ('public.eduscribe_worksheet_score_release_v1(uuid,jsonb)'),
      ('public.eduscribe_auto_score_submission_v1(uuid)')) AS e(signature)
    WHERE pg_catalog.to_regprocedure(e.signature) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'release_notification_missing_functions: %', v_missing;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.eduscribe_notify_student_release_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_title text;
BEGIN
  -- The scorer's instant release at submit: the student already saw the score.
  IF pg_catalog.current_setting('eduscribe.auto_score', true) = 'on'
     AND pg_catalog.pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  IF NEW.id IS NULL OR NEW.student_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- Once per submission, even if it is unreleased and released again.
    IF EXISTS (SELECT 1 FROM public.notifications n
        WHERE n.user_id = NEW.student_id
          AND n.related_entity_type = 'worksheet_submission'
          AND n.related_entity_id = NEW.id) THEN
      RETURN NULL;
    END IF;

    SELECT NULLIF(pg_catalog.btrim(w.title), '') INTO v_title
      FROM public.worksheets w WHERE w.id = NEW.worksheet_id;

    INSERT INTO public.notifications
      (user_id, title, message, notification_type, related_entity_type, related_entity_id, action_url)
    VALUES (
      NEW.student_id,
      'Result ready',
      CASE WHEN v_title IS NULL THEN 'Your result is ready.'
        ELSE pg_catalog.format('Your result for "%s" is ready.', pg_catalog.left(v_title, 200)) END,
      'task',
      'worksheet_submission',
      NEW.id,
      '/student-dashboard/tasks?view=done');
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the release over a notification.
    RAISE WARNING 'eduscribe_notify_student_release_v1: skipped for submission %', NEW.id;
  END;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_notify_student_release ON public.worksheet_submissions;
CREATE TRIGGER trg_notify_student_release
  AFTER UPDATE OF released ON public.worksheet_submissions
  FOR EACH ROW
  WHEN (NEW.released IS TRUE AND OLD.released IS DISTINCT FROM TRUE)
  EXECUTE FUNCTION public.eduscribe_notify_student_release_v1();

-- Nothing here is callable by a client role: only the trigger runs it.
ALTER FUNCTION public.eduscribe_notify_student_release_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_notify_student_release_v1()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
