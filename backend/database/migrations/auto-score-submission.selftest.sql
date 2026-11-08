-- Synthetic, rolled-back checks for auto-score-submission.sql.
-- Run as postgres in the SQL editor, after applying auto-score-submission.sql.
-- Synthetic users, a section, worksheets, items, keys, answers and assignees are
-- made inside this transaction; a student submits through the real path (as the
-- authenticated role with the student's claims), so RLS, the guard and the
-- trigger all run. The final error reports SELFTEST PASSED_ROLLED_BACK or
-- FAILED_ROLLED_BACK. Nothing persists on any path.
--
-- After this one, re-run worksheet-score-release.selftest.sql,
-- worksheet-anon-direct-grants-revoke.selftest.sql and day-task-distribute.selftest.sql:
-- they exercise the same tables and the release path.
--
-- The block between the GENERATED VECTORS markers is written by
--   node backend/database/scripts/genScoringVectors.cjs --write
-- from frontend/src/lib/scoringVectors.json. Do not edit it by hand.
BEGIN;
DO $$
DECLARE
  v_teacher uuid := pg_catalog.gen_random_uuid();
  v_student uuid := pg_catalog.gen_random_uuid();
  v_student2 uuid := pg_catalog.gen_random_uuid();
  v_section uuid := pg_catalog.gen_random_uuid();
  -- Worksheets, one per case.
  w_auto uuid := pg_catalog.gen_random_uuid();
  w_late uuid := pg_catalog.gen_random_uuid();
  w_manual uuid := pg_catalog.gen_random_uuid();
  w_essay_met uuid := pg_catalog.gen_random_uuid();
  w_essay_fail uuid := pg_catalog.gen_random_uuid();
  w_essay_norule uuid := pg_catalog.gen_random_uuid();
  w_missing uuid := pg_catalog.gen_random_uuid();
  w_error uuid := pg_catalog.gen_random_uuid();
  w_other uuid := pg_catalog.gen_random_uuid();
  -- Items.
  i_mc uuid := pg_catalog.gen_random_uuid();
  i_tf uuid := pg_catalog.gen_random_uuid();
  i_id uuid := pg_catalog.gen_random_uuid();
  i_en uuid := pg_catalog.gen_random_uuid();
  i_late uuid := pg_catalog.gen_random_uuid();
  i_manual uuid := pg_catalog.gen_random_uuid();
  i_met_mc uuid := pg_catalog.gen_random_uuid();
  i_met_essay uuid := pg_catalog.gen_random_uuid();
  i_fail_mc uuid := pg_catalog.gen_random_uuid();
  i_fail_essay uuid := pg_catalog.gen_random_uuid();
  i_norule_mc uuid := pg_catalog.gen_random_uuid();
  i_norule_essay uuid := pg_catalog.gen_random_uuid();
  i_missing_keyed uuid := pg_catalog.gen_random_uuid();
  i_missing_unkeyed uuid := pg_catalog.gen_random_uuid();
  i_error uuid := pg_catalog.gen_random_uuid();
  i_other uuid := pg_catalog.gen_random_uuid();
  -- Submissions.
  s_auto uuid := pg_catalog.gen_random_uuid();
  s_late uuid := pg_catalog.gen_random_uuid();
  s_manual uuid := pg_catalog.gen_random_uuid();
  s_essay_met uuid := pg_catalog.gen_random_uuid();
  s_essay_fail uuid := pg_catalog.gen_random_uuid();
  s_essay_norule uuid := pg_catalog.gen_random_uuid();
  s_missing uuid := pg_catalog.gen_random_uuid();
  s_error uuid := pg_catalog.gen_random_uuid();
  s_other_student uuid := pg_catalog.gen_random_uuid();
  s_other_ws uuid := pg_catalog.gen_random_uuid();
  v_sub uuid;
  v_submit_errors jsonb := '{}'::jsonb;
  v_vectors jsonb;
  v_vec jsonb;
  v_res record;
  v_bad text := '';
  v_n integer;
  v_m integer;
  v_row record;
  v_snapshot_before jsonb;
  v_snapshot_after jsonb;
  v_untouched_before jsonb;
  v_untouched_after jsonb;
  v_before jsonb;
  v_after jsonb;
  v_error text;
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
    'provisional', (SELECT pg_catalog.count(*) FROM public.worksheet_provisional_marks),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'notifications', (SELECT pg_catalog.count(*) FROM public.notifications)) INTO v_before;

  -- Fixtures are written as postgres with no user claims, so the guard steps aside.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'auto-score-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_teacher, v_student, v_student2]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'auto-score-' || u.id::text || '@example.invalid', 'Synthetic auto-score user', u.role, 'active'
  FROM (VALUES (v_teacher, 'teacher'), (v_student, 'student'), (v_student2, 'student')) AS u(id, role)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id) VALUES (v_student), (v_student2);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id)
    VALUES (v_section, 'Auto-score selftest ' || v_section::text, '7', '2025-2026', v_teacher);

  INSERT INTO public.worksheets (id, teacher_id, title, status, origin, task_type, checking_mode) VALUES
    (w_auto, v_teacher, 'Synthetic auto quiz', 'Draft', 'manual', 'quiz', 'auto'),
    (w_late, v_teacher, 'Synthetic late quiz', 'Draft', 'manual', 'quiz', 'auto'),
    (w_manual, v_teacher, 'Synthetic manual quiz', 'Draft', 'manual', 'quiz', 'manual'),
    (w_essay_met, v_teacher, 'Synthetic essay quiz met', 'Draft', 'manual', 'quiz', 'auto'),
    (w_essay_fail, v_teacher, 'Synthetic essay quiz not met', 'Draft', 'manual', 'quiz', 'auto'),
    (w_essay_norule, v_teacher, 'Synthetic essay quiz no rule', 'Draft', 'manual', 'quiz', 'auto'),
    (w_missing, v_teacher, 'Synthetic missing-key quiz', 'Draft', 'manual', 'quiz', 'auto'),
    (w_error, v_teacher, 'Synthetic error quiz', 'Draft', 'manual', 'quiz', 'auto'),
    (w_other, v_teacher, 'Synthetic untouched quiz', 'Draft', 'manual', 'quiz', 'auto');
  INSERT INTO public.worksheet_items
    (id, worksheet_id, position, question, item_type, options, points, essay_min_sentences, essay_min_words) VALUES
    (i_mc, w_auto, 1, 'Pick A', 'multiple_choice', '["A","B"]'::jsonb, 2, NULL, NULL),
    (i_tf, w_auto, 2, 'True?', 'true_false', NULL, 1, NULL, NULL),
    (i_id, w_auto, 3, 'Red planet', 'identification', NULL, 1, NULL, NULL),
    (i_en, w_auto, 4, 'Two colours', 'enumeration', NULL, 2, NULL, NULL),
    (i_late, w_late, 1, 'Red planet', 'identification', NULL, 1, NULL, NULL),
    (i_manual, w_manual, 1, 'Red planet', 'identification', NULL, 1, NULL, NULL),
    (i_met_mc, w_essay_met, 1, 'Pick A', 'multiple_choice', '["A","B"]'::jsonb, 2, NULL, NULL),
    (i_met_essay, w_essay_met, 2, 'Explain', 'essay', NULL, 5, 2, 5),
    (i_fail_mc, w_essay_fail, 1, 'Pick A', 'multiple_choice', '["A","B"]'::jsonb, 2, NULL, NULL),
    (i_fail_essay, w_essay_fail, 2, 'Explain', 'essay', NULL, 5, 2, 5),
    (i_norule_mc, w_essay_norule, 1, 'Pick A', 'multiple_choice', '["A","B"]'::jsonb, 2, NULL, NULL),
    (i_norule_essay, w_essay_norule, 2, 'Explain', 'essay', NULL, 5, NULL, NULL),
    (i_missing_keyed, w_missing, 1, 'Red planet', 'identification', NULL, 1, NULL, NULL),
    (i_missing_unkeyed, w_missing, 2, 'Pick A', 'multiple_choice', '["A","B"]'::jsonb, 1, NULL, NULL),
    (i_error, w_error, 1, 'Red planet', 'identification', NULL, 1, NULL, NULL),
    (i_other, w_other, 1, 'Red planet', 'identification', NULL, 1, NULL, NULL);
  INSERT INTO public.worksheet_item_keys (item_id, correct_answer) VALUES
    (i_mc, '"A"'), (i_tf, '"True"'), (i_id, '["Mars"]'), (i_en, '["Red","Blue"]'),
    (i_late, '["Mars"]'), (i_manual, '["Mars"]'),
    (i_met_mc, '"A"'), (i_fail_mc, '"A"'), (i_norule_mc, '"A"'),
    (i_missing_keyed, '["Mars"]'), (i_error, '["Mars"]'), (i_other, '["Mars"]');
  INSERT INTO public.worksheet_submissions (id, worksheet_id, student_id, section_id, status) VALUES
    (s_auto, w_auto, v_student, v_section, 'in_progress'),
    (s_late, w_late, v_student, v_section, 'in_progress'),
    (s_manual, w_manual, v_student, v_section, 'in_progress'),
    (s_essay_met, w_essay_met, v_student, v_section, 'in_progress'),
    (s_essay_fail, w_essay_fail, v_student, v_section, 'in_progress'),
    (s_essay_norule, w_essay_norule, v_student, v_section, 'in_progress'),
    (s_missing, w_missing, v_student, v_section, 'in_progress'),
    (s_error, w_error, v_student, v_section, 'in_progress'),
    (s_other_student, w_auto, v_student2, v_section, 'in_progress'),
    (s_other_ws, w_other, v_student, v_section, 'in_progress');
  INSERT INTO public.worksheet_answers (submission_id, item_id, answer) VALUES
    (s_auto, i_mc, '"A"'), (s_auto, i_tf, '"True"'), (s_auto, i_id, '"Mars."'), (s_auto, i_en, '["Red, Green"]'),
    (s_late, i_late, '"mars"'),
    (s_manual, i_manual, '"Mars"'),
    (s_essay_met, i_met_mc, '"A"'), (s_essay_met, i_met_essay, '"Plants need light. They grow tall."'),
    (s_essay_fail, i_fail_mc, '"B"'), (s_essay_fail, i_fail_essay, '"Too short."'),
    (s_essay_norule, i_norule_mc, '"A"'), (s_essay_norule, i_norule_essay, '"A long answer. With two sentences."'),
    (s_missing, i_missing_keyed, '"Mars"'), (s_missing, i_missing_unkeyed, '"A"'),
    (s_error, i_error, '"Mars"'),
    (s_other_student, i_mc, '"A"'), (s_other_ws, i_other, '"Mars"');
  INSERT INTO public.task_assignees (task_id, student_id, section_id, due_at, assigned_by) VALUES
    (w_auto, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_late, v_student, v_section, '2000-01-01 00:00', v_teacher),
    (w_manual, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_essay_met, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_essay_fail, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_essay_norule, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_missing, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_error, v_student, v_section, '2099-01-01 00:00', v_teacher),
    (w_auto, v_student2, v_section, '2099-01-01 00:00', v_teacher),
    (w_other, v_student, v_section, '2099-01-01 00:00', v_teacher);

  -- Case 6 setup: a forced failure inside the scorer for s_error only (its marks
  -- upsert). Created in this transaction, so it is rolled back with everything else.
  EXECUTE $ddl$CREATE FUNCTION public.eduscribe_selftest_force_error_tmp() RETURNS trigger
    LANGUAGE plpgsql AS $body$ BEGIN RAISE EXCEPTION 'selftest_forced_scorer_error'; END $body$
  $ddl$;
  EXECUTE pg_catalog.format($ddl$CREATE TRIGGER eduscribe_selftest_force_error_tmp
    BEFORE INSERT OR UPDATE ON public.worksheet_answers FOR EACH ROW
    WHEN (NEW.submission_id = %L::uuid)
    EXECUTE FUNCTION public.eduscribe_selftest_force_error_tmp()$ddl$, s_error);

  SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.id) INTO v_untouched_before
    FROM public.worksheet_submissions s WHERE s.id IN (s_other_student, s_other_ws);

  -- The student submits each paper through the real path.
  FOREACH v_sub IN ARRAY ARRAY[s_auto, s_late, s_manual, s_essay_met, s_essay_fail,
      s_essay_norule, s_missing, s_error] LOOP
    BEGIN
      PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
      PERFORM pg_catalog.set_config('request.jwt.claims',
        pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      UPDATE public.worksheet_submissions SET status = 'submitted' WHERE id = v_sub;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      EXECUTE 'RESET ROLE';
      IF v_n <> 1 THEN
        v_submit_errors := v_submit_errors || pg_catalog.jsonb_build_object(v_sub::text, 'no row updated');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      v_submit_errors := v_submit_errors || pg_catalog.jsonb_build_object(v_sub::text, SQLERRM);
    END;
  END LOOP;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  v_ok := v_submit_errors = '{}'::jsonb;
  v_report := v_report || ' every_submit_succeeded=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL ' || v_submit_errors::text END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 1: all objective, Auto. 2 + 1 + 1 + 1 (Red of Red/Blue) = 5 of 6, released at once.
  SELECT * INTO v_row FROM public.worksheet_submissions WHERE id = s_auto;
  v_ok := v_row.status = 'checked' AND v_row.released AND v_row.score = 5 AND v_row.total_points = 6
    AND v_row.checked_by = v_teacher AND v_row.checked_at IS NOT NULL AND v_row.submitted_at IS NOT NULL
    AND (SELECT pg_catalog.jsonb_object_agg(a.item_id::text, pg_catalog.jsonb_build_array(a.points_earned, a.is_correct))
      FROM public.worksheet_answers a WHERE a.submission_id = s_auto)
      = pg_catalog.jsonb_build_object(i_mc::text, '[2, true]'::jsonb, i_tf::text, '[1, true]'::jsonb,
          i_id::text, '[1, true]'::jsonb, i_en::text, '[1, false]'::jsonb)
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_auto);
  v_report := v_report || ' c1_objective_released=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 2: late, still released.
  SELECT * INTO v_row FROM public.worksheet_submissions WHERE id = s_late;
  v_ok := v_row.is_late AND v_row.status = 'checked' AND v_row.released AND v_row.score = 1 AND v_row.total_points = 1;
  v_report := v_report || ' c2_late_released=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 3: manual, untouched by the scorer.
  SELECT * INTO v_row FROM public.worksheet_submissions WHERE id = s_manual;
  v_ok := v_row.status = 'submitted' AND NOT v_row.released AND v_row.score IS NULL AND v_row.checked_by IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_answers a WHERE a.submission_id = s_manual
      AND (a.points_earned IS NOT NULL OR a.is_correct IS NOT NULL))
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_manual);
  v_report := v_report || ' c3_manual_untouched=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 4: essays. Never released; provisional marks only.
  v_ok := (SELECT pg_catalog.bool_and(s.status = 'submitted' AND NOT s.released AND s.score IS NULL AND s.checked_by IS NULL)
      FROM public.worksheet_submissions s WHERE s.id IN (s_essay_met, s_essay_fail, s_essay_norule))
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_answers a
      WHERE a.submission_id IN (s_essay_met, s_essay_fail, s_essay_norule)
        AND (a.points_earned IS NOT NULL OR a.is_correct IS NOT NULL));
  v_report := v_report || ' c4_essay_not_released=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := (SELECT pg_catalog.jsonb_object_agg(m.item_id::text, pg_catalog.jsonb_build_array(m.points, m.is_correct))
      FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_essay_met)
    = pg_catalog.jsonb_build_object(i_met_mc::text, '[2, true]'::jsonb, i_met_essay::text, '[5, true]'::jsonb);
  v_report := v_report || ' c4_rule_met_full_points=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := (SELECT pg_catalog.jsonb_object_agg(m.item_id::text, pg_catalog.jsonb_build_array(m.points, m.is_correct))
      FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_essay_fail)
    = pg_catalog.jsonb_build_object(i_fail_mc::text, '[0, false]'::jsonb, i_fail_essay::text, '[0, false]'::jsonb);
  v_report := v_report || ' c4_rule_not_met_zero=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_ok := (SELECT pg_catalog.jsonb_object_agg(m.item_id::text, pg_catalog.jsonb_build_array(m.points, m.is_correct))
      FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_essay_norule)
    = pg_catalog.jsonb_build_object(i_norule_mc::text, '[2, true]'::jsonb);
  v_report := v_report || ' c4_no_rule_no_essay_mark=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- What the student and the teacher can read.
  v_n := -1;
  v_m := -1;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT pg_catalog.count(*) INTO v_n FROM public.worksheet_provisional_marks;
    SELECT pg_catalog.count(*) INTO v_m FROM public.worksheet_answers a
      WHERE a.submission_id IN (s_essay_met, s_essay_fail, s_essay_norule)
        AND (a.points_earned IS NOT NULL OR a.is_correct IS NOT NULL);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_n := -2;
  END;
  v_ok := v_n = 0 AND v_m = 0;
  v_report := v_report || ' c4_student_sees_no_marks=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  v_n := -1;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_teacher::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_teacher::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT pg_catalog.count(*) INTO v_n FROM public.worksheet_provisional_marks
      WHERE submission_id IN (s_essay_met, s_essay_fail, s_essay_norule);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_n := -2;
  END;
  v_ok := v_n = 5;
  v_report := v_report || ' c4_teacher_sees_marks=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  -- Case 5: one item without a key row -> nothing at all.
  SELECT * INTO v_row FROM public.worksheet_submissions WHERE id = s_missing;
  v_ok := v_row.status = 'submitted' AND NOT v_row.released AND v_row.score IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_missing)
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_answers a WHERE a.submission_id = s_missing AND a.points_earned IS NOT NULL);
  v_report := v_report || ' c5_missing_key_waits=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 6: the scorer failed, the submit did not.
  SELECT * INTO v_row FROM public.worksheet_submissions WHERE id = s_error;
  v_ok := NOT (v_submit_errors ? s_error::text) AND v_row.status = 'submitted' AND v_row.submitted_at IS NOT NULL
    AND NOT v_row.released AND v_row.score IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_answers a WHERE a.submission_id = s_error AND a.points_earned IS NOT NULL);
  v_report := v_report || ' c6_scorer_error_submit_kept=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  EXECUTE 'DROP TRIGGER eduscribe_selftest_force_error_tmp ON public.worksheet_answers';
  EXECUTE 'DROP FUNCTION public.eduscribe_selftest_force_error_tmp()';

  -- Case 7: running the scorer again (as postgres) changes nothing.
  SELECT pg_catalog.jsonb_build_object(
    'subs', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.id) FROM public.worksheet_submissions s
      WHERE s.id IN (s_auto, s_late, s_manual, s_essay_met, s_essay_fail, s_essay_norule, s_missing)),
    'answers', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.submission_id, a.item_id) FROM public.worksheet_answers a
      WHERE a.submission_id IN (s_auto, s_late, s_manual, s_essay_met, s_essay_fail, s_essay_norule, s_missing)),
    'provisional', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.submission_id, m.item_id)
      FROM public.worksheet_provisional_marks m)) INTO v_snapshot_before;
  FOREACH v_sub IN ARRAY ARRAY[s_auto, s_late, s_manual, s_essay_met, s_essay_fail, s_essay_norule, s_missing] LOOP
    PERFORM public.eduscribe_auto_score_submission_v1(v_sub);
  END LOOP;
  SELECT pg_catalog.jsonb_build_object(
    'subs', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.id) FROM public.worksheet_submissions s
      WHERE s.id IN (s_auto, s_late, s_manual, s_essay_met, s_essay_fail, s_essay_norule, s_missing)),
    'answers', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.submission_id, a.item_id) FROM public.worksheet_answers a
      WHERE a.submission_id IN (s_auto, s_late, s_manual, s_essay_met, s_essay_fail, s_essay_norule, s_missing)),
    'provisional', (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.submission_id, m.item_id)
      FROM public.worksheet_provisional_marks m)) INTO v_snapshot_after;
  v_ok := v_snapshot_before = v_snapshot_after;
  v_report := v_report || ' c7_idempotent=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 8: security, all as the student through the real role.
  -- 8a. Scoring fields are still refused by the guard.
  v_error := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.worksheet_submissions SET score = 1, total_points = 1, released = true WHERE id = s_manual;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_error := SQLERRM;
  END;
  v_ok := v_error IS NOT NULL;
  v_report := v_report || ' c8_student_score_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- 8b. Setting the flag by hand does not open the guard: the write is not inside a
  -- trigger. remarks and submitted -> in_progress are allowed by RLS but refused by
  -- the guard, so these prove the depth rule itself.
  v_error := NULL;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_catalog.set_config('eduscribe.auto_score', 'on', true);
    UPDATE public.worksheet_submissions SET remarks = 'self-graded' WHERE id = s_manual;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_error := SQLERRM;
  END;
  v_ok := v_error IS NOT NULL;
  v_error := NULL;
  BEGIN
    -- A failed block also undoes its set_config calls, so the claims are set again.
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', v_student::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_catalog.set_config('eduscribe.auto_score', 'on', true);
    UPDATE public.worksheet_submissions SET status = 'in_progress' WHERE id = s_manual;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_error := SQLERRM;
  END;
  v_ok := v_ok AND v_error IS NOT NULL
    AND (SELECT s.status = 'submitted' AND s.remarks IS NULL FROM public.worksheet_submissions s WHERE s.id = s_manual);
  PERFORM pg_catalog.set_config('eduscribe.auto_score', 'off', true);
  v_report := v_report || ' c8_flag_alone_refused=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- 8c. The student cannot call the scorer.
  v_error := NULL;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.eduscribe_auto_score_submission_v1(s_manual);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN insufficient_privilege THEN
    EXECUTE 'RESET ROLE';
    v_error := 'denied';
  WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_error := 'other: ' || SQLERRM;
  END;
  v_ok := v_error = 'denied';
  v_report := v_report || ' c8_student_cannot_call_scorer=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- 8d. The student cannot write provisional marks.
  v_error := NULL;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.worksheet_provisional_marks (submission_id, item_id, points) VALUES (s_manual, i_manual, 1);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    v_error := SQLERRM;
  END;
  v_ok := v_error IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_provisional_marks m WHERE m.submission_id = s_manual);
  v_report := v_report || ' c8_student_cannot_write_marks=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  -- Case 9: the shared vectors through the SQL scorer.
-- BEGIN GENERATED VECTORS
  v_vectors := $vectors$[
{"id":"mc_exact","kind":"item","item_type":"multiple_choice","points":1,"key":"Mars","answer":"Mars","expected":{"points":1,"correct":true}},
{"id":"mc_case_and_spaces","kind":"item","item_type":"multiple_choice","points":1,"key":"Mars","answer":"  mars ","expected":{"points":1,"correct":true}},
{"id":"mc_wrong","kind":"item","item_type":"multiple_choice","points":1,"key":"Mars","answer":"Venus","expected":{"points":0,"correct":false}},
{"id":"mc_blank","kind":"item","item_type":"multiple_choice","points":1,"key":"Mars","answer":"","expected":{"points":0,"correct":false}},
{"id":"mc_no_answer","kind":"item","item_type":"multiple_choice","points":1,"key":"Mars","answer":null,"expected":{"points":0,"correct":false}},
{"id":"mc_keeps_punctuation","kind":"item","item_type":"multiple_choice","points":1,"key":"Mr. Cruz","answer":"Mr Cruz","expected":{"points":0,"correct":false}},
{"id":"mc_fractional_points","kind":"item","item_type":"multiple_choice","points":2.5,"key":"A","answer":"A","expected":{"points":2.5,"correct":true}},
{"id":"tf_true","kind":"item","item_type":"true_false","points":1,"key":"True","answer":"True","expected":{"points":1,"correct":true}},
{"id":"tf_lowercase","kind":"item","item_type":"true_false","points":1,"key":"False","answer":"false","expected":{"points":1,"correct":true}},
{"id":"tf_wrong","kind":"item","item_type":"true_false","points":1,"key":"True","answer":"False","expected":{"points":0,"correct":false}},
{"id":"id_exact","kind":"item","item_type":"identification","points":1,"key":["Photosynthesis"],"answer":"Photosynthesis","expected":{"points":1,"correct":true}},
{"id":"id_alternative","kind":"item","item_type":"identification","points":1,"key":["Jose Rizal","Rizal"],"answer":"rizal","expected":{"points":1,"correct":true}},
{"id":"id_trailing_period","kind":"item","item_type":"identification","points":1,"key":["Photosynthesis"],"answer":"Photosynthesis.","expected":{"points":1,"correct":true}},
{"id":"id_missing_period","kind":"item","item_type":"identification","points":1,"key":["Character vs. Character"],"answer":"Character vs Character","expected":{"points":1,"correct":true}},
{"id":"id_apostrophe","kind":"item","item_type":"identification","points":1,"key":["Newton's law"],"answer":"Newtons law","expected":{"points":1,"correct":true}},
{"id":"id_hyphen","kind":"item","item_type":"identification","points":1,"key":["well-known"],"answer":"well known","expected":{"points":1,"correct":true}},
{"id":"id_en_dash","kind":"item","item_type":"identification","points":1,"key":["north-east"],"answer":"north–east","expected":{"points":1,"correct":true}},
{"id":"id_quotes","kind":"item","item_type":"identification","points":1,"key":["\"Noli Me Tangere\""],"answer":"Noli Me Tangere","expected":{"points":1,"correct":true}},
{"id":"id_curly_marks","kind":"item","item_type":"identification","points":1,"key":["“Mother’s day”"],"answer":"mothers day","expected":{"points":1,"correct":true}},
{"id":"id_initials","kind":"item","item_type":"identification","points":1,"key":["U.S.A."],"answer":"USA","expected":{"points":1,"correct":true}},
{"id":"id_wrong_word","kind":"item","item_type":"identification","points":1,"key":["Character vs. Character"],"answer":"Character vs Society","expected":{"points":0,"correct":false}},
{"id":"id_word_order","kind":"item","item_type":"identification","points":1,"key":["Character vs. Society"],"answer":"Society vs Character","expected":{"points":0,"correct":false}},
{"id":"id_digit","kind":"item","item_type":"identification","points":1,"key":["World War 2"],"answer":"World War 3","expected":{"points":0,"correct":false}},
{"id":"id_blank","kind":"item","item_type":"identification","points":1,"key":["Rizal"],"answer":"   ","expected":{"points":0,"correct":false}},
{"id":"id_punctuation_only","kind":"item","item_type":"identification","points":1,"key":["Rizal"],"answer":"...","expected":{"points":0,"correct":false}},
{"id":"id_string_key","kind":"item","item_type":"identification","points":1,"key":"Mitochondria","answer":"mitochondria","expected":{"points":1,"correct":true}},
{"id":"id_enye_upper","kind":"item","item_type":"identification","points":1,"key":["Niño"],"answer":"NIÑO","expected":{"points":1,"correct":true}},
{"id":"id_enye_needed","kind":"item","item_type":"identification","points":1,"key":["niño"],"answer":"nino","expected":{"points":0,"correct":false}},
{"id":"id_accent","kind":"item","item_type":"identification","points":1,"key":["Pagsúlat"],"answer":"pagsúlat","expected":{"points":1,"correct":true}},
{"id":"id_three_points","kind":"item","item_type":"identification","points":3,"key":["Mars"],"answer":"Mars","expected":{"points":3,"correct":true}},
{"id":"en_lines_full","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["Character vs. Character","Character vs. Society"],"expected":{"points":2,"correct":true}},
{"id":"en_one_line_comma","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["Character vs. Character, Character vs. Society"],"expected":{"points":2,"correct":true}},
{"id":"en_no_periods","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["Character vs Character","Character vs Society"],"expected":{"points":2,"correct":true}},
{"id":"en_partial","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["Character vs Character","Character vs Nature"],"expected":{"points":1,"correct":false}},
{"id":"en_duplicate_counts_once","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["Character vs. Character, Character vs. Character"],"expected":{"points":1,"correct":false}},
{"id":"en_semicolon","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["Character vs. Character; Character vs. Society"],"expected":{"points":2,"correct":true}},
{"id":"en_empty_pieces","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":[", Character vs. Character,, ;Character vs. Society,"],"expected":{"points":2,"correct":true}},
{"id":"en_case_and_spaces","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character","Character vs. Society"],"answer":["  character   VS. character ,CHARACTER vs.   society  "],"expected":{"points":2,"correct":true}},
{"id":"en_key_with_comma_whole","kind":"item","item_type":"enumeration","points":2,"key":["Paris, France","Rome, Italy"],"answer":["Paris, France","Rome, Italy"],"expected":{"points":2,"correct":true}},
{"id":"en_key_with_comma_no_comma","kind":"item","item_type":"enumeration","points":2,"key":["Paris, France","Rome, Italy"],"answer":["Paris France"],"expected":{"points":1,"correct":false}},
{"id":"en_letters_split","kind":"item","item_type":"enumeration","points":2,"key":["A","B"],"answer":["A, B"],"expected":{"points":2,"correct":true}},
{"id":"en_extra_wrong_piece","kind":"item","item_type":"enumeration","points":3,"key":["Executive","Legislative","Judicial"],"answer":["Executive","Judicial","Barangay"],"expected":{"points":2,"correct":false}},
{"id":"en_one_third","kind":"item","item_type":"enumeration","points":1,"key":["Executive","Legislative","Judicial"],"answer":["Executive"],"expected":{"points":0.33,"correct":false}},
{"id":"en_two_thirds","kind":"item","item_type":"enumeration","points":1,"key":["Executive","Legislative","Judicial"],"answer":["Executive","Judicial"],"expected":{"points":0.67,"correct":false}},
{"id":"en_float_half_edge","kind":"item","item_type":"enumeration","points":1.15,"key":["A","B"],"answer":["A"],"expected":{"points":0.57,"correct":false}},
{"id":"en_empty_key","kind":"item","item_type":"enumeration","points":2,"key":[],"answer":["A"],"expected":{"points":0,"correct":false}},
{"id":"en_no_answer","kind":"item","item_type":"enumeration","points":2,"key":["A","B"],"answer":[],"expected":{"points":0,"correct":false}},
{"id":"en_string_answer","kind":"item","item_type":"enumeration","points":2,"key":["A","B"],"answer":"A; B","expected":{"points":2,"correct":true}},
{"id":"en_mixed_line","kind":"item","item_type":"enumeration","points":2,"key":["Character vs. Character"],"answer":["Character vs. Character, nonsense"],"expected":{"points":2,"correct":true}},
{"id":"en_filipino","kind":"item","item_type":"enumeration","points":2,"key":["Niño","Señora"],"answer":["NIÑO, señora"],"expected":{"points":2,"correct":true}},
{"id":"essay_item_unscored","kind":"item","item_type":"essay","points":5,"key":null,"answer":"Because of gravity.","expected":{"points":null,"correct":null}},
{"id":"count_basic","kind":"essay_counts","text":"The quick brown fox.","words":4,"sentences":1},
{"id":"count_empty","kind":"essay_counts","text":"","words":0,"sentences":0},
{"id":"count_spaces_only","kind":"essay_counts","text":"   \n\t ","words":0,"sentences":0},
{"id":"count_decimal","kind":"essay_counts","text":"Pi is 3.14 today. It rains.","words":6,"sentences":2},
{"id":"count_ellipsis","kind":"essay_counts","text":"Wait… what happened? Nothing!","words":4,"sentences":3},
{"id":"count_trailing_without_period","kind":"essay_counts","text":"First one. Second one","words":4,"sentences":2},
{"id":"count_punctuation_tokens","kind":"essay_counts","text":"Hello , world - ok","words":3,"sentences":1},
{"id":"count_repeated_terminators","kind":"essay_counts","text":"Really?! Yes!!! Done.","words":3,"sentences":3},
{"id":"count_dots_without_space","kind":"essay_counts","text":"Hello...world","words":1,"sentences":1},
{"id":"count_filipino","kind":"essay_counts","text":"Ang batang si Niño ay masipag. Siya ay nag-aaral.","words":9,"sentences":2},
{"id":"count_numbers_only","kind":"essay_counts","text":"1 2 3","words":3,"sentences":1},
{"id":"count_newlines","kind":"essay_counts","text":"One.\nTwo.\nThree","words":3,"sentences":3},
{"id":"count_abbreviation","kind":"essay_counts","text":"Dr. Cruz came.","words":3,"sentences":2},
{"id":"count_symbols_only","kind":"essay_counts","text":"... !!! ???","words":0,"sentences":0}
]$vectors$::jsonb;
-- END GENERATED VECTORS
  FOR v_vec IN SELECT value FROM pg_catalog.jsonb_array_elements(v_vectors) LOOP
    IF v_vec->>'kind' = 'item' THEN
      SELECT * INTO v_res FROM public.eduscribe_score_item_v1(v_vec->>'item_type', (v_vec->>'points')::numeric,
        v_vec->'key', v_vec->'answer');
      IF v_res.points_earned IS DISTINCT FROM (v_vec->'expected'->>'points')::numeric
          OR v_res.is_correct IS DISTINCT FROM (v_vec->'expected'->>'correct')::boolean THEN
        v_bad := v_bad || ' ' || (v_vec->>'id') || '(' || COALESCE(v_res.points_earned::text, 'null') || ','
          || COALESCE(v_res.is_correct::text, 'null') || ')';
      END IF;
    ELSE
      IF public.eduscribe_essay_word_count_v1(v_vec->>'text') <> (v_vec->>'words')::integer
          OR public.eduscribe_essay_sentence_count_v1(v_vec->>'text') <> (v_vec->>'sentences')::integer THEN
        v_bad := v_bad || ' ' || (v_vec->>'id') || '(' || public.eduscribe_essay_word_count_v1(v_vec->>'text') || ','
          || public.eduscribe_essay_sentence_count_v1(v_vec->>'text') || ')';
      END IF;
    END IF;
  END LOOP;
  v_ok := v_bad = '' AND pg_catalog.jsonb_array_length(v_vectors) >= 40;
  v_report := v_report || ' c9_vectors_' || pg_catalog.jsonb_array_length(v_vectors) || '='
    || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' || v_bad END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 10: another student's paper and another worksheet were left alone.
  SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.id) INTO v_untouched_after
    FROM public.worksheet_submissions s WHERE s.id IN (s_other_student, s_other_ws);
  v_ok := v_untouched_before = v_untouched_after
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_answers a
      WHERE a.submission_id IN (s_other_student, s_other_ws) AND a.points_earned IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.worksheet_provisional_marks m WHERE m.submission_id IN (s_other_student, s_other_ws));
  v_report := v_report || ' c10_others_untouched=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  -- Case 11: nothing persists.
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
    'provisional', (SELECT pg_catalog.count(*) FROM public.worksheet_provisional_marks),
    'assignees', (SELECT pg_catalog.count(*) FROM public.task_assignees),
    'notifications', (SELECT pg_catalog.count(*) FROM public.notifications)) INTO v_after;
  v_ok := v_before = v_after;
  v_report := v_report || ' c11_rollback_counts=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END $$;
ROLLBACK;
