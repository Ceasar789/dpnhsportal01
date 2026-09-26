-- ============================================
-- PHASE 4 / 05 — Forty-eight dummy TEACHER accounts, one per subject per grade
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Idempotent: re-running creates nothing twice and repairs anything partial.
--
-- SUPERSEDES phase4-04-seed-test-teachers.sql, which created four teachers
-- with a department and no grade level. Those four (teacher01 … teacher04)
-- are NOT deleted by this file — see "The four from phase4-04" below, which
-- explains why and gives you the delete when you want it.
--
-- ── The arithmetic ───────────────────────────────────────────────────────
--
--   8 subjects  x  6 grade levels  =  48 teachers
--
-- Both numbers come from the system, not from a guess:
--   subjects     seeded by phase1-01: MATH, ENG, SCI, FIL, AP, TLE, MAPEH, ESP
--   grade levels src/lib/academicRules.js GRADE_LEVELS: Grade 7 … Grade 12
--
-- ── What each teacher gets ───────────────────────────────────────────────
--
--   auth.users        so they can log in
--   auth.identities   so EMAIL+PASSWORD login works
--   profiles          role = 'teacher', department = their subject
--
-- NO `students` row. That table is the student record (LRN, guardian, year
-- level, GWA); nothing in the app looks for one on a teacher, and
-- section_students only references students(id).
--
--   Email     teacher.math7@example.com … teacher.esp12@example.com
--             <subject code><grade number>, so the address itself says who
--             this is. Sort User Management by email and every subject's six
--             grade levels sit together.
--   Password  123456789   (the same for all 48, and the same as the
--                          students' — one password for the whole test run)
--   Role      teacher
--   Dept.     the full subject name, e.g. 'Mathematics' — this is what
--             renders as the subject badge beside their name.
--
-- ── Where the grade level actually lives ─────────────────────────────────
--
-- NOT on profiles — there is no grade_level column there, and this file adds
-- none. For these 48 the grade level is carried by the EMAIL ADDRESS ONLY.
-- It becomes real data when you assign them, in one of two places:
--
--   teacher_subjects(teacher_id, subject_id, grade_level, school_year)
--                        the teaching-load record
--   schedules            the sections they actually handle
--
-- That distinction matters for the bug you are chasing. A STUDENT'S SUBJECT
-- CARDS COME FROM schedules.subject_id — never from teacher_subjects, and
-- never from the task itself. So a Math task distributed into a section whose
-- schedule has no Math row lands on the student's "Other" card, and that is
-- correct behaviour, not a defect. Give each section its schedule before
-- concluding anything from where a task appears.
--
-- ── Deliberately inert ───────────────────────────────────────────────────
--
-- Same contract as the student seed. This writes no schedules, no
-- teacher_subjects, and sets no sections.adviser_id. All 48 teach nothing and
-- advise nobody until you say so. It writes no notifications, no
-- activity_logs, and creates or alters no schema object.
--
-- ── The four from phase4-04 ──────────────────────────────────────────────
--
-- teacher01 … teacher04 are superseded by this file: same four subjects
-- (Mathematics, English, Science, Filipino) but with no grade level. Deleting
-- them is your call, not this file's, because a delete cascades further than
-- it looks — worksheets.teacher_id and schedules.teacher_id are both ON
-- DELETE CASCADE off profiles, so removing a teacher also removes every task
-- they created and every student submission made against those tasks. If you
-- have not used them, this is safe:
--
--   DELETE FROM auth.users WHERE email IN (
--     'teacher01@example.com','teacher02@example.com',
--     'teacher03@example.com','teacher04@example.com');
--
-- Every verification query below counts them, so run that delete FIRST if you
-- want the counts to read a clean 48 instead of 52.
--
-- ── One caveat, unchanged from phase4-03 ─────────────────────────────────
--
-- Writing to auth.users directly is unsupported by Supabase. Those tables
-- belong to GoTrue and their columns change between releases, so a GoTrue
-- upgrade can break THIS FILE — not your application. Acceptable for
-- throwaway test accounts; not for real users, who should keep going through
-- the admin's Create User screen.
-- ============================================

DO $$
DECLARE
  -- code (for the email), full subject name (for the department badge).
  -- The eight subjects phase1-01 seeds into the subjects table.
  v_subjects TEXT[][] := ARRAY[
    ARRAY['math',  'Mathematics'],
    ARRAY['eng',   'English'],
    ARRAY['sci',   'Science'],
    ARRAY['fil',   'Filipino'],
    ARRAY['ap',    'Araling Panlipunan'],
    ARRAY['tle',   'Technology and Livelihood Education'],
    ARRAY['mapeh', 'MAPEH'],
    ARRAY['esp',   'Edukasyon sa Pagpapakatao']
  ];

  -- Grade 7 … Grade 12, matching GRADE_LEVELS in src/lib/academicRules.js.
  v_grades INT[] := ARRAY[7, 8, 9, 10, 11, 12];

  -- 48 distinct names, in subject-major order: the first six are
  -- Mathematics Grade 7-12, the next six English Grade 7-12, and so on.
  -- The order here IS the pairing — do not reorder without reordering
  -- v_subjects and v_grades to match.
  v_names TEXT[] := ARRAY[
    -- Mathematics
    'Ramon Delgado', 'Editha Paguio', 'Nestor Balagtas',
    'Lourdes Caraig', 'Arnel Mabini', 'Teresita Bunag',
    -- English
    'Grace Villafuerte', 'Wilfredo Antonio', 'Marissa Cuenca',
    'Efren Dalisay', 'Corazon Tabios', 'Joel Katigbak',
    -- Science
    'Noel Sarmiento', 'Perla Mangubat', 'Danilo Rivamonte',
    'Susan Alcantara', 'Rogelio Bandoja', 'Imelda Fortich',
    -- Filipino
    'Liza Manalastas', 'Bienvenido Ocampo', 'Remedios Lacson',
    'Alfonso Trinidad', 'Milagros Zamora', 'Ernesto Buenaflor',
    -- Araling Panlipunan
    'Virgilio Macapagal', 'Norma Escalona', 'Rodolfo Pangilinan',
    'Consuelo Ibarra', 'Fernando Guzman', 'Aurora Sandoval',
    -- Technology and Livelihood Education
    'Bernardo Cudia', 'Estrella Yabut', 'Samuel Lardizabal',
    'Nenita Roxas', 'Crisanto Velasco', 'Divina Moreno',
    -- MAPEH
    'Reynaldo Bonilla', 'Cecilia Ferrer', 'Antonio Mercado',
    'Purificacion Layug', 'Gerardo Salcedo', 'Evangeline Tiongson',
    -- Edukasyon sa Pagpapakatao
    'Maximo Rosales', 'Adoracion Bermudez', 'Leonardo Cabral',
    'Josefina Amora', 'Isagani Portes', 'Carmelita Duran'
  ];

  v_password  TEXT := '123456789';
  v_hash      TEXT;
  v_now       TIMESTAMPTZ := NOW();

  v_uid       UUID;
  v_email     TEXT;
  v_name      TEXT;
  v_dept      TEXT;
  s           INT;   -- subject index, 1..8
  g           INT;   -- grade index, 1..6
  n           INT;   -- flat index into v_names, 1..48

  v_created   INT := 0;
  v_existing  INT := 0;

  -- auth.identities gained a NOT NULL provider_id in a later GoTrue release.
  -- Checked rather than assumed, so this file runs on either schema.
  v_has_provider_id BOOLEAN;
BEGIN
  -- The three arrays have to agree or the pairing silently shifts: a
  -- Mathematics teacher would be created under an English name and nothing
  -- would complain. Checked, not trusted.
  IF array_length(v_subjects, 1) <> 8 THEN
    RAISE EXCEPTION 'Expected 8 subjects, found %', array_length(v_subjects, 1);
  END IF;
  IF array_length(v_grades, 1) <> 6 THEN
    RAISE EXCEPTION 'Expected 6 grade levels, found %', array_length(v_grades, 1);
  END IF;
  IF array_length(v_names, 1) <> 48 THEN
    RAISE EXCEPTION 'Expected 48 names (8 subjects x 6 grades), found %',
      array_length(v_names, 1);
  END IF;
  IF (SELECT COUNT(DISTINCT x) FROM unnest(v_names) AS x) <> 48 THEN
    RAISE EXCEPTION 'Duplicate name in the roster — all 48 must be distinct';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities'
      AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  -- Hashed once and reused: all 48 share one password, so 48 separate bcrypt
  -- rounds would buy nothing but a slower migration. Schema-qualified because
  -- pgcrypto lives in `extensions` on Supabase and is not on the SQL Editor's
  -- default search_path.
  v_hash := extensions.crypt(v_password, extensions.gen_salt('bf'));

  FOR s IN 1..8 LOOP
    FOR g IN 1..6 LOOP
      n       := (s - 1) * 6 + g;
      v_email := 'teacher.' || v_subjects[s][1] || v_grades[g]::TEXT || '@example.com';
      v_name  := v_names[n];
      v_dept  := v_subjects[s][2];

      SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

      IF v_uid IS NULL THEN
        v_uid := gen_random_uuid();

        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, created_at, updated_at, last_sign_in_at,
          raw_app_meta_data, raw_user_meta_data, is_super_admin,
          -- Empty strings, never NULL. GoTrue reads these as Go strings and a
          -- NULL fails login with "converting NULL to string is unsupported",
          -- an error that says nothing at all about its own cause.
          confirmation_token, recovery_token, email_change_token_new,
          email_change, email_change_token_current, email_change_confirm_status,
          phone_change, phone_change_token, reauthentication_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
          v_email, v_hash,
          -- `role` above is the POSTGRES role every logged-in user carries.
          -- It is NOT the app's role — that lives in profiles.role below.
          -- Setting this one to 'teacher' would break their session entirely.
          -- Confirmed on creation: an unconfirmed account cannot log in, and
          -- an insert like this one sends no confirmation mail.
          v_now, v_now, v_now, NULL,
          '{"provider":"email","providers":["email"]}'::JSONB,
          jsonb_build_object(
            'name', v_name,
            'seeded_test_account', TRUE,
            -- Recorded here only because profiles has no grade_level column.
            -- Nothing in the app reads this; it is a note to your future self.
            'seed_grade_level', 'Grade ' || v_grades[g]::TEXT,
            'seed_subject', v_dept
          ),
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
  END LOOP;

  RAISE NOTICE 'Teacher seed complete — % created, % already existed. Password for all: %',
    v_created, v_existing, v_password;
END $$;


-- ============================================
-- VERIFICATION — run these after the block above and read every result.
-- Queries 2, 3 and 5 must return ZERO rows.
--
-- These count EVERY teacher%@example.com address, which includes the four
-- from phase4-04. Expect 52 unless you ran that delete first, in which
-- case expect 48.
-- ============================================

-- 1. Headline counts. All three numbers must agree (48, or 52 with the old four).
SELECT
  (SELECT COUNT(*) FROM auth.users      WHERE email LIKE 'teacher%@example.com') AS auth_users,
  (SELECT COUNT(*) FROM auth.identities WHERE identity_data->>'email' LIKE 'teacher%@example.com') AS identities,
  (SELECT COUNT(*) FROM profiles        WHERE email LIKE 'teacher%@example.com') AS profiles;

-- 2. A missing row, a wrong role, or an account that cannot log in.
--    Expect ZERO rows. Re-running the block above repairs the first two.
--    No identity -> the account exists and looks perfectly fine in the
--                   dashboard, and login fails anyway.
--    Wrong role  -> every teacher RLS policy and route guard reads
--                   profiles.role, so a student-roled account would land on
--                   the student dashboard instead.
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
--    which would drag a teacher into student-facing queries.
SELECT p.email, s.lrn, s.student_number
FROM profiles p
JOIN students s ON s.id = p.id
WHERE p.email LIKE 'teacher%@example.com';

-- 4. The grid: every subject should show exactly 6, one per grade level.
SELECT p.department, COUNT(*) AS teachers
FROM profiles p
WHERE p.email LIKE 'teacher.%@example.com'
GROUP BY p.department
ORDER BY p.department;

-- 5. Any subject or grade level with no teacher, or with more than one.
--    Expect ZERO rows. Catches a shifted pairing between the three arrays,
--    which would otherwise be invisible: every account would still be created,
--    just under the wrong subject.
SELECT department, grade_level, COUNT(*) AS n
FROM (
  SELECT p.department,
    'Grade ' || regexp_replace(split_part(p.email, '@', 1), '^teacher\.[a-z]+', '') AS grade_level
  FROM profiles p
  WHERE p.email LIKE 'teacher.%@example.com'
) x
GROUP BY department, grade_level
HAVING COUNT(*) <> 1
ORDER BY department, grade_level;

-- 6. Proof the seed stayed inert: all 48 teach nothing and advise nobody
--    until you assign it. Expect 0 and 0 before you do.
SELECT
  (SELECT COUNT(*) FROM schedules sch JOIN profiles p ON p.id = sch.teacher_id
    WHERE p.email LIKE 'teacher%@example.com')       AS scheduled_classes,
  (SELECT COUNT(*) FROM sections sec JOIN profiles p ON p.id = sec.adviser_id
    WHERE p.email LIKE 'teacher%@example.com')       AS advisory_sections;

-- 7. The full roster, grouped by subject then grade, for assigning schedules.
SELECT p.department AS subject,
  'Grade ' || regexp_replace(split_part(p.email, '@', 1), '^teacher\.[a-z]+', '') AS grade_level,
  p.name, p.email
FROM profiles p
WHERE p.email LIKE 'teacher.%@example.com'
ORDER BY p.department,
  regexp_replace(split_part(p.email, '@', 1), '^teacher\.[a-z]+', '')::INT;


-- ============================================
-- CLEANUP — when testing is over.
-- Left commented out deliberately: this is irreversible, and an accidental
-- Run All on this file should not delete the population it just built.
-- Uncomment, select just the line you want, and run it.
--
-- Deleting the auth.users row is enough on its own. profiles.id and
-- auth.identities.user_id are both ON DELETE CASCADE off auth.users.
--
-- Know what else follows a teacher out the door: sections.adviser_id is ON
-- DELETE SET NULL, so an advisory section survives without an adviser — but
-- schedules.teacher_id and worksheets.teacher_id are ON DELETE CASCADE, so
-- every class schedule and every task they created goes with them, and so
-- does every student submission made against those tasks.
-- ============================================

-- The 48 from this file:
-- DELETE FROM auth.users WHERE email LIKE 'teacher.%@example.com';

-- The four superseded ones from phase4-04:
-- DELETE FROM auth.users WHERE email IN (
--   'teacher01@example.com','teacher02@example.com',
--   'teacher03@example.com','teacher04@example.com');
