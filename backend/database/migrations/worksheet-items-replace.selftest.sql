-- Synthetic, rolled-back checks for eduscribe_worksheet_items_replace_v1.
-- Run only after applying worksheet-items-replace.sql, as postgres. Synthetic
-- users, profiles, sections, worksheets, items, keys, submissions and answers
-- are made inside this transaction. Every case runs as the authenticated role
-- with simulated JWT claims inside its own block, which is rolled back before
-- the next case. The final error reports SELFTEST PASSED_ROLLED_BACK or
-- FAILED_ROLLED_BACK. Nothing persists on any path.
BEGIN;
DO $selftest$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_admin uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  v_main uuid := pg_catalog.gen_random_uuid();
  v_other_ws uuid := pg_catalog.gen_random_uuid();
  v_dist uuid := pg_catalog.gen_random_uuid();
  v_answered uuid := pg_catalog.gen_random_uuid();
  v_submitted uuid := pg_catalog.gen_random_uuid();
  v_checked uuid := pg_catalog.gen_random_uuid();
  v_open uuid := pg_catalog.gen_random_uuid();
  v_seed_item1 uuid := pg_catalog.gen_random_uuid();
  v_seed_item2 uuid := pg_catalog.gen_random_uuid();
  v_answered_item uuid := pg_catalog.gen_random_uuid();
  v_answered_sub uuid := pg_catalog.gen_random_uuid();
  v_signature regprocedure := 'public.eduscribe_worksheet_items_replace_v1(uuid,jsonb)'::regprocedure;
  v_valid jsonb;
  v_all_types jsonb;
  v_case text;
  v_actor uuid;
  v_ws uuid;
  v_payload jsonb;
  v_expected jsonb;
  v_receipt jsonb;
  v_error text;
  v_before_state jsonb;
  v_after_state jsonb;
  v_before_counts jsonb;
  v_after_counts jsonb;
  v_ok boolean;
  v_failures integer := 0;
  v_report text := '';
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'auth_users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'worksheet_items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'worksheet_item_keys', (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys),
    'task_assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'worksheet_submissions', (SELECT pg_catalog.count(*) FROM public.worksheet_submissions),
    'worksheet_answers', (SELECT pg_catalog.count(*) FROM public.worksheet_answers))
    INTO v_before_counts;

  -- Fixtures, written as postgres before any claim is set.
  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'items-replace-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_other_teacher, v_admin, v_student]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'items-replace-' || u.id::text || '@example.invalid',
    'Synthetic items-replace user', u.role, 'active'
  FROM (VALUES (v_teacher, 'teacher'), (v_other_teacher, 'teacher'),
    (v_admin, 'admin'), (v_student, 'student')) AS u(id, role)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id) VALUES (v_student);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id)
    VALUES (v_section, 'Synthetic items-replace section ' || v_section::text, '7', '2025-2026', v_teacher);
  INSERT INTO public.worksheets (id, teacher_id, title, status, origin, items) VALUES
    (v_main, v_teacher, 'Synthetic replace worksheet', 'Draft', 'manual', 2),
    (v_other_ws, v_other_teacher, 'Synthetic other teacher worksheet', 'Draft', 'manual', 1),
    (v_dist, v_teacher, 'Synthetic distributed worksheet', 'Draft', 'manual', 1),
    (v_answered, v_teacher, 'Synthetic answered worksheet', 'Draft', 'manual', 1),
    (v_submitted, v_teacher, 'Synthetic submitted worksheet', 'Draft', 'manual', 1),
    (v_checked, v_teacher, 'Synthetic checked worksheet', 'Draft', 'manual', 1),
    (v_open, v_teacher, 'Synthetic opened worksheet', 'Draft', 'manual', 1);
  INSERT INTO public.worksheet_items (id, worksheet_id, position, question, item_type, points) VALUES
    (v_seed_item1, v_main, 1, 'Synthetic seed identification', 'identification', 1),
    (v_seed_item2, v_main, 2, 'Synthetic seed essay', 'essay', 5),
    (v_answered_item, v_answered, 1, 'Synthetic answered item', 'identification', 1);
  INSERT INTO public.worksheet_items (worksheet_id, position, question, item_type, points)
  SELECT w.id, 1, 'Synthetic single item', 'identification', 1
  FROM pg_catalog.unnest(ARRAY[v_other_ws, v_dist, v_submitted, v_checked, v_open]) AS w(id);
  INSERT INTO public.worksheet_item_keys (item_id, correct_answer)
  SELECT i.id, '["Mars"]'::jsonb FROM public.worksheet_items i
  WHERE i.worksheet_id IN (v_main, v_other_ws, v_dist, v_answered, v_submitted, v_checked, v_open)
    AND i.item_type <> 'essay';
  INSERT INTO public.task_assignees (task_id, student_id, section_id, assigned_by)
    VALUES (v_dist, v_student, v_section, v_teacher);
  INSERT INTO public.worksheet_submissions (id, worksheet_id, student_id, section_id, status) VALUES
    (v_answered_sub, v_answered, v_student, v_section, 'in_progress');
  INSERT INTO public.worksheet_submissions (worksheet_id, student_id, section_id, status) VALUES
    (v_submitted, v_student, v_section, 'submitted'),
    (v_checked, v_student, v_section, 'checked'),
    (v_open, v_student, v_section, 'in_progress');
  INSERT INTO public.worksheet_answers (submission_id, item_id, answer)
    VALUES (v_answered_sub, v_answered_item, pg_catalog.to_jsonb('Synthetic answer'::text));

  v_valid := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('question', 'Synthetic new choice', 'item_type', 'multiple_choice',
      'options', pg_catalog.jsonb_build_array('Red', 'Blue'), 'points', 2, 'correct_answer', 'Blue',
      'essay_min_sentences', NULL, 'essay_min_words', NULL),
    pg_catalog.jsonb_build_object('question', 'Synthetic new essay', 'item_type', 'essay',
      'options', NULL, 'points', 5, 'correct_answer', NULL,
      'essay_min_sentences', 3, 'essay_min_words', NULL));
  v_all_types := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('question', 'Synthetic choice', 'item_type', 'multiple_choice',
      'options', pg_catalog.jsonb_build_array('A', 'B', 'C'), 'points', 1, 'correct_answer', 'C'),
    pg_catalog.jsonb_build_object('question', 'Synthetic true or false', 'item_type', 'true_false',
      'options', NULL, 'points', 1.5, 'correct_answer', 'True'),
    pg_catalog.jsonb_build_object('question', 'Synthetic identification', 'item_type', 'identification',
      'options', NULL, 'points', 2, 'correct_answer', pg_catalog.jsonb_build_array('Mars', 'the red planet')),
    pg_catalog.jsonb_build_object('question', 'Synthetic enumeration', 'item_type', 'enumeration',
      'options', NULL, 'points', 3, 'correct_answer', pg_catalog.jsonb_build_array('one', 'two', 'three')),
    pg_catalog.jsonb_build_object('question', 'Synthetic essay with rule', 'item_type', 'essay',
      'options', NULL, 'points', 5, 'correct_answer', NULL,
      'essay_min_sentences', 3, 'essay_min_words', 50),
    pg_catalog.jsonb_build_object('question', 'Synthetic essay without rule', 'item_type', 'essay',
      'options', NULL, 'points', 4, 'correct_answer', NULL));

  -- Case 9: the definition the security model depends on.
  v_ok := (SELECT NOT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND (SELECT r.rolname FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE p.oid = v_signature::oid) = 'postgres'
    AND (SELECT 'search_path=pg_catalog, pg_temp' = ANY(p.proconfig)
      FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND (SELECT p.proacl IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(p.proacl) AS a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
      FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
    AND pg_catalog.has_function_privilege('authenticated', v_signature::oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', v_signature::oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', v_signature::oid, 'EXECUTE');
  v_report := v_report || ' c9_invoker_owner_path_grants=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  FOREACH v_case IN ARRAY ARRAY[
    'c1_replace_then_replace_again', 'c2_all_types', 'c3_zero_items', 'c7_exactly_200_allowed',
    'c7_extra_fields_ignored', 'c4_admin_allowed', 'c4_other_teacher', 'c4_student_caller',
    'c4_unauthenticated', 'c4_unknown_worksheet', 'c5_distributed', 'c6_answer_exists',
    'c6_submitted', 'c6_checked', 'c6_open_without_answers',
    'c7_not_array', 'c7_null_items', 'c7_201_items', 'c7_element_not_object', 'c7_empty_question',
    'c7_unknown_type', 'c7_negative_points', 'c7_points_10000', 'c7_points_text',
    'c7_essay_with_key', 'c7_essay_min_sentences_0', 'c7_essay_min_sentences_51',
    'c7_essay_min_sentences_fraction', 'c7_essay_min_words_2001', 'c7_non_essay_without_key',
    'c7_non_essay_with_essay_min', 'c7_options_not_array', 'c7_choice_key_not_in_options',
    'c7_choice_without_options', 'c7_identification_empty_key', 'c8_atomicity'] LOOP
    v_ok := false;
    v_error := NULL;
    v_receipt := NULL;
    v_actor := v_teacher;
    v_ws := v_main;
    v_payload := v_valid;
    v_expected := v_valid;

    CASE v_case
      WHEN 'c2_all_types' THEN v_payload := v_all_types; v_expected := v_all_types;
      WHEN 'c3_zero_items' THEN v_payload := '[]'::jsonb; v_expected := '[]'::jsonb;
      WHEN 'c7_exactly_200_allowed' THEN
        SELECT pg_catalog.jsonb_agg(v_valid->0) INTO v_payload FROM pg_catalog.generate_series(1, 200);
        v_expected := v_payload;
      WHEN 'c7_extra_fields_ignored' THEN
        v_payload := pg_catalog.jsonb_set(v_valid, '{0,uid}', '"new-1"');
      WHEN 'c4_admin_allowed' THEN v_actor := v_admin;
      WHEN 'c4_other_teacher' THEN v_actor := v_other_teacher;
      WHEN 'c4_student_caller' THEN v_actor := v_student;
      WHEN 'c4_unauthenticated' THEN v_actor := NULL;
      WHEN 'c4_unknown_worksheet' THEN v_ws := pg_catalog.gen_random_uuid();
      WHEN 'c5_distributed' THEN v_ws := v_dist;
      WHEN 'c6_answer_exists' THEN v_ws := v_answered;
      WHEN 'c6_submitted' THEN v_ws := v_submitted;
      WHEN 'c6_checked' THEN v_ws := v_checked;
      WHEN 'c6_open_without_answers' THEN v_ws := v_open;
      WHEN 'c7_not_array' THEN v_payload := v_valid->0;
      WHEN 'c7_null_items' THEN v_payload := NULL;
      WHEN 'c7_201_items' THEN
        SELECT pg_catalog.jsonb_agg(v_valid->0) INTO v_payload FROM pg_catalog.generate_series(1, 201);
      WHEN 'c7_element_not_object' THEN v_payload := v_valid || '["not an object"]'::jsonb;
      WHEN 'c7_empty_question' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,question}', '"   "');
      WHEN 'c7_unknown_type' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,item_type}', '"matching"');
      WHEN 'c7_negative_points' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,points}', '-1');
      WHEN 'c7_points_10000' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,points}', '10000');
      WHEN 'c7_points_text' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,points}', '"2"');
      WHEN 'c7_essay_with_key' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{1,correct_answer}', '"An answer"');
      WHEN 'c7_essay_min_sentences_0' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{1,essay_min_sentences}', '0');
      WHEN 'c7_essay_min_sentences_51' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{1,essay_min_sentences}', '51');
      WHEN 'c7_essay_min_sentences_fraction' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{1,essay_min_sentences}', '2.5');
      WHEN 'c7_essay_min_words_2001' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{1,essay_min_words}', '2001');
      WHEN 'c7_non_essay_without_key' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,correct_answer}', 'null');
      WHEN 'c7_non_essay_with_essay_min' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,essay_min_words}', '10');
      WHEN 'c7_options_not_array' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,options}', '"Red, Blue"');
      WHEN 'c7_choice_key_not_in_options' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,correct_answer}', '"Green"');
      WHEN 'c7_choice_without_options' THEN v_payload := pg_catalog.jsonb_set(v_valid, '{0,options}', '[]');
      WHEN 'c7_identification_empty_key' THEN v_payload := pg_catalog.jsonb_set(v_all_types, '{2,correct_answer}', '[]');
      WHEN 'c8_atomicity' THEN
        -- The second item's key is the fault trigger's sentinel: items are
        -- written, then the key insert fails.
        v_payload := pg_catalog.jsonb_build_array(v_valid->0, pg_catalog.jsonb_build_object(
          'question', 'Synthetic faulted choice', 'item_type', 'multiple_choice',
          'options', pg_catalog.jsonb_build_array('selftest-fault-key', 'Other'), 'points', 1,
          'correct_answer', 'selftest-fault-key'));
      ELSE NULL;
    END CASE;

    BEGIN
      IF v_case = 'c8_atomicity' THEN
        EXECUTE $ddl$CREATE FUNCTION public.eduscribe_selftest_items_fault_tmp() RETURNS trigger
          LANGUAGE plpgsql AS $body$ BEGIN RAISE EXCEPTION 'selftest_items_fault'; END
$body$
$ddl$;
        EXECUTE pg_catalog.format($ddl$CREATE TRIGGER eduscribe_selftest_items_fault_tmp
          BEFORE INSERT ON public.worksheet_item_keys FOR EACH ROW
          WHEN (NEW.correct_answer = %L::jsonb)
          EXECUTE FUNCTION public.eduscribe_selftest_items_fault_tmp()
$ddl$, '"selftest-fault-key"');
      END IF;

      SELECT pg_catalog.jsonb_build_object(
        'count', (SELECT w.items FROM public.worksheets w WHERE w.id = v_ws),
        'items', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', i.id, 'position', i.position, 'question', i.question, 'type', i.item_type,
            'options', i.options, 'points', i.points, 'min_s', i.essay_min_sentences,
            'min_w', i.essay_min_words, 'key', k.correct_answer, 'has_key', k.item_id IS NOT NULL)
            ORDER BY i.position), '[]'::jsonb)
          FROM public.worksheet_items i
          LEFT JOIN public.worksheet_item_keys k ON k.item_id = i.id
          WHERE i.worksheet_id = v_ws))
        INTO v_before_state;

      BEGIN
        PERFORM pg_catalog.set_config('request.jwt.claim.sub', COALESCE(v_actor::text, ''), true);
        PERFORM pg_catalog.set_config('request.jwt.claims',
          CASE WHEN v_actor IS NULL THEN '{}' ELSE
            pg_catalog.jsonb_build_object('sub', v_actor::text)::text END, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        IF v_case = 'c1_replace_then_replace_again' THEN
          -- First a longer set, then the two-item set: nothing of the first may remain.
          v_receipt := public.eduscribe_worksheet_items_replace_v1(v_ws, v_all_types);
        END IF;
        v_receipt := public.eduscribe_worksheet_items_replace_v1(v_ws, v_payload);
        EXECUTE 'RESET ROLE';
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        EXECUTE 'RESET ROLE';
      END;

      SELECT pg_catalog.jsonb_build_object(
        'count', (SELECT w.items FROM public.worksheets w WHERE w.id = v_ws),
        'items', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', i.id, 'position', i.position, 'question', i.question, 'type', i.item_type,
            'options', i.options, 'points', i.points, 'min_s', i.essay_min_sentences,
            'min_w', i.essay_min_words, 'key', k.correct_answer, 'has_key', k.item_id IS NOT NULL)
            ORDER BY i.position), '[]'::jsonb)
          FROM public.worksheet_items i
          LEFT JOIN public.worksheet_item_keys k ON k.item_id = i.id
          WHERE i.worksheet_id = v_ws))
        INTO v_after_state;

      IF v_case IN ('c1_replace_then_replace_again', 'c2_all_types', 'c3_zero_items',
          'c7_exactly_200_allowed', 'c7_extra_fields_ignored', 'c4_admin_allowed',
          'c6_open_without_answers') THEN
        -- Success: the receipt, the count, and every stored row exactly as sent.
        v_ok := v_error IS NULL
          AND v_receipt = pg_catalog.jsonb_build_object('ok', true, 'worksheetId', v_ws,
            'count', pg_catalog.jsonb_array_length(v_expected))
          AND (v_after_state->>'count')::integer = pg_catalog.jsonb_array_length(v_expected)
          AND pg_catalog.jsonb_array_length(v_after_state->'items') = pg_catalog.jsonb_array_length(v_expected)
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements(v_expected) WITH ORDINALITY AS e(value, ordinality)
            FULL JOIN (SELECT * FROM public.worksheet_items x WHERE x.worksheet_id = v_ws) AS i
              ON i.position = e.ordinality
            LEFT JOIN public.worksheet_item_keys k ON k.item_id = i.id
            WHERE e.value IS NULL OR i.id IS NULL
              OR i.question IS DISTINCT FROM e.value->>'question'
              OR i.item_type IS DISTINCT FROM e.value->>'item_type'
              OR i.points IS DISTINCT FROM pg_catalog.round((e.value->>'points')::numeric, 2)
              OR i.options IS DISTINCT FROM CASE WHEN pg_catalog.jsonb_typeof(e.value->'options') = 'array'
                AND pg_catalog.jsonb_array_length(e.value->'options') > 0 THEN e.value->'options' END
              OR i.essay_min_sentences IS DISTINCT FROM (e.value->>'essay_min_sentences')::smallint
              OR i.essay_min_words IS DISTINCT FROM (e.value->>'essay_min_words')::smallint
              OR (k.item_id IS NOT NULL) IS DISTINCT FROM (e.value->>'item_type' <> 'essay')
              OR (e.value->>'item_type' <> 'essay' AND k.correct_answer IS DISTINCT FROM e.value->'correct_answer'))
          AND (v_ws <> v_main OR NOT EXISTS (SELECT 1 FROM public.worksheet_items i
            WHERE i.id IN (v_seed_item1, v_seed_item2)));
        IF v_case = 'c3_zero_items' THEN
          v_ok := v_ok AND NOT EXISTS (SELECT 1 FROM public.worksheet_item_keys k
            WHERE k.item_id IN (v_seed_item1, v_seed_item2));
        END IF;
        IF v_case = 'c6_open_without_answers' THEN
          -- Its seeded item was replaced too; v_seed_item* belong to another worksheet.
          v_ok := v_ok AND (v_before_state->'items'->0->>'id') <> (v_after_state->'items'->0->>'id');
        END IF;
      ELSIF v_case IN ('c4_other_teacher', 'c4_student_caller', 'c4_unknown_worksheet') THEN
        v_ok := v_error = 'not_found' AND v_before_state = v_after_state;
      ELSIF v_case = 'c4_unauthenticated' THEN
        v_ok := v_error = 'not_authenticated' AND v_before_state = v_after_state;
      ELSIF v_case = 'c5_distributed' THEN
        v_ok := v_error = 'distributed' AND v_before_state = v_after_state;
      ELSIF v_case IN ('c6_answer_exists', 'c6_submitted', 'c6_checked') THEN
        v_ok := v_error = 'student_work_exists' AND v_before_state = v_after_state;
      ELSIF v_case = 'c8_atomicity' THEN
        v_ok := v_error = 'selftest_items_fault' AND v_before_state = v_after_state
          AND (v_after_state->>'count')::integer = 2
          AND EXISTS (SELECT 1 FROM public.worksheet_items i WHERE i.id = v_seed_item1)
          AND EXISTS (SELECT 1 FROM public.worksheet_item_keys k WHERE k.item_id = v_seed_item1);
        EXECUTE 'DROP TRIGGER eduscribe_selftest_items_fault_tmp ON public.worksheet_item_keys';
        EXECUTE 'DROP FUNCTION public.eduscribe_selftest_items_fault_tmp()';
      ELSE
        v_ok := v_error = 'invalid_items' AND v_before_state = v_after_state;
      END IF;
      RAISE EXCEPTION 'rollback_case';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
      EXECUTE 'RESET ROLE';
    END;
    v_report := v_report || ' ' || v_case || '=' || CASE WHEN v_ok IS TRUE THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  SELECT pg_catalog.jsonb_build_object(
    'auth_users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'worksheets', (SELECT pg_catalog.count(*) FROM public.worksheets),
    'worksheet_items', (SELECT pg_catalog.count(*) FROM public.worksheet_items),
    'worksheet_item_keys', (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys),
    'task_assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'worksheet_submissions', (SELECT pg_catalog.count(*) FROM public.worksheet_submissions),
    'worksheet_answers', (SELECT pg_catalog.count(*) FROM public.worksheet_answers))
    INTO v_after_counts;
  -- Case 10: nothing persisted, and the temporary fault objects are gone.
  v_ok := v_before_counts = v_after_counts
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proname = 'eduscribe_selftest_items_fault_tmp')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgname = 'eduscribe_selftest_items_fault_tmp');
  v_report := v_report || ' c10_rollback_counts=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END
$selftest$;
ROLLBACK;
