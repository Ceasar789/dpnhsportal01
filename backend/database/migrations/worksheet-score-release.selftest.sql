-- Synthetic, rolled-back checks for eduscribe_worksheet_score_release_v1.
-- Requires the worksheet assessment, task RLS, and weekly collection schemas.
-- The final error reports SELFTEST PASSED_ROLLED_BACK or FAILED_ROLLED_BACK.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_student2 uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  v_collection uuid := pg_catalog.gen_random_uuid();
  v_plain_ws uuid := pg_catalog.gen_random_uuid();
  v_other_ws uuid := pg_catalog.gen_random_uuid();
  v_zero_ws uuid := pg_catalog.gen_random_uuid();
  v_ai_ws uuid := pg_catalog.gen_random_uuid();
  v_main_sub uuid := pg_catalog.gen_random_uuid();
  v_inprogress_sub uuid := pg_catalog.gen_random_uuid();
  v_other_sub uuid := pg_catalog.gen_random_uuid();
  v_zero_sub uuid := pg_catalog.gen_random_uuid();
  v_ai_sub uuid := pg_catalog.gen_random_uuid();
  v_item1 uuid := pg_catalog.gen_random_uuid();
  v_item2 uuid := pg_catalog.gen_random_uuid();
  v_other_item uuid := pg_catalog.gen_random_uuid();
  v_zero_item uuid := pg_catalog.gen_random_uuid();
  v_ai_item uuid := pg_catalog.gen_random_uuid();
  v_before_counts jsonb;
  v_after_counts jsonb;
  v_before_state jsonb;
  v_after_state jsonb;
  v_case text;
  v_actor uuid;
  v_call_sub uuid;
  v_marks jsonb;
  v_receipt jsonb;
  v_error text;
  v_direct_error text;
  v_affected integer;
  v_ok boolean;
  v_failures integer := 0;
  v_report text := '';
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'auth_users', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'students', (SELECT count(*) FROM public.students),
    'sections', (SELECT count(*) FROM public.sections),
    'worksheet_collections', (SELECT count(*) FROM public.worksheet_collections),
    'worksheets', (SELECT count(*) FROM public.worksheets),
    'worksheet_items', (SELECT count(*) FROM public.worksheet_items),
    'worksheet_submissions', (SELECT count(*) FROM public.worksheet_submissions),
    'worksheet_answers', (SELECT count(*) FROM public.worksheet_answers),
    'task_assignees', (SELECT count(*) FROM public.task_assignees))
    INTO v_before_counts;

  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
    (v_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'score-teacher-' || v_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now()),
    (v_other_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'score-other-' || v_other_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now()),
    (v_student, '00000000-0000-0000-0000-000000000000'::uuid,
      'score-student-' || v_student::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now()),
    (v_student2, '00000000-0000-0000-0000-000000000000'::uuid,
      'score-student-' || v_student2::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now());
  INSERT INTO public.profiles (id, email, name, role, status) VALUES
    (v_teacher, 'score-teacher-' || v_teacher::text || '@example.invalid',
      'Synthetic scoring teacher', 'teacher', 'active'),
    (v_other_teacher, 'score-other-' || v_other_teacher::text || '@example.invalid',
      'Synthetic other teacher', 'teacher', 'active'),
    (v_student, 'score-student-' || v_student::text || '@example.invalid',
      'Synthetic scoring student', 'student', 'active'),
    (v_student2, 'score-student-' || v_student2::text || '@example.invalid',
      'Synthetic second student', 'student', 'active');
  INSERT INTO public.students (id) VALUES (v_student), (v_student2);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id)
    VALUES (v_section, 'Synthetic score section ' || v_section::text,
      '7', '2025-2026', v_teacher);
  INSERT INTO public.worksheet_collections
    (id, teacher_id, title, request_id, payload_fingerprint)
    VALUES (v_collection, v_teacher, 'Synthetic scoring collection',
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('a', 64));
  INSERT INTO public.worksheets
    (id, teacher_id, title, status, origin, collection_id, day_of_week) VALUES
    (v_plain_ws, v_teacher, 'Synthetic plain worksheet', 'Draft', 'manual', NULL, NULL),
    (v_other_ws, v_teacher, 'Synthetic separate worksheet', 'Draft', 'manual', NULL, NULL),
    (v_zero_ws, v_teacher, 'Synthetic zero-point worksheet', 'Draft', 'manual', NULL, NULL),
    (v_ai_ws, v_teacher, 'Synthetic saved AI day', 'Draft', 'ai_generated', v_collection, 1);
  INSERT INTO public.worksheet_items
    (id, worksheet_id, position, question, item_type, points) VALUES
    (v_item1, v_plain_ws, 1, 'Synthetic item one', 'identification', 2),
    (v_item2, v_plain_ws, 2, 'Synthetic item two', 'identification', 3),
    (v_other_item, v_other_ws, 1, 'Synthetic separate item', 'identification', 1),
    (v_zero_item, v_zero_ws, 1, 'Synthetic zero-point item', 'identification', 0),
    (v_ai_item, v_ai_ws, 1, 'Synthetic saved AI item', 'identification', 4);
  INSERT INTO public.worksheet_submissions
    (id, worksheet_id, student_id, section_id, status) VALUES
    (v_main_sub, v_plain_ws, v_student, v_section, 'submitted'),
    (v_inprogress_sub, v_plain_ws, v_student2, v_section, 'in_progress'),
    (v_other_sub, v_other_ws, v_student, v_section, 'submitted'),
    (v_zero_sub, v_zero_ws, v_student, v_section, 'submitted'),
    (v_ai_sub, v_ai_ws, v_student, v_section, 'submitted');
  INSERT INTO public.worksheet_answers (submission_id, item_id, answer)
    VALUES (v_main_sub, v_item1, pg_catalog.to_jsonb('Synthetic answer'::text));
  INSERT INTO public.task_assignees (task_id, student_id, section_id, assigned_by)
    VALUES (v_other_ws, v_student, v_section, v_teacher);

  FOREACH v_case IN ARRAY ARRAY[
    'happy', 'unanswered_row', 'answer_unchanged', 're_release',
    'wrong_teacher', 'student_caller', 'in_progress', 'missing_mark',
    'duplicate_item', 'foreign_item', 'above_max', 'negative',
    'three_decimals', 'zero_total', 'unauthenticated', 'atomicity',
    'student_direct_blocked', 'ai_collection', 'plain_worksheet'] LOOP
    v_ok := false;
    v_error := NULL;
    v_direct_error := NULL;
    v_receipt := NULL;
    v_actor := v_teacher;
    v_call_sub := v_main_sub;
    v_marks := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2),
      pg_catalog.jsonb_build_object('itemId', v_item2, 'points', 3));

    CASE v_case
      WHEN 'wrong_teacher' THEN v_actor := v_other_teacher;
      WHEN 'student_caller' THEN v_actor := v_student;
      WHEN 'in_progress' THEN v_call_sub := v_inprogress_sub;
      WHEN 'missing_mark' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2));
      WHEN 'duplicate_item' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2),
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2));
      WHEN 'foreign_item' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2),
        pg_catalog.jsonb_build_object('itemId', v_other_item, 'points', 1));
      WHEN 'above_max' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2),
        pg_catalog.jsonb_build_object('itemId', v_item2, 'points', 4));
      WHEN 'negative' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', -1),
        pg_catalog.jsonb_build_object('itemId', v_item2, 'points', 3));
      WHEN 'three_decimals' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 1.001),
        pg_catalog.jsonb_build_object('itemId', v_item2, 'points', 3));
      WHEN 'zero_total' THEN
        v_call_sub := v_zero_sub;
        v_marks := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('itemId', v_zero_item, 'points', 0));
      WHEN 'unauthenticated' THEN v_actor := NULL;
      WHEN 'atomicity' THEN v_marks := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 2),
        pg_catalog.jsonb_build_object('itemId', v_item2, 'points', 4));
      WHEN 'ai_collection' THEN
        v_call_sub := v_ai_sub;
        v_marks := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('itemId', v_ai_item, 'points', 4));
      ELSE NULL;
    END CASE;

    BEGIN
      IF v_case = 'atomicity' THEN
        SELECT pg_catalog.jsonb_build_object(
          'submission', (SELECT pg_catalog.to_jsonb(s) FROM public.worksheet_submissions s
            WHERE s.id = v_main_sub),
          'answers', (SELECT COALESCE(
            pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.item_id), '[]'::jsonb)
            FROM public.worksheet_answers a WHERE a.submission_id = v_main_sub))
          INTO v_before_state;
      END IF;

      BEGIN
        PERFORM pg_catalog.set_config('request.jwt.claim.sub',
          COALESCE(v_actor::text, ''), true);
        PERFORM pg_catalog.set_config('request.jwt.claims',
          CASE WHEN v_actor IS NULL THEN '{}' ELSE
            pg_catalog.jsonb_build_object('sub', v_actor::text)::text END, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_receipt := public.eduscribe_worksheet_score_release_v1(v_call_sub, v_marks);
        EXECUTE 'RESET ROLE';
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        EXECUTE 'RESET ROLE';
      END;

      IF v_case = 're_release' AND v_error IS NULL THEN
        v_marks := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('itemId', v_item1, 'points', 1.5),
          pg_catalog.jsonb_build_object('itemId', v_item2, 'points', 3));
        BEGIN
          PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
          PERFORM pg_catalog.set_config('request.jwt.claims',
            pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
          EXECUTE 'SET LOCAL ROLE authenticated';
          v_receipt := public.eduscribe_worksheet_score_release_v1(v_main_sub, v_marks);
          EXECUTE 'RESET ROLE';
        EXCEPTION WHEN OTHERS THEN
          v_error := SQLERRM;
          EXECUTE 'RESET ROLE';
        END;
      END IF;

      IF v_case = 'student_direct_blocked' AND v_error IS NULL THEN
        BEGIN
          PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
          PERFORM pg_catalog.set_config('request.jwt.claims',
            pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
          EXECUTE 'SET LOCAL ROLE authenticated';
          UPDATE public.worksheet_submissions SET score = 1 WHERE id = v_other_sub;
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          EXECUTE 'RESET ROLE';
        EXCEPTION WHEN OTHERS THEN
          v_direct_error := SQLERRM;
          EXECUTE 'RESET ROLE';
        END;
      END IF;

      CASE v_case
        WHEN 'happy' THEN
          SELECT v_error IS NULL
            AND v_receipt = pg_catalog.jsonb_build_object('ok', true,
              'submissionId', v_main_sub, 'score', 5, 'totalPoints', 5)
            AND s.status = 'checked' AND s.released IS TRUE
            AND s.score = 5 AND s.total_points = 5
            AND s.checked_by = v_teacher AND s.checked_at IS NOT NULL
            AND (SELECT count(*) FROM public.worksheet_answers a
              WHERE a.submission_id = v_main_sub AND a.points_earned IS NOT NULL
                AND a.is_correct IS TRUE) = 2
            INTO v_ok FROM public.worksheet_submissions s WHERE s.id = v_main_sub;
        WHEN 'unanswered_row' THEN
          SELECT v_error IS NULL AND a.answer IS NULL AND a.points_earned = 3
            INTO v_ok FROM public.worksheet_answers a
            WHERE a.submission_id = v_main_sub AND a.item_id = v_item2;
        WHEN 'answer_unchanged' THEN
          SELECT v_error IS NULL
            AND a.answer = pg_catalog.to_jsonb('Synthetic answer'::text)
            INTO v_ok FROM public.worksheet_answers a
            WHERE a.submission_id = v_main_sub AND a.item_id = v_item1;
        WHEN 're_release' THEN
          SELECT v_error IS NULL AND s.status = 'checked' AND s.released IS TRUE
            AND s.score = 4.5 AND s.total_points = 5
            AND (SELECT a.points_earned FROM public.worksheet_answers a
              WHERE a.submission_id = v_main_sub AND a.item_id = v_item1) = 1.5
            INTO v_ok FROM public.worksheet_submissions s WHERE s.id = v_main_sub;
        WHEN 'wrong_teacher', 'student_caller' THEN v_ok := v_error = 'not_found';
        WHEN 'in_progress' THEN v_ok := v_error = 'invalid_state';
        WHEN 'missing_mark', 'duplicate_item', 'foreign_item', 'above_max',
          'negative', 'three_decimals', 'zero_total' THEN
          v_ok := v_error = 'invalid_marks';
        WHEN 'unauthenticated' THEN v_ok := v_error = 'not_authenticated';
        WHEN 'atomicity' THEN
          SELECT pg_catalog.jsonb_build_object(
            'submission', (SELECT pg_catalog.to_jsonb(s) FROM public.worksheet_submissions s
              WHERE s.id = v_main_sub),
            'answers', (SELECT COALESCE(
              pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.item_id), '[]'::jsonb)
              FROM public.worksheet_answers a WHERE a.submission_id = v_main_sub))
            INTO v_after_state;
          v_ok := v_error = 'invalid_marks'
            AND v_before_state IS NOT DISTINCT FROM v_after_state;
        WHEN 'student_direct_blocked' THEN
          SELECT v_error IS NULL
            AND v_direct_error = 'Only the worksheet owner may set scoring fields'
            AND s.score IS NULL AND s.released IS FALSE
            INTO v_ok FROM public.worksheet_submissions s WHERE s.id = v_other_sub;
        WHEN 'ai_collection' THEN
          SELECT v_error IS NULL AND w.collection_id = v_collection
            AND s.status = 'checked' AND s.released IS TRUE
            AND s.score = 4 AND s.total_points = 4
            INTO v_ok FROM public.worksheet_submissions s
            JOIN public.worksheets w ON w.id = s.worksheet_id WHERE s.id = v_ai_sub;
        WHEN 'plain_worksheet' THEN
          SELECT v_error IS NULL AND w.collection_id IS NULL
            AND s.status = 'checked' AND s.released IS TRUE
            AND s.score = 5 AND s.total_points = 5
            INTO v_ok FROM public.worksheet_submissions s
            JOIN public.worksheets w ON w.id = s.worksheet_id WHERE s.id = v_main_sub;
      END CASE;
      RAISE EXCEPTION 'rollback_case';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
      EXECUTE 'RESET ROLE';
    END;
    v_report := v_report || ' ' || v_case || '=' ||
      CASE WHEN v_ok IS TRUE THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  SELECT pg_catalog.jsonb_build_object(
    'auth_users', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'students', (SELECT count(*) FROM public.students),
    'sections', (SELECT count(*) FROM public.sections),
    'worksheet_collections', (SELECT count(*) FROM public.worksheet_collections),
    'worksheets', (SELECT count(*) FROM public.worksheets),
    'worksheet_items', (SELECT count(*) FROM public.worksheet_items),
    'worksheet_submissions', (SELECT count(*) FROM public.worksheet_submissions),
    'worksheet_answers', (SELECT count(*) FROM public.worksheet_answers),
    'task_assignees', (SELECT count(*) FROM public.task_assignees))
    INTO v_after_counts;
  v_report := v_report || ' rollback_counts=' ||
    CASE WHEN v_before_counts = v_after_counts THEN 'PASS' ELSE 'FAIL' END;
  IF v_before_counts IS DISTINCT FROM v_after_counts THEN
    v_failures := v_failures + 1;
  END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END $$;
ROLLBACK;
