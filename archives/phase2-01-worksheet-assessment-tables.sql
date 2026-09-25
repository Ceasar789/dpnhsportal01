-- ============================================
-- PHASE 2 / 01 — Worksheet assessment tables
--
-- Gives worksheets due dates, questions, answers and scores. The answer key
-- is deliberately NOT a column on worksheet_items: a student has to be able
-- to read the question, and any row they can read they can read entirely,
-- key included. Splitting it into worksheet_item_keys lets RLS deny students
-- the key while still serving them the question.
--
-- checking_mode defaults to 'manual' because the dangerous failure is an
-- auto-checker marking a WRONG answer correct — that looks right on the
-- review screen and slips through, whereas a correct answer marked wrong is
-- obvious and gets fixed. Auto-check is opted into, not inherited.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

ALTER TABLE worksheets ADD COLUMN IF NOT EXISTS checking_mode VARCHAR(10) NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'worksheets_checking_mode_check'
      AND conrelid = 'worksheets'::regclass
  ) THEN
    ALTER TABLE worksheets ADD CONSTRAINT worksheets_checking_mode_check
      CHECK (checking_mode IN ('auto', 'manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS worksheet_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  due_at       TIMESTAMP,
  posted_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, section_id)
);

CREATE TABLE IF NOT EXISTS worksheet_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  position     INT NOT NULL,
  question     TEXT NOT NULL,
  item_type    VARCHAR(20) NOT NULL
               CHECK (item_type IN ('multiple_choice','true_false','identification','enumeration','essay')),
  options      JSONB,
  points       DECIMAL(6,2) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, position)
);

-- Students never read this table. See the banner above.
CREATE TABLE IF NOT EXISTS worksheet_item_keys (
  item_id        UUID PRIMARY KEY REFERENCES worksheet_items(id) ON DELETE CASCADE,
  correct_answer JSONB
);

CREATE TABLE IF NOT EXISTS worksheet_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worksheet_id UUID NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  source       VARCHAR(10) NOT NULL DEFAULT 'online' CHECK (source IN ('online','manual')),
  status       VARCHAR(15) NOT NULL DEFAULT 'in_progress'
               CHECK (status IN ('in_progress','submitted','checked')),
  -- The student sees nothing until a teacher has reviewed and released it.
  released     BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMP,
  score        DECIMAL(6,2),
  total_points DECIMAL(6,2),
  remarks      TEXT,
  checked_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, student_id)
);

CREATE TABLE IF NOT EXISTS worksheet_answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES worksheet_submissions(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES worksheet_items(id) ON DELETE CASCADE,
  answer        JSONB,
  is_correct    BOOLEAN,
  points_earned DECIMAL(6,2),
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_worksheet_sections_section ON worksheet_sections(section_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_items_worksheet  ON worksheet_items(worksheet_id, position);
CREATE INDEX IF NOT EXISTS idx_worksheet_subs_student     ON worksheet_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_subs_worksheet   ON worksheet_submissions(worksheet_id);
CREATE INDEX IF NOT EXISTS idx_worksheet_answers_sub      ON worksheet_answers(submission_id);

-- ============================================
-- VERIFY — expect 5 rows, and checking_mode present with default 'manual'.
-- ============================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('worksheet_sections','worksheet_items','worksheet_item_keys',
                     'worksheet_submissions','worksheet_answers')
ORDER BY table_name;

SELECT column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'worksheets' AND column_name = 'checking_mode';
