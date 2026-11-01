-- TEST DATA ONLY. Run only after applying and verifying Distribute.
-- Synthetic users, profiles, sections, enrolments and worksheet rows are made
-- inside this transaction. The outer handler checks that the forced exception
-- rolled its subtransaction back before reporting PASSED_ROLLED_BACK or
-- FAILED_ROLLED_BACK. Nothing persists on any path.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_inactive_teacher uuid := pg_catalog.gen_random_uuid();
  v_student_a uuid := pg_catalog.gen_random_uuid();
  v_student_b uuid := pg_catalog.gen_random_uuid();
  v_student_other uuid := pg_catalog.gen_random_uuid();
  v_student_inactive uuid := pg_catalog.gen_random_uuid();
  v_student_unenrolled uuid := pg_catalog.gen_random_uuid();
  v_handled uuid := pg_catalog.gen_random_uuid();
  v_advised uuid := pg_catalog.gen_random_uuid();
  v_forbidden uuid := pg_catalog.gen_random_uuid();
  v_collection uuid := pg_catalog.gen_random_uuid();
  v_archived_collection uuid := pg_catalog.gen_random_uuid();
  v_partial_collection uuid := pg_catalog.gen_random_uuid();
  v_other_collection uuid := pg_catalog.gen_random_uuid();
  v_days uuid[];
  v_day smallint;
  v_due timestamptz := pg_catalog.now() + interval '2 days';
  v_response jsonb;
  v_happy jsonb;
  v_before jsonb;
  v_after jsonb;
  v_ok boolean;
  v_failures integer := 0;
  v_report text := '';
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'schedules', (SELECT pg_catalog.count(*) FROM public.schedules),
    'members', (SELECT pg_catalog.count(*) FROM public.section_students),
    'collections', (SELECT pg_catalog.count(*) FROM public.worksheet_collections),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees)) INTO v_before;

  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'weekly-distribute-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_other_teacher, v_inactive_teacher,
    v_student_a, v_student_b, v_student_other, v_student_inactive,
    v_student_unenrolled]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status) VALUES
    (v_teacher, 'weekly-distribute-' || v_teacher::text || '@example.invalid',
      'Synthetic distribution teacher', 'teacher', 'active'),
    (v_other_teacher, 'weekly-distribute-' || v_other_teacher::text || '@example.invalid',
      'Synthetic other teacher', 'teacher', 'active'),
    (v_inactive_teacher, 'weekly-distribute-' || v_inactive_teacher::text || '@example.invalid',
      'Synthetic inactive teacher', 'teacher', 'inactive'),
    (v_student_a, 'weekly-distribute-' || v_student_a::text || '@example.invalid',
      'Synthetic student A', 'student', 'active'),
    (v_student_b, 'weekly-distribute-' || v_student_b::text || '@example.invalid',
      'Synthetic student B', 'student', 'active'),
    (v_student_other, 'weekly-distribute-' || v_student_other::text || '@example.invalid',
      'Synthetic other-section student', 'student', 'active'),
    (v_student_inactive, 'weekly-distribute-' || v_student_inactive::text || '@example.invalid',
      'Synthetic inactive-enrolment student', 'student', 'active'),
    (v_student_unenrolled, 'weekly-distribute-' || v_student_unenrolled::text || '@example.invalid',
      'Synthetic unenrolled student', 'student', 'active')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id)
  SELECT u.id FROM pg_catalog.unnest(ARRAY[v_student_a, v_student_b,
    v_student_other, v_student_inactive, v_student_unenrolled]) AS u(id);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id) VALUES
    (v_handled, 'Weekly handled ' || v_handled::text, '7', '2025-2026', v_other_teacher),
    (v_advised, 'Weekly advised ' || v_advised::text, '7', '2025-2026', v_teacher),
    (v_forbidden, 'Weekly forbidden ' || v_forbidden::text, '7', '2025-2026', v_other_teacher);
  INSERT INTO public.schedules (section_id, teacher_id, subject)
    VALUES (v_handled, v_teacher, 'Filipino'),
      (v_forbidden, v_other_teacher, 'Filipino');
  INSERT INTO public.section_students (section_id, student_id, status) VALUES
    (v_handled, v_student_a, 'active'), (v_handled, v_student_b, 'active'),
    (v_advised, v_student_a, 'active'),
    (v_forbidden, v_student_other, 'active'),
    (v_handled, v_student_inactive, 'inactive');
  INSERT INTO public.worksheet_collections
    (id, teacher_id, title, request_id, payload_fingerprint, revision, archived_at) VALUES
    (v_collection, v_teacher, 'Synthetic distribution collection',
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('a', 64), 1, NULL),
    (v_archived_collection, v_teacher, 'Synthetic archived collection',
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('b', 64), 1, pg_catalog.now()),
    (v_partial_collection, v_teacher, 'Synthetic partial collection',
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('c', 64), 1, NULL),
    (v_other_collection, v_other_teacher, 'Synthetic other collection',
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('d', 64), 1, NULL);
  FOR v_day IN 1..5 LOOP
    INSERT INTO public.worksheets (id, teacher_id, title, status, origin,
      collection_id, day_of_week)
      VALUES (pg_catalog.gen_random_uuid(), v_teacher, 'Synthetic day ' || v_day::text,
        'Draft', 'ai_generated', v_collection, v_day);
  END LOOP;
  INSERT INTO public.worksheets (id, teacher_id, title, status, origin,
    collection_id, day_of_week)
    VALUES (pg_catalog.gen_random_uuid(), v_teacher, 'Synthetic partial day',
      'Draft', 'ai_generated', v_partial_collection, 1);
  SELECT pg_catalog.array_agg(w.id ORDER BY w.day_of_week) INTO v_days
    FROM public.worksheets w WHERE w.collection_id = v_collection;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  v_response := public.eduscribe_ai_weekly_worksheets_distribute_v1(
    v_collection, 1, v_handled, ARRAY[1,2]::smallint[],
    ARRAY[v_student_a,v_student_b], v_due);
  v_happy := v_response;
  v_ok := v_response->'ok' = 'true'::jsonb
    AND v_response->'durable' = 'true'::jsonb
    AND (v_response->>'requested')::integer = 4
    AND (v_response->>'inserted')::integer = 4
    AND (v_response->>'alreadyAssigned')::integer = 0
    AND (v_response->>'assignedElsewhere')::integer = 0
    AND (SELECT pg_catalog.count(*) FROM public.task_assignees a
      WHERE a.task_id = ANY(v_days[1:2]) AND a.student_id IN (v_student_a,v_student_b)
        AND a.section_id = v_handled) = 4
    AND (SELECT a.due_at FROM public.task_assignees a
      WHERE a.task_id = v_days[1] AND a.student_id = v_student_a)
      = (v_due AT TIME ZONE 'Asia/Manila');
  v_report := v_report || ' happy_handled_due_conversion=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_response := public.eduscribe_ai_weekly_worksheets_distribute_v1(
    v_collection, 1, v_handled, ARRAY[1,2]::smallint[],
    ARRAY[v_student_a,v_student_b], v_due);
  v_ok := (v_response->>'requested')::integer = 4
    AND (v_response->>'inserted')::integer = 0
    AND (v_response->>'alreadyAssigned')::integer = 4
    AND (v_response->>'assignedElsewhere')::integer = 0;
  v_report := v_report || ' idempotent=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 2,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'revision_conflict'; END;
  v_report := v_report || ' wrong_revision=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_archived_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'collection_archived'; END;
  v_report := v_report || ' archived=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_partial_collection, 1,
      v_handled, ARRAY[2]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' missing_day=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1,1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' duplicate_days=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' zero_days=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[0]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' out_of_range_day=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[]::uuid[], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' zero_students=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1]::smallint[],
      ARRAY(SELECT pg_catalog.gen_random_uuid() FROM pg_catalog.generate_series(1,201)), v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' 201_students=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a,v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' duplicate_students=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[3]::smallint[], ARRAY[v_student_unenrolled], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' unenrolled=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[3]::smallint[], ARRAY[v_student_inactive], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' inactive_enrolment=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[3]::smallint[], ARRAY[v_student_other], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' other_section_student=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  INSERT INTO public.task_assignees (task_id, student_id, section_id, assigned_by)
    VALUES (v_days[5], v_student_a, v_advised, v_teacher);
  v_response := public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
    v_handled, ARRAY[5]::smallint[], ARRAY[v_student_a], v_due);
  v_ok := (v_response->>'requested')::integer = 1
    AND (v_response->>'inserted')::integer = 0
    AND (v_response->>'alreadyAssigned')::integer = 1
    AND (v_response->>'assignedElsewhere')::integer = 1
    AND (SELECT a.section_id FROM public.task_assignees a
      WHERE a.task_id = v_days[5] AND a.student_id = v_student_a) = v_advised;
  v_report := v_report || ' assigned_elsewhere=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_forbidden, ARRAY[3]::smallint[], ARRAY[v_student_other], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'section_not_allowed'; END;
  v_report := v_report || ' forbidden_section=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_response := public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
    v_advised, ARRAY[4]::smallint[], ARRAY[v_student_a], v_due);
  v_ok := (v_response->>'inserted')::integer = 1
    AND (SELECT a.section_id FROM public.task_assignees a
      WHERE a.task_id = v_days[4] AND a.student_id = v_student_a) = v_advised;
  v_report := v_report || ' advised_section=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[3]::smallint[], ARRAY[v_student_a], pg_catalog.now() - interval '1 minute');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_due_date'; END;
  v_report := v_report || ' past_due=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_response := public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
    v_handled, ARRAY[3]::smallint[], ARRAY[v_student_a], NULL);
  v_ok := (v_response->>'inserted')::integer = 1
    AND (SELECT a.due_at FROM public.task_assignees a
      WHERE a.task_id = v_days[3] AND a.student_id = v_student_a) IS NULL;
  v_report := v_report || ' null_due=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_other_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'not_found'; END;
  v_report := v_report || ' other_teacher_collection=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_inactive_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_inactive_teacher::text)::text, true);
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'inactive_teacher'; END;
  v_report := v_report || ' inactive_teacher=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '{}', true);
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'not_authenticated'; END;
  v_report := v_report || ' unauthenticated=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student_a::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_student_a::text)::text, true);
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_distribute_v1(v_collection, 1,
      v_handled, ARRAY[1]::smallint[], ARRAY[v_student_a], v_due);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'inactive_teacher'; END;
  v_report := v_report || ' student_caller=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  v_ok := v_happy::text NOT LIKE '%Synthetic%'
    AND NOT (v_happy ? 'studentIds') AND NOT (v_happy ? 'studentNames');
  v_report := v_report || ' no_student_names=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := (SELECT pg_catalog.count(*) FROM public.worksheets w
      WHERE w.collection_id = v_collection AND w.status = 'Draft') = 5
    AND (SELECT c.revision FROM public.worksheet_collections c
      WHERE c.id = v_collection) = 1;
  v_report := v_report || ' status_revision_unchanged=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(v_collection, 1, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_work_exists'; END;
  v_report := v_report || ' update_blocked=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(v_collection, 1, true);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_work_exists'; END;
  v_report := v_report || ' archive_blocked=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  SELECT pg_catalog.jsonb_build_object(
    'users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'schedules', (SELECT pg_catalog.count(*) FROM public.schedules),
    'members', (SELECT pg_catalog.count(*) FROM public.section_students),
    'collections', (SELECT pg_catalog.count(*) FROM public.worksheet_collections),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees)) INTO v_after;
  v_ok := v_before = v_after;
  v_report := v_report || ' rollback_counts=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END $$;
ROLLBACK;
