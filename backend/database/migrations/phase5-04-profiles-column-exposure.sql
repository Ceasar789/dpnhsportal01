-- ============================================
-- PHASE 5 / 04 — Close the profiles column exposure
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS).
-- Idempotent. Re-runnable. Run phase5-03 first.
--
-- ── What was still open ──────────────────────────────────────────────────
--
-- phase5-03 narrowed WHICH ROWS of profiles a student may read — themselves,
-- all staff, and their own classmates — and said plainly that it could not
-- narrow the COLUMNS. Row Level Security is row-level; it cannot show `name`
-- while hiding `phone`. So a student could still read any classmate's and
-- any teacher's phone number, date of birth and home address.
--
-- That is the hole this closes, and it is the one worth closing before the
-- table holds real minors' data.
--
-- ── Why there is no view here ────────────────────────────────────────────
--
-- phase5-03 proposed a view with a named column list plus a change at every
-- select('*'). Reading the application first showed that is more machinery
-- than the problem needs, because nothing a student can reach reads another
-- person's profile at all:
--
--   * The student dashboard queries five tables — worksheet_submissions,
--     worksheet_answers, worksheet_items, news, attendance. None of them is
--     profiles, and none embeds it.
--   * AuthContext reads profiles once, filtered to .eq('id', userId) — the
--     signed-in person's own row.
--   * The shared profile page reads the profile-photos bucket, not the table.
--   * News carries its author as its own column; there is no join.
--   * The three select('*') helpers in src/lib/db.js that phase5-03 was
--     counting — getProfile, getAllProfiles, getProfilesByRole — had no
--     callers anywhere. They are deleted in the same commit as this file.
--
-- Every remaining profiles read is either the caller's own row or a staff
-- screen, and staff legitimately need phone numbers to reach a parent.
--
-- So the fix is to stop students reading other people's rows at all, rather
-- than to build a view that serves nobody yet.
--
-- ── If a future screen needs a classmate's or teacher's NAME ─────────────
--
-- Do not widen this policy back. That is how the column exposure returns.
-- Add a view with a named, safe column list:
--
--   CREATE VIEW directory_profiles WITH (security_invoker = false) AS
--     SELECT id, name, role, department, photo_url FROM profiles
--     WHERE role IN ('main_admin','admin','registrar','teacher','faculty')
--        OR shares_section_with(id) OR id = auth.uid();
--   GRANT SELECT ON directory_profiles TO authenticated;
--
-- security_invoker = false is load-bearing: it is what lets the view see
-- rows the caller's own policy now denies. The view's WHERE clause is then
-- the whole access rule, so read it twice before changing it.
-- ============================================


-- ══ profiles — a student reads their own row, and nothing else ════════════
--
-- is_any_staff() is from phase5-03 and is unchanged: main_admin, admin,
-- registrar, teacher, faculty. Staff keep the full directory.
DROP POLICY IF EXISTS authenticated_users_view_profiles ON profiles;
DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()     -- your own record, in full
    OR is_any_staff()   -- staff need the directory, phone numbers included
  );

-- Writes are untouched. profiles_update_own and the guard_profile_privileges
-- trigger from fix-privilege-escalation.sql still govern them.
--
-- shares_section_with() is left in place but is now unused by any policy.
-- It is the function the view above would need, so dropping it would only
-- have to be undone.


-- ══ Verification ══════════════════════════════════════════════════════════
-- Read every row. SKIP is not PASS — it means the fixture was missing and
-- the check told you nothing.
DROP TABLE IF EXISTS profiles_col_results;
CREATE TEMP TABLE profiles_col_results (
  check_name TEXT, expected TEXT, actual TEXT, status TEXT
);

DO $$
DECLARE
  v_student_a UUID;
  v_student_b UUID;
  v_teacher   UUID;
  v_staff     UUID;
  v_n         INT;
BEGIN
  SELECT id INTO v_student_a FROM profiles WHERE role = 'student' ORDER BY email LIMIT 1;
  SELECT id INTO v_student_b FROM profiles
    WHERE role = 'student' AND id IS DISTINCT FROM v_student_a ORDER BY email LIMIT 1;
  SELECT id INTO v_teacher FROM profiles WHERE role = 'teacher' ORDER BY email LIMIT 1;
  SELECT id INTO v_staff   FROM profiles
    WHERE role IN ('main_admin', 'admin', 'registrar') ORDER BY email LIMIT 1;

  -- ── 1. The hole itself: one student reading another student's row ──────
  IF v_student_a IS NULL OR v_student_b IS NULL THEN
    INSERT INTO profiles_col_results VALUES
      ('Student cannot read another student''s profile', '0 rows',
       'two seeded students missing — run phase4-03', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_b, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM profiles WHERE id = v_student_a;
    EXECUTE 'RESET ROLE';
    INSERT INTO profiles_col_results VALUES
      ('Student cannot read another student''s profile', '0 rows', v_n || ' rows',
       CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ── 2. A teacher's home address is not a student's business ────────────
  IF v_student_a IS NULL OR v_teacher IS NULL THEN
    INSERT INTO profiles_col_results VALUES
      ('Student cannot read a teacher''s profile', '0 rows',
       'seeded student or teacher missing', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_a, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM profiles WHERE id = v_teacher;
    EXECUTE 'RESET ROLE';
    INSERT INTO profiles_col_results VALUES
      ('Student cannot read a teacher''s profile', '0 rows', v_n || ' rows',
       CASE WHEN v_n = 0 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ── 3. A student still reads their OWN row, or the app breaks ──────────
  -- AuthContext fetches it on every login; if this fails, nobody can sign in.
  IF v_student_a IS NULL THEN
    INSERT INTO profiles_col_results VALUES
      ('Student CAN read their own profile', '1 row', 'no seeded student', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_a, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM profiles WHERE id = v_student_a;
    EXECUTE 'RESET ROLE';
    INSERT INTO profiles_col_results VALUES
      ('Student CAN read their own profile', '1 row', v_n || ' rows',
       CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ── 4. Staff keep the directory, phone included ────────────────────────
  -- The registrar calls parents. Taking this away would break the office.
  IF v_staff IS NULL OR v_student_a IS NULL THEN
    INSERT INTO profiles_col_results VALUES
      ('Staff CAN still read a student''s phone', 'readable',
       'seeded staff or student missing', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM profiles WHERE id = v_student_a;
    EXECUTE 'RESET ROLE';
    INSERT INTO profiles_col_results VALUES
      ('Staff CAN still read a student''s phone', '1 row', v_n || ' rows',
       CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END);
  END IF;

  -- ── 5. A student cannot enumerate the school ───────────────────────────
  -- The count is the whole point: before this file it was every row in the
  -- table, because staff were visible to everyone and classmates besides.
  IF v_student_a IS NULL THEN
    INSERT INTO profiles_col_results VALUES
      ('Student sees exactly one profile row', '1', 'no seeded student', 'SKIP');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_student_a, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM profiles;
    EXECUTE 'RESET ROLE';
    INSERT INTO profiles_col_results VALUES
      ('Student sees exactly one profile row', '1', v_n::TEXT,
       CASE WHEN v_n = 1 THEN 'PASS' ELSE 'FAIL' END);
  END IF;
END $$;

SELECT * FROM profiles_col_results ORDER BY status DESC, check_name;
