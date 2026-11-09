-- Synthetic, rolled-back checks for attendance-write-lockdown.sql. Run only
-- after applying it (and attendance-save.sql), as postgres. Synthetic users,
-- profiles, students, sections, enrolments, a schedule and attendance rows are
-- made inside this transaction. Every direct write or read runs as the
-- authenticated (or anon) role with simulated JWT claims, inside a block that is
-- rolled back before the next case; the table is compared as postgres
-- afterwards. The final error reports SELFTEST PASSED_ROLLED_BACK or
-- FAILED_ROLLED_BACK. Nothing persists on any path.
BEGIN;
DO $selftest$
DECLARE
  v_adviser uuid := pg_catalog.gen_random_uuid();
  v_subject_teacher uuid := pg_catalog.gen_random_uuid();
  v_other_teacher uuid := pg_catalog.gen_random_uuid();
  v_admin uuid := pg_catalog.gen_random_uuid();
  v_student_a uuid := pg_catalog.gen_random_uuid();
  v_student_b uuid := pg_catalog.gen_random_uuid();
  v_student_foreign uuid := pg_catalog.gen_random_uuid();
  v_main uuid := pg_catalog.gen_random_uuid();
  v_other uuid := pg_catalog.gen_random_uuid();
  v_day date := (pg_catalog.now() AT TIME ZONE 'Asia/Manila')::date - 1;
  v_year text;
  v_case text;
  v_op text;
  v_actor uuid;
  v_role text;
  v_rows bigint;
  v_rows_2 bigint;
  v_rows_3 bigint;
  v_state text;
  v_error text;
  v_receipt jsonb;
  v_snap_before jsonb;
  v_snap_after jsonb;
  v_main_seen bigint;
  v_other_seen bigint;
  v_not_own bigint;
  v_before_counts jsonb;
  v_after_counts jsonb;
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
    'attendance-lockdown-' || u.id::text || '@example.invalid',
    'authenticated', 'authenticated', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.unnest(ARRAY[v_adviser, v_subject_teacher, v_other_teacher, v_admin,
    v_student_a, v_student_b, v_student_foreign]) AS u(id);
  INSERT INTO public.profiles (id, email, name, role, status)
  SELECT u.id, 'attendance-lockdown-' || u.id::text || '@example.invalid',
    'Synthetic attendance user', u.role, u.status
  FROM (VALUES (v_adviser, 'teacher', 'active'), (v_subject_teacher, 'teacher', 'active'),
    (v_other_teacher, 'teacher', 'active'), (v_admin, 'admin', 'active'),
    (v_student_a, 'student', 'active'), (v_student_b, 'student', 'active'),
    (v_student_foreign, 'student', 'active')) AS u(id, role, status)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.students (id)
  SELECT u.id FROM pg_catalog.unnest(ARRAY[v_student_a, v_student_b, v_student_foreign]) AS u(id);
  INSERT INTO public.sections (id, name, grade_level, school_year, adviser_id) VALUES
    (v_main, 'Attendance lockdown main ' || v_main::text, '7', v_year, v_adviser),
    (v_other, 'Attendance lockdown other ' || v_other::text, '7', v_year, v_other_teacher);
  -- The subject teacher handles v_main through a schedule only (not its adviser).
  INSERT INTO public.schedules (section_id, teacher_id, subject, day_of_week, start_time, end_time)
    VALUES (v_main, v_subject_teacher, 'Filipino', 'Monday', '08:00', '09:00');
  INSERT INTO public.section_students (section_id, student_id, status) VALUES
    (v_main, v_student_a, 'active'), (v_main, v_student_b, 'active'),
    (v_other, v_student_foreign, 'active');
  -- v_main: A's daily row and A's Math row. v_other: the foreign student's daily row.
  INSERT INTO public.attendance (student_id, section_id, date, subject, status, recorded_by) VALUES
    (v_student_a, v_main, v_day, NULL, 'Present', v_adviser),
    (v_student_a, v_main, v_day, 'Math', 'Absent', v_subject_teacher),
    (v_student_foreign, v_other, v_day, NULL, 'Late', v_other_teacher);

  -- Cases 1-4 and 6 (writes): direct INSERT is refused, direct UPDATE and DELETE
  -- change nothing, and the table is unchanged when compared as postgres.
  FOREACH v_case IN ARRAY ARRAY['c1_adviser', 'c2_subject_teacher', 'c3_other_teacher',
    'c4_student', 'c6_anon'] LOOP
    v_actor := CASE v_case WHEN 'c1_adviser' THEN v_adviser
      WHEN 'c2_subject_teacher' THEN v_subject_teacher WHEN 'c3_other_teacher' THEN v_other_teacher
      WHEN 'c4_student' THEN v_student_a ELSE NULL END;
    v_role := CASE WHEN v_case = 'c6_anon' THEN 'anon' ELSE 'authenticated' END;
    FOREACH v_op IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
      v_ok := false;
      v_rows := NULL;
      v_state := NULL;
      v_error := NULL;
      BEGIN
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
            ORDER BY a.id), '[]'::jsonb) INTO v_snap_before
          FROM public.attendance a WHERE a.section_id IN (v_main, v_other);
        BEGIN
          PERFORM pg_catalog.set_config('request.jwt.claim.sub', COALESCE(v_actor::text, ''), true);
          PERFORM pg_catalog.set_config('request.jwt.claims',
            CASE WHEN v_actor IS NULL THEN '{}' ELSE
              pg_catalog.jsonb_build_object('sub', v_actor::text)::text END, true);
          EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_role);
          CASE v_op
            WHEN 'insert' THEN
              INSERT INTO public.attendance (student_id, section_id, date, status)
                VALUES (v_student_b, v_main, v_day, 'Present');
            WHEN 'update' THEN
              UPDATE public.attendance SET status = 'Excused' WHERE section_id = v_main;
            ELSE
              DELETE FROM public.attendance WHERE section_id = v_main;
          END CASE;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          EXECUTE 'RESET ROLE';
        EXCEPTION WHEN OTHERS THEN
          v_state := SQLSTATE;
          v_error := SQLERRM;
          EXECUTE 'RESET ROLE';
        END;
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
            ORDER BY a.id), '[]'::jsonb) INTO v_snap_after
          FROM public.attendance a WHERE a.section_id IN (v_main, v_other);
        v_ok := v_snap_before = v_snap_after AND pg_catalog.jsonb_array_length(v_snap_before) = 3
          AND CASE
            -- authenticated INSERT: refused by row-level security.
            WHEN v_op = 'insert' AND v_role = 'authenticated' THEN
              v_state = '42501' AND v_error LIKE '%row-level security%'
            -- authenticated UPDATE/DELETE: no visible write policy, so 0 rows.
            WHEN v_role = 'authenticated' THEN v_state IS NULL AND v_rows = 0
            -- anon INSERT: refused (privilege or RLS).
            WHEN v_op = 'insert' THEN v_state = '42501'
            -- anon UPDATE/DELETE: refused, or 0 rows.
            ELSE v_state = '42501' OR (v_state IS NULL AND v_rows = 0)
          END;
        RAISE EXCEPTION 'rollback_case';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
        EXECUTE 'RESET ROLE';
      END;
      v_report := v_report || ' ' || v_case || '_' || v_op || '=' || CASE WHEN v_ok IS TRUE THEN 'PASS' ELSE 'FAIL' END;
      IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
    END LOOP;
  END LOOP;

  -- Cases 1-4 (reads): teachers of a section keep SELECT; other teachers see
  -- nothing of it; a student sees only their own rows.
  FOREACH v_case IN ARRAY ARRAY['c1_adviser', 'c2_subject_teacher', 'c3_other_teacher', 'c4_student'] LOOP
    v_ok := false;
    v_actor := CASE v_case WHEN 'c1_adviser' THEN v_adviser
      WHEN 'c2_subject_teacher' THEN v_subject_teacher WHEN 'c3_other_teacher' THEN v_other_teacher
      ELSE v_student_a END;
    BEGIN
      PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_actor::text, true);
      PERFORM pg_catalog.set_config('request.jwt.claims',
        pg_catalog.jsonb_build_object('sub', v_actor::text)::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT pg_catalog.count(*) FILTER (WHERE a.section_id = v_main),
          pg_catalog.count(*) FILTER (WHERE a.section_id = v_other),
          pg_catalog.count(*) FILTER (WHERE a.student_id <> v_student_a)
        INTO v_main_seen, v_other_seen, v_not_own
        FROM public.attendance a WHERE a.section_id IN (v_main, v_other);
      EXECUTE 'RESET ROLE';
      v_ok := CASE v_case
        WHEN 'c1_adviser' THEN v_main_seen = 2 AND v_other_seen = 0
        WHEN 'c2_subject_teacher' THEN v_main_seen = 2 AND v_other_seen = 0
        WHEN 'c3_other_teacher' THEN v_main_seen = 0 AND v_other_seen = 1
        ELSE v_main_seen = 2 AND v_other_seen = 0 AND v_not_own = 0
      END;
      RAISE EXCEPTION 'rollback_case';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
      EXECUTE 'RESET ROLE';
    END;
    v_report := v_report || ' ' || v_case || '_read=' || CASE WHEN v_ok IS TRUE THEN 'PASS' ELSE 'FAIL' END;
    IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;
  END LOOP;

  -- Case 5: an admin can still insert, update and delete directly.
  v_ok := false;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_admin::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_admin::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    INSERT INTO public.attendance (student_id, section_id, date, status)
      VALUES (v_student_b, v_main, v_day, 'Present');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    UPDATE public.attendance SET status = 'Absent'
      WHERE student_id = v_student_b AND section_id = v_main AND date = v_day AND subject IS NULL;
    GET DIAGNOSTICS v_rows_2 = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    v_ok := v_rows = 1 AND v_rows_2 = 1
      AND (SELECT a.status FROM public.attendance a WHERE a.student_id = v_student_b
        AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL) = 'Absent';
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.attendance
      WHERE student_id = v_student_b AND section_id = v_main AND date = v_day AND subject IS NULL;
    GET DIAGNOSTICS v_rows_3 = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    v_ok := v_ok AND v_rows_3 = 1
      AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.student_id = v_student_b
        AND a.section_id = v_main AND a.date = v_day);
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c5_admin_insert_update_delete=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 7: the trusted function still saves, repeats and clears for the adviser.
  v_ok := false;
  BEGIN
    PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_adviser::text, true);
    PERFORM pg_catalog.set_config('request.jwt.claims',
      pg_catalog.jsonb_build_object('sub', v_adviser::text)::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Present')));
    EXECUTE 'RESET ROLE';
    v_ok := (v_receipt->>'ok')::boolean AND (v_receipt->>'saved')::integer = 1
      AND (SELECT a.status = 'Present' AND a.recorded_by = v_adviser FROM public.attendance a
        WHERE a.student_id = v_student_b AND a.section_id = v_main AND a.date = v_day AND a.subject IS NULL);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Present')));
    EXECUTE 'RESET ROLE';
    v_ok := v_ok AND (v_receipt->>'saved')::integer = 0 AND (v_receipt->>'cleared')::integer = 0;
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', NULL)));
    EXECUTE 'RESET ROLE';
    v_ok := v_ok AND (v_receipt->>'cleared')::integer = 1
      AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.student_id = v_student_b
        AND a.section_id = v_main AND a.date = v_day);
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c7_function_save_repeat_clear=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 7: the trusted function still refuses a subject-only teacher.
  v_ok := false;
  v_error := NULL;
  v_receipt := NULL;
  BEGIN
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
        ORDER BY a.id), '[]'::jsonb) INTO v_snap_before
      FROM public.attendance a WHERE a.section_id IN (v_main, v_other);
    BEGIN
      PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_subject_teacher::text, true);
      PERFORM pg_catalog.set_config('request.jwt.claims',
        pg_catalog.jsonb_build_object('sub', v_subject_teacher::text)::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      v_receipt := public.eduscribe_attendance_save_v1(v_main, v_day, pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('student_id', v_student_b, 'status', 'Present')));
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
      EXECUTE 'RESET ROLE';
    END;
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ctid', a.ctid::text, 'row', pg_catalog.to_jsonb(a))
        ORDER BY a.id), '[]'::jsonb) INTO v_snap_after
      FROM public.attendance a WHERE a.section_id IN (v_main, v_other);
    v_ok := v_receipt IS NULL AND v_error = 'not_found' AND v_snap_before = v_snap_after;
    RAISE EXCEPTION 'rollback_case';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rollback_case' THEN v_ok := false; END IF;
    EXECUTE 'RESET ROLE';
  END;
  v_report := v_report || ' c7_function_refuses_subject_teacher=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  IF v_ok IS NOT TRUE THEN v_failures := v_failures + 1; END IF;

  -- Case 8: exactly the expected policies, RLS on, anon without write
  -- privileges, and the daily unique index still in place.
  v_ok := (SELECT pg_catalog.array_agg(p.policyname::text ORDER BY p.policyname)
        FROM pg_catalog.pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'attendance')
      = ARRAY['attendance_admin_write', 'attendance_staff_read', 'attendance_student_read']
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies p WHERE p.schemaname = 'public'
      AND p.tablename = 'attendance' AND p.policyname = 'attendance_staff_read'
      AND p.cmd = 'SELECT' AND p.roles = ARRAY['authenticated']::name[])
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_policies p WHERE p.schemaname = 'public'
      AND p.tablename = 'attendance' AND p.policyname = 'attendance_admin_write'
      AND p.cmd = 'ALL' AND p.roles = ARRAY['authenticated']::name[])
    AND (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = 'public.attendance'::regclass)
    AND NOT pg_catalog.has_table_privilege('anon', 'public.attendance', 'INSERT')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.attendance', 'UPDATE')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.attendance', 'DELETE')
    AND NOT pg_catalog.has_table_privilege('anon', 'public.attendance', 'TRUNCATE')
    AND pg_catalog.to_regclass('public.attendance_daily_unique') IS NOT NULL;
  v_report := v_report || ' c8_policy_set_and_index=' || CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
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
