-- Synthetic, rolled-back checks for eduscribe_day_task_distribute_v1.
-- Run only after applying day-task-distribute.sql. Synthetic users, profiles,
-- sections, enrolments and worksheets are made inside this transaction. The
-- outer handler checks that the forced exception rolled its subtransaction back
-- before reporting. The final error reports SELFTEST PASSED_ROLLED_BACK or
-- FAILED_ROLLED_BACK. Nothing persists on any path.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_inactive_teacher uuid := pg_catalog.gen_random_uuid();
  v_student_a uuid := pg_catalog.gen_random_uuid();
  v_student_b uuid := pg_catalog.gen_random_uuid();
  v_student_c uuid := pg_catalog.gen_random_uuid();
  v_student_other uuid := pg_catalog.gen_random_uuid();
  v_student_dropped uuid := pg_catalog.gen_random_uuid();
  v_student_unenrolled uuid := pg_catalog.gen_random_uuid();
  v_handled uuid := pg_catalog.gen_random_uuid();
  v_advised uuid := pg_catalog.gen_random_uuid();
  v_forbidden uuid := pg_catalog.gen_random_uuid();
  v_collection uuid := pg_catalog.gen_random_uuid();
  v_quiz uuid := pg_catalog.gen_random_uuid();
  v_activity uuid := pg_catalog.gen_random_uuid();
  v_essay uuid := pg_catalog.gen_random_uuid();
  v_weekly uuid := pg_catalog.gen_random_uuid();
  v_empty uuid := pg_catalog.gen_random_uuid();
  v_blank uuid := pg_catalog.gen_random_uuid();
  v_quiz_no_items uuid := pg_catalog.gen_random_uuid();
  v_other_ws uuid := pg_catalog.gen_random_uuid();
  v_atomic uuid := pg_catalog.gen_random_uuid();
  v_due timestamptz := pg_catalog.now() + interval '2 days';
  v_fixed_due timestamptz := '2099-01-15 00:00:00+00'::timestamptz;
  v_signature regprocedure := 'public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text)'::regprocedure;
  v_response jsonb;
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
    'items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'postings', (SELECT pg_catalog.count(*) FROM public.worksheet_sections),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees)) INTO v_before;

  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'day-task-distribute-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_other_teacher, v_inactive_teacher,
    v_student_a, v_student_b, v_student_c, v_student_other, v_student_dropped,
    v_student_unenrolled]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'day-task-distribute-' || u.id::text || '@example.invalid',
    'Synthetic day-task user', u.role, u.status
  FROM (VALUES (v_teacher, 'teacher', 'active'), (v_other_teacher, 'teacher', 'active'),
    (v_inactive_teacher, 'teacher', 'inactive'), (v_student_a, 'student', 'active'),
    (v_student_b, 'student', 'active'), (v_student_c, 'student', 'active'),
    (v_student_other, 'student', 'active'), (v_student_dropped, 'student', 'active'),
    (v_student_unenrolled, 'student', 'active')) AS u(id, role, status)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id)
  SELECT u.id FROM pg_catalog.unnest(ARRAY[v_student_a, v_student_b, v_student_c,
    v_student_other, v_student_dropped, v_student_unenrolled]) AS u(id);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id) VALUES
    (v_handled, 'Day task handled ' || v_handled::text, '7', '2025-2026', v_other_teacher),
    (v_advised, 'Day task advised ' || v_advised::text, '7', '2025-2026', v_teacher),
    (v_forbidden, 'Day task forbidden ' || v_forbidden::text, '7', '2025-2026', v_other_teacher);
  INSERT INTO public.schedules (section_id, teacher_id, subject, day_of_week, start_time, end_time)
    VALUES (v_handled, v_teacher, 'Filipino', 'Monday', '08:00', '09:00'),
      (v_forbidden, v_other_teacher, 'Filipino', 'Monday', '08:00', '09:00');
  INSERT INTO public.section_students (section_id, student_id, status) VALUES
    (v_handled, v_student_a, 'active'), (v_handled, v_student_b, 'active'),
    (v_handled, v_student_c, 'active'), (v_advised, v_student_a, 'active'),
    (v_forbidden, v_student_other, 'active'), (v_handled, v_student_dropped, 'dropped');
  INSERT INTO public.worksheet_collections
    (id, teacher_id, title, request_id, payload_fingerprint) VALUES
    (v_collection, v_teacher, 'Synthetic weekly collection',
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('a', 64));
  INSERT INTO public.worksheets
    (id, teacher_id, title, status, origin, task_type, instructions, collection_id, day_of_week) VALUES
    (v_quiz, v_teacher, 'Synthetic quiz', 'Draft', 'manual', 'quiz', 'Answer all.', NULL, NULL),
    (v_activity, v_teacher, 'Synthetic activity', 'Draft', 'manual', 'worksheet', 'Objective: Read.', NULL, NULL),
    (v_essay, v_teacher, 'Synthetic assignment', 'Draft', 'manual', 'assignment', 'Write.', NULL, NULL),
    (v_weekly, v_teacher, 'Synthetic weekly day', 'Draft', 'ai_generated', 'worksheet', 'Weekly.', v_collection, 1),
    (v_empty, v_teacher, 'Synthetic empty', 'Draft', 'manual', 'worksheet', NULL, NULL, NULL),
    (v_blank, v_teacher, 'Synthetic blank', 'Draft', 'manual', 'worksheet', '   ', NULL, NULL),
    (v_quiz_no_items, v_teacher, 'Synthetic quiz no items', 'Draft', 'manual', 'quiz', 'Answer.', NULL, NULL),
    (v_other_ws, v_other_teacher, 'Synthetic other worksheet', 'Draft', 'manual', 'quiz', 'Answer.', NULL, NULL),
    (v_atomic, v_teacher, 'Synthetic atomic quiz', 'Draft', 'manual', 'quiz', 'Answer.', NULL, NULL);
  INSERT INTO public.worksheet_items (worksheet_id, position, question, item_type, points) VALUES
    (v_quiz, 1, 'Synthetic question', 'identification', 1),
    (v_essay, 1, 'Synthetic essay', 'essay', 5),
    (v_weekly, 1, 'Synthetic weekly question', 'identification', 1),
    (v_other_ws, 1, 'Synthetic other question', 'identification', 1),
    (v_atomic, 1, 'Synthetic atomic question', 'identification', 1);

  -- Definition: the properties the security model depends on.
  v_ok := (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND (SELECT r.rolname FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE p.oid = v_signature::oid) = 'postgres'
    AND (SELECT 'search_path=pg_catalog, pg_temp' = ANY(p.proconfig)
      FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND pg_catalog.has_function_privilege('authenticated', v_signature::oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', v_signature::oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', v_signature::oid, 'EXECUTE');
  v_report := v_report || ' definer_owner_path_grants=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Unauthenticated: no claims at all.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'not_authenticated'; END;
  v_report := v_report || ' unauthenticated=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Inactive teacher.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_inactive_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_inactive_teacher::text)::text, true);
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'inactive_teacher'; END;
  v_report := v_report || ' inactive_teacher=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- A student calling it directly.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student_a::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_student_a::text)::text, true);
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'inactive_teacher'; END;
  v_report := v_report || ' student_caller=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Everything below runs as the owning teacher.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_other_ws, v_handled, ARRAY[v_student_a], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'not_found'; END;
  v_report := v_report || ' other_teacher_worksheet=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(pg_catalog.gen_random_uuid(), v_handled, ARRAY[v_student_a], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'not_found'; END;
  v_report := v_report || ' unknown_worksheet=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_weekly, v_handled, ARRAY[v_student_a], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' weekly_collection=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_empty, v_handled, ARRAY[v_student_a], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' no_items_no_instructions=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_blank, v_handled, ARRAY[v_student_a], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' blank_instructions=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz_no_items, v_handled, ARRAY[v_student_a], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' quiz_without_items=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_forbidden, ARRAY[v_student_other], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'section_not_allowed'; END;
  v_report := v_report || ' forbidden_section=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, NULL, ARRAY[v_student_a], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'section_not_allowed'; END;
  v_report := v_report || ' null_section=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_unenrolled], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' student_not_in_any_section=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_other], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' student_of_another_section=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_dropped], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_report := v_report || ' dropped_student=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[]::uuid[], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_student_list'; END;
  v_report := v_report || ' empty_list=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, NULL, v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_student_list'; END;
  v_report := v_report || ' null_list=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a, NULL], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_student_list'; END;
  v_report := v_report || ' null_student=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled,
      ARRAY(SELECT pg_catalog.gen_random_uuid() FROM pg_catalog.generate_series(1,201)), v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_student_list'; END;
  v_report := v_report || ' over_200=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a],
      pg_catalog.now() - interval '1 minute', 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_due_date'; END;
  v_report := v_report || ' past_due=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], NULL, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_due_date'; END;
  v_report := v_report || ' null_due=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a],
      'infinity'::timestamptz, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_due_date'; END;
  v_report := v_report || ' infinite_due=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], v_due, 'sometimes');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_checking_mode'; END;
  v_report := v_report || ' unknown_mode=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], v_due, NULL);
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_checking_mode'; END;
  v_report := v_report || ' null_mode=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Auto with an essay is accepted (day-task-distribute-auto-essay.sql). The block
  -- undoes its own writes, so the later essay_manual case meets the same worksheet.
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(v_essay, v_handled, ARRAY[v_student_a], v_due, 'auto');
    v_ok := v_response->>'checkingMode' = 'auto'
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_essay) = 'auto';
    RAISE EXCEPTION 'essay_auto_undo';
  EXCEPTION WHEN OTHERS THEN v_ok := v_ok AND SQLERRM = 'essay_auto_undo'; END;
  v_ok := v_ok AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_essay) = 'manual'
    AND NOT EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = v_essay);
  v_report := v_report || ' essay_auto_accepted=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- One bad student rejects the whole call: nothing is half written.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_atomic, v_handled,
      ARRAY[v_student_a, v_student_other], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'student_not_in_section'; END;
  v_ok := v_ok
    AND NOT EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = v_atomic)
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_sections s WHERE s.worksheet_id = v_atomic)
    AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_atomic) = 'manual';
  v_report := v_report || ' rejected_call_writes_nothing=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Success: rows, Manila wall-clock, assigned_by, posting, mode, receipt.
  v_response := public.eduscribe_day_task_distribute_v1(v_quiz, v_handled,
    ARRAY[v_student_a, v_student_b], v_fixed_due, 'auto');
  v_ok := v_response->'ok' = 'true'::jsonb
    AND v_response->'durable' = 'true'::jsonb
    AND v_response->>'worksheetId' = v_quiz::text
    AND v_response->>'sectionId' = v_handled::text
    AND (v_response->>'requested')::integer = 2
    AND pg_catalog.jsonb_array_length(v_response->'added') = 2
    AND pg_catalog.jsonb_array_length(v_response->'alreadyAssigned') = 0
    AND pg_catalog.jsonb_array_length(v_response->'assignedElsewhere') = 0
    AND v_response->>'checkingMode' = 'auto'
    AND (SELECT pg_catalog.count(*) FROM public.task_assignees a WHERE a.task_id = v_quiz
      AND a.section_id = v_handled AND a.assigned_by = v_teacher) = 2
    AND (SELECT a.due_at FROM public.task_assignees a
      WHERE a.task_id = v_quiz AND a.student_id = v_student_a) = '2099-01-15 08:00:00'::timestamp
    AND (SELECT s.due_at FROM public.worksheet_sections s
      WHERE s.worksheet_id = v_quiz AND s.section_id = v_handled) = '2099-01-15 08:00:00'::timestamp
    AND (SELECT s.posted_by FROM public.worksheet_sections s
      WHERE s.worksheet_id = v_quiz AND s.section_id = v_handled) = v_teacher
    AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_quiz) = 'auto';
  v_report := v_report || ' success_manila_mode=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Repeat call: idempotent.
  v_response := public.eduscribe_day_task_distribute_v1(v_quiz, v_handled,
    ARRAY[v_student_a, v_student_b], v_fixed_due, 'auto');
  v_ok := (v_response->>'requested')::integer = 2
    AND pg_catalog.jsonb_array_length(v_response->'added') = 0
    AND pg_catalog.jsonb_array_length(v_response->'alreadyAssigned') = 2
    AND pg_catalog.jsonb_array_length(v_response->'assignedElsewhere') = 0
    AND (SELECT pg_catalog.count(*) FROM public.task_assignees a WHERE a.task_id = v_quiz) = 2
    AND (SELECT pg_catalog.count(*) FROM public.worksheet_sections s WHERE s.worksheet_id = v_quiz) = 1;
  v_report := v_report || ' idempotent=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Adding a latecomer, with duplicate ids deduped.
  v_response := public.eduscribe_day_task_distribute_v1(v_quiz, v_handled,
    ARRAY[v_student_c, v_student_c, v_student_a], v_fixed_due, 'auto');
  v_ok := (v_response->>'requested')::integer = 2
    AND v_response->'added' = pg_catalog.to_jsonb(ARRAY[v_student_c])
    AND v_response->'alreadyAssigned' = pg_catalog.to_jsonb(ARRAY[v_student_a])
    AND (SELECT pg_catalog.count(*) FROM public.task_assignees a WHERE a.task_id = v_quiz) = 3;
  v_report := v_report || ' duplicates_deduped_latecomer=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- The same student reached through another allowed (advised) section.
  v_response := public.eduscribe_day_task_distribute_v1(v_quiz, v_advised,
    ARRAY[v_student_a], v_fixed_due, 'auto');
  v_ok := pg_catalog.jsonb_array_length(v_response->'added') = 0
    AND pg_catalog.jsonb_array_length(v_response->'alreadyAssigned') = 0
    AND v_response->'assignedElsewhere' = pg_catalog.to_jsonb(ARRAY[v_student_a])
    AND (SELECT a.section_id FROM public.task_assignees a
      WHERE a.task_id = v_quiz AND a.student_id = v_student_a) = v_handled;
  v_report := v_report || ' advised_section_assigned_elsewhere=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- The mode cannot change once anyone has the task.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a], v_fixed_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'checking_mode_locked'; END;
  v_ok := v_ok AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_quiz) = 'auto';
  v_report := v_report || ' checking_mode_locked=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- A posting takes the newest date; existing assignees keep theirs.
  v_response := public.eduscribe_day_task_distribute_v1(v_quiz, v_handled, ARRAY[v_student_a],
    '2099-02-15 00:00:00+00'::timestamptz, 'auto');
  v_ok := (SELECT s.due_at FROM public.worksheet_sections s
      WHERE s.worksheet_id = v_quiz AND s.section_id = v_handled) = '2099-02-15 08:00:00'::timestamp
    AND (SELECT a.due_at FROM public.task_assignees a
      WHERE a.task_id = v_quiz AND a.student_id = v_student_a) = '2099-01-15 08:00:00'::timestamp;
  v_report := v_report || ' posting_due_updates_assignee_due_stays=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- An Activity has no items but does have instructions.
  v_response := public.eduscribe_day_task_distribute_v1(v_activity, v_advised, ARRAY[v_student_a], v_due, 'manual');
  v_ok := pg_catalog.jsonb_array_length(v_response->'added') = 1
    AND (SELECT a.section_id FROM public.task_assignees a WHERE a.task_id = v_activity) = v_advised;
  v_report := v_report || ' activity_no_items=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- An essay worksheet may go out as manual.
  v_response := public.eduscribe_day_task_distribute_v1(v_essay, v_handled, ARRAY[v_student_b], v_due, 'manual');
  v_ok := pg_catalog.jsonb_array_length(v_response->'added') = 1;
  v_report := v_report || ' essay_manual=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- The receipt carries ids only, never names.
  v_ok := v_response::text NOT LIKE '%Synthetic%';
  v_report := v_report || ' no_student_names=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
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
    'items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'postings', (SELECT pg_catalog.count(*) FROM public.worksheet_sections),
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
