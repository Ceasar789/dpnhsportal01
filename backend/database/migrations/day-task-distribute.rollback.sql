-- Removes only the day-task distribute function and reloads the API schema.
-- No table, row, policy, or other function is changed. Existing assignees and
-- postings stay in place. Run only if day-task-distribute.sql must be undone.
BEGIN;
DROP FUNCTION IF EXISTS public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text);
NOTIFY pgrst, 'reload schema';
COMMIT;
