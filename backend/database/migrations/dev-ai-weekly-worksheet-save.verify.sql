-- READ ONLY. Paste after applying dev-ai-weekly-worksheet-save.sql.
-- These catalog SELECTs inspect structure and privileges only; they never
-- select teacher, student, worksheet, or answer-key row data.

-- New worksheet columns, types, nullability, and defaults.
SELECT a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull AS not_null,
  pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname = 'worksheets'
  AND a.attname IN ('origin', 'source_lesson_plan_id', 'collection_id',
    'day_of_week', 'instructions', 'sections')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY a.attnum;

-- All worksheet constraints and the partial collection/day unique index.
SELECT con.conname AS constraint_name, con.contype AS constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint con
WHERE con.conrelid = 'public.worksheets'::pg_catalog.regclass
ORDER BY con.conname;

SELECT indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public' AND tablename = 'worksheets'
  AND indexname = 'worksheets_collection_weekday_ai_save_unique';

-- Both new tables must exist with RLS enabled.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  pg_catalog.pg_get_userbyid(c.relowner) AS table_owner
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('worksheet_collections', 'worksheet_item_private')
ORDER BY c.relname;

-- Every policy on the new tables, plus the three executor policies added
-- to existing worksheet tables. Inspect roles AND predicates: authenticated
-- includes student sessions, so a role name alone does not prove isolation.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND (tablename IN ('worksheet_collections', 'worksheet_item_private')
    OR policyname IN ('ai_weekly_worksheets_executor', 'ai_weekly_items_executor',
      'ai_weekly_keys_executor'))
ORDER BY tablename, policyname;

-- Explicit and default table ACL entries, including SELECT for authenticated
-- and INSERT only for the executor on the new tables.
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
  AND c.relname IN ('worksheet_collections', 'worksheet_item_private')
ORDER BY c.relname, grantee, acl.privilege_type;

-- RPC owner, SECURITY DEFINER, search_path and every EXECUTE ACL entry.
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
    'public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb)')
ORDER BY grantee, acl.privilege_type;

-- No private-table policy is explicitly assigned to PUBLIC, anon, or student.
-- Also inspect the preceding policy listing: the authenticated SELECT policy
-- must retain its is_admin()/teacher_owns_item(item_id) predicate because
-- students normally connect under the authenticated database role.
SELECT NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_policy pol
  JOIN pg_catalog.pg_class c ON c.oid = pol.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.unnest(pol.polroles) AS assigned(role_oid)
  WHERE n.nspname = 'public' AND c.relname = 'worksheet_item_private'
    AND (assigned.role_oid = 0 OR pg_catalog.pg_get_userbyid(assigned.role_oid)
      IN ('anon', 'student'))
) AS no_explicit_public_anon_or_student_policy;
