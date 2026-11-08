-- Instant auto scoring when a student submits an Auto-checked worksheet.
-- Apply as postgres in the SQL editor, after phase3-02-task-rls.sql,
-- phase4-02-submit-notification.sql, worksheet-score-release.sql and
-- exam-task-type.sql. Then run auto-score-submission.selftest.sql and re-run the
-- existing selftests named in it. Safe to run twice. Undo with
-- auto-score-submission.rollback.sql.
--
-- What it adds
--  * worksheet_items.essay_min_sentences / essay_min_words: the teacher's essay rule.
--  * worksheet_provisional_marks: marks the teacher reviews before releasing. Only
--    the owning teacher and admins can read it; no client role can write it.
--  * eduscribe_auto_score_submission_v1: scores one submitted Auto worksheet.
--      no essay item   -> marks go to worksheet_answers and the score is released
--                         at once (late papers too), checked_by = the worksheet's teacher;
--      an essay item   -> provisional marks only; the paper waits for the teacher;
--                         an essay gets a provisional mark only when it has a rule;
--      a missing key row, an unknown item type, no items -> nothing; the paper waits.
--    Any error inside it is caught and logged, so the student's submit never fails.
--  * trg_auto_score_on_submit: runs the scorer in the student's own submit
--    transaction (AFTER UPDATE, in_progress -> submitted).
--  * guard_worksheet_submission_write: the phase3-02 body with ONE added early
--    return, for the scorer's own UPDATE only (see the comment inside it).
--
-- The rules are a port of frontend/src/lib/worksheetChecking.js (checkItem) and
-- frontend/src/lib/essayRule.js; frontend/src/lib/scoringVectors.json is run
-- against both (the selftest carries a generated copy of it).
--
-- Text handling depends on the database locale. lower(), \s and [[:alnum:]] follow
-- the server's LC_CTYPE. On a UTF-8 locale (the Supabase default) they agree with
-- the browser for the accented and ñ vectors; on the C locale accented letters may
-- not lowercase or count as letters. The selftest's vector check shows which.
-- Rounding of partial credit is done in double precision in the same order as the
-- browser (Math.round(x * 100) / 100), so edge values such as 0.575 round the same.
BEGIN;

DO $$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'auto_score_requires_postgres';
  END IF;
  SELECT pg_catalog.string_agg(e.object_name, ', ') INTO v_missing
    FROM (VALUES ('public.worksheets'), ('public.worksheet_items'), ('public.worksheet_item_keys'),
      ('public.worksheet_submissions'), ('public.worksheet_answers'), ('public.task_assignees'))
      AS e(object_name)
    WHERE pg_catalog.to_regclass(e.object_name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'auto_score_missing_tables: %', v_missing;
  END IF;
  SELECT pg_catalog.string_agg(e.table_name || '.' || e.column_name, ', ') INTO v_missing
    FROM (VALUES
      ('worksheets', 'teacher_id'), ('worksheets', 'checking_mode'),
      ('worksheet_items', 'worksheet_id'), ('worksheet_items', 'item_type'),
      ('worksheet_items', 'points'), ('worksheet_items', 'position'),
      ('worksheet_item_keys', 'item_id'), ('worksheet_item_keys', 'correct_answer'),
      ('worksheet_submissions', 'status'), ('worksheet_submissions', 'released'),
      ('worksheet_submissions', 'score'), ('worksheet_submissions', 'total_points'),
      ('worksheet_submissions', 'checked_by'), ('worksheet_submissions', 'checked_at'),
      ('worksheet_submissions', 'submitted_at'), ('worksheet_submissions', 'is_late'),
      ('worksheet_answers', 'answer'), ('worksheet_answers', 'points_earned'),
      ('worksheet_answers', 'is_correct')) AS e(table_name, column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = e.table_name AND c.column_name = e.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'auto_score_missing_columns: %', v_missing;
  END IF;
  -- The marks upsert needs UNIQUE(submission_id, item_id) on worksheet_answers.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      WHERE i.indrelid = 'public.worksheet_answers'::regclass
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts = 2
        AND ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) AS k(attnum)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY 1) = ARRAY['item_id', 'submission_id']) THEN
    RAISE EXCEPTION 'auto_score_missing_unique: worksheet_answers(submission_id, item_id)';
  END IF;
  IF pg_catalog.to_regprocedure('public.guard_worksheet_submission_write()') IS NULL THEN
    RAISE EXCEPTION 'auto_score_missing_guard: guard_worksheet_submission_write()';
  END IF;
  IF pg_catalog.to_regprocedure('public.is_admin()') IS NULL
      OR pg_catalog.to_regprocedure('public.teacher_owns_item(uuid)') IS NULL THEN
    RAISE EXCEPTION 'auto_score_missing_helpers: is_admin() / teacher_owns_item(uuid)';
  END IF;
END $$;

-- The guard below is copied without a schema prefix, exactly as phase3-02 wrote it.
SET LOCAL search_path = public, pg_temp;

-- a. The essay rule. Both optional; null means no minimum.
ALTER TABLE public.worksheet_items ADD COLUMN IF NOT EXISTS essay_min_sentences smallint;
ALTER TABLE public.worksheet_items ADD COLUMN IF NOT EXISTS essay_min_words smallint;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.worksheet_items'::regclass AND conname = 'worksheet_items_essay_min_sentences_check') THEN
    ALTER TABLE public.worksheet_items ADD CONSTRAINT worksheet_items_essay_min_sentences_check
      CHECK (essay_min_sentences IS NULL OR essay_min_sentences BETWEEN 1 AND 50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.worksheet_items'::regclass AND conname = 'worksheet_items_essay_min_words_check') THEN
    ALTER TABLE public.worksheet_items ADD CONSTRAINT worksheet_items_essay_min_words_check
      CHECK (essay_min_words IS NULL OR essay_min_words BETWEEN 1 AND 2000);
  END IF;
END $$;

-- b. Provisional marks. worksheet_answers is readable by the student who owns the
-- submission (ws_answers_read), so marks a teacher has not approved live here.
CREATE TABLE IF NOT EXISTS public.worksheet_provisional_marks (
  submission_id uuid NOT NULL REFERENCES public.worksheet_submissions(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.worksheet_items(id) ON DELETE CASCADE,
  points numeric(6,2) NOT NULL,
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (submission_id, item_id)
);
ALTER TABLE public.worksheet_provisional_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worksheet_provisional_marks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.worksheet_provisional_marks TO authenticated;
DROP POLICY IF EXISTS worksheet_provisional_marks_teacher_read ON public.worksheet_provisional_marks;
-- Read only, by the owning teacher or an admin. No insert, update or delete
-- policy exists for any client role: only the scorer (as postgres) writes here.
CREATE POLICY worksheet_provisional_marks_teacher_read ON public.worksheet_provisional_marks
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.teacher_owns_item(item_id));

-- c. Text helpers, ports of worksheetChecking.js and essayRule.js.
-- normalizeAnswer: trim, collapse whitespace to one space, lowercase.
CREATE OR REPLACE FUNCTION public.eduscribe_normalize_answer_v1(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(COALESCE(p_value, ''), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g'));
$fn$;

-- comparableAnswer: normalizeAnswer, then hyphen and U+2010..U+2015 become a
-- space; . , ' " ` and curly quotes/apostrophes go; spaces collapse; trim.
CREATE OR REPLACE FUNCTION public.eduscribe_comparable_answer_v1(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(public.eduscribe_normalize_answer_v1(p_value), '[-‐-―]', ' ', 'g'),
    '[.,''"`‘’“”]', '', 'g'), '\s+', ' ', 'g'), '^\s+|\s+$', '', 'g');
$fn$;

-- A stored value (jsonb) as the text String(value) gives in the browser; null stays null.
CREATE OR REPLACE FUNCTION public.eduscribe_json_text_v1(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT CASE WHEN p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) = 'null' THEN NULL
    ELSE p_value #>> '{}' END;
$fn$;

-- toList: null -> nothing, a list -> its entries in order, anything else -> one entry.
CREATE OR REPLACE FUNCTION public.eduscribe_json_list_v1(p_value jsonb)
RETURNS SETOF text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT public.eduscribe_json_text_v1(t.entry)
  FROM pg_catalog.jsonb_array_elements(CASE
      WHEN p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) = 'null' THEN '[]'::jsonb
      WHEN pg_catalog.jsonb_typeof(p_value) = 'array' THEN p_value
      ELSE pg_catalog.jsonb_build_array(p_value) END) WITH ORDINALITY AS t(entry, ord)
  ORDER BY t.ord;
$fn$;

-- essayWordCount: pieces of the trimmed text between whitespace that hold a letter or digit.
CREATE OR REPLACE FUNCTION public.eduscribe_essay_word_count_v1(p_text text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT pg_catalog.count(*)::integer
  FROM pg_catalog.regexp_split_to_table(
    pg_catalog.regexp_replace(COALESCE(p_text, ''), '^\s+|\s+$', '', 'g'), '\s+') AS w(piece)
  WHERE w.piece ~ '[[:alnum:]]';
$fn$;

-- essaySentenceCount: pieces between one or more of . ! ? … followed by whitespace
-- or the end, that hold a letter or digit. "3.5" does not split.
CREATE OR REPLACE FUNCTION public.eduscribe_essay_sentence_count_v1(p_text text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT pg_catalog.count(*)::integer
  FROM pg_catalog.regexp_split_to_table(COALESCE(p_text, ''), '[.!?…]+(?:\s+|$)') AS s(piece)
  WHERE s.piece ~ '[[:alnum:]]';
$fn$;

-- checkItem for one item. p_key is worksheet_item_keys.correct_answer (the caller
-- handles a missing key row). Essay and unknown types return nulls.
CREATE OR REPLACE FUNCTION public.eduscribe_score_item_v1(p_item_type text, p_points numeric,
  p_key jsonb, p_answer jsonb, OUT points_earned numeric, OUT is_correct boolean)
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_points numeric := COALESCE(p_points, 0);
  v_given text;
  v_correct text;
  v_expected text[];
  v_credited text[] := ARRAY[]::text[];
  v_line text;
  v_whole text;
  v_piece text;
  v_pieces text[];
BEGIN
  IF p_item_type IN ('multiple_choice', 'true_false') THEN
    v_given := public.eduscribe_normalize_answer_v1(public.eduscribe_json_text_v1(p_answer));
    v_correct := public.eduscribe_normalize_answer_v1(public.eduscribe_json_text_v1(p_key));
    is_correct := v_given <> '' AND v_given = v_correct;
    points_earned := CASE WHEN is_correct THEN v_points ELSE 0 END;
  ELSIF p_item_type = 'identification' THEN
    v_expected := ARRAY(SELECT x.c FROM (SELECT public.eduscribe_comparable_answer_v1(e) AS c
      FROM public.eduscribe_json_list_v1(p_key) AS e) x WHERE x.c <> '');
    v_given := public.eduscribe_comparable_answer_v1(public.eduscribe_json_text_v1(p_answer));
    is_correct := v_given <> '' AND v_given = ANY(v_expected);
    points_earned := CASE WHEN is_correct THEN v_points ELSE 0 END;
  ELSIF p_item_type = 'enumeration' THEN
    -- Keys keep their order and any duplicates, as the browser's list does.
    v_expected := ARRAY(SELECT x.c FROM (SELECT public.eduscribe_comparable_answer_v1(e) AS c
      FROM public.eduscribe_json_list_v1(p_key) AS e) x WHERE x.c <> '');
    IF pg_catalog.cardinality(v_expected) = 0 THEN
      points_earned := 0;
      is_correct := false;
      RETURN;
    END IF;
    FOR v_line IN SELECT public.eduscribe_normalize_answer_v1(e) FROM public.eduscribe_json_list_v1(p_answer) AS e LOOP
      CONTINUE WHEN v_line = '';
      -- A whole line that matches a key counts as that key; otherwise it is split
      -- on commas and semicolons BEFORE commas are dropped by comparableAnswer.
      v_whole := public.eduscribe_comparable_answer_v1(v_line);
      IF v_whole = ANY(v_expected) THEN
        v_pieces := ARRAY[v_whole];
      ELSE
        v_pieces := ARRAY(SELECT public.eduscribe_comparable_answer_v1(p)
          FROM pg_catalog.regexp_split_to_table(v_line, '[,;]') AS p);
      END IF;
      FOREACH v_piece IN ARRAY v_pieces LOOP
        IF v_piece = ANY(v_expected) AND NOT (v_piece = ANY(v_credited)) THEN
          v_credited := v_credited || v_piece;
        END IF;
      END LOOP;
    END LOOP;
    is_correct := pg_catalog.cardinality(v_credited) = pg_catalog.cardinality(v_expected);
    -- round2((matched / keys) * points) exactly as the browser does it: double
    -- precision, the same order of operations, and Math.round = floor(x + 0.5).
    points_earned := (pg_catalog.floor((pg_catalog.cardinality(v_credited)::float8
      / pg_catalog.cardinality(v_expected)::float8) * v_points::float8 * 100 + 0.5) / 100)::numeric;
  ELSE
    points_earned := NULL;
    is_correct := NULL;
  END IF;
END
$fn$;

-- d. The scorer.
CREATE OR REPLACE FUNCTION public.eduscribe_auto_score_submission_v1(p_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_sub record;
  v_ws record;
  v_item record;
  v_key jsonb;
  v_answer jsonb;
  v_text text;
  v_result record;
  v_met boolean;
  v_uid uuid;
  v_marks jsonb := '[]'::jsonb;
  v_has_essay boolean := false;
  v_item_count integer := 0;
  v_total numeric := 0;
  v_score numeric := 0;
BEGIN
  BEGIN
    SELECT s.id, s.worksheet_id, s.student_id, s.status, s.released, s.score
      INTO v_sub FROM public.worksheet_submissions s WHERE s.id = p_submission_id FOR UPDATE;
    -- Idempotent: only a submitted, unreleased, unscored paper with no provisional marks.
    IF NOT FOUND OR v_sub.status <> 'submitted' OR v_sub.released OR v_sub.score IS NOT NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.worksheet_provisional_marks m WHERE m.submission_id = p_submission_id) THEN RETURN; END IF;
    -- Defensive: inside a user session, only the paper's own student.
    v_uid := auth.uid();
    IF v_uid IS NOT NULL AND v_uid <> v_sub.student_id THEN RETURN; END IF;
    SELECT w.teacher_id, w.checking_mode INTO v_ws FROM public.worksheets w WHERE w.id = v_sub.worksheet_id;
    IF NOT FOUND OR v_ws.checking_mode IS DISTINCT FROM 'auto' THEN RETURN; END IF;

    FOR v_item IN SELECT i.id, i.item_type, i.points, i.essay_min_sentences, i.essay_min_words
        FROM public.worksheet_items i WHERE i.worksheet_id = v_sub.worksheet_id
        ORDER BY i.position, i.id LOOP
      v_item_count := v_item_count + 1;
      v_total := v_total + v_item.points;
      SELECT a.answer INTO v_answer FROM public.worksheet_answers a
        WHERE a.submission_id = p_submission_id AND a.item_id = v_item.id;
      IF NOT FOUND THEN v_answer := NULL; END IF;
      IF v_item.item_type = 'essay' THEN
        v_has_essay := true;
        -- An essay with no rule gets no provisional mark: it is the teacher's to score.
        CONTINUE WHEN v_item.essay_min_sentences IS NULL AND v_item.essay_min_words IS NULL;
        v_text := CASE WHEN pg_catalog.jsonb_typeof(v_answer) = 'string' THEN v_answer #>> '{}' ELSE '' END;
        v_met := (v_item.essay_min_sentences IS NULL
            OR public.eduscribe_essay_sentence_count_v1(v_text) >= v_item.essay_min_sentences)
          AND (v_item.essay_min_words IS NULL
            OR public.eduscribe_essay_word_count_v1(v_text) >= v_item.essay_min_words);
        v_marks := v_marks || pg_catalog.jsonb_build_object('item_id', v_item.id,
          'points', CASE WHEN v_met THEN v_item.points ELSE 0 END, 'is_correct', v_met, 'item_points', v_item.points);
      ELSIF v_item.item_type IN ('multiple_choice', 'true_false', 'identification', 'enumeration') THEN
        SELECT k.correct_answer INTO v_key FROM public.worksheet_item_keys k WHERE k.item_id = v_item.id;
        -- A missing key row is unscorable, never "wrong": leave the paper to the teacher.
        IF NOT FOUND THEN RETURN; END IF;
        SELECT * INTO v_result FROM public.eduscribe_score_item_v1(v_item.item_type, v_item.points, v_key, v_answer);
        IF v_result.points_earned IS NULL THEN RETURN; END IF;
        v_marks := v_marks || pg_catalog.jsonb_build_object('item_id', v_item.id,
          'points', v_result.points_earned, 'is_correct', v_result.is_correct, 'item_points', v_item.points);
        v_score := v_score + v_result.points_earned;
      ELSE
        RETURN;
      END IF;
    END LOOP;

    -- Same limits as the release function: something to score, and a total that fits.
    IF v_item_count = 0 OR v_total <= 0 OR v_total > 9999.99 THEN RETURN; END IF;

    IF v_has_essay THEN
      INSERT INTO public.worksheet_provisional_marks (submission_id, item_id, points, is_correct)
        SELECT p_submission_id, m.item_id, m.points, m.is_correct
        FROM pg_catalog.jsonb_to_recordset(v_marks) AS m(item_id uuid, points numeric, is_correct boolean)
      ON CONFLICT (submission_id, item_id) DO NOTHING;
      RETURN;
    END IF;

    -- No essay: write the marks as the release function does (is_correct = full
    -- points), then release. The guard lets this one UPDATE through only while
    -- the flag is on and the write comes from inside a trigger.
    INSERT INTO public.worksheet_answers (submission_id, item_id, answer, points_earned, is_correct, updated_at)
      SELECT p_submission_id, m.item_id, NULL, m.points, m.points = m.item_points, pg_catalog.now()
      FROM pg_catalog.jsonb_to_recordset(v_marks) AS m(item_id uuid, points numeric, item_points numeric)
    ON CONFLICT (submission_id, item_id) DO UPDATE
      SET points_earned = EXCLUDED.points_earned, is_correct = EXCLUDED.is_correct, updated_at = EXCLUDED.updated_at;

    PERFORM pg_catalog.set_config('eduscribe.auto_score', 'on', true);
    UPDATE public.worksheet_submissions
      SET status = 'checked', released = true, score = v_score, total_points = v_total,
          checked_by = v_ws.teacher_id, checked_at = pg_catalog.now(), updated_at = pg_catalog.now()
      WHERE id = p_submission_id;
    PERFORM pg_catalog.set_config('eduscribe.auto_score', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    -- The block's writes are rolled back with it; the paper stays awaiting the teacher.
    PERFORM pg_catalog.set_config('eduscribe.auto_score', 'off', true);
    RAISE WARNING 'eduscribe_auto_score_submission_v1: skipped submission %: %', p_submission_id, SQLERRM;
  END;
END
$fn$;

-- e. The submission guard: phase3-02's body with one added early return.
CREATE OR REPLACE FUNCTION guard_worksheet_submission_write()
RETURNS TRIGGER AS $$
DECLARE
  v_due TIMESTAMP;
BEGIN
  -- auto-score-submission.sql: the scorer, running inside the submit trigger,
  -- turns this transaction-local flag on around its own UPDATE of this row.
  -- pg_trigger_depth() > 1 means the write comes from inside another trigger,
  -- which a client cannot arrange, so setting the flag by hand gains nothing.
  IF pg_catalog.current_setting('eduscribe.auto_score', true) = 'on'
     AND pg_catalog.pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
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

-- f. Run the scorer when a student submits. The WHEN clause only matches
-- in_progress -> submitted; the scorer's own UPDATE moves submitted -> checked, so
-- it cannot fire this trigger again (and the notify trigger's WHEN is the same).
CREATE OR REPLACE FUNCTION public.eduscribe_auto_score_on_submit_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  BEGIN
    PERFORM public.eduscribe_auto_score_submission_v1(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'eduscribe_auto_score_on_submit_v1: failed for submission %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS trg_auto_score_on_submit ON public.worksheet_submissions;
CREATE TRIGGER trg_auto_score_on_submit
  AFTER UPDATE ON public.worksheet_submissions
  FOR EACH ROW
  WHEN (OLD.status = 'in_progress' AND NEW.status = 'submitted')
  EXECUTE FUNCTION public.eduscribe_auto_score_on_submit_v1();

-- Owners and grants. Nothing new is callable by a client role: the trigger runs
-- the scorer as postgres, and the helpers are only used inside it.
ALTER FUNCTION public.eduscribe_normalize_answer_v1(text) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_comparable_answer_v1(text) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_json_text_v1(jsonb) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_json_list_v1(jsonb) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_essay_word_count_v1(text) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_essay_sentence_count_v1(text) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_score_item_v1(text, numeric, jsonb, jsonb) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_auto_score_submission_v1(uuid) OWNER TO postgres;
ALTER FUNCTION public.eduscribe_auto_score_on_submit_v1() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_normalize_answer_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_comparable_answer_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_json_text_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_json_list_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_essay_word_count_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_essay_sentence_count_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_score_item_v1(text, numeric, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_auto_score_submission_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.eduscribe_auto_score_on_submit_v1() FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
