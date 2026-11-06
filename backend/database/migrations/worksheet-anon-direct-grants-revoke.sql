-- Review before use. Apply only after verifying the live ACLs match this file.
-- Removes direct anon table grants from the three canonical worksheet tables.
-- Does not change rows, policies, functions, or grants to any other role.
-- Requires PostgreSQL 17+ for the MAINTAIN privilege.
BEGIN;

DO $migration$
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
  v_other_effective_before jsonb;
  v_other_effective_after jsonb;
BEGIN
  IF current_user <> 'postgres'
      OR current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'worksheet_anon_revoke_prerequisite';
  END IF;
  SELECT oid INTO v_anon FROM pg_catalog.pg_roles WHERE rolname = 'anon';
  SELECT oid INTO v_postgres FROM pg_catalog.pg_roles WHERE rolname = 'postgres';
  IF v_anon IS NULL OR v_postgres IS NULL
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE oid = v_anon AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'worksheet_anon_revoke_prerequisite';
  END IF;

  FOREACH v_table IN ARRAY ARRAY['worksheets', 'worksheet_items',
      'worksheet_item_keys'] LOOP
    SELECT c.oid INTO v_table_oid
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table
        AND c.relkind IN ('r', 'p') AND c.relrowsecurity
        AND c.relowner <> v_anon;
    IF v_table_oid IS NULL THEN
      RAISE EXCEPTION 'worksheet_anon_revoke_prerequisite';
    END IF;

    SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      INTO v_actual
      FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
        pg_catalog.acldefault('r', c.relowner))) a
      WHERE c.oid = v_table_oid AND a.grantee = v_anon;
    IF v_actual IS DISTINCT FROM v_expected
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a
          WHERE c.oid = v_table_oid AND a.grantee = v_anon
            AND (a.grantor <> v_postgres OR a.is_grantable)) THEN
      RAISE EXCEPTION 'worksheet_anon_revoke_acl_mismatch';
    END IF;

    -- PUBLIC grants or role memberships could survive REVOKE FROM anon.
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
          pg_catalog.acldefault('r', c.relowner))) a
        WHERE c.oid = v_table_oid AND CASE
          WHEN a.grantee = 0 THEN true
          WHEN a.grantee = v_anon THEN false
          ELSE pg_catalog.pg_has_role(v_anon, a.grantee, 'MEMBER') END)
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute att
          CROSS JOIN LATERAL pg_catalog.aclexplode(att.attacl) a
          WHERE att.attrelid = v_table_oid AND att.attnum > 0
            AND NOT att.attisdropped AND CASE
              WHEN a.grantee = 0 OR a.grantee = v_anon THEN true
              ELSE pg_catalog.pg_has_role(v_anon, a.grantee, 'MEMBER') END) THEN
      RAISE EXCEPTION 'worksheet_anon_revoke_other_path';
    END IF;

    -- Each existing application/server role must have its own ACL entry.
    FOREACH v_role IN ARRAY ARRAY['authenticated',
        'eduscribe_ai_save_executor', 'postgres', 'service_role'] LOOP
      SELECT oid INTO v_role_oid FROM pg_catalog.pg_roles WHERE rolname = v_role;
      IF v_role_oid IS NULL OR NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_class c
          CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
            pg_catalog.acldefault('r', c.relowner))) a
          WHERE c.oid = v_table_oid AND a.grantee = v_role_oid) THEN
        RAISE EXCEPTION 'worksheet_anon_revoke_role_grant_missing';
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
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,
      r.rolname, p.privilege,
      pg_catalog.has_table_privilege(r.oid, c.oid, p.privilege),
      CASE WHEN p.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
        THEN pg_catalog.has_any_column_privilege(r.oid, c.oid, p.privilege)
        ELSE NULL END)
      ORDER BY c.relname, r.rolname, p.privilege)
    INTO v_other_effective_before
    FROM pg_catalog.pg_class c
    CROSS JOIN (VALUES ('authenticated'), ('eduscribe_ai_save_executor'),
      ('postgres'), ('service_role')) rname(name)
    JOIN pg_catalog.pg_roles r ON r.rolname = rname.name
    CROSS JOIN unnest(v_expected) p(privilege)
    WHERE c.oid IN ('public.worksheets'::regclass,
      'public.worksheet_items'::regclass, 'public.worksheet_item_keys'::regclass);

  EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.worksheets, '
    || 'public.worksheet_items, public.worksheet_item_keys FROM anon';

  FOREACH v_table IN ARRAY ARRAY['public.worksheets',
      'public.worksheet_items', 'public.worksheet_item_keys'] LOOP
    FOREACH v_role IN ARRAY v_expected LOOP
      IF pg_catalog.has_table_privilege('anon', v_table, v_role) THEN
        RAISE EXCEPTION 'worksheet_anon_revoke_effective_access';
      END IF;
    END LOOP;
    FOREACH v_role IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF pg_catalog.has_any_column_privilege('anon', v_table, v_role) THEN
        RAISE EXCEPTION 'worksheet_anon_revoke_column_access';
      END IF;
    END LOOP;
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
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,
      r.rolname, p.privilege,
      pg_catalog.has_table_privilege(r.oid, c.oid, p.privilege),
      CASE WHEN p.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
        THEN pg_catalog.has_any_column_privilege(r.oid, c.oid, p.privilege)
        ELSE NULL END)
      ORDER BY c.relname, r.rolname, p.privilege)
    INTO v_other_effective_after
    FROM pg_catalog.pg_class c
    CROSS JOIN (VALUES ('authenticated'), ('eduscribe_ai_save_executor'),
      ('postgres'), ('service_role')) rname(name)
    JOIN pg_catalog.pg_roles r ON r.rolname = rname.name
    CROSS JOIN unnest(v_expected) p(privilege)
    WHERE c.oid IN ('public.worksheets'::regclass,
      'public.worksheet_items'::regclass, 'public.worksheet_item_keys'::regclass);
  IF v_other_acl_after IS DISTINCT FROM v_other_acl_before
      OR v_other_effective_after IS DISTINCT FROM v_other_effective_before THEN
    RAISE EXCEPTION 'worksheet_anon_revoke_other_role_changed';
  END IF;
END
$migration$;

COMMIT;
