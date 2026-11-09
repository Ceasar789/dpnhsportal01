-- Synthetic, rolled-back checks for eduscribe_attendance_save_v1 and the
-- attendance_daily_unique index. Run only after applying attendance-save.sql,
-- as postgres. Synthetic users, profiles, students, sections, enrolments,
-- schedules and attendance rows are made inside this transaction. Every call
-- runs as the authenticated role with simulated JWT claims, inside a block that
-- is rolled back before the next case. The final error reports SELFTEST
-- PASSED_ROLLED_BACK or FAILED_ROLLED_BACK. Nothing persists on any path.
BEGIN;
DO $selftest$
DECLARE
  v_adviser uuid := pg_catalog.gen_random_uuid();
  v_subject_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_inactive_teacher uuid := pg_catalog.gen_random_uuid();
  v_student_a uuid := pg_catalog.gen_random_uuid();
  v_student_b uuid := pg_catalog.gen_random_uuid();
  v_student_c uuid := pg_catalog.gen_random_uuid();
  v_student_dropped uuid := pg_catalog.gen_random_uuid();
  v_student_foreign uuid := pg_catalog.gen_random_uuid();
  v_student_unenrolled uuid := pg_catalog.gen_random_uuid();
  v_main uuid := pg_catalog.gen_random_uuid();
  v_other uuid := pg_catalog.gen_random_uuid();
  v_past uuid := pg_catalog.gen_random_uuid();
  v_inactive_section uuid := pg_catalog.gen_random_uuid();
  v_signature regprocedure := 'public.eduscribe_attendance_save_v1(uuid,date,jsonb)'::regprocedure;
  v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Manila')::date;
  v_day date := (pg_catalog.now() AT TIME ZONE 'Asia/Manila')::date - 1;
  v_year text;
  v_case text;
  v_actor uuid;
  v_section uuid;
  v_date date;
  v_marks jsonb;
  v_expected text;
  v_receipt jsonb;
  v_error text;
  v_constraint text;
  v_snap_before jsonb;
  v_snap_after jsonb;
  v_snap_step jsonb;
  v_before_counts jsonb;
  v_after_counts jsonb;
  v_many uuid[];
  v_seen integer;
  v_other_rows integer;
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
    'schedules', (SELECT pg_catalog.count(*) FROM public.schedules),
    'attendance', (SELECT pg_catalog.count(*) FROM public.attendance)) INTO v_before_counts;

  SELECT s.school_year INTO v_year FROM public.school_settings s WHERE s.id = 1;

  -- Fixtures, written as postgres before any claim is set.
  INSERT INTO auth.users (id, instance_id, email, aud, role,
    encrypted_password, email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
    'attendance-save-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_adviser, v_subject_teacher, v_other_teacher, v_inactive_teacher,
    v_student_a, v_student_b, v_student_c, v_student_dropped, v_student_foreign,
    v_student_unenrolled]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'attendance-save-' || u.id::text || '@example.invalid',
    'Synthetic attendance user', u.role, u.status
  FROM (VALUES (v_adviser, 'teacher', 'active'), (v_subject_teacher, 'teacher', 'active'),
    (v_other_teacher, 'teacher', 'active'), (v_inactive_teacher, 'teacher', 'inactive'),
    (v_student_a, 'student', 'active'), (v_student_b, 'student', 'active'),
    (v_student_c, 'student', 'active'), (v_student_dropped, 'student', 'active'),
    (v_student_foreign, 'student', 'active'), (v_student_unenrolled, 'student', 'active'))
    AS u(id, role, status)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id)
  SELECT u.id FROM pg_catalog.unnest(ARRAY[v_student_a, v_student_b, v_student_c,
    v_student_dropped, v_student_foreign, v_student_unenrolled]) AS u(id);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id) VALUES
    (v_main, 'Attendance main ' || v_main::text, '7', v_year, v_adviser),
    (v_other, 'Attendance other ' || v_other::text, '7', v_year, v_other_teacher),
    (v_past, 'Attendance past ' || v_past::text, '7', '1999-2000', v_adviser),
    (v_inactive_section, 'Attendance inactive ' || v_inactive_section::text, '7', v_year, v_inactive_teacher);
  INSERT INTO public.schedules (section_id, teacher_id, subject, day_of_week, start_time, end_time)
    VALUES (v_main, v_subject_teacher, 'Filipino', 'Monday', '08:00', '09:00');
  INSERT INTO public.section_students (section_id, student_id, status) VALUES
    (v_main, v_student_a, 'active'), (v_main, v_student_b, 'active'),
    (v_main, v_student_c, 'active'), (v_main, v_student_dropped, 'dropped'),
    (v_other, v_student_foreign, 'active'), (v_past, v_student_a, 'active'),
    (v_inactive_section, v_student_a, 'active');
  -- A subject row for student A on the test day: the function must never touch it.
  INSERT INTO public.attendance (student_id, section_id, date, subject, status, recorded_by)
    VALUES (v_student_a, v_main, v_day, 'Math', 'Absent', v_subject_teacher);

  -- Case 7: the definition the security model depends on.
  v_ok := (SELECT p.prosecdef FROM pg_catalog.pg_proc p WHERE p.oid = v_signature::oid)
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
    AND NOT pg_catalog.has_function_privilege('service_role', v_signature::oid, 'EXECUTE')
    AND v_year IS NOT NULL AND v_year <> '1999-2000';
  v_report := v_report || ' c7_definer_owner_path_grants=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Cases 3 and 4: every refusal gives its code and writes nothing.
  FOREACH v_case IN ARRAY ARRAY[
    'c3_subject_only_teacher', 'c3_other_teacher', 'c3_student_caller', 'c3_inactive_teacher',
    'c3_unauthenticated', 'c3_unknown_section', 'c3_past_year_section', 'c3_future_date',
    'c3_dropped_student', 'c3_foreign_student', 'c3_unenrolled_student', 'c3_duplicate_student',
    'c3_invalid_status', 'c3_wrong_case_status', 'c3_missing_status', 'c3_remark_501',
    'c3_remark_not_text', 'c3_201_entries', 'c3_not_array', 'c3_null_marks', 'c3_null_section',
    'c3_null_date', 'c3_garbage_student_id', 'c3_entry_not_object',
    'c4_last_entry_invalid_status', 'c4_last_entry_invalid_student'] LOOP
    v_ok := false;
    v_error := NULL;
    v_receipt := NULL;
    v_actor := v_adviser;
    v_section := v_main;
    v_date := v_day;
    v_marks := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present'));
    v_expected := 'invalid_marks';

    CASE v_case
      WHEN 'c3_subject_only_teacher' THEN v_actor := v_subject_teacher; v_expected := 'not_found';
      WHEN 'c3_other_teacher' THEN v_actor := v_other_teacher; v_expected := 'not_found';
      WHEN 'c3_student_caller' THEN v_actor := v_student_a; v_expected := 'inactive_teacher';
      WHEN 'c3_inactive_teacher' THEN
        v_actor := v_inactive_teacher; v_section := v_inactive_section; v_expected := 'inactive_teacher';
      WHEN 'c3_unauthenticated' THEN v_actor := NULL; v_expected := 'not_authenticated';
      WHEN 'c3_unknown_section' THEN v_section := pg_catalog.gen_random_uuid(); v_expected := 'not_found';
      WHEN 'c3_past_year_section' THEN v_section := v_past; v_expected := 'not_found';
      WHEN 'c3_future_date' THEN v_date := v_today + 1; v_expected := 'future_date';
      WHEN 'c3_dropped_student' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_dropped, 'status', 'Present'));
        v_expected := 'invalid_students';
      WHEN 'c3_foreign_student' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_foreign, 'status', 'Present'));
        v_expected := 'invalid_students';
      WHEN 'c3_unenrolled_student' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_unenrolled, 'status', 'Present'));
        v_expected := 'invalid_students';
      WHEN 'c3_duplicate_student' THEN
        v_marks := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present'),
          pg_catalog.jsonb_build_object('student_id', pg_catalog.upper(v_student_a::text), 'status', 'Absent'));
      WHEN 'c3_invalid_status' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Sick'));
      WHEN 'c3_wrong_case_status' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'present'));
      WHEN 'c3_missing_status' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_a));
      WHEN 'c3_remark_501' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_a,
          'status', 'Present', 'remark', pg_catalog.repeat('x', 501)));
      WHEN 'c3_remark_not_text' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', v_student_a,
          'status', 'Present', 'remark', 5));
      WHEN 'c3_201_entries' THEN
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('student_id', pg_catalog.gen_random_uuid(), 'status', 'Present'))
          INTO v_marks FROM pg_catalog.generate_series(1, 201);
      WHEN 'c3_not_array' THEN v_marks := pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present');
      WHEN 'c3_null_marks' THEN v_marks := NULL;
      WHEN 'c3_null_section' THEN v_section := NULL;
      WHEN 'c3_null_date' THEN v_date := NULL; v_expected := 'invalid_date';
      WHEN 'c3_garbage_student_id' THEN
        v_marks := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('student_id', 'not-a-uuid', 'status', 'Present'));
      WHEN 'c3_entry_not_object' THEN v_marks := '["just text"]'::jsonb;
      WHEN 'c4_last_entry_invalid_status' THEN
        v_marks := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present'),
          pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Absent'),
          pg_catalog.jsonb_build_object('student_id', v_student_c, 'status', 'Sick'));
      WHEN 'c4_last_entry_invalid_student' THEN
        v_marks := pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present'),
          pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Absent'),
          pg_catalog.jsonb_build_object('student_id', v_student_dropped, 'status', 'Late'));
        v_expected := 'invalid_students';
      ELSE NULL;
    END CASE;

    BEGIN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
          ORDER BY a.id), '[]'::jsonb) INTO v_snap_before
        FROM public.attendance a WHERE a.section_id IN (v_main, v_other, v_past, v_inactive_section);
      BEGIN
        PERFORM pg_catalog.set_config('request.jwt.claim.sub', COALESCE(v_actor::text, ''), true);
        PERFORM pg_catalog.set_config('request.jwt.claims',
          CASE WHEN v_actor IS NULL THEN '{}' ELSE
            pg_catalog.jsonb_build_object('sub', v_actor::text)::text END, true);
        EXECUTE 'SET LOCAL ROLE authenticated';
        v_receipt := public.eduscribe_attendance_save_v1(v_section, v_date, v_marks);
        EXECUTE 'RESET ROLE';
      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        EXECUTE 'RESET ROLE';
      END;
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
          ORDER BY a.id), '[]'::jsonb) INTO v_snap_after
        FROM public.attendance a WHERE a.section_id IN (v_main, v_other, v_past, v_inactive_section);
      v_ok := v_receipt IS NULL AND v_error = v_expected AND v_snap_before = v_snap_after;
      RAISE EXCEPTION 'rollback_case';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
      EXECUTE 'RESET ROLE';
    END;
    v_report := v_report || ' ' || v_case || '=' || CASE WHEN v_ok IS TRUE THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  -- Case 1: save, repeat (no change), replace, omit, clear.
  v_ok := false;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_adviser::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_adviser::text)::text, true);
    v_marks := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present', 'remark', 'On time'),
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Absent'),
      pg_catalog.jsonb_build_object('student_id', v_student_c, 'status', 'Late', 'remark', NULL));

    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, v_marks);
    EXECUTE 'RESET ROLE';
    v_ok := v_receipt = pg_catalog.jsonb_build_object('ok', true, 'sectionId', v_main, 'date', v_day, 'saved', 3, 'cleared', 0)
      AND (SELECT a.status = 'Present' AND a.remarks = 'On time' AND a.recorded_by = v_adviser
        FROM public.attendance a WHERE a.student_id = v_student_a AND a.section_id = v_main
          AND a.date = v_day AND a.subject IS NULL)
      AND (SELECT a.status = 'Absent' AND a.remarks IS NULL AND a.recorded_by = v_adviser
        FROM public.attendance a WHERE a.student_id = v_student_b AND a.section_id = v_main
          AND a.date = v_day AND a.subject IS NULL)
      AND (SELECT a.status FROM public.attendance a WHERE a.student_id = v_student_c
        AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL) = 'Late';
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
        ORDER BY a.id), '[]'::jsonb) INTO v_snap_step
      FROM public.attendance a WHERE a.section_id = v_main;

    -- The same payload again rewrites no row (same ctid) and reports nothing saved.
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, v_marks);
    EXECUTE 'RESET ROLE';
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
        ORDER BY a.id), '[]'::jsonb) INTO v_snap_after
      FROM public.attendance a WHERE a.section_id = v_main;
    v_ok := v_ok AND (v_receipt->>'saved')::integer = 0 AND (v_receipt->>'cleared')::integer = 0
      AND v_snap_step = v_snap_after;

    -- New statuses replace (remark too); C is omitted and stays exactly as it was.
    SELECT pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a)) INTO v_snap_step
      FROM public.attendance a WHERE a.student_id = v_student_c AND a.section_id = v_main
        AND a.date = v_day AND a.subject IS NULL;
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Excused'),
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Present')));
    EXECUTE 'RESET ROLE';
    v_ok := v_ok AND (v_receipt->>'saved')::integer = 2
      AND (SELECT a.status = 'Excused' AND a.remarks IS NULL FROM public.attendance a
        WHERE a.student_id = v_student_a AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL)
      AND (SELECT a.status FROM public.attendance a WHERE a.student_id = v_student_b
        AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL) = 'Present'
      AND (SELECT pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
        FROM public.attendance a WHERE a.student_id = v_student_c AND a.section_id = v_main
          AND a.date = v_day AND a.subject IS NULL) = v_snap_step;

    -- A null status clears only B's daily row.
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', NULL)));
    EXECUTE 'RESET ROLE';
    v_ok := v_ok AND (v_receipt->>'saved')::integer = 0 AND (v_receipt->>'cleared')::integer = 1
      AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.student_id = v_student_b
        AND a.section_id = v_main AND a.date = v_day)
      AND EXISTS (SELECT 1 FROM public.attendance a WHERE a.student_id = v_student_a
        AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL AND a.status = 'Excused')
      AND EXISTS (SELECT 1 FROM public.attendance a WHERE a.student_id = v_student_c
        AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL AND a.status = 'Late')
      AND (SELECT pg_catalog.count(*) FROM public.attendance a WHERE a.student_id = v_student_a
        AND a.section_id = v_main AND a.date = v_day AND a.subject = 'Math' AND a.status = 'Absent'
        AND a.recorded_by = v_subject_teacher) = 1;
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c1_save_repeat_replace_omit_clear=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 2: the subject row is never changed or deleted.
  v_ok := false;
  BEGIN
    SELECT pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a)) INTO v_snap_step
      FROM public.attendance a WHERE a.student_id = v_student_a AND a.section_id = v_main
        AND a.date = v_day AND a.subject = 'Math';
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_adviser::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_adviser::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', NULL)));
    EXECUTE 'RESET ROLE';
    v_ok := (v_receipt->>'cleared')::integer = 0;
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present')));
    EXECUTE 'RESET ROLE';
    v_ok := v_ok AND (v_receipt->>'saved')::integer = 1
      AND (SELECT pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
        FROM public.attendance a WHERE a.student_id = v_student_a AND a.section_id = v_main
          AND a.date = v_day AND a.subject = 'Math') = v_snap_step
      AND (SELECT pg_catalog.count(*) FROM public.attendance a WHERE a.student_id = v_student_a
        AND a.section_id = v_main AND a.date = v_day) = 2;
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c2_subject_row_untouched=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 5: two daily rows for one student, section and date cannot exist.
  v_ok := false;
  BEGIN
    INSERT INTO public.attendance (student_id, section_id, date, status)
      VALUES (v_student_c, v_main, v_day, 'Present');
    BEGIN
      INSERT INTO public.attendance (student_id, section_id, date, status)
        VALUES (v_student_c, v_main, v_day, 'Absent');
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      v_ok := v_constraint = 'attendance_daily_unique';
    END;
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
  END;
  v_report := v_report || ' c5_daily_unique_index=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 6: 200 entries are accepted (today's Manila date is allowed too).
  v_ok := false;
  BEGIN
    v_many := ARRAY(SELECT pg_catalog.gen_random_uuid() FROM pg_catalog.generate_series(1, 200));
    INSERT INTO auth.users (id, instance_id, email, aud, role,
      encrypted_password, email_confirmed_at, created_at, updated_at)
    SELECT u.id, '00000000-0000-0000-0000-000000000000'::uuid,
      'attendance-save-' || u.id::text || '@example.invalid',
      'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
    FROM pg_catalog.unnest(v_many) AS u(id);
    INSERT INTO public.profiles (id, email, name, role, status)
    SELECT u.id, 'attendance-save-' || u.id::text || '@example.invalid', 'Synthetic attendance user', 'student', 'active'
    FROM pg_catalog.unnest(v_many) AS u(id)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.students (id) SELECT u.id FROM pg_catalog.unnest(v_many) AS u(id);
    INSERT INTO public.section_students (section_id, student_id, status)
    SELECT v_main, u.id, 'active' FROM pg_catalog.unnest(v_many) AS u(id);
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('student_id', u.id, 'status', 'Present'))
      INTO v_marks FROM pg_catalog.unnest(v_many) AS u(id);
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_adviser::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_adviser::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_today, v_marks);
    EXECUTE 'RESET ROLE';
    v_ok := (v_receipt->>'saved')::integer = 200
      AND (SELECT pg_catalog.count(*) FROM public.attendance a WHERE a.section_id = v_main
        AND a.date = v_today AND a.subject IS NULL AND a.status = 'Present') = 200;
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c6_200_entries=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 8: a student still reads their own saved status, and no one else's.
  v_ok := false;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_adviser::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_adviser::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_a, 'status', 'Present'),
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Absent')));
    EXECUTE 'RESET ROLE';
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_student_a::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_student_a::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT pg_catalog.count(*) FILTER (WHERE a.subject IS NULL AND a.status = 'Present'),
        pg_catalog.count(*) FILTER (WHERE a.student_id <> v_student_a)
      INTO v_seen, v_other_rows
      FROM public.attendance a WHERE a.section_id = v_main AND a.date = v_day;
    EXECUTE 'RESET ROLE';
    v_ok := (v_receipt->>'saved')::integer = 2 AND v_seen = 1 AND v_other_rows = 0;
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c8_student_reads_own_only=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  RAISE EXCEPTION 'selftest_forced_rollback';
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'RESET ROLE';
  SELECT pg_catalog.jsonb_build_object(
    'users', (SELECT pg_catalog.count(*) FROM auth.users),
    'profiles', (SELECT pg_catalog.count(*) FROM public.profiles),
    'students', (SELECT pg_catalog.count(*) FROM public.students),
    'sections', (SELECT pg_catalog.count(*) FROM public.sections),
    'members', (SELECT pg_catalog.count(*) FROM public.section_students),
    'schedules', (SELECT pg_catalog.count(*) FROM public.schedules),
    'attendance', (SELECT pg_catalog.count(*) FROM public.attendance)) INTO v_after_counts;
  -- Case 9: nothing persisted.
  v_ok := v_before_counts = v_after_counts;
  v_report := v_report || ' c9_rollback_counts=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  RAISE EXCEPTION 'SELFTEST % failures=% report=% error=%',
    CASE WHEN v_failures = 0 AND SQLERRM = 'selftest_forced_rollback'
      THEN 'PASSED_ROLLED_BACK' ELSE 'FAILED_ROLLED_BACK' END,
    v_failures, v_report, SQLERRM;
END
$selftest$;
ROLLBACK;
