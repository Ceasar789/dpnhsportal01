-- DISPOSABLE DATABASE ONLY. Never run against the shared Supabase project.
-- Requires the production Save migration, weekly draft job migration, base
-- assessment schema, and two synthetic active teacher profiles. One teacher
-- needs an active subject load for the sole current school year. No fixture
-- content or answer key is printed. The final forced exception rolls back all
-- fixtures and successful saves; expect SELFTEST PASSED_ROLLED_BACK.
BEGIN;
DO $$
DECLARE
  v_teacher uuid;
  v_other uuid;
  v_subject uuid;
  v_wrong_subject uuid := pg_catalog.gen_random_uuid();
  v_subject_name text;
  v_grade text;
  v_year text;
  v_wrong_year text;
  v_wrong_grade text;
  v_load uuid;
  v_ai_plan uuid := pg_catalog.gen_random_uuid();
  v_manual_plan uuid := pg_catalog.gen_random_uuid();
  v_legacy_ai_plan uuid := pg_catalog.gen_random_uuid();
  v_legacy_manual_plan uuid := pg_catalog.gen_random_uuid();
  v_mismatch_plan uuid := pg_catalog.gen_random_uuid();
  v_ai_job uuid := pg_catalog.gen_random_uuid();
  v_manual_job uuid := pg_catalog.gen_random_uuid();
  v_legacy_ai_job uuid := pg_catalog.gen_random_uuid();
  v_legacy_manual_job uuid := pg_catalog.gen_random_uuid();
  v_mismatch_job uuid := pg_catalog.gen_random_uuid();
  v_request uuid := pg_catalog.gen_random_uuid();
  v_existing_worksheet uuid := pg_catalog.gen_random_uuid();
  v_existing_item uuid := pg_catalog.gen_random_uuid();
  v_payload jsonb;
  v_manual_payload jsonb;
  v_legacy_ai_payload jsonb;
  v_legacy_manual_payload jsonb;
  v_bad jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_item_ids uuid[];
  v_error text;
  v_table text;
  v_before_collections bigint;
  v_before_items bigint;
  v_before_keys bigint;
  v_before_private bigint;
  v_before_worksheets bigint;
  v_after_collections bigint;
  v_after_items bigint;
  v_after_keys bigint;
  v_after_private bigint;
  v_after_worksheets bigint;
  v_before_assignees bigint;
  v_after_assignees bigint;
  v_before_sections bigint;
  v_after_sections bigint;
  v_plan public.lesson_plans%ROWTYPE;
BEGIN
  SELECT p.id, ts.id, ts.subject_id, sub.name, ts.grade_level, ts.school_year
    INTO v_teacher, v_load, v_subject, v_subject_name, v_grade, v_year
    FROM public.profiles p JOIN public.teacher_subjects ts ON ts.teacher_id = p.id
    JOIN public.subjects sub ON sub.id = ts.subject_id
    JOIN public.school_settings s ON s.id = 1 AND s.school_year = ts.school_year
    WHERE p.role = 'teacher' AND p.status = 'active' AND sub.is_active IS TRUE
    ORDER BY p.id, ts.id LIMIT 1;
  SELECT p.id INTO v_other FROM public.profiles p
    WHERE p.role = 'teacher' AND p.status = 'active' AND p.id <> v_teacher
    ORDER BY p.id LIMIT 1;
  IF v_teacher IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_UNAVAILABLE: seed two synthetic teachers and one current active load';
  END IF;
  v_wrong_year := CASE WHEN v_year = '2000-2001' THEN '2001-2002' ELSE '2000-2001' END;
  v_wrong_grade := CASE WHEN v_grade = 'Synthetic Grade' THEN 'Other Grade' ELSE 'Synthetic Grade' END;
  IF NOT pg_catalog.has_function_privilege('authenticated',
      'public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)', 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon',
        'public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)', 'EXECUTE')
      OR pg_catalog.has_function_privilege('service_role',
        'public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)', 'EXECUTE')
      OR NOT pg_catalog.has_table_privilege('authenticated',
        'public.worksheet_item_keys', 'SELECT')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'worksheet_item_keys'
          AND policyname = 'weekly_production_keys_private')
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,
          pg_catalog.acldefault('f', p.proowner))) acl
        WHERE p.oid = 'public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)'::regprocedure
          AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')
      OR EXISTS (SELECT 1 FROM (VALUES ('public.worksheet_collections'),
          ('public.worksheet_item_private'), ('public.worksheet_item_keys')) t(name)
        WHERE pg_catalog.has_table_privilege('anon', t.name, 'SELECT')
          OR pg_catalog.has_any_column_privilege('anon', t.name, 'SELECT'))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
          pg_catalog.acldefault('r', c.relowner))) acl
        WHERE c.oid IN ('public.worksheet_collections'::regclass,
          'public.worksheet_item_private'::regclass,
          'public.worksheet_item_keys'::regclass)
          AND acl.grantee = 0 AND acl.privilege_type = 'SELECT') THEN
    RAISE EXCEPTION 'SELFTEST FAILED: grants';
  END IF;
  -- Effective anon access includes grants inherited from PUBLIC. Exercise the
  -- actual role as well as checking the catalog, without selecting row data.
  FOREACH v_table IN ARRAY ARRAY['public.worksheet_collections',
      'public.worksheet_item_private', 'public.worksheet_item_keys'] LOOP
    v_error := NULL;
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      EXECUTE 'SELECT count(*) FROM ' || v_table;
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLSTATE;
      EXECUTE 'RESET ROLE';
    END;
    IF v_error IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'SELFTEST FAILED: anon access';
    END IF;
  END LOOP;

  -- A synthetic pre-existing manual row must retain its owner read path.
  INSERT INTO public.worksheets
    (id, teacher_id, title, subject_id, subject, grade_level, items,
      status, task_type, checking_mode)
  VALUES (v_existing_worksheet, v_teacher, 'Synthetic existing worksheet',
    v_subject, v_subject_name, v_grade, 1, 'Draft', 'worksheet', 'manual');
  INSERT INTO public.worksheet_items
    (id, worksheet_id, position, question, item_type, options, points)
  VALUES (v_existing_item, v_existing_worksheet, 1,
    'Synthetic baseline prompt', 'true_false', NULL, 1);
  INSERT INTO public.worksheet_item_keys (item_id, correct_answer)
  VALUES (v_existing_item, '"True"'::jsonb);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF NOT EXISTS (SELECT 1 FROM public.worksheets w
        WHERE w.id = v_existing_worksheet AND w.teacher_id = v_teacher)
        OR NOT EXISTS (SELECT 1 FROM public.worksheet_item_keys k
          WHERE k.item_id = v_existing_item) THEN
      RAISE EXCEPTION 'SELFTEST FAILED: baseline worksheet owner access';
    END IF;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RAISE;
  END;

  SELECT pg_catalog.count(*) INTO v_before_collections
    FROM public.worksheet_collections;
  SELECT pg_catalog.count(*) INTO v_before_items FROM public.worksheet_items;
  SELECT pg_catalog.count(*) INTO v_before_keys FROM public.worksheet_item_keys;
  SELECT pg_catalog.count(*) INTO v_before_private FROM public.worksheet_item_private;
  SELECT pg_catalog.count(*) INTO v_before_worksheets FROM public.worksheets;
  SELECT pg_catalog.count(*) INTO v_before_sections FROM public.worksheet_sections;
  IF pg_catalog.to_regclass('public.task_assignees') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.task_assignees' INTO v_before_assignees;
  END IF;

  INSERT INTO public.subjects (id, name, code, is_active)
  VALUES (v_wrong_subject, 'Synthetic other subject ' || v_wrong_subject::text,
    'T' || pg_catalog.left(pg_catalog.replace(v_wrong_subject::text, '-', ''), 19), true);

  INSERT INTO public.lesson_plans (id, teacher_id, title, objectives, subject_id,
    subject, grade_level, academic_year, ai_generated, status) VALUES
    (v_ai_plan, v_teacher, 'Synthetic AI ILAW', 'Synthetic AI source', v_subject,
      v_subject_name, v_grade, v_year, true, 'draft'),
    (v_manual_plan, v_teacher, 'Synthetic Manual ILAW',
      '{"kind":"eduscribe.manual-ilaw","version":2}', v_subject,
      v_subject_name, v_grade, v_year, false, 'draft'),
    (v_legacy_ai_plan, v_teacher, 'Synthetic legacy AI ILAW',
      'Synthetic legacy AI source', v_subject, v_subject_name, v_grade,
      NULL, true, 'draft'),
    (v_legacy_manual_plan, v_teacher, 'Synthetic legacy Manual ILAW',
      '{"kind":"eduscribe.manual-ilaw","version":2}', v_subject,
      v_subject_name, v_grade, NULL, false, 'draft'),
    (v_mismatch_plan, v_teacher, 'Synthetic wrong-year ILAW', 'Synthetic source',
      v_subject, v_subject_name, v_grade, v_wrong_year, true, 'draft');
  FOR v_plan IN SELECT * FROM public.lesson_plans
      WHERE id IN (v_ai_plan, v_manual_plan, v_legacy_ai_plan,
        v_legacy_manual_plan, v_mismatch_plan) LOOP
    INSERT INTO public.weekly_draft_generation_jobs
      (id, teacher_id, source_lesson_plan_id, request_id, request_fingerprint,
        source_hash, source_days, question_count, planned_calls,
        attempted_calls, completed_batches, status, draft_result)
    VALUES (CASE WHEN v_plan.id = v_ai_plan THEN v_ai_job
      WHEN v_plan.id = v_manual_plan THEN v_manual_job
      WHEN v_plan.id = v_legacy_ai_plan THEN v_legacy_ai_job
      WHEN v_plan.id = v_legacy_manual_plan THEN v_legacy_manual_job
      ELSE v_mismatch_job END,
      v_teacher, v_plan.id, pg_catalog.gen_random_uuid()::text,
      pg_catalog.sha256(pg_catalog.convert_to(v_plan.id::text, 'UTF8')),
      pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        v_plan.title, v_plan.objectives, v_plan.subject, v_plan.grade_level,
        v_plan.subject_id, v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8')),
      (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('day', day_name)
        ORDER BY ord) FROM pg_catalog.unnest(ARRAY['Monday','Tuesday','Wednesday',
          'Thursday','Friday']) WITH ORDINALITY AS t(day_name, ord)),
      20, 10, 10, 10, 'COMPLETED',
      pg_catalog.jsonb_build_object('kind', 'weekly-worksheet-collection',
        'status', 'local-draft', 'saved', false, 'teacherId', v_teacher,
        'sourceLessonPlan', pg_catalog.jsonb_build_object('id', v_plan.id),
        'worksheets', (SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('day', day_name) ORDER BY ord)
          FROM pg_catalog.unnest(ARRAY['Monday','Tuesday','Wednesday',
            'Thursday','Friday']) WITH ORDINALITY AS t(day_name, ord))));
  END LOOP;

  SELECT pg_catalog.jsonb_build_object('sourceLessonPlanId', v_ai_plan,
    'title', 'Synthetic reviewed weekly set', 'worksheets',
    (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'day', day_number, 'title', 'Synthetic day ' || day_number,
      'instructions', 'Synthetic directions', 'checkingMode', 'manual',
      'sections', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', 'main', 'title', 'Questions', 'directions', 'Synthetic section directions')),
      'questions', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'position', position, 'sectionId', 'main',
        'question', 'Synthetic question ' || day_number || '-' || position,
        'item_type', 'true_false', 'options', null, 'points', 1,
        'correct_answer', 'True') ORDER BY position)
        FROM pg_catalog.generate_series(1,20) position)) ORDER BY day_number)
      FROM pg_catalog.generate_series(1,5) day_number)) INTO v_payload;
  v_manual_payload := pg_catalog.jsonb_set(v_payload, '{sourceLessonPlanId}',
    pg_catalog.to_jsonb(v_manual_plan::text));
  -- The reviewed Manual draft may have fewer questions than generation produced.
  v_manual_payload := pg_catalog.jsonb_set(v_manual_payload,
    '{worksheets,0,questions}', pg_catalog.jsonb_build_array(
      v_manual_payload #> '{worksheets,0,questions,0}'));
  v_legacy_ai_payload := pg_catalog.jsonb_set(v_payload,
    '{sourceLessonPlanId}', pg_catalog.to_jsonb(v_legacy_ai_plan::text));
  v_legacy_manual_payload := pg_catalog.jsonb_set(v_manual_payload,
    '{sourceLessonPlanId}', pg_catalog.to_jsonb(v_legacy_manual_plan::text));
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);

  -- Invalid late day must not leave the earlier four days or a collection.
  v_bad := pg_catalog.jsonb_set(v_payload, '{worksheets,4,day}', '1'::jsonb);
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_bad);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'invalid_document' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: duplicate day';
  END IF;
  v_error := NULL;
  v_bad := pg_catalog.jsonb_set(v_payload, '{worksheets}',
    (v_payload->'worksheets') - 4);
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_bad);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'invalid_document' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: missing day';
  END IF;
  v_error := NULL;
  v_bad := pg_catalog.jsonb_set(v_payload,
    '{worksheets,0,questions,0,correct_answer}', '"Maybe"'::jsonb);
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_bad);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'invalid_document' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: invalid answer';
  END IF;
  v_error := NULL;
  v_bad := pg_catalog.jsonb_set(v_payload,
    '{worksheets,0,questions,0,position}', '2'::jsonb);
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_bad);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'invalid_document' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: invalid question';
  END IF;
  SELECT pg_catalog.count(*) INTO v_after_collections
    FROM public.worksheet_collections;
  SELECT pg_catalog.count(*) INTO v_after_worksheets FROM public.worksheets;
  SELECT pg_catalog.count(*) INTO v_after_items FROM public.worksheet_items;
  SELECT pg_catalog.count(*) INTO v_after_keys FROM public.worksheet_item_keys;
  SELECT pg_catalog.count(*) INTO v_after_private FROM public.worksheet_item_private;
  IF v_after_collections <> v_before_collections
      OR v_after_worksheets <> v_before_worksheets
      OR v_after_items <> v_before_items OR v_after_keys <> v_before_keys
      OR v_after_private <> v_before_private THEN
    RAISE EXCEPTION 'SELFTEST FAILED: partial save';
  END IF;

  -- A different active teacher cannot save the first teacher's completed job.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other::text, true);
  v_error := NULL;
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'job_unavailable' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: wrong owner';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  v_error := NULL;
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'not_authenticated' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: missing identity';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', pg_catalog.gen_random_uuid()::text, true);
  v_error := NULL;
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'inactive_teacher' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: inactive teacher';
  END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  v_error := NULL;
  BEGIN
    DELETE FROM public.teacher_subjects WHERE id = v_load;
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'assignment_denied' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: absent load';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teacher_subjects ts
      JOIN public.subjects sub ON sub.id = ts.subject_id
      WHERE ts.id = v_load AND ts.teacher_id = v_teacher
        AND ts.subject_id = v_subject AND ts.grade_level = v_grade
        AND ts.school_year = v_year AND sub.is_active IS TRUE) THEN
    RAISE EXCEPTION 'SELFTEST FAILED: matching load not restored';
  END IF;
  v_error := NULL;
  BEGIN
    UPDATE public.teacher_subjects SET school_year = v_wrong_year WHERE id = v_load;
    PERFORM public.eduscribe_weekly_job_save_v1(v_legacy_ai_job,
      pg_catalog.gen_random_uuid(), v_legacy_ai_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'assignment_denied' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: wrong-year load';
  END IF;
  v_error := NULL;
  BEGIN
    UPDATE public.teacher_subjects SET subject_id = v_wrong_subject WHERE id = v_load;
    PERFORM public.eduscribe_weekly_job_save_v1(v_legacy_ai_job,
      pg_catalog.gen_random_uuid(), v_legacy_ai_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'assignment_denied' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: wrong-subject load';
  END IF;
  v_error := NULL;
  BEGIN
    UPDATE public.teacher_subjects SET grade_level = v_wrong_grade WHERE id = v_load;
    PERFORM public.eduscribe_weekly_job_save_v1(v_legacy_ai_job,
      pg_catalog.gen_random_uuid(), v_legacy_ai_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'assignment_denied' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: wrong-grade load';
  END IF;
  v_error := NULL;
  BEGIN
    UPDATE public.subjects SET is_active = false WHERE id = v_subject;
    PERFORM public.eduscribe_weekly_job_save_v1(v_legacy_ai_job,
      pg_catalog.gen_random_uuid(), v_legacy_ai_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'assignment_denied' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: inactive subject';
  END IF;
  v_error := NULL;
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_mismatch_job,
      pg_catalog.gen_random_uuid(), pg_catalog.jsonb_set(v_payload,
        '{sourceLessonPlanId}', pg_catalog.to_jsonb(v_mismatch_plan::text)));
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'assignment_denied' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: mismatched school year';
  END IF;
  v_error := NULL;
  BEGIN
    UPDATE public.lesson_plans SET objectives = 'Changed synthetic source'
      WHERE id = v_ai_plan;
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job,
      pg_catalog.gen_random_uuid(), v_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'source_changed' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: changed source';
  END IF;

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT public.eduscribe_weekly_job_save_v1(v_ai_job, v_request, v_payload)
      INTO v_result;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RAISE;
  END;
  SELECT public.eduscribe_weekly_job_save_v1(v_ai_job, v_request, v_payload)
    INTO v_replay;
  IF v_result IS DISTINCT FROM v_replay OR v_result->'ok' IS DISTINCT FROM 'true'::jsonb
      OR v_result->'durable' IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_array_length(v_result->'worksheets') <> 5
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_result->'worksheets') d
        WHERE (d->>'items')::integer <> 20) THEN
    RAISE EXCEPTION 'SELFTEST FAILED: AI save or replay';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM public.worksheets w
      WHERE w.collection_id = (v_result->>'collectionId')::uuid
        AND w.teacher_id = v_teacher AND w.origin = 'ai_generated'
        AND w.status = 'Draft' AND w.task_type = 'worksheet'
        AND w.items = 20 AND w.day_of_week BETWEEN 1 AND 5) <> 5
      OR (SELECT pg_catalog.count(*) FROM public.worksheet_items i
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE w.collection_id = (v_result->>'collectionId')::uuid) <> 100
      OR (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys k
        JOIN public.worksheet_items i ON i.id = k.item_id
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE w.collection_id = (v_result->>'collectionId')::uuid) <> 100
      OR (SELECT pg_catalog.count(*) FROM public.worksheet_item_private p
        JOIN public.worksheet_items i ON i.id = p.item_id
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE w.collection_id = (v_result->>'collectionId')::uuid) <> 100 THEN
    RAISE EXCEPTION 'SELFTEST FAILED: canonical rows incomplete';
  END IF;
  SELECT pg_catalog.array_agg(i.id) INTO v_item_ids
    FROM public.worksheet_items i JOIN public.worksheets w ON w.id = i.worksheet_id
    WHERE w.collection_id = (v_result->>'collectionId')::uuid;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF EXISTS (SELECT 1 FROM public.worksheet_collections c
        WHERE c.id = (v_result->>'collectionId')::uuid)
        OR EXISTS (SELECT 1 FROM public.worksheets w
          WHERE w.collection_id = (v_result->>'collectionId')::uuid
            OR w.id = v_existing_worksheet) THEN
      RAISE EXCEPTION 'SELFTEST FAILED: cross-teacher worksheet access';
    END IF;
    IF EXISTS (SELECT 1 FROM public.worksheet_item_keys k
        WHERE k.item_id = ANY(v_item_ids) OR k.item_id = v_existing_item) THEN
      RAISE EXCEPTION 'SELFTEST FAILED: foreign key access';
    END IF;
    IF EXISTS (SELECT 1 FROM public.worksheet_item_private p
        WHERE p.item_id = ANY(v_item_ids)) THEN
      RAISE EXCEPTION 'SELFTEST FAILED: foreign private access';
    END IF;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RAISE;
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF NOT EXISTS (SELECT 1 FROM public.worksheet_collections c
        WHERE c.id = (v_result->>'collectionId')::uuid
          AND c.teacher_id = v_teacher AND c.revision = 1)
        OR NOT EXISTS (SELECT 1 FROM public.worksheets w
          WHERE w.id = v_existing_worksheet AND w.teacher_id = v_teacher)
        OR (SELECT pg_catalog.count(*) FROM public.worksheets w
          WHERE w.collection_id = (v_result->>'collectionId')::uuid) <> 5
        OR (SELECT pg_catalog.count(*) FROM public.worksheet_item_keys k
        WHERE k.item_id = ANY(v_item_ids)) <> 100
        OR NOT EXISTS (SELECT 1 FROM public.worksheet_item_keys k
          WHERE k.item_id = v_existing_item)
        OR (SELECT pg_catalog.count(*) FROM public.worksheet_item_private p
          WHERE p.item_id = ANY(v_item_ids)) <> 100 THEN
      RAISE EXCEPTION 'SELFTEST FAILED: owner key access';
    END IF;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RAISE;
  END;
  v_error := NULL;
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, v_request,
      v_payload || '{"title":"Changed content"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'idempotency_conflict' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: changed payload retry';
  END IF;
  v_error := NULL;
  BEGIN
    PERFORM public.eduscribe_weekly_job_save_v1(v_ai_job, pg_catalog.gen_random_uuid(), v_payload);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM; END;
  IF v_error IS DISTINCT FROM 'idempotency_conflict' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: duplicate job Save';
  END IF;
  SELECT public.eduscribe_weekly_job_save_v1(v_manual_job, pg_catalog.gen_random_uuid(),
    v_manual_payload) INTO v_result;
  IF v_result->'durable' IS DISTINCT FROM 'true'::jsonb
      OR v_result #>> '{worksheets,0,items}' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: Manual ILAW job Save';
  END IF;
  SELECT public.eduscribe_weekly_job_save_v1(v_legacy_ai_job,
    pg_catalog.gen_random_uuid(), v_legacy_ai_payload) INTO v_result;
  IF v_result->'durable' IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_array_length(v_result->'worksheets') <> 5 THEN
    RAISE EXCEPTION 'SELFTEST FAILED: legacy NULL-year AI Save';
  END IF;
  SELECT public.eduscribe_weekly_job_save_v1(v_legacy_manual_job,
    pg_catalog.gen_random_uuid(), v_legacy_manual_payload) INTO v_result;
  IF v_result->'durable' IS DISTINCT FROM 'true'::jsonb
      OR v_result #>> '{worksheets,0,items}' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'SELFTEST FAILED: legacy NULL-year Manual Save';
  END IF;
  SELECT pg_catalog.count(*) INTO v_after_worksheets FROM public.worksheets;
  IF v_after_worksheets <> v_before_worksheets + 20 THEN
    RAISE EXCEPTION 'SELFTEST FAILED: canonical five-day saves';
  END IF;
  SELECT pg_catalog.count(*) INTO v_after_sections FROM public.worksheet_sections;
  IF v_before_sections <> v_after_sections THEN
    RAISE EXCEPTION 'SELFTEST FAILED: worksheet posting changed';
  END IF;
  IF v_before_assignees IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.task_assignees' INTO v_after_assignees;
    IF v_before_assignees <> v_after_assignees THEN
      RAISE EXCEPTION 'SELFTEST FAILED: distribution changed';
    END IF;
  END IF;
  RAISE EXCEPTION 'SELFTEST PASSED_ROLLED_BACK: canonical AI/Manual and legacy NULL-year Save, authorization, five days, atomicity, replay, key privacy, no distribution';
END $$;
ROLLBACK;
