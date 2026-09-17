-- ============================================
-- PHASE 1 / 04 — Section names are unique per school year, not globally
--
-- `sections.name` was created with a global UNIQUE constraint (see
-- database-schema.sql). That means "7-Rizal" can only ever exist once in the
-- whole table — so once the 2025-2026 section "7-Rizal" exists, the registrar
-- can never create a 2026-2027 "7-Rizal", even though last year's section is
-- long since archived by school year. That directly contradicts the yearly
-- rollover this system promises: section names are meant to repeat every
-- school year, not be permanently claimed by whichever year used them first.
--
-- The fix: drop the global UNIQUE(name) and replace it with
-- UNIQUE(name, school_year), so a name can be reused across years but still
-- can't collide twice within the same year.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================

-- Drop the global unique constraint on name, whatever it happens to be named.
-- Postgres auto-names a single-column UNIQUE constraint "<table>_<column>_key"
-- by default (sections_name_key here), but this looks it up by shape instead
-- of assuming that name, so it also works if it was ever renamed.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'sections'
    AND con.contype = 'u'
    AND con.conkey = (
      SELECT ARRAY[attnum]
      FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'name'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sections DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Add the per-year uniqueness instead. Idempotent: skipped if it already
-- exists (e.g. this script is run twice).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sections_name_school_year_key'
  ) THEN
    ALTER TABLE sections ADD CONSTRAINT sections_name_school_year_key UNIQUE (name, school_year);
  END IF;
END $$;

-- ============================================
-- VERIFY
-- ============================================
-- Expect one row named sections_name_school_year_key, UNIQUE, over
-- (name, school_year) — and no remaining single-column UNIQUE on name alone.
SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'sections' AND con.contype = 'u';

-- Sanity check: this should now succeed (or fail only on a genuine same-year
-- duplicate), where before it would have failed against any prior year's use
-- of the same name.
-- INSERT INTO sections (name, grade_level, school_year) VALUES ('7-Rizal', 'Grade 7', '2026-2027');
