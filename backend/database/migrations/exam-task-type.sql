-- Adds 'exam' to the allowed values of worksheets.task_type.
-- An exam is checked, distributed and released exactly like a quiz; only the
-- label differs. No function, policy or trigger lists task types, so the check
-- constraint from phase3-01-task-distribution-tables.sql is the only change.
-- Apply as postgres in the SQL editor, then run exam-task-type.selftest.sql.
-- Safe to run twice: the constraint is dropped by name and added again.
-- Undo with exam-task-type.rollback.sql.
BEGIN;

DO $$
DECLARE
  v_other text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'exam_task_type_requires_postgres';
  END IF;
  IF pg_catalog.to_regclass('public.worksheets') IS NULL THEN
    RAISE EXCEPTION 'exam_task_type_missing_table: public.worksheets';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'worksheets' AND c.column_name = 'task_type') THEN
    RAISE EXCEPTION 'exam_task_type_missing_column: worksheets.task_type';
  END IF;

  -- A second check on task_type under another name would still refuse 'exam'.
  -- Stop instead of guessing which one to replace.
  SELECT pg_catalog.string_agg(c.conname, ', ') INTO v_other
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.worksheets'::regclass AND c.contype = 'c'
      AND c.conname <> 'worksheets_task_type_check'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%task_type%';
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'exam_task_type_unexpected_constraint: %', v_other;
  END IF;
END $$;

ALTER TABLE public.worksheets DROP CONSTRAINT IF EXISTS worksheets_task_type_check;
-- Every existing value is still allowed, so validating current rows cannot fail.
ALTER TABLE public.worksheets ADD CONSTRAINT worksheets_task_type_check
  CHECK (task_type IN ('worksheet','assignment','quiz','project','exam'));

COMMIT;
