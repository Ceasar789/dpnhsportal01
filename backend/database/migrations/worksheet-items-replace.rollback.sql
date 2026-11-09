-- Removes only the atomic items-replace function and reloads the API schema.
-- No table, row, policy, trigger or other function is changed. Run only if
-- worksheet-items-replace.sql must be undone. Safe to run twice.
BEGIN;

DO $guard$
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'worksheet_items_replace_requires_postgres';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.eduscribe_worksheet_items_replace_v1(uuid, jsonb);
NOTIFY pgrst, 'reload schema';
COMMIT;
