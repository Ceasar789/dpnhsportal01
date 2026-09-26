-- ============================================
-- PHASE 1 / 02 — Link existing tables to the subjects registry
--
-- schedules.subject is currently NOT NULL free text. Any existing rows must be
-- matched to a subject before the constraint is relaxed, or the migration
-- leaves rows that satisfy neither the old nor the new rule.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

ALTER TABLE schedules     ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);
ALTER TABLE lesson_plans  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);
ALTER TABLE worksheets    ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id);

-- Best-effort backfill for any rows that already exist. Matches on the exact
-- name or the code, case-insensitively.
UPDATE schedules s SET subject_id = sub.id
FROM subjects sub
WHERE s.subject_id IS NULL
  AND (LOWER(TRIM(s.subject)) = LOWER(sub.name) OR LOWER(TRIM(s.subject)) = LOWER(sub.code));

UPDATE lesson_plans lp SET subject_id = sub.id
FROM subjects sub
WHERE lp.subject_id IS NULL
  AND (LOWER(TRIM(lp.subject)) = LOWER(sub.name) OR LOWER(TRIM(lp.subject)) = LOWER(sub.code));

UPDATE worksheets w SET subject_id = sub.id
FROM subjects sub
WHERE w.subject_id IS NULL
  AND (LOWER(TRIM(w.subject)) = LOWER(sub.name) OR LOWER(TRIM(w.subject)) = LOWER(sub.code));

-- Only now is it safe to stop requiring the legacy text column.
ALTER TABLE schedules ALTER COLUMN subject DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_teacher    ON schedules(teacher_id, school_year);
CREATE INDEX IF NOT EXISTS idx_schedules_section    ON schedules(section_id);

-- ============================================
-- VERIFY — any row listed here has a subject name that matched nothing in the
-- registry and needs to be fixed by hand.
-- ============================================
SELECT 'schedules' AS source, id, subject FROM schedules    WHERE subject_id IS NULL AND subject IS NOT NULL
UNION ALL
SELECT 'lesson_plans',        id, subject FROM lesson_plans WHERE subject_id IS NULL AND subject IS NOT NULL
UNION ALL
SELECT 'worksheets',          id, subject FROM worksheets   WHERE subject_id IS NULL AND subject IS NOT NULL;
