-- REVIEW ONLY. Removes only objects and privileges introduced by Distribute.
-- Existing Manage assignee SELECT privilege and policy remain intact.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.eduscribe_ai_weekly_worksheets_distribute_v1(
  uuid,bigint,uuid,smallint[],uuid[],timestamptz) FROM authenticated;
DROP FUNCTION IF EXISTS public.eduscribe_ai_weekly_worksheets_distribute_v1(
  uuid,bigint,uuid,smallint[],uuid[],timestamptz);

DROP POLICY IF EXISTS ai_weekly_distribute_assignees_insert ON public.task_assignees;
DROP POLICY IF EXISTS ai_weekly_distribute_members_read ON public.section_students;
DROP POLICY IF EXISTS ai_weekly_distribute_sections_read ON public.sections;
DROP POLICY IF EXISTS ai_weekly_distribute_schedules_read ON public.schedules;

REVOKE INSERT ON public.task_assignees FROM eduscribe_ai_save_executor;
REVOKE SELECT ON public.sections, public.schedules, public.section_students
  FROM eduscribe_ai_save_executor;
NOTIFY pgrst, 'reload schema';
COMMIT;
