-- ============================================
-- Verification for archives/seed-test-students.mjs
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Read every result. Queries 2-4 are the ones that matter: each looks for a
-- specific way the seed can be half-finished, and each must return ZERO rows.
--
-- A seeded student needs THREE rows to be fully usable:
--   auth.users   — so they can log in
--   profiles     — so they appear in the admin's User Management
--   students     — so they can be enrolled at all (section_students.student_id
--                  REFERENCES students(id); no students row, no section)
-- A student missing only the third looks completely normal in User Management
-- and then simply cannot be added to a section, with nothing explaining why.
-- ============================================

-- 1. Headline counts. All three numbers must read 60.
SELECT
  (SELECT COUNT(*) FROM auth.users WHERE email LIKE 'student%@example.com') AS auth_users,
  (SELECT COUNT(*) FROM profiles  WHERE email LIKE 'student%@example.com') AS profiles,
  (SELECT COUNT(*) FROM students s
     JOIN profiles p ON p.id = s.id
   WHERE p.email LIKE 'student%@example.com')                              AS students;

-- 2. Auth users with no profile, or a profile with no students row.
--    Expect ZERO rows. Re-running the seed script repairs these.
SELECT
  u.email,
  (p.id IS NOT NULL) AS has_profile,
  (s.id IS NOT NULL) AS has_student_row
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN students s ON s.id = u.id
WHERE u.email LIKE 'student%@example.com'
  AND (p.id IS NULL OR s.id IS NULL)
ORDER BY u.email;

-- 3. Accounts that cannot log in — never confirmed, so Supabase refuses them.
--    Expect ZERO rows. The script passes email_confirm:true; a row here means
--    that account was created some other way.
SELECT email, created_at
FROM auth.users
WHERE email LIKE 'student%@example.com'
  AND email_confirmed_at IS NULL
ORDER BY email;

-- 4. Anything wrong with the seeded rows themselves.
--    Expect ZERO rows. Catches a bad role (they must all be plain 'student',
--    never staff), a non-active status, a missing or malformed LRN, and a
--    duplicate LRN shared between two students.
SELECT p.email, p.role, p.status, s.lrn, s.student_number,
  CASE
    WHEN p.role <> 'student'                THEN 'role is not student'
    WHEN p.status <> 'active'               THEN 'status is not active'
    WHEN s.lrn IS NULL                      THEN 'no LRN'
    WHEN s.lrn !~ '^[0-9]{12}$'             THEN 'LRN is not 12 digits'
    ELSE 'LRN shared with another student'
  END AS problem
FROM profiles p
LEFT JOIN students s ON s.id = p.id
WHERE p.email LIKE 'student%@example.com'
  AND (
    p.role <> 'student'
    OR p.status <> 'active'
    OR s.lrn IS NULL
    OR s.lrn !~ '^[0-9]{12}$'
    OR EXISTS (SELECT 1 FROM students s2 WHERE s2.lrn = s.lrn AND s2.id <> s.id)
  )
ORDER BY p.email;

-- 5. Proof the seed stayed inert: no dummy has been enrolled anywhere.
--    Expect 0 BEFORE you assign sections by hand, and 60 after.
SELECT COUNT(*) AS enrolled_dummies
FROM section_students ss
JOIN profiles p ON p.id = ss.student_id
WHERE p.email LIKE 'student%@example.com';

-- 6. The roster, in block order, for assigning sections by hand.
--    Block A = student01-20, Block B = student21-40, Block C = student41-60.
SELECT
  CASE
    WHEN RIGHT(LEFT(p.email, 9), 2)::INT <= 20 THEN 'A'
    WHEN RIGHT(LEFT(p.email, 9), 2)::INT <= 40 THEN 'B'
    ELSE 'C'
  END AS block,
  p.email, p.name, s.lrn, s.student_number
FROM profiles p
LEFT JOIN students s ON s.id = p.id
WHERE p.email LIKE 'student%@example.com'
ORDER BY p.email;
