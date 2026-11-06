-- DISPOSABLE DATABASE ONLY. Run after worksheet-anon-direct-grants-revoke.sql.
-- Requires the existing worksheet RLS policies and three seeded SYNTHETIC
-- profiles with these example.invalid addresses: worksheet-acl-teacher,
-- worksheet-acl-student, worksheet-acl-admin. The student needs a students row.
-- Also requires the existing executor worksheet policies. Never use school data.
-- All synthetic worksheet rows below are rolled back on success or failure.
BEGIN;

DO $selftest$
DECLARE
  v_teacher uuid;
  v_student uuid;
  v_admin uuid;
  v_section uuid := pg_catalog.gen_random_uuid();
  v_worksheet uuid := pg_catalog.gen_random_uuid();
  v_item uuid := pg_catalog.gen_random_uuid();
  v_table text;
  v_count integer;
  v_error text;
  v_case record;
BEGIN
  IF current_user <> 'postgres'
      OR pg_catalog.to_regprocedure('public.eduscribe_ai_uid()') IS NULL
      OR pg_catalog.to_regclass('public.task_assignees') IS NULL
      OR EXISTS (SELECT 1 FROM (VALUES ('anon'), ('authenticated'),
          ('eduscribe_ai_save_executor'), ('service_role')) r(name)
        WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles role_row
          WHERE role_row.rolname = r.name
            AND pg_catalog.pg_has_role('postgres', role_row.oid, 'SET')))
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheet_item_keys'
          AND policyname = 'ai_weekly_keys_executor')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheet_items'
          AND policyname = 'ai_weekly_items_executor')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheets'
          AND policyname = 'ai_weekly_worksheets_executor')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheet_item_keys'
          AND policyname = 'ws_keys_all')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheet_items'
          AND policyname = 'ws_items_read')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheets'
          AND policyname = 'ws_worksheets_student_read') THEN
    RAISE EXCEPTION 'SELFTEST FIXTURE_UNAVAILABLE';
  END IF;
  SELECT id INTO v_teacher FROM public.profiles
    WHERE email = 'worksheet-acl-teacher@example.invalid'
      AND role = 'teacher' AND status = 'active';
  SELECT p.id INTO v_student FROM public.profiles p
    JOIN public.students s ON s.id = p.id
    WHERE p.email = 'worksheet-acl-student@example.invalid'
      AND p.role = 'student' AND p.status = 'active';
  SELECT id INTO v_admin FROM public.profiles
    WHERE email = 'worksheet-acl-admin@example.invalid'
      AND role = 'main_admin' AND status = 'active';
  IF v_teacher IS NULL OR v_student IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'SELFTEST FIXTURE_UNAVAILABLE';
  END IF;

  INSERT INTO public.worksheets (id, teacher_id, title, status)
    VALUES (v_worksheet, v_teacher, 'Synthetic ACL worksheet', 'Draft');
  INSERT INTO public.worksheet_items
    (id, worksheet_id, position, question, item_type, points)
    VALUES (v_item, v_worksheet, 1, 'Synthetic ACL prompt', 'true_false', 1);
  INSERT INTO public.worksheet_item_keys (item_id, correct_answer)
    VALUES (v_item, '"True"'::jsonb);
  INSERT INTO public.sections (id, name, grade_level, school_year)
    VALUES (v_section, 'Synthetic ACL ' || left(v_section::text, 8),
      'Grade 7', '2099-2100');
  INSERT INTO public.task_assignees (task_id, student_id, section_id)
    VALUES (v_worksheet, v_student, v_section);

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  FOREACH v_table IN ARRAY ARRAY['worksheets', 'worksheet_items',
      'worksheet_item_keys'] LOOP
    v_error := NULL;
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      EXECUTE format('SELECT count(*) FROM public.%I', v_table);
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLSTATE;
      EXECUTE 'RESET ROLE';
    END;
    IF v_error IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'SELFTEST FAILED: anonymous table access';
    END IF;
  END LOOP;

  -- Teacher and admin may read all three rows; an assigned student may read
  -- the worksheet and item but not its key. Executor uses the verified teacher
  -- identity; service_role retains its independent server read path.
  FOR v_case IN SELECT * FROM (VALUES
      ('authenticated'::text, v_teacher, 1, 1, 1),
      ('authenticated'::text, v_student, 1, 1, 0),
      ('authenticated'::text, v_admin, 1, 1, 1),
      ('eduscribe_ai_save_executor'::text, v_teacher, 1, 1, 1),
      ('service_role'::text, v_teacher, 1, 1, 1)
    ) t(role_name, uid, worksheets_seen, items_seen, keys_seen) LOOP
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_case.uid::text, true);
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', v_case.role_name);
      SELECT count(*) INTO v_count FROM public.worksheets
        WHERE id = v_worksheet;
      IF v_count <> v_case.worksheets_seen THEN
        RAISE EXCEPTION 'SELFTEST FAILED: worksheet role read';
      END IF;
      SELECT count(*) INTO v_count FROM public.worksheet_items
        WHERE id = v_item;
      IF v_count <> v_case.items_seen THEN
        RAISE EXCEPTION 'SELFTEST FAILED: item role read';
      END IF;
      SELECT count(*) INTO v_count FROM public.worksheet_item_keys
        WHERE item_id = v_item;
      IF v_count <> v_case.keys_seen THEN
        RAISE EXCEPTION 'SELFTEST FAILED: key role read';
      END IF;
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      RAISE;
    END;
  END LOOP;
  RAISE NOTICE 'SELFTEST PASSED_ROLLED_BACK';
END
$selftest$;

ROLLBACK;
