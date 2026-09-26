-- ============================================
-- PHASE 5 / 01 — RLS test suite
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- READ ONLY. Creates nothing, changes nothing, deletes nothing. Safe to run
-- against the live database, as often as you like.
--
-- ── Why this file exists ─────────────────────────────────────────────────
--
-- There is no backend. The browser talks straight to Supabase, so RLS is the
-- ONLY thing standing between one student and another student's answers. The
-- 94 unit tests cover scoring, countdowns and rendering — not one of them
-- touches a policy. This is the untested half, and it is the half that leaks.
--
-- ── How it works ─────────────────────────────────────────────────────────
--
-- Supabase derives auth.uid() from the request's JWT claims. Setting
-- `request.jwt.claims` and switching to the `authenticated` role makes the
-- database answer exactly as it would for that logged-in person. Every check
-- below asks a question AS somebody and compares the answer to what the
-- policies promise.
--
-- Results come back as a table, not as an exception, so ONE failing check
-- does not hide the twelve after it. Read every row.
--
-- ── Reading the result ───────────────────────────────────────────────────
--
--   PASS    the policy behaved as designed
--   FAIL    a real hole — someone can see or write what they must not
--   SKIP    the fixture this check needs does not exist in your data yet
--           (e.g. no submissions to test against). Not a pass. Seed the
--           data and re-run, or the check is telling you nothing.
--
-- A suite that is all SKIP is worth exactly nothing. Distribute a task,
-- answer it as a student and have a teacher release a score before trusting
-- a clean run.
--
-- Depends on phase4-03 and phase4-05 (the seeded students and teachers).
-- ============================================

DO $$
DECLARE
  v_student_a  UUID;
  v_student_b  UUID;
  v_teacher_a  UUID;
  v_teacher_b  UUID;
  v_worksheet  UUID;
  v_owner      UUID;
  v_sub_a      UUID;
  v_n          INT;
  v_ok         BOOLEAN;
  v_err        TEXT;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS rls_results (
    seq        SERIAL,
    area       TEXT,
    check_name TEXT,
    expected   TEXT,
    actual     TEXT,
    status     TEXT
  );
  DELETE FROM rls_results;

  -- ── Fixtures ───────────────────────────────────────────────────────────
  -- Student A has to be someone who ACTUALLY HAS a submission, or the two
  -- checks that matter most — can another student read, or overwrite,
  -- their answers — test nothing and report SKIP.
  --
  -- Found from the data rather than hardcoded. The first version named
  -- student01@example.com, the answer was submitted from a different
  -- account, and the suite went on reporting SKIP while a real submission
  -- sat in the table untested.
  SELECT ws.student_id, ws.id
    INTO v_student_a, v_sub_a
  FROM worksheet_submissions ws
  ORDER BY ws.created_at DESC NULLS LAST
  LIMIT 1;

  -- No submissions anywhere yet: fall back to a seeded student so the
  -- other eleven checks still run.
  IF v_student_a IS NULL THEN
    SELECT id INTO v_student_a FROM profiles WHERE email = 'student01@example.com';
  END IF;

  -- Student B is anybody else with a student role — the one doing the
  -- peeking.
  SELECT id INTO v_student_b
  FROM profiles
  WHERE role = 'student' AND id IS DISTINCT FROM v_student_a
  ORDER BY email
  LIMIT 1;

  -- A worksheet that has actually been distributed, and the teacher who owns
  -- it — picked from real data rather than assumed, so the checks describe
  -- the database as it is.
  SELECT w.id, w.teacher_id INTO v_worksheet, v_owner
  FROM worksheets w
  WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = w.id)
  ORDER BY w.created_at DESC
  LIMIT 1;

  v_teacher_a := v_owner;
  SELECT id INTO v_teacher_b
  FROM profiles
  WHERE role = 'teacher' AND id IS DISTINCT FROM v_owner
  ORDER BY email
  LIMIT 1;


  -- ══ 1. A student must not read another student's submissions ═══════════
  IF v_student_a IS NULL OR v_student_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('submissions', 'Student cannot read another student''s submissions',
            '0 rows', 'seeded students missing — run phase4-03', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM worksheet_submissions WHERE student_id = v_student_a;
    EXECUTE 'RESET ROLE';
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('submissions', 'Student cannot read another student''s submissions',
            '0 rows', v_n || ' rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ══ 2. A student must not read the answer key, ever ════════════════════
  -- ws_keys_all is teacher-only. A student who can read this can score
  -- themselves perfectly on every auto-checked task in the school.
  IF v_student_a IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('answer key', 'Student cannot read worksheet_item_keys',
            '0 rows', 'no seeded student', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_a, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM worksheet_item_keys;
    EXECUTE 'RESET ROLE';
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('answer key', 'Student cannot read worksheet_item_keys',
            '0 rows', v_n || ' rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ══ 3. A student must not read another student's answers ═══════════════
  IF v_sub_a IS NULL OR v_student_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('answers', 'Student cannot read another student''s answers',
            '0 rows', 'no submission to test against — answer a task first', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM worksheet_answers WHERE submission_id = v_sub_a;
    EXECUTE 'RESET ROLE';
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('answers', 'Student cannot read another student''s answers',
            '0 rows', v_n || ' rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ══ 4. A student must not read a task nobody assigned them ═════════════
  IF v_worksheet IS NULL OR v_student_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('worksheets', 'Student cannot read an unassigned task',
            '0 rows', 'no distributed task — distribute one first', 'SKIP');
  ELSE
    -- Only meaningful if student B genuinely does not hold it.
    IF EXISTS (SELECT 1 FROM task_assignees
               WHERE task_id = v_worksheet AND student_id = v_student_b) THEN
      INSERT INTO rls_results (area, check_name, expected, actual, status)
      VALUES ('worksheets', 'Student cannot read an unassigned task',
              '0 rows', 'this student holds the task — pick another fixture', 'SKIP');
    ELSE
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      SELECT count(*) INTO v_n FROM worksheets WHERE id = v_worksheet;
      EXECUTE 'RESET ROLE';
      INSERT INTO rls_results (area, check_name, expected, actual, status)
      VALUES ('worksheets', 'Student cannot read an unassigned task',
              '0 rows', v_n || ' rows',
              CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
    END IF;
  END IF;

  -- ══ 5. A student must not read another student's assignment rows ═══════
  IF v_student_a IS NULL OR v_student_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('assignments', 'Student cannot read another student''s task_assignees',
            '0 rows', 'seeded students missing', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM task_assignees WHERE student_id = v_student_a;
    EXECUTE 'RESET ROLE';
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('assignments', 'Student cannot read another student''s task_assignees',
            '0 rows', v_n || ' rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ══ 6. A student must not read another person's notifications ══════════
  IF v_student_a IS NULL OR v_student_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('notifications', 'Student cannot read another user''s notifications',
            '0 rows', 'seeded students missing', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM notifications WHERE user_id <> v_student_b;
    EXECUTE 'RESET ROLE';
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('notifications', 'Student cannot read another user''s notifications',
            '0 rows', v_n || ' rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ══ 7. A teacher must not read another teacher's worksheets ════════════
  IF v_worksheet IS NULL OR v_teacher_b IS NULL OR v_teacher_b = v_owner THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('worksheets', 'Teacher cannot read another teacher''s task',
            '0 rows', 'need two teachers and one distributed task', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_teacher_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM worksheets WHERE id = v_worksheet;
    EXECUTE 'RESET ROLE';
    -- NOT necessarily a bug if this reads 1: a teacher scheduled into the
    -- section the task was posted to may legitimately see it. Reported as
    -- REVIEW rather than FAIL so it gets looked at instead of dismissed.
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('worksheets', 'Teacher cannot read another teacher''s task',
            '0 rows', v_n || ' rows',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'REVIEW' END);
  END IF;

  -- ══ 8. A teacher must not write the teaching load (admin only) ═════════
  IF v_teacher_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('teaching load', 'Teacher cannot write teacher_subjects',
            'refused', 'no second teacher', 'SKIP');
  ELSE
    v_ok := FALSE;
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_teacher_b, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      -- Deliberately invalid subject_id so that even if RLS wrongly allows
      -- this, the FK rejects it and nothing is actually written. The test
      -- must never leave a row behind in a live database.
      BEGIN
        INSERT INTO teacher_subjects (teacher_id, subject_id, grade_level, school_year)
        VALUES (v_teacher_b, '00000000-0000-0000-0000-000000000000', 'Grade 7', '1900-1901');
        v_ok := TRUE;   -- got past RLS
      EXCEPTION
        WHEN insufficient_privilege THEN v_ok := FALSE;
        WHEN foreign_key_violation THEN v_ok := TRUE;  -- RLS let it through
        WHEN OTHERS THEN v_ok := FALSE; v_err := SQLERRM;
      END;
      EXECUTE 'RESET ROLE';
    END;
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('teaching load', 'Teacher cannot write teacher_subjects',
            'refused', CASE WHEN v_ok THEN 'ALLOWED' ELSE 'refused' END,
            CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END);
  END IF;

  -- ══ 9. A student must not write notifications to anyone else ═══════════
  -- This is exactly the capability phase4-02 used a trigger to avoid
  -- granting. If it ever reads ALLOWED, that trigger became pointless and
  -- every student can post to any inbox in the school.
  IF v_student_a IS NULL OR v_teacher_a IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('notifications', 'Student cannot write a notification to a teacher',
            'refused', 'fixtures missing', 'SKIP');
  ELSE
    v_ok := FALSE;
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_student_a, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
      BEGIN
        INSERT INTO notifications (user_id, title, message, notification_type)
        VALUES (v_teacher_a, 'RLS probe', 'RLS probe', 'task');
        v_ok := TRUE;
        -- Got through, so the row exists and must not survive this test.
        -- Raising rolls back this sub-block only; v_ok is a plpgsql variable
        -- and is not transactional, so the verdict still gets out.
        RAISE EXCEPTION 'rls-probe-rollback';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'rls-probe-rollback' THEN v_ok := FALSE; END IF;
      END;
      EXECUTE 'RESET ROLE';
    END;
    -- Rolled back below in every case, so a pass and a fail both leave the
    -- table exactly as they found it.
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('notifications', 'Student cannot write a notification to a teacher',
            'refused', CASE WHEN v_ok THEN 'ALLOWED' ELSE 'refused' END,
            CASE WHEN v_ok THEN 'FAIL' ELSE 'PASS' END);
  END IF;

  -- ══ 10. A student must not update another student's submission ═════════
  IF v_sub_a IS NULL OR v_student_b IS NULL THEN
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('submissions', 'Student cannot update another student''s submission',
            '0 rows affected', 'no submission to test against', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      -- Writes the same value back, so nothing changes even if permitted —
      -- but a permitted UPDATE still rewrites the row and fires its
      -- updated_at trigger, so this rolls itself back the same way probe 9
      -- does. v_n survives the rollback; the row does not.
      UPDATE worksheet_submissions SET status = status WHERE id = v_sub_a;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE EXCEPTION 'rls-probe-rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'rls-probe-rollback' THEN v_n := 0; END IF;
    END;
    EXECUTE 'RESET ROLE';
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('submissions', 'Student cannot update another student''s submission',
            '0 rows affected', v_n || ' rows affected',
            CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ══ 11. Every table the students touch has RLS switched on ═════════════
  -- RLS off is not a weak policy, it is no policy: every row readable by
  -- anyone logged in. Cheap to check and catastrophic to miss.
  FOR v_err IN
    SELECT unnest(ARRAY['worksheets', 'worksheet_items', 'worksheet_item_keys',
                        'worksheet_submissions', 'worksheet_answers',
                        'worksheet_sections', 'task_assignees', 'notifications',
                        'teacher_subjects', 'schedules', 'sections',
                        'section_students', 'students', 'profiles'])
  LOOP
    SELECT relrowsecurity INTO v_ok
    FROM pg_class WHERE oid = to_regclass('public.' || v_err);
    INSERT INTO rls_results (area, check_name, expected, actual, status)
    VALUES ('rls enabled', 'RLS is on for ' || v_err, 'on',
            CASE WHEN v_ok IS NULL THEN 'table missing'
                 WHEN v_ok THEN 'on' ELSE 'OFF' END,
            CASE WHEN v_ok IS NULL THEN 'SKIP'
                 WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);
  END LOOP;

  -- ══ 12. No UNEXPECTED policy is wide open ══════════════════════════════
  -- Three unconditional reads are deliberate and were reviewed:
  --   calendar_events  the school calendar, served on a public /calendar route
  --   school_settings  the school's own name, address and phone — not a person's
  --   subjects         a lookup table every screen has to read
  -- Named rather than counted, so adding a fourth shows up as a failure
  -- instead of raising a number nobody looks at twice.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual = 'true' OR with_check = 'true')
    AND NOT (tablename = 'calendar_events' AND policyname = 'public_view_calendar_events')
    AND NOT (tablename = 'school_settings' AND policyname = 'school_settings_read')
    AND NOT (tablename = 'subjects'        AND policyname = 'subjects_read');
  INSERT INTO rls_results (area, check_name, expected, actual, status)
  VALUES ('policies', 'No unreviewed policy grants unconditional access',
          '0 beyond the 3 reviewed', v_n || ' unreviewed',
          CASE WHEN v_n = 0 THEN 'PASS' ELSE 'REVIEW' END);

  -- ══ 13. Every RLS-enabled table has at least one policy ════════════════
  -- RLS on with zero policies is default-deny: the table reads as empty for
  -- everyone, which looks exactly like "no data yet" and is the failure mode
  -- this whole project keeps tripping over.
  -- Six tables are knowingly left in that state, and default deny is the
  -- right answer for them: nothing reads them. The only references are
  -- src/lib/db.js, which nothing imports, and two .orig backup files; four
  -- were superseded by worksheets and task_assignees in Phase 3.
  --
  -- Excluded by name, not by count. A seventh table arriving here means a
  -- real feature was switched off, and that must not hide behind a number
  -- that was already failing.
  SELECT count(*) INTO v_n
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND c.relname NOT IN ('assignments', 'assignment_submissions', 'quizzes',
                          'quiz_results', 'class_announcements', 'ilaw_lesson_plans')
    AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname);
  INSERT INTO rls_results (area, check_name, expected, actual, status)
  VALUES ('policies', 'No live table has RLS on with zero policies',
          '0 beyond the 6 dead ones', v_n || ' live tables',
          CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);

  -- No suite-wide rollback here on purpose. A DO block's BEGIN…EXCEPTION is
  -- a subtransaction: raising at the end and catching it would roll back
  -- every row written to rls_results along with the probes, and the suite
  -- would report nothing at all. Each write probe undoes itself instead.
END $$;

-- ============================================
-- THE RESULT — read every row.
-- FAIL = a real hole. REVIEW = look at it and decide. SKIP = tested nothing.
-- ============================================
SELECT area, check_name, expected, actual, status
FROM rls_results
ORDER BY
  CASE status WHEN 'FAIL' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'SKIP' THEN 3 ELSE 4 END,
  seq;
