-- Synthetic, rolled-back checks for day-task-distribute-auto-essay.sql.
-- Run as postgres after applying it (and auto-score-submission.sql, for the
-- end-to-end case). Synthetic users, a section, enrolments and worksheets are made
-- inside this transaction. The final error reports SELFTEST PASSED_ROLLED_BACK or
-- FAILED_ROLLED_BACK. Nothing persists on any path.
-- Tagged dollar quotes only: the SQL editor splits a script at a bare double
-- dollar sign.
BEGIN;
DO $selftest$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_student2 uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  v_forbidden uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  w_quiz_essay uuid := pg_catalog.gen_random_uuid();
  w_assignment uuid := pg_catalog.gen_random_uuid();
  w_modes uuid := pg_catalog.gen_random_uuid();
  w_objective uuid := pg_catalog.gen_random_uuid();
  w_exam_essay uuid := pg_catalog.gen_random_uuid();
  w_rejects uuid := pg_catalog.gen_random_uuid();
  w_e2e uuid := pg_catalog.gen_random_uuid();
  i_e2e_mc uuid := pg_catalog.gen_random_uuid();
  i_e2e_essay uuid := pg_catalog.gen_random_uuid();
  s_e2e uuid := pg_catalog.gen_random_uuid();
  v_due timestamptz := pg_catalog.now() + interval '2 days';
  v_response jsonb;
  v_error text;
  v_n integer;
  v_m integer;
  v_row record;
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
    'members', (SELECT pg_catalog.count(*) FROM public.section_students),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'keys', (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys),
    'postings', (SELECT pg_catalog.count(*) FROM public.worksheet_sections),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'submissions', (SELECT pg_catalog.count(*) FROM public.worksheet_submissions),
    'answers', (SELECT pg_catalog.count(*) FROM public.worksheet_answers),
    'provisional', (SELECT pg_catalog.count(*) FROM public.worksheet_provisional_marks),
    'notifications', (SELECT pg_catalog.count(*) FROM public.notifications)) INTO v_before;

  -- Fixtures as postgres with no user claims.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'auto-essay-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_other_teacher, v_student, v_student2]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'auto-essay-' || u.id::text || '@example.invalid', 'Synthetic auto-essay user', u.role, 'active'
  FROM (VALUES (v_teacher, 'teacher'), (v_other_teacher, 'teacher'), (v_student, 'student'), (v_student2, 'student'))
    AS u(id, role)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id) VALUES (v_student), (v_student2);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id) VALUES
    (v_section, 'Auto-essay advised ' || v_section::text, '7', '2025-2026', v_teacher),
    (v_forbidden, 'Auto-essay forbidden ' || v_forbidden::text, '7', '2025-2026', v_other_teacher);
  INSERT INTO public.section_students (section_id, student_id, status) VALUES
    (v_section, v_student, 'active'), (v_section, v_student2, 'active'), (v_forbidden, v_student2, 'active');
  INSERT INTO public.worksheets (id, teacher_id, title, status, origin, task_type, instructions, items) VALUES
    (w_quiz_essay, v_teacher, 'Synthetic quiz with essay', 'Draft', 'manual', 'quiz', 'Answer.', 2),
    (w_assignment, v_teacher, 'Synthetic essay assignment', 'Draft', 'manual', 'assignment', 'Write.', 1),
    (w_modes, v_teacher, 'Synthetic mode checks', 'Draft', 'manual', 'quiz', 'Answer.', 2),
    (w_objective, v_teacher, 'Synthetic objective quiz', 'Draft', 'manual', 'quiz', 'Answer.', 1),
    (w_exam_essay, v_teacher, 'Synthetic essay exam', 'Draft', 'manual', 'exam', 'Write.', 1),
    (w_rejects, v_teacher, 'Synthetic rejected calls', 'Draft', 'manual', 'quiz', 'Answer.', 2),
    (w_e2e, v_teacher, 'Synthetic end-to-end quiz', 'Draft', 'manual', 'quiz', 'Answer.', 2);
  INSERT INTO public.worksheet_items (id, worksheet_id, position, question, item_type, options, points, essay_min_sentences) VALUES
    (pg_catalog.gen_random_uuid(), w_quiz_essay, 1, 'Pick A', 'multiple_choice', '["A","B"]', 2, NULL),
    (pg_catalog.gen_random_uuid(), w_quiz_essay, 2, 'Explain', 'essay', NULL, 5, NULL),
    (pg_catalog.gen_random_uuid(), w_assignment, 1, 'Write', 'essay', NULL, 5, NULL),
    (pg_catalog.gen_random_uuid(), w_modes, 1, 'Pick A', 'multiple_choice', '["A","B"]', 2, NULL),
    (pg_catalog.gen_random_uuid(), w_modes, 2, 'Explain', 'essay', NULL, 5, NULL),
    (pg_catalog.gen_random_uuid(), w_objective, 1, 'Red planet', 'identification', NULL, 1, NULL),
    (pg_catalog.gen_random_uuid(), w_exam_essay, 1, 'Explain', 'essay', NULL, 5, NULL),
    (pg_catalog.gen_random_uuid(), w_rejects, 1, 'Pick A', 'multiple_choice', '["A","B"]', 2, NULL),
    (pg_catalog.gen_random_uuid(), w_rejects, 2, 'Explain', 'essay', NULL, 5, NULL),
    (i_e2e_mc, w_e2e, 1, 'Pick A', 'multiple_choice', '["A","B"]', 2, NULL),
    (i_e2e_essay, w_e2e, 2, 'Explain in two sentences', 'essay', NULL, 5, 2);
  INSERT INTO public.worksheet_item_keys (item_id, correct_answer) VALUES (i_e2e_mc, '"A"');

  -- Every distribute call runs as the owning teacher, as the existing selftest does.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  -- (a) Auto with an essay item is accepted and stored.
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(w_quiz_essay, v_section, ARRAY[v_student], v_due, 'auto');
    v_ok := v_response->'ok' = 'true'::jsonb AND v_response->>'checkingMode' = 'auto'
      AND v_response->'added' = pg_catalog.to_jsonb(ARRAY[v_student])
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_quiz_essay) = 'auto';
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' a_auto_with_essay_accepted=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (b) Manual with an essay still works.
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(w_assignment, v_section, ARRAY[v_student], v_due, 'manual');
    v_ok := v_response->>'checkingMode' = 'manual'
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_assignment) = 'manual';
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' b_manual_with_essay_accepted=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (c) An unknown mode and NULL are still refused, and write nothing.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(w_modes, v_section, ARRAY[v_student], v_due, 'sometimes');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_checking_mode'; END;
  IF v_ok THEN
    v_ok := false;
    BEGIN
      PERFORM public.eduscribe_day_task_distribute_v1(w_modes, v_section, ARRAY[v_student], v_due, NULL);
    EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_checking_mode'; END;
  END IF;
  v_ok := v_ok AND NOT EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = w_modes)
    AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_modes) = 'manual';
  v_report := v_report || ' c_bad_modes_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (d) The lock still holds once anyone has the task.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(w_quiz_essay, v_section, ARRAY[v_student2], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'checking_mode_locked'; END;
  v_ok := v_ok AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_quiz_essay) = 'auto'
    AND NOT EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = w_quiz_essay AND a.student_id = v_student2);
  v_report := v_report || ' d_mode_lock_kept=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (e) Auto without an essay behaves as before.
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(w_objective, v_section, ARRAY[v_student, v_student2], v_due, 'auto');
    v_ok := v_response->>'checkingMode' = 'auto' AND pg_catalog.jsonb_array_length(v_response->'added') = 2
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_objective) = 'auto';
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' e_auto_without_essay=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (f) An Exam with an essay as Auto is accepted like a Quiz.
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(w_exam_essay, v_section, ARRAY[v_student], v_due, 'auto');
    v_ok := v_response->>'checkingMode' = 'auto'
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_exam_essay) = 'auto';
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' f_exam_essay_auto_accepted=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (g) Other refusals still write nothing (on an Auto-with-essay worksheet).
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(w_rejects, v_section, ARRAY[v_student],
      pg_catalog.now() - interval '1 minute', 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_due_date'; END;
  v_report := v_report || ' g_past_due_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(w_rejects, v_forbidden, ARRAY[v_student2], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'section_not_allowed'; END;
  v_report := v_report || ' g_forbidden_section_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(w_rejects, v_section,
      ARRAY(SELECT pg_catalog.gen_random_uuid() FROM pg_catalog.generate_series(1, 201)), v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_student_list'; END;
  v_report := v_report || ' g_over_200_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  v_ok := NOT EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = w_rejects)
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_sections s WHERE s.worksheet_id = w_rejects)
    AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_rejects) = 'manual';
  v_report := v_report || ' g_refusals_wrote_nothing=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- End to end: distribute as Auto, the student starts, answers and submits through
  -- the real path; the scorer leaves provisional marks only.
  v_error := NULL;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(w_e2e, v_section, ARRAY[v_student], v_due, 'auto');
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  v_ok := v_error IS NULL AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = w_e2e) = 'auto';
  v_report := v_report || ' e2e_distributed_auto=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || COALESCE(v_error, '') END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_error := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.worksheet_submissions (id, worksheet_id, student_id, section_id, status)
      VALUES (s_e2e, w_e2e, v_student, v_section, 'in_progress');
    INSERT INTO public.worksheet_answers (submission_id, item_id, answer) VALUES
      (s_e2e, i_e2e_mc, '"A"'), (s_e2e, i_e2e_essay, '"Plants need light. They grow toward it."');
    UPDATE public.worksheet_submissions SET status = 'submitted' WHERE id = s_e2e;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    IF v_n <> 1 THEN v_error := 'submit updated ' || v_n || ' rows'; END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_error := SQLERRM;
  END;
  v_report := v_report || ' e2e_student_submitted=' || CASE WHEN v_error IS NULL THEN 'PASS' ELSE 'FAIL ' || v_error END;
  IF v_error IS NOT NULL THEN v_failures := v_failures + 1; END IF;

  SELECT * INTO v_row FROM public.worksheet_submissions WHERE id = s_e2e;
  v_ok := v_row.status = 'submitted' AND NOT v_row.released AND v_row.score IS NULL AND v_row.total_points IS NULL
    AND (SELECT pg_catalog.jsonb_object_agg(m.item_id::text, pg_catalog.jsonb_build_array(m.points, m.is_correct))
      FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_e2e)
      = pg_catalog.jsonb_build_object(i_e2e_mc::text, '[2, true]'::jsonb, i_e2e_essay::text, '[5, true]'::jsonb)
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_answers a WHERE a.submission_id = s_e2e
      AND (a.points_earned IS NOT NULL OR a.is_correct IS NOT NULL));
  v_report := v_report || ' e2e_provisional_only=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_n := -1;
  v_m := -1;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT pg_catalog.count(*) INTO v_n FROM public.worksheet_provisional_marks;
    SELECT pg_catalog.count(*) INTO v_m FROM public.worksheet_answers a
      WHERE a.submission_id = s_e2e AND (a.points_earned IS NOT NULL OR a.is_correct IS NOT NULL);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_n := -2;
  END;
  v_ok := v_n = 0 AND v_m = 0;
  v_report := v_report || ' e2e_student_sees_no_marks=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  -- (h) Nothing persists.
  EXECUTE 'RESET ROLE';
  SELECT pg_catalog.jsonb_build_object(
    'users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'members', (SELECT pg_catalog.count(*) FROM public.section_students),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'keys', (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys),
    'postings', (SELECT pg_catalog.count(*) FROM public.worksheet_sections),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'submissions', (SELECT pg_catalog.count(*) FROM public.worksheet_submissions),
    'answers', (SELECT pg_catalog.count(*) FROM public.worksheet_answers),
    'provisional', (SELECT pg_catalog.count(*) FROM public.worksheet_provisional_marks),
    'notifications', (SELECT pg_catalog.count(*) FROM public.notifications)) INTO v_after;
  v_ok := v_before = v_after;
  v_report := v_report || ' h_rollback_counts=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END
$selftest$;
ROLLBACK;
