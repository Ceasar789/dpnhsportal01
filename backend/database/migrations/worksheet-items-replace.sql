-- Atomic replace of one worksheet's questions and answer key.
-- Apply after phase2-01/02/05, auto-score-submission.sql and the task tables,
-- then run worksheet-items-replace.selftest.sql. Run as postgres.
--
-- Today saveItems (useWorksheetAssessment.jsx) deletes the items, inserts the
-- items, inserts the keys and updates worksheets.items as four separate client
-- writes. A failure after the delete leaves the worksheet with no questions and
-- a stale count. This function does all four in one transaction.
--
-- SECURITY INVOKER: it runs as the caller, so the existing RLS (owner or admin
-- on worksheets, worksheet_items and worksheet_item_keys) and the
-- guard_worksheet_item_delete trigger still apply to every statement. It adds
-- two refusals the client could not make atomic: a distributed worksheet and
-- one with student work. Error text is a stable code the client maps to a message.
BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'worksheet_items_replace_requires_postgres';
  END IF;

  SELECT pg_catalog.string_agg(e.object_name, ', ') INTO v_missing
    FROM (VALUES ('public.worksheets'), ('public.worksheet_items'),
      ('public.worksheet_item_keys'), ('public.task_assignees'),
      ('public.worksheet_submissions'), ('public.worksheet_answers')) AS e(object_name)
    WHERE pg_catalog.to_regclass(e.object_name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'worksheet_items_replace_missing_tables: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.signature, ', ') INTO v_missing
    FROM (VALUES ('auth.uid()'), ('public.is_admin()'),
      ('public.teacher_owns_worksheet(uuid)')) AS e(signature)
    WHERE pg_catalog.to_regprocedure(e.signature) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'worksheet_items_replace_missing_functions: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.role_name, ', ') INTO v_missing
    FROM (VALUES ('authenticated'), ('anon'), ('service_role')) AS e(role_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = e.role_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'worksheet_items_replace_missing_roles: %', v_missing;
  END IF;

  -- The columns this function writes, with the types its casts assume.
  SELECT pg_catalog.string_agg(e.table_name || '.' || e.column_name, ', ') INTO v_missing
    FROM (VALUES
      ('worksheets', 'id', 'uuid'), ('worksheets', 'teacher_id', 'uuid'),
      ('worksheets', 'items', 'integer'),
      ('worksheet_items', 'id', 'uuid'), ('worksheet_items', 'worksheet_id', 'uuid'),
      ('worksheet_items', 'position', 'integer'), ('worksheet_items', 'question', 'text'),
      ('worksheet_items', 'item_type', 'character varying'), ('worksheet_items', 'options', 'jsonb'),
      ('worksheet_items', 'points', 'numeric'),
      ('worksheet_items', 'essay_min_sentences', 'smallint'),
      ('worksheet_items', 'essay_min_words', 'smallint'),
      ('worksheet_item_keys', 'item_id', 'uuid'), ('worksheet_item_keys', 'correct_answer', 'jsonb'),
      ('task_assignees', 'task_id', 'uuid'),
      ('worksheet_submissions', 'id', 'uuid'), ('worksheet_submissions', 'worksheet_id', 'uuid'),
      ('worksheet_submissions', 'status', 'character varying'),
      ('worksheet_answers', 'submission_id', 'uuid')) AS e(table_name, column_name, data_type)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = e.table_name
        AND c.column_name = e.column_name AND c.data_type = e.data_type);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'worksheet_items_replace_column_mismatch: %', v_missing;
  END IF;

  -- Positions must stay unique per worksheet.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      WHERE i.indrelid = 'public.worksheet_items'::regclass
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts = 2
        AND ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) AS k(attnum)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY 1) = ARRAY['position', 'worksheet_id']) THEN
    RAISE EXCEPTION 'worksheet_items_replace_missing_unique: worksheet_items(worksheet_id, position)';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.eduscribe_worksheet_items_replace_v1(
  p_worksheet_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_locked uuid;
  v_item jsonb;
  v_type text;
  v_options jsonb;
  v_key jsonb;
  v_min_sentences jsonb;
  v_min_words jsonb;
  v_number numeric;
  v_count integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- The same owner/admin helpers the RLS uses. The row lock makes two saves of
  -- one worksheet (two tabs) run one after the other.
  SELECT w.id INTO v_locked FROM public.worksheets w
    WHERE w.id = p_worksheet_id
      AND (public.teacher_owns_worksheet(w.id) OR public.is_admin())
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = p_worksheet_id) THEN
    RAISE EXCEPTION 'distributed';
  END IF;

  -- An in_progress submission with no answer does not block (a student only
  -- opened it); an answer or a finished submission does.
  IF EXISTS (SELECT 1 FROM public.worksheet_submissions s
      WHERE s.worksheet_id = p_worksheet_id
        AND (s.status <> 'in_progress'
          OR EXISTS (SELECT 1 FROM public.worksheet_answers a WHERE a.submission_id = s.id))) THEN
    RAISE EXCEPTION 'student_work_exists';
  END IF;

  -- Validation mirrors QuestionBuilderModal's submit rules and the table checks.
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_items) AS e(value) LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(v_item->'question') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(v_item->'item_type') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(v_item->'points') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;
    IF (v_item->>'question') ~ '^[[:space:]]*$' THEN RAISE EXCEPTION 'invalid_items'; END IF;
    v_type := v_item->>'item_type';
    IF v_type NOT IN ('multiple_choice', 'true_false', 'identification', 'enumeration', 'essay') THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;
    v_number := (v_item->>'points')::numeric;
    IF v_number < 0 OR pg_catalog.round(v_number, 2) > 9999.99 THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;

    -- A JSON null and a missing field mean the same thing.
    v_options := v_item->'options';
    IF pg_catalog.jsonb_typeof(v_options) = 'null' THEN v_options := NULL; END IF;
    v_key := v_item->'correct_answer';
    IF pg_catalog.jsonb_typeof(v_key) = 'null' THEN v_key := NULL; END IF;
    v_min_sentences := v_item->'essay_min_sentences';
    IF pg_catalog.jsonb_typeof(v_min_sentences) = 'null' THEN v_min_sentences := NULL; END IF;
    v_min_words := v_item->'essay_min_words';
    IF pg_catalog.jsonb_typeof(v_min_words) = 'null' THEN v_min_words := NULL; END IF;

    IF v_options IS NOT NULL AND (pg_catalog.jsonb_typeof(v_options) <> 'array'
        OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_options) AS o(value)
          WHERE pg_catalog.jsonb_typeof(o.value) <> 'string')) THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;

    IF v_type = 'essay' THEN
      IF v_key IS NOT NULL THEN RAISE EXCEPTION 'invalid_items'; END IF;
      IF v_min_sentences IS NOT NULL THEN
        IF pg_catalog.jsonb_typeof(v_min_sentences) <> 'number' THEN RAISE EXCEPTION 'invalid_items'; END IF;
        v_number := (v_min_sentences #>> '{}')::numeric;
        IF v_number <> pg_catalog.trunc(v_number) OR v_number < 1 OR v_number > 50 THEN
          RAISE EXCEPTION 'invalid_items';
        END IF;
      END IF;
      IF v_min_words IS NOT NULL THEN
        IF pg_catalog.jsonb_typeof(v_min_words) <> 'number' THEN RAISE EXCEPTION 'invalid_items'; END IF;
        v_number := (v_min_words #>> '{}')::numeric;
        IF v_number <> pg_catalog.trunc(v_number) OR v_number < 1 OR v_number > 2000 THEN
          RAISE EXCEPTION 'invalid_items';
        END IF;
      END IF;
    ELSE
      IF v_key IS NULL OR v_min_sentences IS NOT NULL OR v_min_words IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_items';
      END IF;
      IF v_type = 'multiple_choice' THEN
        -- At least one non-blank choice, and the key is exactly one of them.
        IF v_options IS NULL OR pg_catalog.jsonb_array_length(v_options) = 0
            OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_options) AS o(value)
              WHERE o.value ~ '^[[:space:]]*$')
            OR pg_catalog.jsonb_typeof(v_key) <> 'string'
            OR NOT v_options @> pg_catalog.jsonb_build_array(v_key) THEN
          RAISE EXCEPTION 'invalid_items';
        END IF;
      ELSIF v_type = 'true_false' THEN
        IF pg_catalog.jsonb_typeof(v_key) <> 'string' OR (v_key #>> '{}') ~ '^[[:space:]]*$' THEN
          RAISE EXCEPTION 'invalid_items';
        END IF;
      ELSE
        -- identification and enumeration: a non-empty list of non-blank answers.
        IF pg_catalog.jsonb_typeof(v_key) <> 'array' OR pg_catalog.jsonb_array_length(v_key) = 0
            OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_key) AS k(value)
              WHERE pg_catalog.jsonb_typeof(k.value) <> 'string' OR (k.value #>> '{}') ~ '^[[:space:]]*$') THEN
          RAISE EXCEPTION 'invalid_items';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Old items go first (UNIQUE(worksheet_id, position)); their keys cascade.
  DELETE FROM public.worksheet_items i WHERE i.worksheet_id = p_worksheet_id;

  v_count := pg_catalog.jsonb_array_length(p_items);
  IF v_count > 0 THEN
    -- Positions start at 1, as saveItems wrote them.
    INSERT INTO public.worksheet_items (worksheet_id, position, question, item_type,
        options, points, essay_min_sentences, essay_min_words)
    SELECT p_worksheet_id, e.ordinality::integer, e.value->>'question', e.value->>'item_type',
      CASE WHEN pg_catalog.jsonb_typeof(e.value->'options') = 'array'
          AND pg_catalog.jsonb_array_length(e.value->'options') > 0 THEN e.value->'options' END,
      (e.value->>'points')::numeric,
      CASE WHEN e.value->>'item_type' = 'essay'
          AND pg_catalog.jsonb_typeof(e.value->'essay_min_sentences') = 'number'
        THEN (e.value->>'essay_min_sentences')::numeric::smallint END,
      CASE WHEN e.value->>'item_type' = 'essay'
          AND pg_catalog.jsonb_typeof(e.value->'essay_min_words') = 'number'
        THEN (e.value->>'essay_min_words')::numeric::smallint END
    FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality);

    -- A separate statement, so the key policy (teacher_owns_item) sees the new items.
    INSERT INTO public.worksheet_item_keys (item_id, correct_answer)
    SELECT i.id, e.value->'correct_answer'
    FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality)
    JOIN public.worksheet_items i
      ON i.worksheet_id = p_worksheet_id AND i.position = e.ordinality::integer
    WHERE e.value->>'item_type' <> 'essay';
  END IF;

  UPDATE public.worksheets SET items = v_count WHERE id = p_worksheet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'worksheetId', p_worksheet_id, 'count', v_count);
END
$fn$;

ALTER FUNCTION public.eduscribe_worksheet_items_replace_v1(uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_worksheet_items_replace_v1(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_worksheet_items_replace_v1(uuid, jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
