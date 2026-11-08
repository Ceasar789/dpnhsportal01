-- Undoes auto-score-submission.sql: removes the trigger, the scorer and its
-- helpers, and restores guard_worksheet_submission_write exactly as
-- phase3-02-task-rls.sql wrote it. Safe to run twice.
--
-- It deliberately KEEPS worksheet_provisional_marks and the two essay-rule columns
-- on worksheet_items: they may hold a teacher's essay rules and marks waiting for
-- review, and dropping them would lose that silently. To remove them too, run the
-- commented block at the end yourself; it refuses while either holds data.
-- Scores already released by the scorer stay released: they are ordinary
-- released submissions, exactly as if the teacher had released them.
BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'auto_score_rollback_requires_postgres';
  END IF;
END $$;

-- The guard below is copied without a schema prefix, exactly as phase3-02 wrote it.
SET LOCAL search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_auto_score_on_submit ON public.worksheet_submissions;
DROP FUNCTION IF EXISTS public.eduscribe_auto_score_on_submit_v1();
DROP FUNCTION IF EXISTS public.eduscribe_auto_score_submission_v1(uuid);
DROP FUNCTION IF EXISTS public.eduscribe_score_item_v1(text, numeric, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.eduscribe_essay_sentence_count_v1(text);
DROP FUNCTION IF EXISTS public.eduscribe_essay_word_count_v1(text);
DROP FUNCTION IF EXISTS public.eduscribe_json_list_v1(jsonb);
DROP FUNCTION IF EXISTS public.eduscribe_json_text_v1(jsonb);
DROP FUNCTION IF EXISTS public.eduscribe_comparable_answer_v1(text);
DROP FUNCTION IF EXISTS public.eduscribe_normalize_answer_v1(text);

-- The guard as phase3-02-task-rls.sql defines it, without the scorer exemption.
CREATE OR REPLACE FUNCTION guard_worksheet_submission_write()
RETURNS TRIGGER AS $$
DECLARE
  v_due TIMESTAMP;
BEGIN
  -- auth.uid() IS NULL means this write did not come through a user session
  -- at all (Supabase SQL Editor, service role, seed/migration scripts) — it
  -- is not a student bypass, so let it through unguarded.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_admin() OR teacher_owns_worksheet(NEW.worksheet_id) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.remarks IS NOT NULL
       OR NEW.status <> 'in_progress'
       OR NEW.source <> 'online' THEN
      RAISE EXCEPTION 'Students may only start a submission, not create a finished one';
    END IF;
    NEW.submitted_at := NULL;
    -- Pinned false at creation, same reasoning as submitted_at above: the
    -- client must never be the one deciding lateness, not even by omission.
    NEW.is_late := FALSE;
    RETURN NEW;
  END IF;

  -- From here on TG_OP = 'UPDATE'.
  IF NEW.score        IS DISTINCT FROM OLD.score
     OR NEW.total_points IS DISTINCT FROM OLD.total_points
     OR NEW.released     IS DISTINCT FROM OLD.released
     OR NEW.checked_by   IS DISTINCT FROM OLD.checked_by
     OR NEW.checked_at   IS DISTINCT FROM OLD.checked_at THEN
    RAISE EXCEPTION 'Only the worksheet owner may set scoring fields';
  END IF;

  IF NEW.remarks      IS DISTINCT FROM OLD.remarks
     OR NEW.source       IS DISTINCT FROM OLD.source
     OR NEW.worksheet_id IS DISTINCT FROM OLD.worksheet_id
     OR NEW.section_id   IS DISTINCT FROM OLD.section_id THEN
    RAISE EXCEPTION 'Students may not change these fields on their submission';
  END IF;

  -- Status may only move in_progress -> in_progress (no-op), in_progress ->
  -- submitted (server sets submitted_at and stamps is_late), or submitted ->
  -- submitted (no-op). Anything else, including submitted -> in_progress, is
  -- rejected.
  IF OLD.status = 'in_progress' AND NEW.status = 'submitted' THEN
    -- Same Manila conversion as is_late below, and for the same reason: this
    -- assigns a timestamptz into a naive TIMESTAMP column, and leaving it as
    -- NOW() would store it in the session's zone (UTC on Supabase) while
    -- due_at/is_late are in Manila wall-clock time. Without this, a teacher
    -- could see a submitted_at that reads hours *before* the deadline sitting
    -- next to is_late = TRUE, which looks like the lateness flag is the bug.
    --
    -- Reminder for the next person: this repo's TIMESTAMP columns are mixed.
    -- due_at, is_late and now submitted_at are Manila wall-clock. But
    -- task_assignees.assigned_at, worksheet_sections.posted_at, and — on
    -- this very row — worksheet_submissions.created_at and .updated_at still
    -- default to CURRENT_TIMESTAMP, which is UTC wall-clock. created_at in
    -- particular sits right next to the now-Manila submitted_at: a
    -- submission started at 01:00 and submitted at 01:30 Manila time will
    -- show created_at from the previous afternoon (UTC) beside
    -- submitted_at = 01:30, making a 30-minute gap look like eight and a
    -- half hours. None of these were touched in this round and are NOT
    -- comparable to due_at/submitted_at/is_late without the same AT TIME
    -- ZONE conversion.
    NEW.submitted_at := (NOW() AT TIME ZONE 'Asia/Manila');
    SELECT due_at INTO v_due FROM task_assignees
      WHERE task_id = NEW.worksheet_id AND student_id = NEW.student_id;
    -- due_at is a naive TIMESTAMP holding the school's local wall-clock time
    -- (taskFormatting.js's combineDateAndTime writes it with no offset), but
    -- NOW() is timestamptz. Comparing them directly lets Postgres coerce
    -- due_at using the session's TimeZone setting, which on Supabase is UTC
    -- — not the school's, which is Asia/Manila (UTC+8). That silently reads
    -- up to 8 hours of genuinely-late submissions as on-time. Converting
    -- NOW() into the same Asia/Manila wall-clock space the column stores
    -- fixes that without depending on a session setting nobody will check.
    NEW.is_late := (v_due IS NOT NULL AND (NOW() AT TIME ZONE 'Asia/Manila') > v_due);
  ELSIF (OLD.status = 'in_progress' AND NEW.status = 'in_progress')
     OR (OLD.status = 'submitted'   AND NEW.status = 'submitted') THEN
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Students may not set their own submission time';
    END IF;
    NEW.is_late := OLD.is_late;
  ELSE
    RAISE EXCEPTION 'Students may not move a submission from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.released IS DISTINCT FROM FALSE
     OR NEW.score IS NOT NULL OR NEW.total_points IS NOT NULL
     OR NEW.checked_by IS NOT NULL OR NEW.checked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Students may not score or release their own submission';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Optional, run separately and only on purpose. It refuses while the table or
-- the columns hold anything, so nothing is lost by accident.
-- BEGIN;
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.worksheet_provisional_marks) THEN
--     RAISE EXCEPTION 'worksheet_provisional_marks still has rows; nothing was dropped';
--   END IF;
--   IF EXISTS (SELECT 1 FROM public.worksheet_items
--       WHERE essay_min_sentences IS NOT NULL OR essay_min_words IS NOT NULL) THEN
--     RAISE EXCEPTION 'Some essay items still have a rule; nothing was dropped';
--   END IF;
-- END $$;
-- DROP TABLE IF EXISTS public.worksheet_provisional_marks;
-- ALTER TABLE public.worksheet_items DROP CONSTRAINT IF EXISTS worksheet_items_essay_min_sentences_check;
-- ALTER TABLE public.worksheet_items DROP CONSTRAINT IF EXISTS worksheet_items_essay_min_words_check;
-- ALTER TABLE public.worksheet_items DROP COLUMN IF EXISTS essay_min_sentences;
-- ALTER TABLE public.worksheet_items DROP COLUMN IF EXISTS essay_min_words;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
