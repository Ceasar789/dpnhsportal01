-- REVIEW ONLY. DO NOT AUTO-RUN.
-- This irreversibly deletes every weekly AI collection and its private item
-- metadata, and removes the added columns from existing worksheets. Export and
-- review all affected data, verify the target is the test-data project, and
-- confirm no saved collection is needed before manually pasting this file.
-- It deliberately leaves AI lesson-plan Save objects and all pre-existing
-- worksheet policies, tables, items, and answer keys in place.
BEGIN;

DO $$ BEGIN
  IF pg_catalog.to_regprocedure('public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb)
      FROM authenticated;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb);

DROP POLICY IF EXISTS ai_weekly_keys_executor ON public.worksheet_item_keys;
DROP POLICY IF EXISTS ai_weekly_items_executor ON public.worksheet_items;
DROP POLICY IF EXISTS ai_weekly_worksheets_executor ON public.worksheets;
DROP POLICY IF EXISTS ai_weekly_private_executor ON public.worksheet_item_private;
DROP POLICY IF EXISTS ai_weekly_private_owner_read ON public.worksheet_item_private;
DROP POLICY IF EXISTS ai_weekly_collections_executor ON public.worksheet_collections;
DROP POLICY IF EXISTS ai_weekly_collections_owner_read ON public.worksheet_collections;

REVOKE SELECT, INSERT ON public.worksheet_item_keys, public.worksheet_items,
  public.worksheets FROM eduscribe_ai_save_executor;
ALTER TABLE public.worksheets DROP CONSTRAINT IF EXISTS worksheets_collection_ai_save_fk;
DROP INDEX IF EXISTS public.worksheets_collection_weekday_ai_save_unique;
DROP TABLE IF EXISTS public.worksheet_item_private;
DROP TABLE IF EXISTS public.worksheet_collections;

ALTER TABLE public.worksheets
  DROP CONSTRAINT IF EXISTS worksheets_weekday_ai_save_check,
  DROP CONSTRAINT IF EXISTS worksheets_origin_ai_save_check,
  DROP COLUMN IF EXISTS sections,
  DROP COLUMN IF EXISTS instructions,
  DROP COLUMN IF EXISTS day_of_week,
  DROP COLUMN IF EXISTS collection_id,
  DROP COLUMN IF EXISTS source_lesson_plan_id,
  DROP COLUMN IF EXISTS origin;

NOTIFY pgrst, 'reload schema';
COMMIT;
