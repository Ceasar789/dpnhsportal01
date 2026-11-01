-- Restores the exact update_v1 body from dev-ai-weekly-worksheet-manage.sql.
-- CREATE OR REPLACE keeps the existing owner and EXECUTE grants.
BEGIN;
CREATE OR REPLACE FUNCTION public.eduscribe_ai_weekly_worksheets_update_v1(
  p_collection_id uuid, p_expected_revision bigint, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_user uuid := public.eduscribe_ai_uid();
  v_existing public.worksheet_collections%ROWTYPE;
  v_worksheet_id uuid;
  v_item_id uuid;
  v_day jsonb;
  v_question jsonb;
  v_section jsonb;
  v_value jsonb;
  v_private jsonb;
  v_options jsonb;
  v_key jsonb;
  v_parts text[];
  v_kind text;
  v_essay jsonb;
  v_enum jsonb;
  v_rubric jsonb;
  v_result jsonb := '[]'::jsonb;
  v_days integer[] := ARRAY[]::integer[];
  v_existing_days integer[];
  v_day_number integer;
  v_position integer;
  v_count integer;
  v_points numeric;
  v_rubric_sum numeric;
  v_revision bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;
  SELECT * INTO v_existing FROM public.worksheet_collections c
    WHERE c.id = p_collection_id AND c.teacher_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF p_expected_revision IS DISTINCT FROM v_existing.revision THEN
    RAISE EXCEPTION 'revision_conflict';
  END IF;
  PERFORM 1 FROM public.worksheets w WHERE w.collection_id = p_collection_id
    ORDER BY w.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.worksheet_sections s
      JOIN public.worksheets w ON w.id = s.worksheet_id
      WHERE w.collection_id = p_collection_id)
    OR EXISTS (SELECT 1 FROM public.task_assignees a
      JOIN public.worksheets w ON w.id = a.task_id
      WHERE w.collection_id = p_collection_id)
    OR EXISTS (SELECT 1 FROM public.worksheet_submissions s
      JOIN public.worksheets w ON w.id = s.worksheet_id
      WHERE w.collection_id = p_collection_id)
    OR EXISTS (SELECT 1 FROM public.worksheet_answers a
      JOIN public.worksheet_items i ON i.id = a.item_id
      JOIN public.worksheets w ON w.id = i.worksheet_id
      WHERE w.collection_id = p_collection_id) THEN
    RAISE EXCEPTION 'student_work_exists';
  END IF;
  IF v_existing.archived_at IS NOT NULL THEN RAISE EXCEPTION 'collection_archived'; END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
      OR pg_catalog.octet_length(p_payload::text) > 2097152
      OR NOT (p_payload ?& ARRAY['title','worksheets'])
      OR p_payload - ARRAY['title','worksheets']::text[] <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
      OR pg_catalog.char_length(p_payload->>'title') NOT BETWEEN 1 AND 255
      OR pg_catalog.btrim(p_payload->>'title') = ''
      OR pg_catalog.jsonb_typeof(p_payload->'worksheets') <> 'array'
      OR pg_catalog.jsonb_array_length(p_payload->'worksheets') NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  SELECT pg_catalog.array_agg(w.day_of_week::integer ORDER BY w.day_of_week)
    INTO v_existing_days FROM public.worksheets w WHERE w.collection_id = p_collection_id;
  IF COALESCE(pg_catalog.array_length(v_existing_days, 1), 0)
      <> pg_catalog.jsonb_array_length(p_payload->'worksheets') THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  IF EXISTS (SELECT 1 FROM public.worksheets w WHERE w.collection_id = p_collection_id
        AND (w.teacher_id <> v_user OR w.origin <> 'ai_generated' OR w.status <> 'Draft')) THEN
    RAISE EXCEPTION 'invalid_state';
  END IF;

  -- The day, section, question, key and private metadata validation below is
  -- copied from eduscribe_ai_weekly_worksheets_save_v1, with only in-place writes.
  FOR v_day IN SELECT value FROM pg_catalog.jsonb_array_elements(p_payload->'worksheets') LOOP
    IF pg_catalog.jsonb_typeof(v_day) <> 'object'
        OR NOT (v_day ?& ARRAY['day','title','instructions','sections','checkingMode','questions'])
        OR v_day - ARRAY['day','title','instructions','sections','checkingMode','questions']::text[] <> '{}'::jsonb
        OR pg_catalog.jsonb_typeof(v_day->'day') <> 'number'
        OR (v_day->>'day') !~ '^[1-5]$'
        OR pg_catalog.jsonb_typeof(v_day->'title') <> 'string'
        OR pg_catalog.char_length(v_day->>'title') NOT BETWEEN 1 AND 255
        OR pg_catalog.btrim(v_day->>'title') = ''
        OR pg_catalog.jsonb_typeof(v_day->'instructions') <> 'string'
        OR pg_catalog.char_length(v_day->>'instructions') > 2000
        OR pg_catalog.jsonb_typeof(v_day->'sections') <> 'array'
        OR pg_catalog.jsonb_array_length(v_day->'sections') NOT BETWEEN 1 AND 12
        OR pg_catalog.jsonb_typeof(v_day->'questions') <> 'array'
        OR pg_catalog.jsonb_array_length(v_day->'questions') NOT BETWEEN 1 AND 60
        OR v_day->>'checkingMode' NOT IN ('auto','manual') THEN
      RAISE EXCEPTION 'invalid_document';
    END IF;
    v_day_number := (v_day->>'day')::integer;
    IF v_day_number = ANY(v_days) THEN RAISE EXCEPTION 'invalid_document'; END IF;
    v_days := pg_catalog.array_append(v_days, v_day_number);
    v_count := pg_catalog.jsonb_array_length(v_day->'questions');

    FOR v_section IN SELECT value FROM pg_catalog.jsonb_array_elements(v_day->'sections') LOOP
      IF pg_catalog.jsonb_typeof(v_section) <> 'object'
          OR NOT (v_section ?& ARRAY['id','title','directions'])
          OR v_section - ARRAY['id','title','directions']::text[] <> '{}'::jsonb
          OR pg_catalog.jsonb_typeof(v_section->'id') <> 'string'
          OR pg_catalog.char_length(v_section->>'id') NOT BETWEEN 1 AND 128
          OR pg_catalog.jsonb_typeof(v_section->'title') <> 'string'
          OR pg_catalog.char_length(v_section->>'title') NOT BETWEEN 1 AND 120
          OR pg_catalog.btrim(v_section->>'title') = ''
          OR pg_catalog.jsonb_typeof(v_section->'directions') <> 'string'
          OR pg_catalog.char_length(v_section->>'directions') > 2000 THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(v_day->'sections') s
          WHERE s->>'id' = v_section->>'id') <> 1 THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
    END LOOP;

    SELECT w.id INTO v_worksheet_id FROM public.worksheets w
      WHERE w.collection_id = p_collection_id AND w.day_of_week = v_day_number
        AND w.teacher_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_document'; END IF;
    UPDATE public.worksheets w SET title = v_day->>'title',
      instructions = v_day->>'instructions', sections = v_day->'sections',
      checking_mode = v_day->>'checkingMode', items = v_count
      WHERE w.id = v_worksheet_id AND w.collection_id = p_collection_id
        AND w.teacher_id = v_user;
    DELETE FROM public.worksheet_items i WHERE i.worksheet_id = v_worksheet_id
      AND EXISTS (SELECT 1 FROM public.worksheets w WHERE w.id = i.worksheet_id
        AND w.collection_id = p_collection_id AND w.teacher_id = v_user);
    v_position := 0;
    FOR v_question IN SELECT value FROM pg_catalog.jsonb_array_elements(v_day->'questions') LOOP
      v_position := v_position + 1;
      IF pg_catalog.jsonb_typeof(v_question) <> 'object'
          OR NOT (v_question ?& ARRAY['position','sectionId','question','item_type','options','points','correct_answer'])
          OR v_question - ARRAY['position','sectionId','question','item_type','options','points','correct_answer','enumeration','essay']::text[] <> '{}'::jsonb
          OR pg_catalog.jsonb_typeof(v_question->'position') <> 'number'
          OR v_question->>'position' <> v_position::text
          OR pg_catalog.jsonb_typeof(v_question->'sectionId') <> 'string'
          OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_day->'sections') s
            WHERE s->>'id' = v_question->>'sectionId')
          OR pg_catalog.jsonb_typeof(v_question->'question') <> 'string'
          OR pg_catalog.char_length(v_question->>'question') NOT BETWEEN 1 AND 4000
          OR pg_catalog.btrim(v_question->>'question') = ''
          OR v_question->>'item_type' NOT IN
            ('multiple_choice','true_false','identification','enumeration','essay')
          OR pg_catalog.jsonb_typeof(v_question->'points') <> 'number' THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      v_points := (v_question->>'points')::numeric;
      IF v_points <= 0 OR v_points > 100 OR v_points <> pg_catalog.round(v_points, 2) THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      v_kind := v_question->>'item_type';
      v_options := v_question->'options';
      IF v_kind = 'multiple_choice' THEN
        IF pg_catalog.jsonb_typeof(v_options) <> 'array'
            OR pg_catalog.jsonb_array_length(v_options) <> 4 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_options) LOOP
          IF pg_catalog.jsonb_typeof(v_value) <> 'string'
              OR pg_catalog.char_length(v_value #>> '{}') NOT BETWEEN 1 AND 500
              OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
        END LOOP;
      ELSIF v_options <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF v_kind <> 'enumeration' AND v_question ? 'enumeration'
          AND v_question->'enumeration' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF v_kind <> 'essay' AND v_question ? 'essay'
          AND v_question->'essay' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;

      v_key := NULL;
      IF v_kind = 'multiple_choice' THEN
        IF pg_catalog.jsonb_typeof(v_question->'correct_answer') <> 'string'
            OR pg_catalog.char_length(v_question->>'correct_answer') NOT BETWEEN 1 AND 500
            OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_options) o
              WHERE o = v_question->>'correct_answer') THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        v_key := v_question->'correct_answer';
      ELSIF v_kind = 'true_false' THEN
        IF v_question->>'correct_answer' NOT IN ('True','False') THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        v_key := v_question->'correct_answer';
      ELSIF v_kind IN ('identification','enumeration') THEN
        IF pg_catalog.jsonb_typeof(v_question->'correct_answer') <> 'string'
            OR pg_catalog.char_length(v_question->>'correct_answer') NOT BETWEEN 1 AND 2000 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        SELECT pg_catalog.array_agg(pg_catalog.btrim(part) ORDER BY ord)
          INTO v_parts FROM pg_catalog.unnest(pg_catalog.string_to_array(
            v_question->>'correct_answer', ',')) WITH ORDINALITY AS t(part, ord)
          WHERE pg_catalog.btrim(part) <> '';
        IF COALESCE(pg_catalog.array_length(v_parts, 1), 0) NOT BETWEEN 1 AND 30 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        v_key := pg_catalog.to_jsonb(v_parts);
      ELSIF v_question->'correct_answer' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;

      v_private := pg_catalog.jsonb_build_object('sectionId', v_question->>'sectionId');
      IF v_kind = 'enumeration' THEN
        v_enum := v_question->'enumeration';
        IF v_enum IS NOT NULL AND v_enum <> 'null'::jsonb THEN
          IF pg_catalog.jsonb_typeof(v_enum) <> 'object'
              OR NOT (v_enum ?& ARRAY['alternatives','orderSensitive'])
              OR v_enum - ARRAY['alternatives','orderSensitive']::text[] <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(v_enum->'alternatives') <> 'array'
              OR pg_catalog.jsonb_array_length(v_enum->'alternatives') > 10
              OR pg_catalog.jsonb_typeof(v_enum->'orderSensitive') <> 'boolean' THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
          FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_enum->'alternatives') LOOP
            IF pg_catalog.jsonb_typeof(v_value) <> 'string'
                OR pg_catalog.char_length(v_value #>> '{}') NOT BETWEEN 1 AND 2000
                OR pg_catalog.array_length(pg_catalog.string_to_array(v_value #>> '{}', ','), 1)
                  <> pg_catalog.array_length(v_parts, 1)
                OR EXISTS (SELECT 1 FROM pg_catalog.unnest(pg_catalog.string_to_array(
                  v_value #>> '{}', ',')) AS part WHERE pg_catalog.btrim(part) = '') THEN
              RAISE EXCEPTION 'invalid_document';
            END IF;
          END LOOP;
          v_private := v_private || pg_catalog.jsonb_build_object('enumeration', v_enum);
        END IF;
      END IF;
      IF v_kind = 'essay' THEN
        v_essay := v_question->'essay';
        IF pg_catalog.jsonb_typeof(v_essay) <> 'object'
            OR NOT (v_essay ?& ARRAY['referenceAnswer','minWords','maxWords','rubric'])
            OR v_essay - ARRAY['referenceAnswer','minWords','maxWords','rubric']::text[] <> '{}'::jsonb
            OR pg_catalog.jsonb_typeof(v_essay->'referenceAnswer') <> 'string'
            OR pg_catalog.char_length(v_essay->>'referenceAnswer') NOT BETWEEN 1 AND 8000
            OR pg_catalog.btrim(v_essay->>'referenceAnswer') = ''
            OR pg_catalog.jsonb_typeof(v_essay->'minWords') <> 'number'
            OR pg_catalog.jsonb_typeof(v_essay->'maxWords') <> 'number'
            OR (v_essay->>'minWords') !~ '^[0-9]{1,4}$'
            OR (v_essay->>'maxWords') !~ '^[0-9]{1,4}$'
            OR (v_essay->>'minWords')::integer NOT BETWEEN 1 AND 3000
            OR (v_essay->>'maxWords')::integer NOT BETWEEN (v_essay->>'minWords')::integer AND 3000
            OR pg_catalog.jsonb_typeof(v_essay->'rubric') <> 'array'
            OR pg_catalog.jsonb_array_length(v_essay->'rubric') NOT BETWEEN 1 AND 20 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        v_rubric_sum := 0;
        FOR v_rubric IN SELECT value FROM pg_catalog.jsonb_array_elements(v_essay->'rubric') LOOP
          IF pg_catalog.jsonb_typeof(v_rubric) <> 'object'
              OR NOT (v_rubric ?& ARRAY['criterion','points'])
              OR v_rubric - ARRAY['criterion','points']::text[] <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(v_rubric->'criterion') <> 'string'
              OR pg_catalog.char_length(v_rubric->>'criterion') NOT BETWEEN 1 AND 500
              OR pg_catalog.btrim(v_rubric->>'criterion') = ''
              OR pg_catalog.jsonb_typeof(v_rubric->'points') <> 'number' THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
          v_rubric_sum := v_rubric_sum + (v_rubric->>'points')::numeric;
          IF (v_rubric->>'points')::numeric <= 0 OR (v_rubric->>'points')::numeric > 100 THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
        END LOOP;
        IF v_rubric_sum <> v_points THEN RAISE EXCEPTION 'invalid_document'; END IF;
        v_private := v_private || pg_catalog.jsonb_build_object('essay', v_essay);
      END IF;
      IF v_kind = 'enumeration' AND v_day->>'checkingMode' = 'auto'
          AND v_enum IS NOT NULL AND v_enum <> 'null'::jsonb
          AND ((v_enum->>'orderSensitive')::boolean
            OR pg_catalog.jsonb_array_length(v_enum->'alternatives') > 0) THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;

      INSERT INTO public.worksheet_items
        (worksheet_id, position, question, item_type, options, points)
      VALUES (v_worksheet_id, v_position, v_question->>'question', v_kind,
        CASE WHEN v_kind = 'multiple_choice' THEN v_options ELSE NULL END, v_points)
      RETURNING id INTO v_item_id;
      IF v_kind <> 'essay' THEN
        INSERT INTO public.worksheet_item_keys(item_id, correct_answer)
        VALUES (v_item_id, v_key);
      END IF;
      INSERT INTO public.worksheet_item_private(item_id, private)
      VALUES (v_item_id, v_private);
    END LOOP;
    v_result := v_result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'day', v_day_number, 'id', v_worksheet_id, 'items', v_count));
  END LOOP;
  IF ARRAY(SELECT x FROM pg_catalog.unnest(v_days) AS t(x) ORDER BY x)
      IS DISTINCT FROM v_existing_days THEN RAISE EXCEPTION 'invalid_document'; END IF;
  UPDATE public.worksheet_collections c SET title = p_payload->>'title',
    revision = c.revision + 1 WHERE c.id = p_collection_id AND c.teacher_id = v_user
    RETURNING c.revision INTO v_revision;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'durable', true,
    'collectionId', p_collection_id, 'revision', v_revision, 'worksheets', v_result);
END $$;
COMMIT;
