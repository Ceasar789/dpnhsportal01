-- ============================================
-- PHASE 4 / 03 — Sixty dummy STUDENT accounts for load testing
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Idempotent: re-running creates nothing twice and repairs anything partial.
--
-- These accounts are inert on purpose. They can log in and they appear in the
-- admin's User Management; they cause nothing else. This file writes to
-- exactly five tables and nowhere else:
--
--   auth.users        so they can log in
--   auth.identities   so EMAIL+PASSWORD login works (see below)
--   profiles          so they appear in User Management
--   students          so they can be enrolled at all (see below)
--
-- It does NOT enrol anyone — section_students is untouched, because sections
-- are assigned by hand in the UI afterwards. It writes no notifications, no
-- activity_logs, does not touch sections.current_enrollment, and creates or
-- alters no schema object.
--
-- ── Two things worth knowing before you run this ────────────────────────
--
-- 1. WRITING TO auth.users DIRECTLY IS UNSUPPORTED BY SUPABASE. It works, and
--    it is widely done, but auth.users and auth.identities belong to GoTrue
--    (Supabase Auth) and their columns change between versions. If Supabase
--    upgrades GoTrue and adds a NOT NULL column, THIS FILE breaks — not your
--    application. That is an acceptable trade for throwaway test accounts you
--    will delete anyway. It would not be acceptable for real users; those
--    should keep going through the admin's Create User screen.
--
--    The auth.identities row is not optional. Without it the account exists
--    and looks fine in the dashboard, but email/password login fails, because
--    that is the row GoTrue actually matches a password against.
--
--    Every token column is set to '' rather than left NULL. GoTrue reads them
--    as Go strings, and a NULL fails login with "converting NULL to string is
--    unsupported" — an error that says nothing about its own cause.
--
-- 2. THE students ROW IS WHAT MAKES ENROLMENT POSSIBLE.
--    section_students.student_id REFERENCES students(id). The admin's own
--    Create User screen writes only `profiles`, never `students` — so a
--    student created that way cannot be added to a section at all, and
--    nothing on screen explains why. This file writes both.
--
-- ── What you get ─────────────────────────────────────────────────────────
--
--   Email     student01@example.com … student60@example.com
--   Password  123456789   (the same for all sixty)
--   LRN       108123456789 … 108123456848, one apart, twelve digits each
--   Stud. No. 2026-0001 … 2026-0060
--   Blocks    A = 01-20, B = 21-40, C = 41-60 — sort User Management by
--             email and the three blocks are contiguous, so each block can be
--             assigned to one section.
--
-- example.com is reserved by RFC 2606: always a valid address, never
-- deliverable, so nothing can be mailed to a real person by accident.
-- ============================================

DO $$
DECLARE
  -- Sixty distinct names. Block membership is carried by the NUMBER, not the
  -- name, so the ordering here is the ordering in User Management.
  v_names TEXT[] := ARRAY[
    -- Block A — student01 … student20
    'Andrea Bautista', 'Miguel Santos', 'Sofia Reyes', 'Gabriel Cruz',
    'Isabella Ramos', 'Joshua Mendoza', 'Althea Garcia', 'Nathaniel Torres',
    'Clarisse Villanueva', 'Rafael Domingo', 'Beatriz Aquino', 'Emmanuel Navarro',
    'Danica Salazar', 'Lorenzo Pascual', 'Kyla Marquez', 'Sebastian Alvarez',
    'Trisha Gonzales', 'Adrian Lagman', 'Patricia Fernandez', 'Kristoffer Bacani',
    -- Block B — student21 … student40
    'Camille Ocampo', 'Dominic Herrera', 'Angelica Rosales', 'Vincent Del Rosario',
    'Mariel Castillo', 'Jerome Panganiban', 'Nicole Abad', 'Christian Soriano',
    'Faith Delgado', 'Marco Bernardo', 'Jasmine Aguilar', 'Elijah Carreon',
    'Roselle Manalo', 'Bryan Espino', 'Charmaine Lucero', 'Kenneth Dizon',
    'Aubrey Sarmiento', 'Paulo Gutierrez', 'Hazel Nicolas', 'Ronnie Valdez',
    -- Block C — student41 … student60
    'Shaira Bulaong', 'Jomar Padilla', 'Arianne Corpuz', 'Dennis Magsino',
    'Karylle Jimenez', 'Fritz Andrada', 'Loreen Cabrera', 'Ryan Estrada',
    'Michelle Pineda', 'Alfred Bonifacio', 'Janine Rivera', 'Mark Anthony Sison',
    'Precious Almeda', 'Gerald Tolentino', 'Kimberly Fajardo', 'Renz Malinao',
    'Abigail Serrano', 'Jerick Ampong', 'Leah Bustamante', 'Carlo Villamor'
  ];

  v_password  TEXT := '123456789';
  v_hash      TEXT;
  v_now       TIMESTAMPTZ := NOW();

  v_uid       UUID;
  v_email     TEXT;
  v_lrn       TEXT;
  v_number    TEXT;
  i           INT;

  v_created   INT := 0;
  v_existing  INT := 0;

  -- auth.identities gained a NOT NULL provider_id in a later GoTrue release.
  -- Checked rather than assumed, so this file runs on either schema.
  v_has_provider_id BOOLEAN;
BEGIN
  IF array_length(v_names, 1) <> 60 THEN
    RAISE EXCEPTION 'Expected 60 names, found %', array_length(v_names, 1);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities'
      AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  -- Hashed once and reused. Every account shares one password, so sixty
  -- separate bcrypt rounds would buy nothing but a slower migration.
  -- Schema-qualified: pgcrypto lives in `extensions` on Supabase and is not
  -- on the SQL Editor's default search_path.
  v_hash := extensions.crypt(v_password, extensions.gen_salt('bf'));

  FOR i IN 1..60 LOOP
    v_email  := 'student' || lpad(i::TEXT, 2, '0') || '@example.com';
    v_lrn    := (108123456789::BIGINT + i - 1)::TEXT;
    v_number := '2026-' || lpad(i::TEXT, 4, '0');

    SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        -- Empty strings, never NULL — see the header.
        confirmation_token, recovery_token, email_change_token_new,
        email_change, email_change_token_current, email_change_confirm_status,
        phone_change, phone_change_token, reauthentication_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, v_hash,
        -- Confirmed on creation: an unconfirmed account cannot log in, and
        -- no confirmation mail is sent by an insert like this one.
        v_now, v_now, v_now, NULL,
        '{"provider":"email","providers":["email"]}'::JSONB,
        jsonb_build_object('name', v_names[i], 'seeded_test_account', TRUE),
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
    INSERT INTO profiles (id, email, name, role, status)
    VALUES (v_uid, v_email, v_names[i], 'student', 'active')
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, name = EXCLUDED.name,
          role = 'student', status = 'active';

    INSERT INTO students (id, lrn, student_number, student_status)
    VALUES (v_uid, v_lrn, v_number, 'Regular')
    ON CONFLICT (id) DO UPDATE
      SET lrn = EXCLUDED.lrn, student_number = EXCLUDED.student_number,
          student_status = 'Regular';
  END LOOP;

  RAISE NOTICE 'Seed complete — % created, % already existed. Password for all: %',
    v_created, v_existing, v_password;
END $$;


-- ============================================
-- VERIFICATION — run these after the block above and read every result.
-- Queries 2-4 each look for a specific way the seed can be half-finished.
-- Every one of them must return ZERO rows.
-- ============================================

-- 1. Headline counts. All four numbers must read 60.
SELECT
  (SELECT COUNT(*) FROM auth.users      WHERE email LIKE 'student%@example.com') AS auth_users,
  (SELECT COUNT(*) FROM auth.identities WHERE identity_data->>'email' LIKE 'student%@example.com') AS identities,
  (SELECT COUNT(*) FROM profiles        WHERE email LIKE 'student%@example.com') AS profiles,
  (SELECT COUNT(*) FROM students s JOIN profiles p ON p.id = s.id
    WHERE p.email LIKE 'student%@example.com')                                   AS students;

-- 2. Any of the four rows missing. Expect ZERO rows.
--    No identity  -> the account exists but cannot log in.
--    No students  -> the account looks normal but cannot be enrolled anywhere.
--    Re-running the block above repairs both.
SELECT u.email,
  (i.id IS NOT NULL) AS has_identity,
  (p.id IS NOT NULL) AS has_profile,
  (s.id IS NOT NULL) AS has_student_row
FROM auth.users u
LEFT JOIN auth.identities i ON i.user_id = u.id AND i.provider = 'email'
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN students s ON s.id = u.id
WHERE u.email LIKE 'student%@example.com'
  AND (i.id IS NULL OR p.id IS NULL OR s.id IS NULL)
ORDER BY u.email;

-- 3. Accounts that cannot log in because they were never confirmed, or have
--    a NULL in a column GoTrue reads as a string. Expect ZERO rows.
SELECT email, email_confirmed_at, created_at
FROM auth.users
WHERE email LIKE 'student%@example.com'
  AND (email_confirmed_at IS NULL
    OR confirmation_token IS NULL OR recovery_token IS NULL
    OR email_change_token_new IS NULL OR email_change IS NULL)
ORDER BY email;

-- 4. Anything wrong with the seeded rows themselves. Expect ZERO rows.
SELECT p.email, p.role, p.status, s.lrn, s.student_number,
  CASE
    WHEN p.role <> 'student'    THEN 'role is not student'
    WHEN p.status <> 'active'   THEN 'status is not active'
    WHEN s.lrn IS NULL          THEN 'no LRN'
    WHEN s.lrn !~ '^[0-9]{12}$' THEN 'LRN is not 12 digits'
    ELSE 'LRN shared with another student'
  END AS problem
FROM profiles p
LEFT JOIN students s ON s.id = p.id
WHERE p.email LIKE 'student%@example.com'
  AND (p.role <> 'student' OR p.status <> 'active'
    OR s.lrn IS NULL OR s.lrn !~ '^[0-9]{12}$'
    OR EXISTS (SELECT 1 FROM students s2 WHERE s2.lrn = s.lrn AND s2.id <> s.id))
ORDER BY p.email;

-- 5. Proof the seed stayed inert: nothing was enrolled.
--    Expect 0 BEFORE you assign sections by hand, and 60 after.
SELECT COUNT(*) AS enrolled_dummies
FROM section_students ss
JOIN profiles p ON p.id = ss.student_id
WHERE p.email LIKE 'student%@example.com';

-- 6. The roster in block order, for assigning sections by hand.
SELECT
  CASE WHEN RIGHT(LEFT(p.email, 9), 2)::INT <= 20 THEN 'A'
       WHEN RIGHT(LEFT(p.email, 9), 2)::INT <= 40 THEN 'B'
       ELSE 'C' END AS block,
  p.email, p.name, s.lrn, s.student_number
FROM profiles p
LEFT JOIN students s ON s.id = p.id
WHERE p.email LIKE 'student%@example.com'
ORDER BY p.email;


-- ============================================
-- CLEANUP — when testing is over.
-- Deliberately left commented out: this is irreversible, and an accidental
-- Run All on this file should not delete the population you just built.
-- Uncomment the DELETE, select just those lines, and run them.
--
-- Deleting the auth.users row is enough on its own. profiles.id, students.id
-- and auth.identities.user_id are all ON DELETE CASCADE off auth.users, and
-- section_students cascades off students — so one delete unwinds everything,
-- including any sections you assigned by hand.
-- ============================================

-- DELETE FROM auth.users WHERE email LIKE 'student%@example.com';
