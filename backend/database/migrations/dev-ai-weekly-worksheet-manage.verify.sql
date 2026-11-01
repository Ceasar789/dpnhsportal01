-- READ ONLY. Inspect these catalog results before using the Manage RPCs.
-- No teacher, student, worksheet or answer-key row data is selected.

SELECT a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null,
  pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname = 'worksheet_collections'
  AND a.attname IN ('revision', 'archived_at')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attname;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('worksheet_sections', 'task_assignees',
    'worksheet_submissions', 'worksheet_answers')
ORDER BY c.relname;

SELECT c.relname AS table_name,
  CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
  acl.privilege_type, acl.is_grantable,
  pg_catalog.pg_get_userbyid(acl.grantor) AS grantor
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
WHERE n.nspname = 'public'
  AND c.relname IN ('worksheet_collections', 'worksheets', 'worksheet_items',
    'worksheet_item_keys', 'worksheet_item_private', 'worksheet_sections',
    'task_assignees', 'worksheet_submissions', 'worksheet_answers')
  AND pg_catalog.pg_get_userbyid(acl.grantee) = 'eduscribe_ai_save_executor'
ORDER BY c.relname, acl.privilege_type;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('ai_weekly_manage_sections_read',
    'ai_weekly_manage_assignees_read', 'ai_weekly_manage_submissions_read',
    'ai_weekly_manage_answers_read')
ORDER BY tablename, policyname;

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
  AND p.proname IN ('eduscribe_ai_weekly_worksheets_update_v1',
    'eduscribe_ai_weekly_worksheets_archive_v1',
    'eduscribe_ai_weekly_worksheets_delete_v1')
ORDER BY p.proname, grantee, acl.privilege_type;

SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname = 'eduscribe_ai_save_executor';
