-- TEST DATA ONLY. Run after applying and verifying the day-lock migration.
-- The forced error reports SELFTEST PASSED_ROLLED_BACK or FAILED_ROLLED_BACK.
-- All fixtures are synthetic. The outer exception undoes them on every path.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_inactive_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  v_plan uuid := pg_catalog.gen_random_uuid();
  v_other_ws uuid := pg_catalog.gen_random_uuid();
  v_collection uuid;
  v_submission uuid;
  v_answer uuid;
  v_wids uuid[];
  v_old_items uuid[];
  v_new_items uuid[];
  v_locked_ints integer[];
  v_expected_locked jsonb;
  v_before_locked jsonb;
  v_after_locked jsonb;
  v_before_counts jsonb;
  v_after_counts jsonb;
  v_save_payload jsonb;
  v_update_payload jsonb;
  v_day_payload jsonb;
  v_response jsonb;
  v_case text;
  v_error text;
  v_day integer;
  v_ok boolean;
  v_failures integer := 0;
  v_report text := '';
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'auth_users', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'students', (SELECT count(*) FROM public.students),
    'sections', (SELECT count(*) FROM public.sections),
    'lesson_plans', (SELECT count(*) FROM public.lesson_plans),
    'worksheet_collections', (SELECT count(*) FROM public.worksheet_collections),
    'worksheets', (SELECT count(*) FROM public.worksheets),
    'worksheet_items', (SELECT count(*) FROM public.worksheet_items),
    'worksheet_item_keys', (SELECT count(*) FROM public.worksheet_item_keys),
    'worksheet_item_private', (SELECT count(*) FROM public.worksheet_item_private),
    'worksheet_sections', (SELECT count(*) FROM public.worksheet_sections),
    'task_assignees', (SELECT count(*) FROM public.task_assignees),
    'worksheet_submissions', (SELECT count(*) FROM public.worksheet_submissions),
    'worksheet_answers', (SELECT count(*) FROM public.worksheet_answers))
    INTO v_before_counts;

  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'day-lock-teacher-' || v_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now()),
    (v_other_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'day-lock-other-' || v_other_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now()),
    (v_inactive_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'day-lock-inactive-' || v_inactive_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now()),
    (v_student, '00000000-0000-0000-0000-000000000000'::uuid,
      'day-lock-student-' || v_student::text || '@example.invalid',
      'authenticated', 'authenticated', '', now(), now(), now());
  INSERT INTO public.profiles (id, email, name, role, status) VALUES
    (v_teacher, 'day-lock-teacher-' || v_teacher::text || '@example.invalid',
      'Synthetic day-lock teacher', 'teacher', 'active'),
    (v_other_teacher, 'day-lock-other-' || v_other_teacher::text || '@example.invalid',
      'Synthetic other teacher', 'teacher', 'active'),
    (v_inactive_teacher, 'day-lock-inactive-' || v_inactive_teacher::text || '@example.invalid',
      'Synthetic inactive teacher', 'teacher', 'inactive'),
    (v_student, 'day-lock-student-' || v_student::text || '@example.invalid',
      'Synthetic student', 'student', 'active');
  INSERT INTO public.students (id) VALUES (v_student);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id)
    VALUES (v_section, 'Day-lock selftest ' || v_section::text,
      '7', '2025-2026', v_teacher);
  INSERT INTO public.lesson_plans (id, teacher_id, title, subject,
    grade_level, ai_generated)
    VALUES (v_plan, v_teacher, 'Synthetic AI lesson plan', 'Filipino', '7', true);
  INSERT INTO public.worksheets (id, teacher_id, title, status)
    VALUES (v_other_ws, v_teacher, 'Synthetic separate worksheet', 'Draft');
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  v_save_payload := pg_catalog.jsonb_build_object(
    'sourceLessonPlanId', v_plan::text, 'title', 'Synthetic five-day collection',
    'worksheets', '[]'::jsonb);
  FOR v_day IN 1..5 LOOP
    v_day_payload := pg_catalog.jsonb_build_object(
      'day', v_day, 'title', 'Synthetic day ' || v_day::text,
      'instructions', 'Answer each question.',
      'sections', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', 'main', 'title', 'Questions', 'directions', '')),
      'checkingMode', 'manual',
      'questions', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'position', 1, 'sectionId', 'main', 'question', 'Choose one.',
        'item_type', 'multiple_choice',
        'options', pg_catalog.jsonb_build_array('First', 'Second', 'Third', 'Fourth'),
        'points', 1, 'correct_answer', 'First')));
    v_save_payload := pg_catalog.jsonb_set(v_save_payload, '{worksheets}',
      (v_save_payload->'worksheets') || pg_catalog.jsonb_build_array(v_day_payload));
  END LOOP;

  FOREACH v_case IN ARRAY ARRAY[
    'no_lock', 'assignee_day1', 'locked_count', 'submission_day2',
    'cross_answer_day3', 'sections_day4', 'two_locked_days', 'all_locked_days',
    'title_change_locked', 'title_spaces_locked', 'title_change_unlocked',
    'invalid_locked', 'wrong_revision', 'archived', 'other_teacher',
    'inactive_teacher', 'archive_refused', 'delete_refused', 'restore',
    'changed_locked'] LOOP
    v_ok := false;
    BEGIN
      v_response := public.eduscribe_ai_weekly_worksheets_save_v1(
        pg_catalog.gen_random_uuid(), v_save_payload);
      v_collection := (v_response->>'collectionId')::uuid;
      SELECT pg_catalog.array_agg(w.id ORDER BY w.day_of_week) INTO v_wids
        FROM public.worksheets w WHERE w.collection_id = v_collection;
      SELECT pg_catalog.array_agg(i.id ORDER BY w.day_of_week) INTO v_old_items
        FROM public.worksheet_items i JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE w.collection_id = v_collection;
      IF pg_catalog.cardinality(v_wids) <> 5
          OR pg_catalog.cardinality(v_old_items) <> 5 THEN
        RAISE EXCEPTION 'synthetic five-day fixture unavailable';
      END IF;
      v_update_payload := v_save_payload - 'sourceLessonPlanId';
      FOR v_day IN 1..5 LOOP
        v_update_payload := pg_catalog.jsonb_set(v_update_payload,
          ARRAY['worksheets', (v_day - 1)::text, 'questions', '0', 'question'],
          pg_catalog.to_jsonb(('Revised prompt ' || v_day::text)::text));
      END LOOP;
      v_locked_ints := ARRAY[]::integer[];
      v_expected_locked := '[]'::jsonb;
      v_answer := NULL;
      v_error := NULL;

      IF v_case IN ('assignee_day1', 'locked_count', 'two_locked_days',
          'title_change_locked', 'title_spaces_locked', 'invalid_locked',
          'archive_refused', 'delete_refused', 'changed_locked') THEN
        INSERT INTO public.task_assignees
          (task_id, student_id, section_id, assigned_by)
          VALUES (v_wids[1], v_student, v_section, v_teacher);
        v_locked_ints := ARRAY[1];
        v_expected_locked := '[1]'::jsonb;
      END IF;
      IF v_case = 'submission_day2' THEN
        INSERT INTO public.worksheet_submissions (worksheet_id, student_id, section_id)
          VALUES (v_wids[2], v_student, v_section);
        v_locked_ints := ARRAY[2];
        v_expected_locked := '[2]'::jsonb;
      END IF;
      IF v_case = 'cross_answer_day3' THEN
        INSERT INTO public.worksheet_submissions (worksheet_id, student_id, section_id)
          VALUES (v_other_ws, v_student, v_section) RETURNING id INTO v_submission;
        INSERT INTO public.worksheet_answers (submission_id, item_id, answer)
          VALUES (v_submission, v_old_items[3], '"First"'::jsonb)
          RETURNING id INTO v_answer;
        v_locked_ints := ARRAY[3];
        v_expected_locked := '[3]'::jsonb;
      END IF;
      IF v_case = 'sections_day4' THEN
        INSERT INTO public.worksheet_sections (worksheet_id, section_id, posted_by)
          VALUES (v_wids[4], v_section, v_teacher);
        v_locked_ints := ARRAY[4];
        v_expected_locked := '[4]'::jsonb;
      END IF;
      IF v_case = 'two_locked_days' THEN
        INSERT INTO public.worksheet_sections (worksheet_id, section_id, posted_by)
          VALUES (v_wids[3], v_section, v_teacher);
        v_locked_ints := ARRAY[1, 3];
        v_expected_locked := '[1,3]'::jsonb;
      END IF;
      IF v_case = 'all_locked_days' THEN
        FOR v_day IN 1..5 LOOP
          INSERT INTO public.worksheet_sections (worksheet_id, section_id, posted_by)
            VALUES (v_wids[v_day], v_section, v_teacher);
        END LOOP;
        v_locked_ints := ARRAY[1, 2, 3, 4, 5];
      END IF;
      IF v_case IN ('title_change_locked', 'title_change_unlocked') THEN
        v_update_payload := pg_catalog.jsonb_set(v_update_payload, '{title}',
          pg_catalog.to_jsonb('Revised weekly set'::text));
      ELSIF v_case = 'title_spaces_locked' THEN
        v_update_payload := pg_catalog.jsonb_set(v_update_payload, '{title}',
          pg_catalog.to_jsonb('  Synthetic five-day collection  '::text));
      END IF;
      IF v_case = 'locked_count' THEN
        v_update_payload := pg_catalog.jsonb_set(v_update_payload,
          '{worksheets,0,questions}',
          (v_update_payload #> '{worksheets,0,questions}') ||
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'position', 2, 'sectionId', 'main', 'question', 'Choose another.',
            'item_type', 'multiple_choice',
            'options', pg_catalog.jsonb_build_array('First', 'Second', 'Third', 'Fourth'),
            'points', 1, 'correct_answer', 'First')));
      ELSIF v_case = 'invalid_locked' THEN
        v_update_payload := pg_catalog.jsonb_set(v_update_payload,
          '{worksheets,0,questions,0,options}',
          pg_catalog.jsonb_build_array('First', 'Second', 'Third'));
      END IF;

      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'worksheet', pg_catalog.to_jsonb(w), 'children', COALESCE((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'item', pg_catalog.to_jsonb(i), 'key', pg_catalog.to_jsonb(k),
              'private', pg_catalog.to_jsonb(p)) ORDER BY i.position)
            FROM public.worksheet_items i
            LEFT JOIN public.worksheet_item_keys k ON k.item_id = i.id
            LEFT JOIN public.worksheet_item_private p ON p.item_id = i.id
            WHERE i.worksheet_id = w.id), '[]'::jsonb))
          ORDER BY w.day_of_week), '[]'::jsonb) INTO v_before_locked
        FROM public.worksheets w WHERE w.collection_id = v_collection
          AND w.day_of_week = ANY(v_locked_ints);

      IF v_case IN ('all_locked_days', 'title_change_locked', 'invalid_locked',
          'wrong_revision', 'archived', 'other_teacher', 'inactive_teacher',
          'archive_refused', 'delete_refused') THEN
        IF v_case = 'archived' THEN
          PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(
            v_collection, 1, true);
        ELSIF v_case = 'other_teacher' THEN
          PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other_teacher::text, true);
          PERFORM pg_catalog.set_config('request.jwt.claims',
            pg_catalog.jsonb_build_object('sub', v_other_teacher::text)::text, true);
        ELSIF v_case = 'inactive_teacher' THEN
          PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_inactive_teacher::text, true);
          PERFORM pg_catalog.set_config('request.jwt.claims',
            pg_catalog.jsonb_build_object('sub', v_inactive_teacher::text)::text, true);
        END IF;
        BEGIN
          IF v_case = 'archive_refused' THEN
            PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(
              v_collection, 1, true);
          ELSIF v_case = 'delete_refused' THEN
            PERFORM public.eduscribe_ai_weekly_worksheets_delete_v1(
              v_collection, 1);
          ELSE
            PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(
              v_collection, CASE WHEN v_case IN ('wrong_revision', 'archived')
                THEN 2 ELSE 1 END, v_update_payload);
          END IF;
        EXCEPTION WHEN OTHERS THEN v_error := SQLERRM;
        END;
        v_ok := v_error = CASE v_case
          WHEN 'wrong_revision' THEN 'revision_conflict'
          WHEN 'archived' THEN 'collection_archived'
          WHEN 'other_teacher' THEN 'not_found'
          WHEN 'inactive_teacher' THEN 'inactive_teacher'
          WHEN 'invalid_locked' THEN 'invalid_document'
          ELSE 'student_work_exists' END;
        IF v_case = 'invalid_locked' THEN
          v_ok := v_ok AND (SELECT c.revision = 1
            FROM public.worksheet_collections c WHERE c.id = v_collection);
        END IF;
      ELSE
        IF v_case = 'restore' THEN
          PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(
            v_collection, 1, true);
          PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(
            v_collection, 2, false);
        END IF;
        v_response := public.eduscribe_ai_weekly_worksheets_update_v1(
          v_collection, CASE WHEN v_case = 'restore' THEN 3 ELSE 1 END,
          v_update_payload);
        SELECT pg_catalog.array_agg(i.id ORDER BY w.day_of_week) INTO v_new_items
          FROM public.worksheet_items i JOIN public.worksheets w ON w.id = i.worksheet_id
          WHERE w.collection_id = v_collection;
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'worksheet', pg_catalog.to_jsonb(w), 'children', COALESCE((
              SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'item', pg_catalog.to_jsonb(i), 'key', pg_catalog.to_jsonb(k),
                'private', pg_catalog.to_jsonb(p)) ORDER BY i.position)
              FROM public.worksheet_items i
              LEFT JOIN public.worksheet_item_keys k ON k.item_id = i.id
              LEFT JOIN public.worksheet_item_private p ON p.item_id = i.id
              WHERE i.worksheet_id = w.id), '[]'::jsonb))
            ORDER BY w.day_of_week), '[]'::jsonb) INTO v_after_locked
          FROM public.worksheets w WHERE w.collection_id = v_collection
            AND w.day_of_week = ANY(v_locked_ints);
        v_ok := v_response->'ok' = 'true'::jsonb
          AND (v_response->>'revision') =
            CASE WHEN v_case = 'restore' THEN '4' ELSE '2' END
          AND v_response->'lockedDays' = v_expected_locked
          AND pg_catalog.jsonb_array_length(v_response->'worksheets') = 5
          AND (SELECT pg_catalog.array_agg(w.id ORDER BY w.day_of_week)
            FROM public.worksheets w WHERE w.collection_id = v_collection) = v_wids
          AND v_before_locked = v_after_locked
          AND pg_catalog.cardinality(v_new_items) = 5;
        FOR v_day IN 1..5 LOOP
          IF v_day = ANY(v_locked_ints) THEN
            v_ok := v_ok AND v_new_items[v_day] = v_old_items[v_day];
          ELSE
            v_ok := v_ok AND v_new_items[v_day] <> v_old_items[v_day];
          END IF;
        END LOOP;
        IF v_case = 'locked_count' THEN
          v_ok := v_ok AND (v_response #>> '{worksheets,0,items}') = '1';
        ELSIF v_case = 'cross_answer_day3' THEN
          v_ok := v_ok AND EXISTS (SELECT 1 FROM public.worksheet_answers a
            WHERE a.id = v_answer AND a.item_id = v_old_items[3]);
        ELSIF v_case = 'title_spaces_locked' THEN
          v_ok := v_ok AND (SELECT c.title = 'Synthetic five-day collection'
            FROM public.worksheet_collections c WHERE c.id = v_collection);
        ELSIF v_case = 'title_change_unlocked' THEN
          v_ok := v_ok AND (SELECT c.title = 'Revised weekly set'
            FROM public.worksheet_collections c WHERE c.id = v_collection);
        END IF;
      END IF;
      RAISE EXCEPTION 'rollback_case';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    END;
    v_report := v_report || ' ' || v_case || '=' ||
      CASE WHEN v_ok IS TRUE THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  SELECT pg_catalog.jsonb_build_object(
    'auth_users', (SELECT count(*) FROM auth.users),
    'profiles', (SELECT count(*) FROM public.profiles),
    'students', (SELECT count(*) FROM public.students),
    'sections', (SELECT count(*) FROM public.sections),
    'lesson_plans', (SELECT count(*) FROM public.lesson_plans),
    'worksheet_collections', (SELECT count(*) FROM public.worksheet_collections),
    'worksheets', (SELECT count(*) FROM public.worksheets),
    'worksheet_items', (SELECT count(*) FROM public.worksheet_items),
    'worksheet_item_keys', (SELECT count(*) FROM public.worksheet_item_keys),
    'worksheet_item_private', (SELECT count(*) FROM public.worksheet_item_private),
    'worksheet_sections', (SELECT count(*) FROM public.worksheet_sections),
    'task_assignees', (SELECT count(*) FROM public.task_assignees),
    'worksheet_submissions', (SELECT count(*) FROM public.worksheet_submissions),
    'worksheet_answers', (SELECT count(*) FROM public.worksheet_answers))
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
