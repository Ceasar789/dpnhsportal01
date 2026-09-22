-- ============================================
-- PHASE 4 / 04 — Four dummy TEACHER accounts for load testing
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Idempotent: re-running creates nothing twice and repairs anything partial.
--
-- The companion to phase4-03-seed-test-students.sql, and deliberately
-- shorter. A teacher needs THREE rows, not four:
--
--   auth.users        so they can log in
--   auth.identities   so EMAIL+PASSWORD login works
--   profiles          role = 'teacher', which is what every teacher RLS
--                     policy and every route guard actually reads
--
-- NO `students` row — that table is the student record (LRN, guardian,
-- year level, GWA) and a teacher has no business in it. Nothing in the app
-- looks for one, and section_students only references students(id), which a
-- teacher is never on either side of.
--
-- ── What is deliberately NOT here ────────────────────────────────────────
--
-- Inert, same as the student seed. This writes no schedules, no
-- teacher_subjects, and does not set sections.adviser_id — so these four
-- teach nothing and advise nobody until you say so in the app. That is the
-- point: you assign the load by hand, the same way you assign the students'
-- sections by hand.
--
-- Worth knowing which of those three does what, because they are not
-- interchangeable:
--   sections.adviser_id  -> the teacher's ADVISORY section
--   schedules            -> the sections they HANDLE, and the subject cards
--                           a student sees (student subject cards come from
--                           schedules.subject_id, never from the tasks)
--   teacher_subjects     -> the teaching load record; not read by the
--                           student dashboard at all
--
-- ── `department` is set on purpose ───────────────────────────────────────
--
-- The subject badge beside a teacher's name comes from profiles.department,
-- assigned by an admin. Four different departments here gives you a Math
-- teacher, an English teacher, a Science teacher and a Filipino teacher —
-- which is what it takes to test whether a Math teacher's task lands on the
-- student's Math card or falls through to Other. Delete the column from both
-- the INSERT and the DO UPDATE if you would rather set these by hand.
--
-- ── What you get ─────────────────────────────────────────────────────────
--
--   Email     teacher01@example.com … teacher04@example.com
--   Password  123456789   (the same for all four, and the same as the
--                          students' — one password for the whole test run)
--   Role      teacher
--
-- example.com is reserved by RFC 2606: always a valid address, never
-- deliverable, so nothing can be mailed to a real person by accident.
--
-- Writing to auth.users directly is unsupported by Supabase and can break on
-- a GoTrue upgrade. See the header of phase4-03 for the full reasoning; it
-- applies here unchanged.
-- ============================================

DO $$
DECLARE
  -- name, department. The department is what renders as the subject badge.
  v_teachers TEXT[][] := ARRAY[
    ARRAY['Ramon Delgado',    'Mathematics'],
    ARRAY['Grace Villafuerte', 'English'],
    ARRAY['Noel Sarmiento',   'Science'],
    ARRAY['Liza Manalastas',  'Filipino']
  ];

  v_password  TEXT := '123456789';
  v_hash      TEXT;
  v_now       TIMESTAMPTZ := NOW();

  v_uid       UUID;
  v_email     TEXT;
  v_name      TEXT;
  v_dept      TEXT;
  i           INT;

  v_created   INT := 0;
  v_existing  INT := 0;

  -- auth.identities gained a NOT NULL provider_id in a later GoTrue release.
  -- Checked rather than assumed, so this file runs on either schema.
  v_has_provider_id BOOLEAN;
BEGIN
  IF array_length(v_teachers, 1) <> 4 THEN
    RAISE EXCEPTION 'Expected 4 teachers, found %', array_length(v_teachers, 1);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities'
      AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  -- Hashed once and reused: all four share one password, so four separate
  -- bcrypt rounds would buy nothing. Schema-qualified because pgcrypto lives
  -- in `extensions` on Supabase and is not on the SQL Editor's search_path.
  v_hash := extensions.crypt(v_password, extensions.gen_salt('bf'));

  FOR i IN 1..4 LOOP
    v_email := 'teacher' || lpad(i::TEXT, 2, '0') || '@example.com';
    v_name  := v_teachers[i][1];
    v_dept  := v_teachers[i][2];

    SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        -- Empty strings, never NULL. GoTrue reads these as Go strings and a
        -- NULL fails login with "converting NULL to string is unsupported",
        -- an error that says nothing about its own cause.
        confirmation_token, recovery_token, email_change_token_new,
        email_change, email_change_token_current, email_change_confirm_status,
        phone_change, phone_change_token, reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, v_hash,
        -- `role` above is the POSTGRES role every logged-in user carries.
        -- It is not the app's role — that lives in profiles.role below, and
        -- setting this one to 'teacher' would break their session entirely.
        v_now, v_now, v_now, NULL,
        '{"provider":"email","providers":["email"]}'::JSONB,
        jsonb_build_object('name', v_name, 'seeded_test_account', TRUE),
        FALSE,
        '', '', '', '', '', 0, '', '', ''
      );

      IF v_has_provider_id THEN
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider, provider_id,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), v_uid,
          jsonb_build_object('sub', v_uid::TEXT, 'email', v_email, 'email_verified', TRUE),
          'email', v_uid::TEXT, NULL, v_now, v_now
        );
      ELSE
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          -- On the older schema `id` is TEXT and holds the provider's own
          -- subject id, which for the email provider is the user's uuid.
          v_uid::TEXT, v_uid,
          jsonb_build_object('sub', v_uid::TEXT, 'email', v_email, 'email_verified', TRUE),
          'email', NULL, v_now, v_now
        );
      END IF;

      v_created := v_created + 1;
    ELSE
      v_existing := v_existing + 1;
    END IF;

    -- Upserted, not inserted, so a re-run after a partial failure finishes
    -- the job instead of colliding on the primary key.
    INSERT INTO profiles (id, email, name, role, department, status)
    VALUES (v_uid, v_email, v_name, 'teacher', v_dept, 'active')
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name,
          role = 'teacher', department = EXCLUDED.department, status = 'active';
  END LOOP;

  RAISE NOTICE 'Teacher seed complete — % created, % already existed. Password for all: %',
    v_created, v_existing, v_password;
END $$;


-- ============================================
-- VERIFICATION — run these after the block above and read every result.
-- Queries 2 and 3 must return ZERO rows.
-- ============================================

-- 1. Headline counts. All three numbers must read 4.
SELECT
  (SELECT COUNT(*) FROM auth.users      WHERE email LIKE 'teacher%@example.com') AS auth_users,
  (SELECT COUNT(*) FROM auth.identities WHERE identity_data->>'email' LIKE 'teacher%@example.com') AS identities,
  (SELECT COUNT(*) FROM profiles        WHERE email LIKE 'teacher%@example.com') AS profiles;

-- 2. A missing row, a wrong role, or an account that cannot log in.
--    Expect ZERO rows. Re-running the block above repairs the first two.
--    No identity -> the account exists and looks fine, but login fails.
--    Wrong role  -> every teacher RLS policy and route guard reads
--                   profiles.role, so a student-roled account lands on the
--                   student dashboard instead.
SELECT u.email, p.role, p.department,
  (i.id IS NOT NULL) AS has_identity,
  (p.id IS NOT NULL) AS has_profile,
  (u.email_confirmed_at IS NOT NULL) AS confirmed
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email'
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email LIKE 'teacher%@example.com'
  AND (i.id IS NULL OR p.id IS NULL
    OR u.email_confirmed_at IS NULL
    OR p.role <> 'teacher' OR p.status <> 'active')
ORDER BY u.email;

-- 3. A teacher wrongly carrying a student record. Expect ZERO rows.
--    Nothing above creates one; this catches a stray from an earlier attempt,
--    which would put a teacher in student-facing queries.
SELECT p.email, s.lrn, s.student_number
FROM profiles p
JOIN students s ON s.id = p.id
WHERE p.email LIKE 'teacher%@example.com';

-- 4. Proof the seed stayed inert: these four teach nothing and advise nobody
--    until you assign it. Expect 0 and 0 before you do.
SELECT
  (SELECT COUNT(*) FROM schedules sch JOIN profiles p ON p.id = sch.teacher_id
    WHERE p.email LIKE 'teacher%@example.com')     AS scheduled_classes,
  (SELECT COUNT(*) FROM sections sec JOIN profiles p ON p.id = sec.adviser_id
    WHERE p.email LIKE 'teacher%@example.com')     AS advisory_sections;

-- 5. The four, for assigning advisories and schedules by hand.
SELECT p.email, p.name, p.department, p.role, p.status
FROM profiles p
WHERE p.email LIKE 'teacher%@example.com'
ORDER BY p.email;


-- ============================================
-- CLEANUP — when testing is over.
-- Left commented out deliberately: this is irreversible, and an accidental
-- Run All on this file should not delete the accounts it just built.
-- Uncomment the DELETE, select just that line, and run it.
--
-- Deleting the auth.users row is enough. profiles.id and
-- auth.identities.user_id are both ON DELETE CASCADE off auth.users.
--
-- Note what else follows a teacher out: sections.adviser_id is ON DELETE SET
-- NULL, so their advisory survives without an adviser — but schedules.
-- teacher_id and worksheets are ON DELETE CASCADE, so every class schedule
-- and every task they created goes with them, and so does anything a student
-- submitted against those tasks.
-- ============================================

-- DELETE FROM auth.users WHERE email LIKE 'teacher%@example.com';
