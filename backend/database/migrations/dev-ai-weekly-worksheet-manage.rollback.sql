-- REVIEW ONLY. Export affected collection data before running this rollback.
-- It refuses to remove revision/archive columns once any collection has been
-- updated or archived. It leaves the weekly Save RPC and its policies intact.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.worksheet_collections c
      WHERE c.revision <> 1 OR c.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'weekly manage rollback blocked: export changed collections first';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.eduscribe_ai_weekly_worksheets_update_v1(uuid,bigint,jsonb),
  public.eduscribe_ai_weekly_worksheets_archive_v1(uuid,bigint,boolean),
  public.eduscribe_ai_weekly_worksheets_delete_v1(uuid,bigint) FROM authenticated;
DROP FUNCTION IF EXISTS public.eduscribe_ai_weekly_worksheets_update_v1(uuid,bigint,jsonb);
DROP FUNCTION IF EXISTS public.eduscribe_ai_weekly_worksheets_archive_v1(uuid,bigint,boolean);
DROP FUNCTION IF EXISTS public.eduscribe_ai_weekly_worksheets_delete_v1(uuid,bigint);

DROP POLICY IF EXISTS ai_weekly_manage_sections_read ON public.worksheet_sections;
DROP POLICY IF EXISTS ai_weekly_manage_assignees_read ON public.task_assignees;
DROP POLICY IF EXISTS ai_weekly_manage_submissions_read ON public.worksheet_submissions;
DROP POLICY IF EXISTS ai_weekly_manage_answers_read ON public.worksheet_answers;

REVOKE UPDATE, DELETE ON public.worksheet_collections, public.worksheets
  FROM eduscribe_ai_save_executor;
REVOKE DELETE ON public.worksheet_items, public.worksheet_item_keys,
  public.worksheet_item_private FROM eduscribe_ai_save_executor;
REVOKE SELECT ON public.worksheet_sections, public.task_assignees,
  public.worksheet_submissions, public.worksheet_answers FROM eduscribe_ai_save_executor;

ALTER TABLE public.worksheet_collections
  DROP COLUMN IF EXISTS revision,
  DROP COLUMN IF EXISTS archived_at;
NOTIFY pgrst, 'reload schema';
COMMIT;
