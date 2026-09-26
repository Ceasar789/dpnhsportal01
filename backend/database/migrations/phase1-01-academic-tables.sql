-- ============================================
-- PHASE 1 / 01 — Subjects registry and teaching load
--
-- `subjects` replaces the free-text subject column used across schedules,
-- lesson_plans and worksheets. Grade level is deliberately NOT part of a
-- subject: folding it in would turn 8 rows into 32 and make the list hard to
-- maintain. Grade level lives on teacher_subjects and on sections instead.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- The teaching load: who teaches what, at which grade level, in which year.
-- A teacher holding Mathematics for Grade 7 and Grade 8 has two rows here.
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_level VARCHAR(50) NOT NULL,
  school_year VARCHAR(20) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(teacher_id, subject_id, grade_level, school_year)
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher
  ON teacher_subjects(teacher_id, school_year);

-- The eight subjects taught at this school.
INSERT INTO subjects (name, code) VALUES
  ('Mathematics',                        'MATH'),
  ('English',                            'ENG'),
  ('Science',                            'SCI'),
  ('Filipino',                           'FIL'),
  ('Araling Panlipunan',                 'AP'),
  ('Technology and Livelihood Education','TLE'),
  ('MAPEH',                              'MAPEH'),
  ('Edukasyon sa Pagpapakatao',          'ESP')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- VERIFY — expect 8 rows, and an empty teaching load.
-- ============================================
SELECT code, name FROM subjects ORDER BY name;
SELECT COUNT(*) AS teaching_load_rows FROM teacher_subjects;
