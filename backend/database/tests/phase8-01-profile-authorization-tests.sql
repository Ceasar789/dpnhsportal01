-- ============================================================
-- PHASE 8 / 01 — Profile authorization integration tests
--
-- DISPOSABLE SUPABASE PROJECT ONLY. NEVER RUN AGAINST LIVE SCHOOL DATA.
--
-- Submit this entire file through one PostgreSQL session with stop-on-error
-- enabled. Before running it, provision the deterministic Auth users and
-- matching profiles listed in expected_fixtures below through the disposable
-- project's Auth Admin API. The suite creates no production-like identities,
-- accepts no missing fixtures, and rolls every successful write probe back.
--
-- JWT/SET ROLE probes validate PostgreSQL RLS and triggers. They do not replace
-- Express/API integration tests for real Supabase tokens or onboarding.
-- ============================================================

BEGIN;

CREATE TEMP TABLE expected_fixtures (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL,
  status text NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_fixtures (id, email, role, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'phase8-main-admin@example.invalid',         'main_admin', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'phase8-admin@example.invalid',              'admin',      'active'),
  ('10000000-0000-0000-0000-000000000003', 'phase8-student@example.invalid',            'student',    'active'),
  ('10000000-0000-0000-0000-000000000004', 'phase8-teacher@example.invalid',            'teacher',    'active'),
  ('10000000-0000-0000-0000-000000000005', 'phase8-guest@example.invalid',              'guest',      'active'),
  ('10000000-0000-0000-0000-000000000006', 'phase8-inactive-main@example.invalid',      'main_admin', 'inactive'),
  ('10000000-0000-0000-0000-000000000007', 'phase8-suspended-main@example.invalid',     'main_admin', 'suspended'),
  ('10000000-0000-0000-0000-000000000008', 'phase8-archived-main@example.invalid',      'main_admin', 'archived'),
  ('10000000-0000-0000-0000-000000000009', 'phase8-inactive-teacher@example.invalid',   'teacher',    'inactive'),
  ('10000000-0000-0000-0000-00000000000a', 'phase8-archived-registrar@example.invalid', 'registrar',  'archived');

CREATE OR REPLACE FUNCTION pg_temp.assert_security(condition boolean, failure_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS NOT TRUE THEN
    RAISE EXCEPTION 'SECURITY TEST FAILED: %', failure_message;
  END IF;
END;
$$;

DO $$
DECLARE
  main_admin_id constant uuid := '10000000-0000-0000-0000-000000000001';
  admin_id constant uuid := '10000000-0000-0000-0000-000000000002';
  student_id constant uuid := '10000000-0000-0000-0000-000000000003';
  teacher_id constant uuid := '10000000-0000-0000-0000-000000000004';
  guest_id constant uuid := '10000000-0000-0000-0000-000000000005';
  inactive_main_id constant uuid := '10000000-0000-0000-0000-000000000006';
  suspended_main_id constant uuid := '10000000-0000-0000-0000-000000000007';
  archived_main_id constant uuid := '10000000-0000-0000-0000-000000000008';
  inactive_teacher_id constant uuid := '10000000-0000-0000-0000-000000000009';
  archived_registrar_id constant uuid := '10000000-0000-0000-0000-00000000000a';
  probe_id constant uuid := '10000000-0000-0000-0000-0000000000ff';
  row_count integer;
  fixture_count integer;
  denied boolean;
  probe_ok boolean;
  observed_count integer;
  observed_window timestamptz;
  observed_updated_at timestamp;
  actor_id uuid;
BEGIN
  -- Hard setup gate: exact disposable fixtures are mandatory. A missing or
  -- mismatched identity aborts the suite instead of producing a SKIP.
  SELECT count(*) INTO fixture_count
  FROM expected_fixtures expected
  JOIN public.profiles actual
    ON actual.id = expected.id
   AND actual.email = expected.email
   AND actual.role = expected.role
   AND actual.status = expected.status;

  PERFORM pg_temp.assert_security(
    fixture_count = (SELECT count(*) FROM expected_fixtures),
    'deterministic disposable Auth/profile fixtures are missing or mismatched'
  );

  -- The migration must leave only the approved operation-specific policy set.
  SELECT count(*) INTO row_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles';
  PERFORM pg_temp.assert_security(row_count = 3, 'profiles must have exactly three policies');
  PERFORM pg_temp.assert_security(
    NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = 'profiles'
        AND cmd IN ('ALL', 'INSERT', 'DELETE')
    ),
    'an ALL, INSERT, or DELETE profiles policy remains'
  );

  -- Owner SELECT.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO row_count FROM public.profiles WHERE id = student_id;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 1, 'owner cannot read own profile');

  -- Active staff retain the approved directory read.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', teacher_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO row_count FROM public.profiles WHERE id = student_id;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 1, 'active staff cannot read another profile');

  -- Owner personal-field UPDATE, rolled back inside its own subtransaction.
  probe_ok := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET bio = 'phase8 personal-field probe' WHERE id = student_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    probe_ok := row_count = 1;
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(probe_ok, 'owner personal-field update was denied');

  -- Ordinary cross-user UPDATE denial.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.profiles SET name = name WHERE id = teacher_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 0, 'ordinary user updated another profile');

  -- Authenticated self-service INSERT denial. Any error other than RLS denial
  -- is also a failure because it means the request reached a later constraint.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.profiles (id, email, name, role, status)
    VALUES (probe_id, 'phase8-probe@example.invalid', 'Phase 8 probe', 'student', 'active');
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'authenticated self-service INSERT passed RLS');

  -- Authenticated self-service DELETE denial.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.profiles WHERE id = student_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 0, 'authenticated owner deleted own profile');

  -- Admin self-promotion denial.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET role = 'main_admin' WHERE id = admin_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'admin promoted itself to main_admin');

  -- Ordinary role and status changes are denied by the trigger.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', teacher_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET status = 'suspended' WHERE id = teacher_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'teacher changed own account status');

  -- An active Main Admin can manage another user's department, role, or status.
  probe_ok := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', main_admin_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles
    SET department = 'Phase 8 test department', role = 'faculty', status = 'inactive'
    WHERE id = teacher_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    probe_ok := row_count = 1;
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(probe_ok, 'active Main Admin cannot manage another profile');

  -- Main Admin cannot directly change its own role or status.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', main_admin_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET status = 'inactive' WHERE id = main_admin_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'Main Admin changed its own role/status directly');

  -- Inactive, suspended, and archived Main Admin accounts lose cross-user UPDATE.
  FOREACH actor_id IN ARRAY ARRAY[inactive_main_id, suspended_main_id, archived_main_id]
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET name = name WHERE id = teacher_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.assert_security(row_count = 0, 'non-active Main Admin retained cross-user UPDATE');
  END LOOP;

  -- Non-active staff cannot use the staff branch to read another profile.
  FOREACH actor_id IN ARRAY ARRAY[inactive_teacher_id, archived_registrar_id]
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO row_count FROM public.profiles WHERE id = student_id;
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.assert_security(row_count = 0, 'non-active staff retained cross-user profile read');
  END LOOP;

  -- System-owned fields: direct owner mutations must be rejected.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET email = 'changed@example.invalid' WHERE id = student_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'owner changed system-controlled email');

  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET created_at = created_at - interval '1 day' WHERE id = student_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'owner changed system-controlled created_at');

  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET department = 'Unauthorized department' WHERE id = student_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'owner changed administrator-controlled department');

  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET photo_change_count = 0 WHERE id = student_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'owner reset photo_change_count');

  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET photo_change_window_start = now() - interval '8 days' WHERE id = student_id;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'owner changed photo_change_window_start');

  -- Caller-supplied updated_at is ignored and replaced by the database.
  probe_ok := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles
    SET bio = bio, updated_at = timestamp '2000-01-01'
    WHERE id = student_id
    RETURNING updated_at INTO observed_updated_at;
    EXECUTE 'RESET ROLE';
    probe_ok := observed_updated_at > timestamp '2000-01-01';
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(probe_ok, 'caller controlled updated_at');

  -- Fourth photo change in an active window is rejected.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    UPDATE public.profiles
    SET photo_change_count = 3, photo_change_window_start = now()
    WHERE id = student_id;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      UPDATE public.profiles SET photo_url = 'phase8/fourth-photo.webp' WHERE id = student_id;
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN raise_exception THEN
      EXECUTE 'RESET ROLE';
      denied := SQLERRM LIKE 'Photo change limit reached%';
    END;
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(denied, 'fourth photo change was not rejected');

  -- An expired seven-day window resets to one and starts a fresh window.
  probe_ok := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    UPDATE public.profiles
    SET photo_change_count = 3, photo_change_window_start = now() - interval '8 days'
    WHERE id = student_id;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', student_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles
    SET photo_url = 'phase8/reset-window.webp'
    WHERE id = student_id
    RETURNING photo_change_count, photo_change_window_start
      INTO observed_count, observed_window;
    EXECUTE 'RESET ROLE';
    probe_ok := observed_count = 1 AND observed_window > now() - interval '1 minute';
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(probe_ok, 'expired photo window did not reset correctly');

  -- Anonymous users receive neither SELECT nor UPDATE access.
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO row_count FROM public.profiles;
  UPDATE public.profiles SET name = name WHERE id = student_id;
  GET DIAGNOSTICS fixture_count = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 0 AND fixture_count = 0, 'anonymous profile access was allowed');

  -- Guest can manage its own personal fields but cannot read another profile.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', guest_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO row_count FROM public.profiles WHERE id IN (guest_id, student_id);
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 1, 'guest read another profile or lost own-profile read');

  probe_ok := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', guest_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.profiles SET bio = 'phase8 guest probe' WHERE id = guest_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    probe_ok := row_count = 1;
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(probe_ok, 'guest lost own personal-field update');

  -- Main Admin browser clients also receive no INSERT or DELETE policy.
  denied := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', main_admin_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.profiles (id, email, name, role, status)
    VALUES (probe_id, 'phase8-main-probe@example.invalid', 'Phase 8 probe', 'student', 'active');
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN EXECUTE 'RESET ROLE'; denied := true;
  END;
  PERFORM pg_temp.assert_security(denied, 'Main Admin client INSERT passed RLS');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', main_admin_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  DELETE FROM public.profiles WHERE id = student_id;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_security(row_count = 0, 'Main Admin client DELETE passed RLS');

  -- Trusted service-role provisioning compatibility. The disposable guest has
  -- no dependent application rows; the delete/reinsert/update sequence is
  -- contained in a subtransaction and forcibly rolled back.
  probe_ok := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    EXECUTE 'SET LOCAL ROLE service_role';
    DELETE FROM public.profiles WHERE id = guest_id;
    INSERT INTO public.profiles (id, email, name, role, status)
    VALUES (guest_id, 'phase8-guest@example.invalid', 'Phase 8 Guest', 'guest', 'inactive');
    UPDATE public.profiles SET role = 'student', status = 'active' WHERE id = guest_id;
    GET DIAGNOSTICS row_count = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    probe_ok := row_count = 1;
    RAISE EXCEPTION 'rollback-probe';
  EXCEPTION WHEN raise_exception THEN
    EXECUTE 'RESET ROLE';
    IF SQLERRM <> 'rollback-probe' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_security(probe_ok, 'trusted service-role provisioning is incompatible');

  RAISE NOTICE 'PASS: all Phase 8 profile authorization assertions succeeded';
END;
$$;

ROLLBACK;
