-- SECURITY WARNING: restores anonymous worksheet table privileges.
-- Do not use after enabling or applying the production weekly Save contract
-- without a separate security review. This script refuses the known Save RPC.
-- Run only if the exact revoke migration was applied and rollback is approved.
-- No worksheet rows, policies, functions, or other roles are changed.
BEGIN;

DO $rollback$
DECLARE
  v_table text;
  v_table_oid oid;
  v_anon oid;
  v_postgres oid;
  v_role text;
  v_role_oid oid;
  v_actual text[];
  v_expected text[] := ARRAY['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
    'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];
  v_other_acl_before jsonb;
  v_other_acl_after jsonb;
BEGIN
  IF current_user <> 'postgres'
      OR current_setting('server_version_num')::integer < 170000
      OR pg_catalog.to_regprocedure(
        'public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'worksheet_anon_rollback_requires_review';
  END IF;
  SELECT oid INTO v_anon FROM pg_catalog.pg_roles WHERE rolname = 'anon';
  SELECT oid INTO v_postgres FROM pg_catalog.pg_roles WHERE rolname = 'postgres';
  IF v_anon IS NULL OR v_postgres IS NULL THEN
    RAISE EXCEPTION 'worksheet_anon_rollback_prerequisite';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['public.worksheets',
      'public.worksheet_items', 'public.worksheet_item_keys'] LOOP
    SELECT c.oid INTO v_table_oid FROM pg_catalog.pg_class c
      WHERE c.oid = pg_catalog.to_regclass(v_table)
        AND c.relkind IN ('r', 'p') AND c.relrowsecurity;
    IF v_table_oid IS NULL THEN
      RAISE EXCEPTION 'worksheet_anon_rollback_prerequisite';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
        WHERE c.oid = v_table_oid AND a.grantee = v_anon) THEN
      RAISE EXCEPTION 'worksheet_anon_rollback_acl_mismatch';
    END IF;
    FOREACH v_role IN ARRAY v_expected LOOP
      IF pg_catalog.has_table_privilege('anon', v_table, v_role) THEN
        RAISE EXCEPTION 'worksheet_anon_rollback_other_access';
      END IF;
    END LOOP;
    FOREACH v_role IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF pg_catalog.has_any_column_privilege('anon', v_table, v_role) THEN
        RAISE EXCEPTION 'worksheet_anon_rollback_other_access';
      END IF;
    END LOOP;
    FOREACH v_role IN ARRAY ARRAY['authenticated',
        'eduscribe_ai_save_executor', 'postgres', 'service_role'] LOOP
      SELECT oid INTO v_role_oid FROM pg_catalog.pg_roles WHERE rolname = v_role;
      IF v_role_oid IS NULL OR NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
            pg_catalog.acldefault('r', c.relowner))) a
          WHERE c.oid = v_table_oid AND a.grantee = v_role_oid) THEN
        RAISE EXCEPTION 'worksheet_anon_rollback_role_grant_missing';
      END IF;
    END LOOP;
  END LOOP;

  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,
      a.grantee, a.grantor, a.privilege_type, a.is_grantable)
      ORDER BY c.relname, a.grantee, a.grantor, a.privilege_type)
    INTO v_other_acl_before
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
    WHERE c.oid IN ('public.worksheets'::regclass,
      'public.worksheet_items'::regclass, 'public.worksheet_item_keys'::regclass)
      AND a.grantee <> v_anon;

  EXECUTE 'GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, '
    || 'TRUNCATE, UPDATE ON TABLE public.worksheets, public.worksheet_items, '
    || 'public.worksheet_item_keys TO anon';

  FOREACH v_table IN ARRAY ARRAY['public.worksheets',
      'public.worksheet_items', 'public.worksheet_item_keys'] LOOP
    SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      INTO v_actual
      FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
      WHERE c.oid = pg_catalog.to_regclass(v_table) AND a.grantee = v_anon;
    IF v_actual IS DISTINCT FROM v_expected
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
          WHERE c.oid = pg_catalog.to_regclass(v_table)
            AND a.grantee = v_anon
            AND (a.grantor <> v_postgres OR a.is_grantable)) THEN
      RAISE EXCEPTION 'worksheet_anon_rollback_receipt_mismatch';
    END IF;
  END LOOP;
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,
      a.grantee, a.grantor, a.privilege_type, a.is_grantable)
      ORDER BY c.relname, a.grantee, a.grantor, a.privilege_type)
    INTO v_other_acl_after
    FROM pg_catalog.pg_class c
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
    WHERE c.oid IN ('public.worksheets'::regclass,
      'public.worksheet_items'::regclass, 'public.worksheet_item_keys'::regclass)
      AND a.grantee <> v_anon;
  IF v_other_acl_after IS DISTINCT FROM v_other_acl_before THEN
    RAISE EXCEPTION 'worksheet_anon_rollback_other_role_changed';
  END IF;
END
$rollback$;

COMMIT;
