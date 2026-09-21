-- ============================================
-- PHASE 4 / 01 — News post expiry
--
-- A news post can now carry an optional expiry date. Once that date has
-- passed, the post should disappear from the news page on its own.
--
-- This project has no backend — the browser talks straight to Supabase, and
-- nothing of theirs runs server-side, so there is no scheduled job that
-- could delete or unpublish a post at midnight. It does not need one:
-- expiry is enforced by filtering on read. Every reader query excludes rows
-- whose expires_at has passed (while still including every row where
-- expires_at IS NULL, which is the normal, non-expiring case). From the
-- reader's side the post vanishes on its own the day after it expires; from
-- the system's side nothing has to be running, and the row itself is left
-- untouched so an admin can still see it, extend it, or delete it.
--
-- expires_at is nullable because it is the exception, not the rule — most
-- news never expires, and an existing row with no value must keep behaving
-- exactly as it does today (visible until archived by hand, same as before
-- this migration).
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

ALTER TABLE news ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- ============================================
-- VERIFY — expect one row: news / expires_at / nullable.
-- ============================================
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'news' AND column_name = 'expires_at';
