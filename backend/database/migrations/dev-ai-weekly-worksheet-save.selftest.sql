-- TEST DATA ONLY. Paste this entire file into the Supabase SQL Editor after
-- applying and verifying dev-ai-weekly-worksheet-save.sql. It persists nothing:
-- the final exception rolls back every insert, including a successful test.
-- SELFTEST_PASSED_ROLLED_BACK means all checks passed; otherwise read the
-- PASS/FAIL/SKIPPED labels in the final error. No fixture data is printed.
DO $$
DECLARE
  v_teacher uuid;
  v_other_teacher uuid;
  v_plan uuid;
  v_non_teacher uuid;
  v_request uuid := pg_catalog.gen_random_uuid();
  v_case_request uuid;
  v_collection uuid;
  v_day_one jsonb;
  v_day_two jsonb;
  v_payload jsonb;
  v_bad jsonb;
  v_response jsonb;
  v_replay jsonb;
  v_worksheet_ids uuid[];
  v_item_ids uuid[];
  v_marker text;
  v_case text;
  v_error_ok boolean;
  v_role_switched boolean := false;
  v_happy boolean := false;
  v_ok boolean;
  v_count integer;
  v_count_two integer;
  v_failures integer := 0;
  v_report text := '';
BEGIN
  SELECT p.id, l.id INTO v_teacher, v_plan
  FROM public.profiles p
  JOIN public.lesson_plans l ON l.teacher_id = p.id
  WHERE p.role = 'teacher' AND p.status = 'active'
    AND l.ai_generated IS TRUE AND l.title IS NOT NULL
    AND pg_catalog.btrim(l.title) <> ''
  ORDER BY p.id, l.id LIMIT 1;
  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'NO_FIXTURE: no active teacher owns a titled AI lesson plan';
  END IF;
  LOOP
    v_non_teacher := pg_catalog.gen_random_uuid();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = v_non_teacher);
  END LOOP;
  BEGIN
  SELECT p.id INTO v_other_teacher FROM public.profiles p
  WHERE p.role = 'teacher' AND p.status = 'active' AND p.id <> v_teacher
  ORDER BY p.id LIMIT 1;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_role_switched := true;
  EXCEPTION WHEN OTHERS THEN
    v_role_switched := false;
  END;
  v_report := v_report || ' role_authenticated=' ||
    CASE WHEN v_role_switched THEN 'PASS' ELSE 'SKIPPED' END;

  v_day_one := pg_catalog.jsonb_build_object(
    'day', 1, 'title', 'Self-test day one', 'instructions', 'Answer each item.',
    'sections', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'main', 'title', 'Questions', 'directions', '')),
    'checkingMode', 'manual', 'questions', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'sectionId', 'main',
        'question', 'Which is the first choice?', 'item_type', 'multiple_choice',
        'options', pg_catalog.jsonb_build_array('First', 'Second', 'Third', 'Fourth'),
        'points', 1, 'correct_answer', 'First'),
      pg_catalog.jsonb_build_object('position', 2, 'sectionId', 'main',
        'question', 'Is this statement true?', 'item_type', 'true_false',
        'options', null, 'points', 1, 'correct_answer', 'True'),
      pg_catalog.jsonb_build_object('position', 3, 'sectionId', 'main',
        'question', 'Name the sample term.', 'item_type', 'identification',
        'options', null, 'points', 1, 'correct_answer', 'sample term')));
  v_day_two := pg_catalog.jsonb_build_object(
    'day', 2, 'title', 'Self-test day two', 'instructions', 'Answer each item.',
    'sections', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', 'main', 'title', 'Questions', 'directions', '')),
    'checkingMode', 'manual', 'questions', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('position', 1, 'sectionId', 'main',
        'question', 'Is this other statement false?', 'item_type', 'true_false',
        'options', null, 'points', 1, 'correct_answer', 'False'),
      pg_catalog.jsonb_build_object('position', 2, 'sectionId', 'main',
        'question', 'Name two sample items.', 'item_type', 'enumeration',
        'options', null, 'points', 2, 'correct_answer', 'first item, second item',
        'enumeration', pg_catalog.jsonb_build_object('alternatives',
          pg_catalog.jsonb_build_array('other first, other second'),
          'orderSensitive', false)),
      pg_catalog.jsonb_build_object('position', 3, 'sectionId', 'main',
        'question', 'Explain the fictional example.', 'item_type', 'essay',
        'options', null, 'points', 5, 'correct_answer', null,
        'essay', pg_catalog.jsonb_build_object(
          'referenceAnswer', 'The fictional example illustrates a simple idea.',
          'minWords', 80, 'maxWords', 150,
          'rubric', pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('criterion', 'Explanation', 'points', 2),
            pg_catalog.jsonb_build_object('criterion', 'Evidence', 'points', 2),
            pg_catalog.jsonb_build_object('criterion', 'Clarity', 'points', 1))))));
  v_payload := pg_catalog.jsonb_build_object('sourceLessonPlanId', v_plan::text,
    'title', 'Self-test weekly set',
    'worksheets', pg_catalog.jsonb_build_array(v_day_one, v_day_two));

  BEGIN
    SELECT public.eduscribe_ai_weekly_worksheets_save_v1(v_request, v_payload)
      INTO v_response;
    v_happy := COALESCE(v_response->'ok' = 'true'::jsonb
      AND v_response->'durable' = 'true'::jsonb
      AND v_response->>'collectionId' IS NOT NULL
      AND pg_catalog.jsonb_array_length(v_response->'worksheets') = 2
      AND v_response #>> '{worksheets,0,day}' = '1'
      AND v_response #>> '{worksheets,1,day}' = '2'
      AND v_response #>> '{worksheets,0,items}' = '3'
      AND v_response #>> '{worksheets,1,items}' = '3'
      AND v_response #>> '{worksheets,0,id}' IS NOT NULL
      AND v_response #>> '{worksheets,1,id}' IS NOT NULL, false);
    IF v_happy THEN
      v_collection := (v_response->>'collectionId')::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_happy := false;
  END;
  v_report := v_report || ' A_happy=' ||
    CASE WHEN v_happy THEN 'PASS' ELSE 'FAIL' END;
  IF v_happy IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  IF v_happy THEN
    SELECT pg_catalog.array_agg(w.id ORDER BY w.day_of_week)
      INTO v_worksheet_ids FROM public.worksheets w
      WHERE w.collection_id = v_collection;
    SELECT pg_catalog.array_agg(i.id ORDER BY i.id)
      INTO v_item_ids FROM public.worksheet_items i
      WHERE i.worksheet_id = ANY(v_worksheet_ids);

    SELECT count(*) INTO v_count FROM public.worksheet_collections c
      WHERE c.id = v_collection AND c.request_id = v_request
        AND c.teacher_id = v_teacher AND c.source_lesson_plan_id = v_plan;
    v_ok := v_count = 1;
    v_report := v_report || ' B_collection=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || '(' || v_count || ')';
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    SELECT count(*) INTO v_count FROM public.worksheets w
      WHERE w.collection_id = v_collection AND w.teacher_id = v_teacher
        AND w.origin = 'ai_generated' AND w.status = 'Draft'
        AND w.task_type = 'worksheet' AND w.source_lesson_plan_id = v_plan
        AND w.day_of_week IN (1, 2) AND w.items = 3
        AND w.instructions = 'Answer each item.'
        AND pg_catalog.jsonb_array_length(w.sections) = 1
        AND w.sections #>> '{0,id}' = 'main';
    v_ok := v_count = 2 AND pg_catalog.array_length(v_worksheet_ids, 1) = 2
      AND v_worksheet_ids[1] = (v_response #>> '{worksheets,0,id}')::uuid
      AND v_worksheet_ids[2] = (v_response #>> '{worksheets,1,id}')::uuid;
    v_report := v_report || ' B_worksheets=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || '(' || v_count || ')';
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    SELECT count(*) INTO v_count FROM public.worksheet_items i
      WHERE i.worksheet_id = ANY(v_worksheet_ids);
    v_ok := v_count = 6 AND
      (SELECT count(*) FROM public.worksheet_items i
       WHERE i.id = ANY(v_item_ids) AND i.item_type = 'multiple_choice') = 1 AND
      (SELECT count(*) FROM public.worksheet_items i
       WHERE i.id = ANY(v_item_ids) AND i.item_type = 'true_false') = 2 AND
      (SELECT count(*) FROM public.worksheet_items i
       WHERE i.id = ANY(v_item_ids) AND i.item_type = 'identification') = 1 AND
      (SELECT count(*) FROM public.worksheet_items i
       WHERE i.id = ANY(v_item_ids) AND i.item_type = 'enumeration') = 1 AND
      (SELECT count(*) FROM public.worksheet_items i
       WHERE i.id = ANY(v_item_ids) AND i.item_type = 'essay') = 1;
    v_report := v_report || ' B_items=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || '(' || v_count || ')';
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    SELECT count(*) INTO v_count FROM public.worksheet_item_keys k
      WHERE k.item_id = ANY(v_item_ids);
    SELECT count(*) INTO v_count_two FROM public.worksheet_item_keys k
      JOIN public.worksheet_items i ON i.id = k.item_id
      WHERE k.item_id = ANY(v_item_ids) AND i.item_type = 'essay';
    v_ok := v_count = 5 AND v_count_two = 0;
    v_report := v_report || ' B_keys=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || '(' || v_count || ')';
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    SELECT count(*) INTO v_count FROM public.worksheet_item_private p
      WHERE p.item_id = ANY(v_item_ids);
    v_ok := v_count = 6;
    v_report := v_report || ' B_private=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || '(' || v_count || ')';
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    SELECT count(*) INTO v_count FROM public.worksheet_item_keys k
      JOIN public.worksheet_items i ON i.id = k.item_id
      WHERE k.item_id = ANY(v_item_ids)
        AND ((i.item_type = 'multiple_choice'
              AND pg_catalog.jsonb_typeof(k.correct_answer) = 'string')
          OR (i.item_type = 'true_false'
              AND k.correct_answer IN ('"True"'::jsonb, '"False"'::jsonb))
          OR (i.item_type IN ('identification', 'enumeration')
              AND pg_catalog.jsonb_typeof(k.correct_answer) = 'array'));
    v_ok := v_count = 5 AND
      (SELECT count(DISTINCT k.correct_answer) FROM public.worksheet_item_keys k
       JOIN public.worksheet_items i ON i.id = k.item_id
       WHERE k.item_id = ANY(v_item_ids) AND i.item_type = 'true_false') = 2;
    v_report := v_report || ' B_key_types=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END || '(' || v_count || ')';
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    BEGIN
      SELECT public.eduscribe_ai_weekly_worksheets_save_v1(v_request, v_payload)
        INTO v_replay;
      v_ok := v_replay->>'collectionId' = v_response->>'collectionId'
        AND v_replay->'worksheets' = v_response->'worksheets';
    EXCEPTION WHEN OTHERS THEN v_ok := false;
    END;
    SELECT count(*) INTO v_count FROM public.worksheet_collections c
      WHERE c.request_id = v_request AND c.teacher_id = v_teacher;
    SELECT count(*) INTO v_count_two FROM public.worksheet_items i
      WHERE i.worksheet_id = ANY(v_worksheet_ids);
    v_ok := v_ok AND v_count = 1 AND v_count_two = 6;
    v_report := v_report || ' C_replay=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    v_error_ok := false;
    BEGIN
      PERFORM public.eduscribe_ai_weekly_worksheets_save_v1(v_request,
        pg_catalog.jsonb_set(v_payload, '{title}', '"changed title"'::jsonb));
    EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'idempotency_conflict';
    END;
    v_report := v_report || ' D_conflict=' ||
      CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
    IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;

    FOREACH v_case IN ARRAY ARRAY[
      'blank_title', 'three_options', 'wrong_mc_key', 'lowercase_tf',
      'duplicate_day', 'day_six', 'rubric_sum', 'unknown_question_key',
      'position_gap', 'missing_section', 'auto_ordered_enum', 'six_days'] LOOP
      v_case_request := pg_catalog.gen_random_uuid();
      v_bad := v_payload;
      CASE v_case
        WHEN 'blank_title' THEN
          v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets,0,title}', '" "'::jsonb);
        WHEN 'three_options' THEN
          v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets,0,questions,0,options}',
            '["First","Second","Third"]'::jsonb);
        WHEN 'wrong_mc_key' THEN
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,0,questions,0,correct_answer}', '"Not an option"'::jsonb);
        WHEN 'lowercase_tf' THEN
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,0,questions,1,correct_answer}', '"true"'::jsonb);
        WHEN 'duplicate_day' THEN
          v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets,1,day}', '1'::jsonb);
        WHEN 'day_six' THEN
          v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets,1,day}', '6'::jsonb);
        WHEN 'rubric_sum' THEN
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,1,questions,2,essay,rubric,2,points}', '2'::jsonb);
        WHEN 'unknown_question_key' THEN
          v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets,0,questions,0}',
            v_bad #> '{worksheets,0,questions,0}' ||
              '{"unexpected":"value"}'::jsonb);
        WHEN 'position_gap' THEN
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,0,questions,1,position}', '4'::jsonb);
        WHEN 'missing_section' THEN
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,0,questions,0,sectionId}', '"absent"'::jsonb);
        WHEN 'auto_ordered_enum' THEN
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,1,checkingMode}', '"auto"'::jsonb);
          v_bad := pg_catalog.jsonb_set(v_bad,
            '{worksheets,1,questions,1,enumeration,orderSensitive}', 'true'::jsonb);
        WHEN 'six_days' THEN
          v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets}',
            (v_bad->'worksheets') || pg_catalog.jsonb_build_array(
              v_day_one, v_day_one, v_day_one, v_day_one));
      END CASE;
      v_error_ok := false;
      BEGIN
        PERFORM public.eduscribe_ai_weekly_worksheets_save_v1(v_case_request, v_bad);
      EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'invalid_document';
      END;
      SELECT count(*) INTO v_count FROM public.worksheet_collections c
        WHERE c.request_id = v_case_request;
      v_ok := v_error_ok AND v_count = 0;
      v_report := v_report || ' E_' || v_case || '=' ||
        CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
      IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
    END LOOP;

    v_error_ok := false;
    BEGIN
      PERFORM public.eduscribe_ai_weekly_worksheets_save_v1(
        pg_catalog.gen_random_uuid(), pg_catalog.jsonb_set(v_payload,
          '{sourceLessonPlanId}',
          pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()::text)));
    EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'source_plan_denied';
    END;
    v_report := v_report || ' F_missing_source=' ||
      CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
    IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;

    IF v_other_teacher IS NULL THEN
      v_report := v_report || ' F_foreign_teacher=SKIPPED';
    ELSE
      PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other_teacher::text, true);
      PERFORM pg_catalog.set_config('request.jwt.claims',
        pg_catalog.jsonb_build_object('sub', v_other_teacher::text)::text, true);
      v_error_ok := false;
      BEGIN
        PERFORM public.eduscribe_ai_weekly_worksheets_save_v1(
          pg_catalog.gen_random_uuid(), v_payload);
      EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'source_plan_denied';
      END;
      v_report := v_report || ' F_foreign_teacher=' ||
        CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
      IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;
      PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
      PERFORM pg_catalog.set_config('request.jwt.claims',
        pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
    END IF;

    PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
    PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
    v_error_ok := false;
    BEGIN
      PERFORM public.eduscribe_ai_weekly_worksheets_save_v1(
        pg_catalog.gen_random_uuid(), v_payload);
    EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'not_authenticated';
    END;
    v_report := v_report || ' G_no_claim=' ||
      CASE WHEN v_error_ok THEN 'PASS' ELSE 'FAIL' END;
    IF NOT v_error_ok THEN v_failures := v_failures + 1; END IF;

    IF v_role_switched THEN
      PERFORM pg_catalog.set_config('request.jwt.claim.sub',
        v_non_teacher::text, true);
      PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
      SELECT count(*) INTO v_count FROM public.worksheet_item_private p
        WHERE p.item_id = ANY(v_item_ids);
      SELECT count(*) INTO v_count_two FROM public.worksheet_item_keys k
        WHERE k.item_id = ANY(v_item_ids);
      v_ok := v_count = 0 AND v_count_two = 0;
      SELECT count(*) INTO v_count FROM public.worksheet_items i
        WHERE i.id = ANY(v_item_ids);
      SELECT count(*) INTO v_count_two FROM public.worksheets w
        WHERE w.id = ANY(v_worksheet_ids);
      v_ok := v_ok AND v_count = 0 AND v_count_two = 0;
      v_report := v_report || ' H_nonowner_rls=' ||
        CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
      IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
    ELSE
      v_report := v_report || ' H_nonowner_rls=SKIPPED';
    END IF;
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
    SELECT count(*) INTO v_count FROM public.worksheet_item_private p
      WHERE p.item_id = ANY(v_item_ids);
    SELECT count(*) INTO v_count_two FROM public.worksheet_item_keys k
      WHERE k.item_id = ANY(v_item_ids);
    v_ok := v_count = 6 AND v_count_two = 5;
    SELECT count(*) INTO v_count FROM public.worksheet_items i
      WHERE i.id = ANY(v_item_ids);
    SELECT count(*) INTO v_count_two FROM public.worksheets w
      WHERE w.id = ANY(v_worksheet_ids);
    v_ok := v_ok AND v_count = 6 AND v_count_two = 2;
    v_report := v_report || ' H_owner_read=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

    v_case_request := pg_catalog.gen_random_uuid();
    v_marker := 'selftest-' || v_case_request::text;
    v_bad := pg_catalog.jsonb_set(v_payload, '{worksheets,0,title}',
      pg_catalog.to_jsonb(v_marker));
    v_bad := pg_catalog.jsonb_set(v_bad, '{worksheets,1,title}', '" "'::jsonb);
    v_error_ok := false;
    BEGIN
      PERFORM public.eduscribe_ai_weekly_worksheets_save_v1(v_case_request, v_bad);
    EXCEPTION WHEN OTHERS THEN v_error_ok := SQLERRM = 'invalid_document';
    END;
    SELECT count(*) INTO v_count FROM public.worksheet_collections c
      WHERE c.request_id = v_case_request;
    SELECT count(*) INTO v_count_two FROM public.worksheets w
      WHERE w.teacher_id = v_teacher AND w.title = v_marker;
    v_ok := v_error_ok AND v_count = 0 AND v_count_two = 0;
    v_report := v_report || ' I_atomic_second_day=' ||
      CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  ELSE
    v_report := v_report || ' B_to_I=SKIPPED';
  END IF;

  EXCEPTION WHEN OTHERS THEN
    v_failures := v_failures + 1;
    v_report := v_report || ' unexpected=FAIL';
  END;
  BEGIN
    IF v_role_switched THEN EXECUTE 'RESET ROLE'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_failures := v_failures + 1;
    v_report := v_report || ' role_reset=FAIL';
  END;
  IF v_failures = 0 THEN
    RAISE EXCEPTION 'SELFTEST_PASSED_ROLLED_BACK %', v_report;
  ELSE
    RAISE EXCEPTION 'SELFTEST_FAILED_ROLLED_BACK failures=% %', v_failures, v_report;
  END IF;
END $$;
