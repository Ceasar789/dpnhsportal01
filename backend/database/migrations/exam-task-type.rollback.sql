-- Restores the four-value task_type check from before exam-task-type.sql.
-- It refuses to run while any worksheet is an exam: those rows would break the
-- old check, and they must be changed or deleted on purpose, never silently.
-- Nothing else is changed. Safe to run twice.
BEGIN;

-- No new exam can be written between the count and the new constraint.
LOCK TABLE public.worksheets IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_count FROM public.worksheets WHERE task_type = 'exam';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'exam_task_type_rollback_blocked: % worksheet(s) still have task_type exam. Change or delete them first; nothing was changed.', v_count;
  END IF;
END $$;

ALTER TABLE public.worksheets DROP CONSTRAINT IF EXISTS worksheets_task_type_check;
ALTER TABLE public.worksheets ADD CONSTRAINT worksheets_task_type_check
  CHECK (task_type IN ('worksheet','assignment','quiz','project'));

COMMIT;
