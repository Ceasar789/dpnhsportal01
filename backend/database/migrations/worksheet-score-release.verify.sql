-- Read-only catalog check for the score-release function and its direct EXECUTE grants.
SELECT p.oid::pg_catalog.regprocedure AS function_name,
  l.lanname AS language,
  pg_catalog.format_type(p.prorettype, NULL) AS return_type,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_language l ON l.oid = p.prolang
WHERE p.oid = pg_catalog.to_regprocedure(
  'public.eduscribe_worksheet_score_release_v1(uuid,jsonb)');

SELECT CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
  acl.privilege_type, acl.is_grantable
FROM pg_catalog.pg_proc p
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
WHERE p.oid = pg_catalog.to_regprocedure(
  'public.eduscribe_worksheet_score_release_v1(uuid,jsonb)')
ORDER BY grantee, acl.privilege_type;
