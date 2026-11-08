-- Synthetic, rolled-back checks for exam-task-type.sql.
-- Run only after applying exam-task-type.sql (and day-task-distribute.sql).
-- Synthetic users, profiles, a section, an enrolment and worksheets are made
-- inside this transaction. The outer handler checks that the forced exception
-- rolled its subtransaction back before reporting. The final error reports
-- SELFTEST PASSED_ROLLED_BACK or FAILED_ROLLED_BACK. Nothing persists on any path.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  v_exam uuid := pg_catalog.gen_random_uuid();
  v_quiz uuid := pg_catalog.gen_random_uuid();
  v_exam_empty uuid := pg_catalog.gen_random_uuid();
  v_quiz_empty uuid := pg_catalog.gen_random_uuid();
  v_exam_directions_only uuid := pg_catalog.gen_random_uuid();
  v_exam_essay uuid := pg_catalog.gen_random_uuid();
  v_type text;
  v_constraint text;
  v_due timestamptz := pg_catalog.now() + interval '2 days';
  v_response jsonb;
  v_quiz_response jsonb;
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
    'postings', (SELECT pg_catalog.count(*) FROM public.worksheet_sections),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees)) INTO v_before;

  -- Fixtures: one active teacher who advises one section with one active student.
  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'exam-task-type-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_student]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'exam-task-type-' || u.id::text || '@example.invalid',
    'Synthetic exam user', u.role, 'active'
  FROM (VALUES (v_teacher, 'teacher'), (v_student, 'student')) AS u(id, role)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id) VALUES (v_student);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id) VALUES
    (v_section, 'Exam selftest ' || v_section::text, '7', '2025-2026', v_teacher);
  INSERT INTO public.section_students (section_id, student_id, status) VALUES
    (v_section, v_student, 'active');

  -- (a) A worksheet with task_type 'exam' can be inserted.
  v_ok := false;
  BEGIN
    INSERT INTO public.worksheets (id, teacher_id, title, status, origin, task_type, instructions, items)
      VALUES (v_exam, v_teacher, 'Synthetic exam', 'Draft', 'manual', 'exam', 'Answer all.', 1);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' a_exam_insert=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (b) Each of the four original values still inserts.
  FOREACH v_type IN ARRAY ARRAY['worksheet', 'assignment', 'quiz', 'project'] LOOP
    v_ok := false;
    BEGIN
      INSERT INTO public.worksheets (teacher_id, title, status, origin, task_type)
        VALUES (v_teacher, 'Synthetic ' || v_type, 'Draft', 'manual', v_type);
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN v_ok := false; END;
    v_report := v_report || ' b_' || v_type || '_insert=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  -- (c) An unknown value is still refused, by this constraint.
  v_ok := false;
  BEGIN
    INSERT INTO public.worksheets (teacher_id, title, status, origin, task_type)
      VALUES (v_teacher, 'Synthetic bogus', 'Draft', 'manual', 'bogus');
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    v_ok := v_constraint = 'worksheets_task_type_check';
  WHEN OTHERS THEN v_ok := false;
  END;
  v_report := v_report || ' c_bogus_rejected=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- The rest needs the exam row from (a); stop here cleanly if it is missing.
  IF NOT EXISTS (SELECT 1 FROM public.worksheets w WHERE w.id = v_exam) THEN
    RAISE EXCEPTION 'selftest_forced_rollback';
  END IF;

  -- A quiz twin of every exam fixture, so each result is compared with a quiz.
  INSERT INTO public.worksheets (id, teacher_id, title, status, origin, task_type, instructions, items) VALUES
    (v_quiz, v_teacher, 'Synthetic quiz', 'Draft', 'manual', 'quiz', 'Answer all.', 1),
    (v_exam_empty, v_teacher, 'Synthetic empty exam', 'Draft', 'manual', 'exam', NULL, 0),
    (v_quiz_empty, v_teacher, 'Synthetic empty quiz', 'Draft', 'manual', 'quiz', NULL, 0),
    (v_exam_directions_only, v_teacher, 'Synthetic exam with directions only', 'Draft', 'manual', 'exam', 'Read.', 0),
    (v_exam_essay, v_teacher, 'Synthetic essay exam', 'Draft', 'manual', 'exam', 'Write.', 1);
  INSERT INTO public.worksheet_items (worksheet_id, position, question, item_type, points) VALUES
    (v_exam, 1, 'Synthetic exam question', 'identification', 1),
    (v_quiz, 1, 'Synthetic quiz question', 'identification', 1),
    (v_exam_essay, 1, 'Synthetic essay question', 'essay', 5);

  -- Everything below runs as the owning teacher.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  -- (d) An exam with items distributes exactly like a quiz, and the student is added.
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(v_exam, v_section, ARRAY[v_student], v_due, 'auto');
    v_quiz_response := public.eduscribe_day_task_distribute_v1(v_quiz, v_section, ARRAY[v_student], v_due, 'auto');
    v_ok := v_response->'ok' = 'true'::jsonb
      AND v_response->'added' = pg_catalog.to_jsonb(ARRAY[v_student])
      AND pg_catalog.jsonb_array_length(v_response->'alreadyAssigned') = 0
      AND v_response->>'checkingMode' = 'auto'
      AND (v_response - 'worksheetId') = (v_quiz_response - 'worksheetId')
      AND EXISTS (SELECT 1 FROM public.task_assignees a
        WHERE a.task_id = v_exam AND a.student_id = v_student AND a.section_id = v_section)
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_exam) = 'auto';
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' d_exam_distributes_like_quiz=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (e) An exam with no items and no directions is refused, as a quiz is.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_exam_empty, v_section, ARRAY[v_student], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  IF v_ok THEN
    v_ok := false;
    BEGIN
      PERFORM public.eduscribe_day_task_distribute_v1(v_quiz_empty, v_section, ARRAY[v_student], v_due, 'manual');
    EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  END IF;
  v_report := v_report || ' e_empty_exam_refused_like_quiz=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (e) Directions alone do not make an exam distributable; only an Activity ('worksheet') may have no items.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_exam_directions_only, v_section, ARRAY[v_student], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'invalid_document'; END;
  v_report := v_report || ' e_exam_directions_only_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (f) Once the exam has a student, its checking mode is locked, as for the quiz.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_day_task_distribute_v1(v_exam, v_section, ARRAY[v_student], v_due, 'manual');
  EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'checking_mode_locked'; END;
  IF v_ok THEN
    v_ok := false;
    BEGIN
      PERFORM public.eduscribe_day_task_distribute_v1(v_quiz, v_section, ARRAY[v_student], v_due, 'manual');
    EXCEPTION WHEN OTHERS THEN v_ok := SQLERRM = 'checking_mode_locked'; END;
  END IF;
  v_ok := v_ok AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_exam) = 'auto';
  v_report := v_report || ' f_exam_mode_locked_like_quiz=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- (f) An exam with an essay can go out as auto-checked, like a quiz
  -- (day-task-distribute-auto-essay.sql).
  v_ok := false;
  BEGIN
    v_response := public.eduscribe_day_task_distribute_v1(v_exam_essay, v_section, ARRAY[v_student], v_due, 'auto');
    v_ok := v_response->>'checkingMode' = 'auto'
      AND (SELECT w.checking_mode FROM public.worksheets w WHERE w.id = v_exam_essay) = 'auto';
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  v_report := v_report || ' f_essay_exam_auto_accepted=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  SELECT pg_catalog.jsonb_build_object(
    'users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'members', (SELECT pg_catalog.count(*) FROM public.section_students),
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
