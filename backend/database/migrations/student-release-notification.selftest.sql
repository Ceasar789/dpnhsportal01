-- Synthetic, rolled-back checks for student-release-notification.sql. Run as
-- postgres in the SQL editor, after applying it. Synthetic users, a section,
-- worksheets, items, keys, answers, assignees and submissions are made inside
-- this transaction. Releases go through the real release function as the
-- teacher (authenticated role with the teacher's claims), and the auto-release
-- through a real student submit, so RLS, the guard and every trigger run.
-- The final error reports SELFTEST PASSED_ROLLED_BACK or FAILED_ROLLED_BACK.
-- Nothing persists on any path.
BEGIN;
DO $selftest$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_student2 uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  w_manual uuid := pg_catalog.gen_random_uuid();
  w_auto uuid := pg_catalog.gen_random_uuid();
  w_fail uuid := pg_catalog.gen_random_uuid();
  w_insert uuid := pg_catalog.gen_random_uuid();
  i_manual uuid := pg_catalog.gen_random_uuid();
  i_manual2 uuid := pg_catalog.gen_random_uuid();
  i_auto uuid := pg_catalog.gen_random_uuid();
  i_fail uuid := pg_catalog.gen_random_uuid();
  s_manual uuid := pg_catalog.gen_random_uuid();
  s_manual_b uuid := pg_catalog.gen_random_uuid();
  s_auto uuid := pg_catalog.gen_random_uuid();
  s_fail uuid := pg_catalog.gen_random_uuid();
  s_insert uuid := pg_catalog.gen_random_uuid();
  v_signature regprocedure := 'public.eduscribe_notify_student_release_v1()'::regprocedure;
  v_marks jsonb;
  v_receipt jsonb;
  v_note record;
  v_n integer;
  v_m integer;
  v_error text;
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
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'keys', (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys),
    'submissions', (SELECT pg_catalog.count(*) FROM public.worksheet_submissions),
    'answers', (SELECT pg_catalog.count(*) FROM public.worksheet_answers),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'notifications', (SELECT pg_catalog.count(*) FROM public.notifications)) INTO v_before;

  -- Fixtures, written as postgres with no user claims, so the guard steps aside.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'release-note-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_student, v_student2]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'release-note-' || u.id::text || '@example.invalid', 'Synthetic release-note user', u.role, 'active'
  FROM (VALUES (v_teacher, 'teacher'), (v_student, 'student'), (v_student2, 'student')) AS u(id, role)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id) VALUES (v_student), (v_student2);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id)
    VALUES (v_section, 'Release-note selftest ' || v_section::text, '7', '2025-2026', v_teacher);
  INSERT INTO public.worksheets (id, teacher_id, title, status, origin, task_type, checking_mode) VALUES
    (w_manual, v_teacher, 'Synthetic release quiz', 'Draft', 'manual', 'quiz', 'manual'),
    (w_auto, v_teacher, 'Synthetic auto quiz', 'Draft', 'manual', 'quiz', 'auto'),
    (w_fail, v_teacher, 'Synthetic failing note quiz', 'Draft', 'manual', 'quiz', 'manual'),
    (w_insert, v_teacher, 'Synthetic inserted quiz', 'Draft', 'manual', 'quiz', 'manual');
  INSERT INTO public.worksheet_items (id, worksheet_id, position, question, item_type, options, points) VALUES
    (i_manual, w_manual, 1, 'Red planet', 'identification', NULL, 2),
    (i_manual2, w_manual, 2, 'Blue planet', 'identification', NULL, 5),
    (i_auto, w_auto, 1, 'Red planet', 'identification', NULL, 1),
    (i_fail, w_fail, 1, 'Red planet', 'identification', NULL, 1);
  INSERT INTO public.worksheet_item_keys (item_id, correct_answer) VALUES (i_auto, '["Mars"]');
  INSERT INTO public.worksheet_submissions (id, worksheet_id, student_id, section_id, status) VALUES
    (s_manual, w_manual, v_student, v_section, 'submitted'),
    (s_manual_b, w_manual, v_student2, v_section, 'submitted'),
    (s_auto, w_auto, v_student, v_section, 'in_progress'),
    (s_fail, w_fail, v_student, v_section, 'submitted');
  INSERT INTO public.worksheet_answers (submission_id, item_id, answer) VALUES
    (s_auto, i_auto, '"Mars"');
  INSERT INTO public.task_assignees (task_id, student_id, section_id, due_at, assigned_by) VALUES
    (w_manual, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_manual, v_student2, v_section, '2099-01-01 00:00', v_teacher),
    (w_auto, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_fail, v_student, v_section, '2099-01-01 00:00', v_teacher);

  -- Case 1: a teacher release creates exactly one notification, for the right
  -- student, of type task, linking to the Tasks Done view, naming only the title.
  v_ok := false;
  v_error := NULL;
  BEGIN
    v_marks := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('itemId', i_manual, 'points', 2),
      pg_catalog.jsonb_build_object('itemId', i_manual2, 'points', 4));
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_worksheet_score_release_v1(s_manual, v_marks);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n
    WHERE n.related_entity_type = 'worksheet_submission' AND n.related_entity_id = s_manual;
  SELECT n.* INTO v_note FROM public.notifications n
    WHERE n.related_entity_type = 'worksheet_submission' AND n.related_entity_id = s_manual LIMIT 1;
  v_ok := v_error IS NULL AND (v_receipt->>'ok')::boolean IS TRUE
    AND (SELECT s.released FROM public.worksheet_submissions s WHERE s.id = s_manual) IS TRUE
    AND v_n = 1
    AND v_note.user_id = v_student
    AND v_note.notification_type = 'task'
    AND v_note.title = 'Result ready'
    AND v_note.message = 'Your result for "Synthetic release quiz" is ready.'
    AND v_note.action_url = '/student-dashboard/tasks?view=done'
    AND COALESCE(v_note.is_read, false) = false;
  v_report := v_report || ' c1_teacher_release_one_notification=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || COALESCE(v_error, '') END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 2: no score in the text (score 6, total 7 in case 1).
  v_ok := v_note.message IS NOT NULL
    AND pg_catalog.strpos(v_note.message || ' ' || v_note.title, '6') = 0
    AND pg_catalog.strpos(v_note.message || ' ' || v_note.title, '7') = 0
    AND v_note.message !~* '(score|points|/)';
  v_report := v_report || ' c2_no_score_in_text=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 3: releasing again, another UPDATE of the row, and unrelease + release
  -- all leave exactly one notification.
  v_ok := false;
  v_error := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_worksheet_score_release_v1(s_manual, v_marks);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  UPDATE public.worksheet_submissions SET updated_at = pg_catalog.now() WHERE id = s_manual;
  UPDATE public.worksheet_submissions SET released = false WHERE id = s_manual;
  UPDATE public.worksheet_submissions SET released = true WHERE id = s_manual;
  SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n
    WHERE n.related_entity_type = 'worksheet_submission' AND n.related_entity_id = s_manual;
  v_ok := v_error IS NULL AND v_n = 1;
  v_report := v_report || ' c3_rerelease_and_updates_add_none=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || COALESCE(v_error, '') END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 4: the instant auto-release when the student submits creates none.
  v_ok := false;
  v_error := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.worksheet_submissions SET status = 'submitted' WHERE id = s_auto;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n
    WHERE n.related_entity_type = 'worksheet_submission' AND n.related_entity_id = s_auto;
  -- released must really be true here, or this case would prove nothing.
  v_ok := v_error IS NULL AND v_n = 0
    AND (SELECT s.released FROM public.worksheet_submissions s WHERE s.id = s_auto) IS TRUE;
  v_report := v_report || ' c4_auto_release_at_submit_adds_none=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || COALESCE(v_error, '') END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 5: a different student gets nothing.
  SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n
    WHERE n.user_id = v_student2 AND n.related_entity_type = 'worksheet_submission';
  v_ok := v_n = 0;
  v_report := v_report || ' c5_other_student_gets_none=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 6: RLS. The student reads their own notification; another student cannot.
  v_ok := false;
  v_n := NULL;
  v_m := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n WHERE n.related_entity_id = s_manual;
    EXECUTE 'RESET ROLE';
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student2::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_student2::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT pg_catalog.count(*) INTO v_m FROM public.notifications n WHERE n.related_entity_id = s_manual;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  v_ok := v_n = 1 AND v_m = 0;
  v_report := v_report || ' c6_rls_owner_only=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 7: a notification that cannot be written never blocks the release.
  EXECUTE $ddl$
CREATE FUNCTION public.eduscribe_selftest_note_fail_tmp() RETURNS trigger
LANGUAGE plpgsql AS $body$
BEGIN
  RAISE EXCEPTION 'selftest_forced_notification_error';
END
$body$
$ddl$;
  EXECUTE pg_catalog.format($ddl$
CREATE TRIGGER eduscribe_selftest_note_fail_tmp
BEFORE INSERT ON public.notifications FOR EACH ROW
WHEN (NEW.related_entity_id = %L::uuid)
EXECUTE FUNCTION public.eduscribe_selftest_note_fail_tmp()
$ddl$, s_fail);
  v_ok := false;
  v_error := NULL;
  v_receipt := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_worksheet_score_release_v1(s_fail,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('itemId', i_fail, 'points', 1)));
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    EXECUTE 'RESET ROLE';
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n WHERE n.related_entity_id = s_fail;
  v_ok := v_error IS NULL AND (v_receipt->>'ok')::boolean IS TRUE AND v_n = 0
    AND (SELECT s.released FROM public.worksheet_submissions s WHERE s.id = s_fail) IS TRUE;
  v_report := v_report || ' c7_failed_notification_keeps_release=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || COALESCE(v_error, '') END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 8: a row inserted already released creates none.
  INSERT INTO public.worksheet_submissions (id, worksheet_id, student_id, section_id, status, released, score, total_points)
    VALUES (s_insert, w_insert, v_student, v_section, 'checked', true, 1, 1);
  SELECT pg_catalog.count(*) INTO v_n FROM public.notifications n WHERE n.related_entity_id = s_insert;
  v_ok := v_n = 0;
  v_report := v_report || ' c8_insert_released_adds_none=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 9: the definition the design depends on.
  v_ok := (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND (SELECT r.rolname FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE p.oid = v_signature::oid) = 'postgres'
    AND (SELECT 'search_path=pg_catalog, pg_temp' = ANY(p.proconfig)
      FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND NOT pg_catalog.has_function_privilege('anon', v_signature::oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('authenticated', v_signature::oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', v_signature::oid, 'EXECUTE')
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = 'public.worksheet_submissions'::regclass
        AND t.tgname = 'trg_notify_student_release' AND NOT t.tgisinternal AND t.tgenabled <> 'D');
  v_report := v_report || ' c9_definer_owner_path_grants_trigger=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  SELECT pg_catalog.jsonb_build_object(
    'users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'keys', (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys),
    'submissions', (SELECT pg_catalog.count(*) FROM public.worksheet_submissions),
    'answers', (SELECT pg_catalog.count(*) FROM public.worksheet_answers),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'notifications', (SELECT pg_catalog.count(*) FROM public.notifications)) INTO v_after;
  -- Case 10: nothing persisted.
  v_ok := v_before = v_after;
  v_report := v_report || ' c10_rollback_counts=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END
$selftest$;
ROLLBACK;
