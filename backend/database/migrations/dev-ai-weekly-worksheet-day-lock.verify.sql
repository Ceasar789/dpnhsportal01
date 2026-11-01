-- READ ONLY. Run before applying the day-lock migration to compare the live
-- update_v1 body with dev-ai-weekly-worksheet-manage.sql, then again afterward.
-- Catalog metadata only; no teacher, student, worksheet or answer row data.

SELECT pg_catalog.pg_get_functiondef(
  pg_catalog.to_regprocedure(
    'public.eduscribe_ai_weekly_worksheets_update_v1(uuid,bigint,jsonb)'))
  AS live_update_v1_body;

SELECT p.oid::pg_catalog.regprocedure AS function_name,
  pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS security_definer, p.proconfig AS function_settings,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
  acl.privilege_type, acl.is_grantable
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
WHERE n.nspname = 'public'
  AND p.proname = 'eduscribe_ai_weekly_worksheets_update_v1'
ORDER BY grantee, acl.privilege_type;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('worksheet_collections', 'worksheets', 'worksheet_items',
    'worksheet_item_keys', 'worksheet_item_private', 'worksheet_sections',
    'task_assignees', 'worksheet_submissions', 'worksheet_answers')
ORDER BY c.relname;

SELECT c.relname AS table_name, t.tgname AS trigger_name,
  pg_catalog.pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('worksheet_collections', 'worksheets', 'worksheet_items')
ORDER BY c.relname, t.tgname;
