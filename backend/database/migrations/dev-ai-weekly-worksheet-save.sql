-- TEST DATA ONLY. Review the target project and paste this whole file into the
-- Supabase SQL Editor as one transaction. Do not apply to production.
-- Prerequisites: apply dev-ai-lesson-plan-save.sql, then
-- dev-ai-lesson-plan-save-without-assignment.sql in that order. Each requires
-- its plain SET eduscribe.dev_ai_save_migration = 'approved' statement, a
-- verified test-data target, and the eduscribe_ai_save_executor -> postgres
-- role grant. This file requires public.eduscribe_ai_uid(), active profiles,
-- saved AI lesson_plans(id uuid), and the existing worksheet assessment tables.
-- Creates nullable worksheet metadata, private collection/item tables, and
-- one atomic save RPC. Roll back only after reviewing the separate
-- dev-ai-weekly-worksheet-save.rollback.sql file and saved data.
-- Payload contract: {sourceLessonPlanId,title,worksheets:[{day (1..5),title,
-- instructions,sections:[{id,title,directions}],checkingMode,questions:[
-- {position,sectionId,question,item_type,options,points,correct_answer,
-- enumeration?,essay?}]}]}. Optional metadata is null or absent; all other
-- fields are required. The caller never supplies teacher_id or database IDs.
BEGIN;
SET eduscribe.dev_ai_weekly_save_migration = 'approved';

DO $$ BEGIN
  IF pg_catalog.current_setting('eduscribe.dev_ai_weekly_save_migration', true) IS DISTINCT FROM 'approved'
      OR pg_catalog.to_regprocedure('public.eduscribe_ai_uid()') IS NULL
      OR pg_catalog.to_regclass('public.lesson_plans') IS NULL
      OR pg_catalog.to_regclass('public.worksheet_items') IS NULL
      OR pg_catalog.to_regclass('public.worksheet_item_keys') IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'eduscribe_ai_save_executor' AND NOT rolcanlogin AND NOT rolbypassrls)
      OR NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lesson_plans'
          AND column_name = 'id' AND udt_name = 'uuid') THEN
    RAISE EXCEPTION 'weekly save prerequisites are unavailable';
  END IF;
END $$;

ALTER TABLE public.worksheets
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_lesson_plan_id uuid
    REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collection_id uuid,
  ADD COLUMN IF NOT EXISTS day_of_week smallint,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS sections jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.worksheets'::regclass AND conname = 'worksheets_origin_ai_save_check') THEN
    ALTER TABLE public.worksheets ADD CONSTRAINT worksheets_origin_ai_save_check
      CHECK (origin IN ('manual', 'ai_generated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.worksheets'::regclass AND conname = 'worksheets_weekday_ai_save_check') THEN
    ALTER TABLE public.worksheets ADD CONSTRAINT worksheets_weekday_ai_save_check
      CHECK (day_of_week BETWEEN 1 AND 5);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.worksheet_collections (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  title varchar(255) NOT NULL,
  request_id uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (teacher_id, request_id),
  UNIQUE (id, teacher_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.worksheets'::regclass AND conname = 'worksheets_collection_ai_save_fk') THEN
    ALTER TABLE public.worksheets ADD CONSTRAINT worksheets_collection_ai_save_fk
      FOREIGN KEY (collection_id) REFERENCES public.worksheet_collections(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS worksheets_collection_weekday_ai_save_unique
  ON public.worksheets(collection_id, day_of_week) WHERE collection_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.worksheet_item_private (
  item_id uuid PRIMARY KEY REFERENCES public.worksheet_items(id) ON DELETE CASCADE,
  private jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(private) = 'object')
);

ALTER TABLE public.worksheet_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheet_item_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worksheet_collections, public.worksheet_item_private
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.worksheet_collections, public.worksheet_item_private TO authenticated;
GRANT SELECT, INSERT ON public.worksheet_collections, public.worksheet_item_private
  TO eduscribe_ai_save_executor;
GRANT SELECT, INSERT ON public.worksheets, public.worksheet_items,
  public.worksheet_item_keys TO eduscribe_ai_save_executor;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_collections' AND policyname = 'ai_weekly_collections_owner_read') THEN
    CREATE POLICY ai_weekly_collections_owner_read ON public.worksheet_collections
      FOR SELECT TO authenticated
      USING (teacher_id = auth.uid() OR public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_collections' AND policyname = 'ai_weekly_collections_executor') THEN
    CREATE POLICY ai_weekly_collections_executor ON public.worksheet_collections
      FOR ALL TO eduscribe_ai_save_executor
      USING (teacher_id = public.eduscribe_ai_uid())
      WITH CHECK (teacher_id = public.eduscribe_ai_uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_item_private' AND policyname = 'ai_weekly_private_owner_read') THEN
    CREATE POLICY ai_weekly_private_owner_read ON public.worksheet_item_private
      FOR SELECT TO authenticated
      USING (public.is_admin() OR public.teacher_owns_item(item_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_item_private' AND policyname = 'ai_weekly_private_executor') THEN
    CREATE POLICY ai_weekly_private_executor ON public.worksheet_item_private
      FOR ALL TO eduscribe_ai_save_executor
      USING (EXISTS (SELECT 1 FROM public.worksheet_items i
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE i.id = item_id AND w.teacher_id = public.eduscribe_ai_uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.worksheet_items i
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE i.id = item_id AND w.teacher_id = public.eduscribe_ai_uid()));
  END IF;
  -- Add executor-scoped policies; do not alter the existing client policies.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheets' AND policyname = 'ai_weekly_worksheets_executor') THEN
    CREATE POLICY ai_weekly_worksheets_executor ON public.worksheets
      FOR ALL TO eduscribe_ai_save_executor
      USING (teacher_id = public.eduscribe_ai_uid())
      WITH CHECK (teacher_id = public.eduscribe_ai_uid()
        AND origin = 'ai_generated' AND status = 'Draft');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_items' AND policyname = 'ai_weekly_items_executor') THEN
    CREATE POLICY ai_weekly_items_executor ON public.worksheet_items
      FOR ALL TO eduscribe_ai_save_executor
      USING (EXISTS (SELECT 1 FROM public.worksheets w
        WHERE w.id = worksheet_id AND w.teacher_id = public.eduscribe_ai_uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.worksheets w
        WHERE w.id = worksheet_id AND w.teacher_id = public.eduscribe_ai_uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_item_keys' AND policyname = 'ai_weekly_keys_executor') THEN
    CREATE POLICY ai_weekly_keys_executor ON public.worksheet_item_keys
      FOR ALL TO eduscribe_ai_save_executor
      USING (EXISTS (SELECT 1 FROM public.worksheet_items i
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE i.id = item_id AND w.teacher_id = public.eduscribe_ai_uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.worksheet_items i
        JOIN public.worksheets w ON w.id = i.worksheet_id
        WHERE i.id = item_id AND w.teacher_id = public.eduscribe_ai_uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.eduscribe_ai_weekly_worksheets_save_v1(
  p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_user uuid := public.eduscribe_ai_uid();
  v_source_id uuid;
  v_collection_id uuid := pg_catalog.gen_random_uuid();
  v_worksheet_id uuid;
  v_item_id uuid;
  v_fingerprint text;
  v_existing public.worksheet_collections%ROWTYPE;
  v_source public.lesson_plans%ROWTYPE;
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
  v_day_number integer;
  v_position integer;
  v_count integer;
  v_points numeric;
  v_rubric_sum numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;
  IF p_request_id IS NULL OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
      OR pg_catalog.octet_length(p_payload::text) > 2097152
      OR NOT (p_payload ?& ARRAY['sourceLessonPlanId','title','worksheets'])
      OR p_payload - ARRAY['sourceLessonPlanId','title','worksheets']::text[] <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(p_payload->'sourceLessonPlanId') <> 'string'
      OR (p_payload->>'sourceLessonPlanId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(p_payload->'title') <> 'string'
      OR pg_catalog.char_length(p_payload->>'title') NOT BETWEEN 1 AND 255
      OR pg_catalog.btrim(p_payload->>'title') = ''
      OR pg_catalog.jsonb_typeof(p_payload->'worksheets') <> 'array'
      OR pg_catalog.jsonb_array_length(p_payload->'worksheets') NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  v_source_id := (p_payload->>'sourceLessonPlanId')::uuid;
  SELECT * INTO v_source FROM public.lesson_plans l WHERE l.id = v_source_id
    AND l.teacher_id = v_user AND l.ai_generated IS TRUE
    AND l.title IS NOT NULL AND pg_catalog.btrim(l.title) <> '';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_plan_denied';
  END IF;
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p_payload::text, 'UTF8')), 'hex');

  -- Claim the request first. A same-ID concurrent caller waits on the unique
  -- constraint, then sees the committed row and returns the same IDs.
  INSERT INTO public.worksheet_collections
    (id, teacher_id, source_lesson_plan_id, title, request_id, payload_fingerprint)
  VALUES (v_collection_id, v_user, v_source_id, p_payload->>'title',
    p_request_id, v_fingerprint) ON CONFLICT (teacher_id, request_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.worksheet_collections c
      WHERE c.teacher_id = v_user AND c.request_id = p_request_id;
    IF v_existing.id IS NULL OR v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'day', w.day_of_week, 'id', w.id, 'items', w.items) ORDER BY w.day_of_week), '[]'::jsonb)
      INTO v_result FROM public.worksheets w
      WHERE w.collection_id = v_existing.id AND w.teacher_id = v_user;
    IF pg_catalog.jsonb_array_length(v_result) <> pg_catalog.jsonb_array_length(p_payload->'worksheets') THEN
      RAISE EXCEPTION 'invalid_state';
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok', true, 'durable', true,
      'collectionId', v_existing.id, 'worksheets', v_result);
  END IF;

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

    INSERT INTO public.worksheets
      (teacher_id, title, subject_id, subject, grade_level, items,
       status, task_type, checking_mode, origin,
       source_lesson_plan_id, collection_id, day_of_week, instructions, sections)
    VALUES (v_user, v_day->>'title', v_source.subject_id, v_source.subject,
      v_source.grade_level, v_count, 'Draft', 'worksheet',
      v_day->>'checkingMode', 'ai_generated', v_source_id, v_collection_id,
      v_day_number, v_day->>'instructions', v_day->'sections')
    RETURNING id INTO v_worksheet_id;
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
  RETURN pg_catalog.jsonb_build_object('ok', true, 'durable', true,
    'collectionId', v_collection_id, 'worksheets', v_result);
END $$;

GRANT CREATE ON SCHEMA public TO eduscribe_ai_save_executor;
ALTER FUNCTION public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb)
  OWNER TO eduscribe_ai_save_executor;
REVOKE CREATE ON SCHEMA public FROM eduscribe_ai_save_executor;
REVOKE ALL ON FUNCTION public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
-- Match AI lesson-plan Save: authenticated invokes the user-scoped RPC;
-- the SECURITY DEFINER executor owns the function and checks JWT identity.
GRANT EXECUTE ON FUNCTION public.eduscribe_ai_weekly_worksheets_save_v1(uuid,jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
