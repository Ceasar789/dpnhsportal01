-- READ ONLY. Inspect catalog results before calling the distribution RPC.
-- No teacher, student, worksheet, assignee, or answer-key row data is selected.

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
  AND p.oid = pg_catalog.to_regprocedure(
    'public.eduscribe_ai_weekly_worksheets_distribute_v1(uuid,bigint,uuid,smallint[],uuid[],timestamptz)')
ORDER BY grantee, acl.privilege_type;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND policyname LIKE 'ai_weekly_distribute_%'
ORDER BY tablename, policyname;

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  pg_catalog.has_table_privilege('eduscribe_ai_save_executor', c.oid, 'SELECT') AS executor_select,
  pg_catalog.has_table_privilege('eduscribe_ai_save_executor', c.oid, 'INSERT') AS executor_insert
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('sections', 'schedules', 'section_students', 'task_assignees')
ORDER BY c.relname;

SELECT c.relname AS table_name, a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
  AND ((c.relname = 'task_assignees' AND a.attname = 'due_at')
    OR (c.relname = 'worksheets' AND a.attname = 'day_of_week'))
ORDER BY c.relname, a.attname;

SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_catalog.pg_roles WHERE rolname = 'eduscribe_ai_save_executor';
