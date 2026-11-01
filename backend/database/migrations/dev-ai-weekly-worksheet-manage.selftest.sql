-- TEST DATA ONLY. Run only after applying and verifying the Manage migration.
-- Synthetic auth users, profiles, student, plan, section and worksheet rows are
-- made inside this transaction. The error text is SELFTEST PASSED_ROLLED_BACK ...
-- or SELFTEST FAILED_ROLLED_BACK ...; nothing persists on any path.
-- This is a SQL Editor test, not an application migration.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  v_plan uuid := pg_catalog.gen_random_uuid();
  v_other_ws uuid := pg_catalog.gen_random_uuid();
  v_request uuid := pg_catalog.gen_random_uuid();
  v_collection uuid;
  v_day integer;
  v_day_payload jsonb;
  v_save_payload jsonb;
  v_update_day jsonb;
  v_update_payload jsonb;
  v_response jsonb;
  v_work_case text;
  v_wids uuid[];
  v_old_items uuid[];
  v_new_items uuid[];
  v_submission uuid;
  v_archive_ok boolean;
  v_update_ok boolean;
  v_delete_ok boolean;
  v_error_ok boolean;
  v_ok boolean;
  v_count integer;
  v_failures integer := 0;
  v_report text := '';
BEGIN
  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES
    (v_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'weekly-manage-teacher-' || v_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()),
    (v_other_teacher, '00000000-0000-0000-0000-000000000000'::uuid,
      'weekly-manage-other-' || v_other_teacher::text || '@example.invalid',
      'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()),
    (v_student, '00000000-0000-0000-0000-000000000000'::uuid,
      'weekly-manage-student-' || v_student::text || '@example.invalid',
      'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now());
  INSERT INTO public.profiles (id, email, name, role, status) VALUES
    (v_teacher, 'weekly-manage-teacher-' || v_teacher::text || '@example.invalid',
      'Synthetic weekly teacher', 'teacher', 'active'),
    (v_other_teacher, 'weekly-manage-other-' || v_other_teacher::text || '@example.invalid',
      'Synthetic other teacher', 'teacher', 'active'),
    (v_student, 'weekly-manage-student-' || v_student::text || '@example.invalid',
      'Synthetic weekly student', 'student', 'active')
    ON CONFLICT (id) DO NOTHING;
  IF (SELECT count(*) FROM public.profiles p
      WHERE p.id IN (v_teacher, v_other_teacher)
        AND p.role = 'teacher' AND p.status = 'active') <> 2
      OR NOT EXISTS (SELECT 1 FROM public.profiles p
        WHERE p.id = v_student AND p.role = 'student') THEN
    RAISE EXCEPTION 'synthetic profile fixture unavailable';
  END IF;
  INSERT INTO public.students (id) VALUES (v_student);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id)
    VALUES (v_section, 'Weekly manage selftest ' || v_section::text,
      '7', '2025-2026', v_teacher);
  INSERT INTO public.lesson_plans (id, teacher_id, title, subject,
    grade_level, ai_generated)
    VALUES (v_plan, v_teacher, 'Synthetic AI lesson plan', 'Filipino', '7', true);
  INSERT INTO public.worksheets (id, teacher_id, title, status)
    VALUES (v_other_ws, v_teacher, 'Synthetic answer-link fixture', 'Draft');

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
        'position', 1, 'sectionId', 'main', 'question', 'Choose the first answer.',
        'item_type', 'multiple_choice',
        'options', pg_catalog.jsonb_build_array('First', 'Second', 'Third', 'Fourth'),
        'points', 1, 'correct_answer', 'First')));
    v_save_payload := pg_catalog.jsonb_set(v_save_payload, '{worksheets}',
      (v_save_payload->'worksheets') || pg_catalog.jsonb_build_array(v_day_payload));
  END LOOP;
  v_response := public.eduscribe_ai_weekly_worksheets_save_v1(v_request, v_save_payload);
  v_collection := (v_response->>'collectionId')::uuid;
  SELECT pg_catalog.array_agg(w.id ORDER BY w.day_of_week) INTO v_wids
    FROM public.worksheets w WHERE w.collection_id = v_collection;
  SELECT pg_catalog.array_agg(i.id ORDER BY i.id) INTO v_old_items
    FROM public.worksheet_items i WHERE i.worksheet_id = ANY(v_wids);
  v_ok := v_response->'ok' = 'true'::jsonb
    AND pg_catalog.array_length(v_wids, 1) = 5
    AND pg_catalog.array_length(v_old_items, 1) = 5
    AND (SELECT c.revision FROM public.worksheet_collections c
      WHERE c.id = v_collection) = 1;
  v_report := v_report || ' save_fixture=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_update_day := v_save_payload #> '{worksheets,0}';
  v_update_day := pg_catalog.jsonb_set(v_update_day, '{title}',
    '"Revised day one"'::jsonb);
  v_update_day := pg_catalog.jsonb_set(v_update_day, '{questions}',
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'sectionId', 'main',
        'question', 'Which is first now?', 'item_type', 'multiple_choice',
        'options', pg_catalog.jsonb_build_array('First', 'Second', 'Third', 'Fourth'),
        'points', 1, 'correct_answer', 'First'),
      pg_catalog.jsonb_build_object('position', 2, 'sectionId', 'main',
        'question', 'Name two examples.', 'item_type', 'enumeration',
        'options', null, 'points', 2, 'correct_answer', 'one, two',
        'enumeration', pg_catalog.jsonb_build_object('alternatives',
          pg_catalog.jsonb_build_array('first, second'), 'orderSensitive', false)),
      pg_catalog.jsonb_build_object('position', 3, 'sectionId', 'main',
        'question', 'Explain an example.', 'item_type', 'essay',
        'options', null, 'points', 3, 'correct_answer', null,
        'essay', pg_catalog.jsonb_build_object('referenceAnswer',
          'A synthetic example.', 'minWords', 80, 'maxWords', 150,
          'rubric', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'criterion', 'Explanation', 'points', 3))))));
  v_update_payload := pg_catalog.jsonb_build_object('title', 'Revised weekly set',
    'worksheets', pg_catalog.jsonb_set(v_save_payload->'worksheets',
      '{0}', v_update_day));
  v_response := public.eduscribe_ai_weekly_worksheets_update_v1(
    v_collection, 1, v_update_payload);
  SELECT pg_catalog.array_agg(i.id ORDER BY i.id) INTO v_new_items
    FROM public.worksheet_items i WHERE i.worksheet_id = ANY(v_wids);
  v_ok := v_response->'ok' = 'true'::jsonb AND v_response->>'revision' = '2'
    AND pg_catalog.jsonb_array_length(v_response->'worksheets') = 5
    AND (SELECT pg_catalog.array_agg(w.id ORDER BY w.day_of_week)
      FROM public.worksheets w WHERE w.collection_id = v_collection) = v_wids
    AND (SELECT c.title FROM public.worksheet_collections c
      WHERE c.id = v_collection) = 'Revised weekly set'
    AND pg_catalog.array_length(v_new_items, 1) = 7
    AND (SELECT count(*) FROM public.worksheet_items i
      WHERE i.id = ANY(v_old_items)) = 0
    AND (SELECT count(*) FROM public.worksheet_item_private p
      JOIN public.worksheet_items i ON i.id = p.item_id
      WHERE i.worksheet_id = v_wids[1] AND p.private ? 'enumeration') = 1
    AND (SELECT count(*) FROM public.worksheet_item_private p
      JOIN public.worksheet_items i ON i.id = p.item_id
      WHERE i.worksheet_id = v_wids[1] AND p.private ? 'essay') = 1
    AND (SELECT count(*) FROM public.worksheet_item_keys k
      JOIN public.worksheet_items i ON i.id = k.item_id
      WHERE i.worksheet_id = v_wids[1] AND i.item_type = 'essay') = 0;
  v_report := v_report || ' update_replaces_items_and_private=' ||
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_error_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(
      v_collection, 1, v_update_payload);
  EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'revision_conflict';
  END;
  v_report := v_report || ' stale_revision=' ||
    CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
  IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;

  v_error_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(v_collection, 2,
      pg_catalog.jsonb_set(v_update_payload, '{worksheets}',
        (v_update_payload->'worksheets') - 4));
  EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'invalid_document';
  END;
  v_report := v_report || ' day_set_mismatch=' ||
    CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
  IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;

  v_error_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(v_collection, 2,
      pg_catalog.jsonb_set(v_update_payload,
        '{worksheets,0,questions,0,options}', '["First","Second"]'::jsonb));
  EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'invalid_document';
  END;
  v_report := v_report || ' two_option_mcq=' ||
    CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
  IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;

  v_response := public.eduscribe_ai_weekly_worksheets_archive_v1(v_collection, 2, true);
  v_ok := v_response->>'revision' = '3' AND v_response->'archived' = 'true'::jsonb
    AND EXISTS (SELECT 1 FROM public.worksheet_collections c
      WHERE c.id = v_collection AND c.archived_at IS NOT NULL)
    AND (SELECT count(*) FROM public.worksheets w
      WHERE w.collection_id = v_collection AND w.status = 'Draft') = 5;
  v_report := v_report || ' archive=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  v_response := public.eduscribe_ai_weekly_worksheets_archive_v1(v_collection, 3, false);
  v_ok := v_response->>'revision' = '4' AND v_response->'archived' = 'false'::jsonb
    AND EXISTS (SELECT 1 FROM public.worksheet_collections c
      WHERE c.id = v_collection AND c.archived_at IS NULL);
  v_report := v_report || ' restore=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Restore must remain available even if a posting appears while archived.
  v_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(v_collection, 4, true);
    INSERT INTO public.worksheet_sections (worksheet_id, section_id, posted_by)
      VALUES (v_wids[1], v_section, v_teacher);
    v_response := public.eduscribe_ai_weekly_worksheets_archive_v1(
      v_collection, 5, false);
    v_ok := v_response->>'revision' = '6'
      AND v_response->'archived' = 'false'::jsonb;
    RAISE EXCEPTION 'rollback_restore_fixture';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_restore_fixture' THEN v_ok := false; END IF;
  END;
  v_report := v_report || ' restore_with_work=' ||
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Each nested exception rolls its synthetic work row back before the next
  -- case. The answer-only case uses a submission on the separate fixture
  -- worksheet: the schema has independent item and submission FKs, allowing
  -- the answer branch to be isolated from the target collection's submissions.
  FOREACH v_work_case IN ARRAY ARRAY['sections','assignees','submissions','answers'] LOOP
    v_archive_ok := false;
    v_update_ok := false;
    v_delete_ok := false;
    BEGIN
      CASE v_work_case
        WHEN 'sections' THEN
          INSERT INTO public.worksheet_sections
            (worksheet_id, section_id, posted_by)
          VALUES (v_wids[1], v_section, v_teacher);
        WHEN 'assignees' THEN
          INSERT INTO public.task_assignees
            (task_id, student_id, section_id, assigned_by)
          VALUES (v_wids[1], v_student, v_section, v_teacher);
        WHEN 'submissions' THEN
          INSERT INTO public.worksheet_submissions
            (worksheet_id, student_id, section_id)
          VALUES (v_wids[1], v_student, v_section);
        WHEN 'answers' THEN
          INSERT INTO public.worksheet_submissions
            (worksheet_id, student_id, section_id)
          VALUES (v_other_ws, v_student, v_section)
          RETURNING id INTO v_submission;
          INSERT INTO public.worksheet_answers
            (submission_id, item_id, answer)
          VALUES (v_submission, v_new_items[1], '"First"'::jsonb);
      END CASE;
      BEGIN
        PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(
          v_collection, 4, true);
      EXCEPTION WHEN OTHERS THEN v_archive_ok := SQLERRM = 'student_work_exists';
      END;
      BEGIN
        PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(
          v_collection, 4, v_update_payload);
      EXCEPTION WHEN OTHERS THEN v_update_ok := SQLERRM = 'student_work_exists';
      END;
      BEGIN
        PERFORM public.eduscribe_ai_weekly_worksheets_delete_v1(v_collection, 4);
      EXCEPTION WHEN OTHERS THEN v_delete_ok := SQLERRM = 'student_work_exists';
      END;
      RAISE EXCEPTION 'rollback_work_fixture';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rollback_work_fixture' THEN
        v_archive_ok := false;
        v_update_ok := false;
        v_delete_ok := false;
      END IF;
    END;
    v_report := v_report || ' ' || v_work_case || '_archive=' ||
      CASE WHEN v_archive_ok THEN 'PASS' ELSE 'FAIL' END
      || ' ' || v_work_case || '_update=' ||
      CASE WHEN v_update_ok THEN 'PASS' ELSE 'FAIL' END
      || ' ' || v_work_case || '_delete=' ||
      CASE WHEN v_delete_ok THEN 'PASS' ELSE 'FAIL' END;
    IF NOT v_archive_ok THEN v_failures := v_failures + 1; END IF;
    IF NOT v_update_ok THEN v_failures := v_failures + 1; END IF;
    IF NOT v_delete_ok THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_other_teacher::text)::text, true);
  v_update_ok := false;
  v_archive_ok := false;
  v_delete_ok := false;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_update_v1(
      v_collection, 4, v_update_payload);
  EXCEPTION WHEN OTHERS THEN v_update_ok := SQLERRM = 'not_found';
  END;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_archive_v1(
      v_collection, 4, true);
  EXCEPTION WHEN OTHERS THEN v_archive_ok := SQLERRM = 'not_found';
  END;
  BEGIN
    PERFORM public.eduscribe_ai_weekly_worksheets_delete_v1(v_collection, 4);
  EXCEPTION WHEN OTHERS THEN v_delete_ok := SQLERRM = 'not_found';
  END;
  v_report := v_report || ' cross_teacher_update=' ||
    CASE WHEN v_update_ok THEN 'PASS' ELSE 'FAIL' END
    || ' cross_teacher_archive=' ||
    CASE WHEN v_archive_ok THEN 'PASS' ELSE 'FAIL' END
    || ' cross_teacher_delete=' ||
    CASE WHEN v_delete_ok THEN 'PASS' ELSE 'FAIL' END;
  IF NOT v_update_ok THEN v_failures := v_failures + 1; END IF;
  IF NOT v_archive_ok THEN v_failures := v_failures + 1; END IF;
  IF NOT v_delete_ok THEN v_failures := v_failures + 1; END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);

  v_response := public.eduscribe_ai_weekly_worksheets_delete_v1(v_collection, 4);
  v_ok := v_response->'deleted' = 'true'::jsonb
    AND (SELECT count(*) FROM public.worksheet_collections c
      WHERE c.id = v_collection) = 0
    AND (SELECT count(*) FROM public.worksheets w
      WHERE w.id = ANY(v_wids)) = 0
    AND (SELECT count(*) FROM public.worksheet_items i
      WHERE i.id = ANY(v_new_items)) = 0
    AND (SELECT count(*) FROM public.worksheet_item_keys k
      WHERE k.item_id = ANY(v_new_items)) = 0
    AND (SELECT count(*) FROM public.worksheet_item_private p
      WHERE p.item_id = ANY(v_new_items)) = 0;
  v_report := v_report || ' delete_cascades_five=' ||
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_response := public.eduscribe_ai_weekly_worksheets_save_v1(
    pg_catalog.gen_random_uuid(), v_save_payload);
  v_ok := v_response->'ok' = 'true'::jsonb
    AND pg_catalog.jsonb_array_length(v_response->'worksheets') = 5;
  v_report := v_report || ' save_still_works=' ||
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END $$;
ROLLBACK;
