-- Production contract for explicit Save of a completed five-day draft job.
-- Canonical worksheet storage only. Apply after live schema review and isolated tests.
-- Run as postgres in one transaction. This function does not distribute.
BEGIN;

DO $$ BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls))
      OR pg_catalog.to_regclass('public.weekly_draft_generation_jobs') IS NULL
      OR pg_catalog.to_regclass('public.worksheets') IS NULL
      OR pg_catalog.to_regclass('public.worksheet_items') IS NULL
      OR pg_catalog.to_regclass('public.worksheet_item_keys') IS NULL
      OR pg_catalog.to_regclass('public.profiles') IS NULL
      OR pg_catalog.to_regclass('public.lesson_plans') IS NULL
      OR pg_catalog.to_regclass('public.teacher_subjects') IS NULL
      OR pg_catalog.to_regclass('public.subjects') IS NULL
      OR pg_catalog.to_regclass('public.school_settings') IS NULL
      OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
      OR pg_catalog.to_regprocedure('public.teacher_owns_item(uuid)') IS NULL
      OR pg_catalog.to_regprocedure('public.is_admin()') IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
        AND tablename = 'worksheet_item_keys' AND policyname = 'ws_keys_all')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
        AND tablename = 'worksheet_items' AND policyname = 'ws_items_read')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
        AND tablename = 'worksheets' AND policyname = 'ws_worksheets_owner_all')
      OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'lesson_plans' AND column_name = 'subject_id' AND udt_name = 'uuid')
      OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
        AND table_name = 'lesson_plans' AND column_name = 'academic_year') THEN
    RAISE EXCEPTION 'weekly_save_prerequisites_unavailable';
  END IF;
END $$;

-- Existing tables keep their grants. Refuse unsafe access or disabled RLS
-- before any schema change; anon inherits every PUBLIC grant.
DO $$ DECLARE v_table text; v_privilege text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.worksheet_item_keys',
      'public.worksheet_collections', 'public.worksheet_item_private'] LOOP
    IF pg_catalog.to_regclass(v_table) IS NOT NULL THEN
      FOREACH v_privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE',
          'TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege('anon', v_table, v_privilege) THEN
          RAISE EXCEPTION 'weekly_save_unsafe_anon_grant';
        END IF;
      END LOOP;
      IF pg_catalog.has_any_column_privilege('anon', v_table, 'SELECT')
          OR pg_catalog.has_any_column_privilege('anon', v_table, 'INSERT')
          OR pg_catalog.has_any_column_privilege('anon', v_table, 'UPDATE')
          OR pg_catalog.has_any_column_privilege('anon', v_table, 'REFERENCES') THEN
        RAISE EXCEPTION 'weekly_save_unsafe_anon_grant';
      END IF;
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['public.worksheet_collections',
      'public.worksheet_item_private'] LOOP
    IF pg_catalog.to_regclass(v_table) IS NOT NULL THEN
      IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
          WHERE c.oid = pg_catalog.to_regclass(v_table))
          OR NOT pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT') THEN
        RAISE EXCEPTION 'weekly_save_existing_access_incompatible';
      END IF;
      FOREACH v_privilege IN ARRAY ARRAY['INSERT','UPDATE','DELETE',
          'TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege('authenticated', v_table, v_privilege) THEN
          RAISE EXCEPTION 'weekly_save_existing_access_incompatible';
        END IF;
      END LOOP;
      IF pg_catalog.has_any_column_privilege('authenticated', v_table, 'INSERT')
          OR pg_catalog.has_any_column_privilege('authenticated', v_table, 'UPDATE')
          OR pg_catalog.has_any_column_privilege('authenticated', v_table, 'REFERENCES') THEN
        RAISE EXCEPTION 'weekly_save_existing_access_incompatible';
      END IF;
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['public.worksheets', 'public.worksheet_items',
      'public.worksheet_item_keys'] LOOP
    IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
        WHERE c.oid = pg_catalog.to_regclass(v_table)) THEN
      RAISE EXCEPTION 'weekly_save_rls_unavailable';
    END IF;
  END LOOP;
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
  IF EXISTS (SELECT 1 FROM public.worksheets w
      WHERE w.origin IS NULL OR w.origin NOT IN ('manual','ai_generated')
        OR (w.day_of_week IS NOT NULL AND w.day_of_week NOT BETWEEN 1 AND 5))
      OR EXISTS (SELECT 1 FROM public.worksheets w
        WHERE w.source_lesson_plan_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.lesson_plans lp
            WHERE lp.id = w.source_lesson_plan_id)) THEN
    RAISE EXCEPTION 'weekly_save_existing_worksheet_conflict';
  END IF;
END $$;
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
  UNIQUE (teacher_id, request_id), UNIQUE (id, teacher_id)
);
ALTER TABLE public.worksheet_collections
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_job_id uuid,
  ADD COLUMN IF NOT EXISTS save_receipt jsonb;
-- Detect existing conflicts before creating constraints/indexes. No row is
-- rewritten or removed to make a deployment pass.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.worksheet_collections c
      WHERE c.request_id IS NULL OR c.teacher_id IS NULL OR c.revision IS NULL
        OR c.revision < 1 OR c.payload_fingerprint IS NULL
        OR c.payload_fingerprint !~ '^[0-9a-f]{64}$')
      OR EXISTS (SELECT 1 FROM public.worksheet_collections c
        WHERE c.source_lesson_plan_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.lesson_plans lp
            WHERE lp.id = c.source_lesson_plan_id))
      OR EXISTS (SELECT 1 FROM public.worksheet_collections c
        GROUP BY c.teacher_id, c.request_id HAVING pg_catalog.count(*) > 1)
      OR EXISTS (SELECT 1 FROM public.worksheet_collections c
        WHERE c.source_job_id IS NOT NULL
        GROUP BY c.teacher_id, c.source_job_id HAVING pg_catalog.count(*) > 1)
      OR EXISTS (SELECT 1 FROM public.worksheets w
        WHERE w.collection_id IS NOT NULL AND
          (w.day_of_week IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.worksheet_collections c
              WHERE c.id = w.collection_id)))
      OR EXISTS (SELECT 1 FROM public.worksheets w
        WHERE w.collection_id IS NOT NULL
        GROUP BY w.collection_id, w.day_of_week HAVING pg_catalog.count(*) > 1) THEN
    RAISE EXCEPTION 'weekly_save_existing_canonical_conflict';
  END IF;
END $$;
CREATE UNIQUE INDEX weekly_prod_collection_request_unique
  ON public.worksheet_collections(teacher_id, request_id);
CREATE UNIQUE INDEX weekly_collections_completed_job_unique
  ON public.worksheet_collections(teacher_id, source_job_id)
  WHERE source_job_id IS NOT NULL;
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
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.worksheet_item_private p
      WHERE p.item_id IS NULL OR p.private IS NULL
        OR pg_catalog.jsonb_typeof(p.private) <> 'object'
        OR NOT EXISTS (SELECT 1 FROM public.worksheet_items i
          WHERE i.id = p.item_id)) THEN
    RAISE EXCEPTION 'weekly_save_existing_private_conflict';
  END IF;
END $$;
-- IF NOT EXISTS must not silently accept an incompatible pre-existing table.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM (VALUES
      ('worksheet_collections','id','uuid'),
      ('worksheet_collections','teacher_id','uuid'),
      ('worksheet_collections','source_lesson_plan_id','uuid'),
      ('worksheet_collections','request_id','uuid'),
      ('worksheet_collections','payload_fingerprint','text'),
      ('worksheet_collections','revision','int8'),
      ('worksheet_collections','source_job_id','uuid'),
      ('worksheet_collections','save_receipt','jsonb'),
      ('worksheets','id','uuid'),
      ('worksheets','teacher_id','uuid'),
      ('worksheets','subject_id','uuid'),
      ('worksheets','collection_id','uuid'),
      ('worksheets','day_of_week','int2'),
      ('worksheets','sections','jsonb'),
      ('worksheet_items','id','uuid'),
      ('worksheet_items','worksheet_id','uuid'),
      ('worksheet_items','options','jsonb'),
      ('worksheet_item_keys','item_id','uuid'),
      ('worksheet_item_keys','correct_answer','jsonb'),
      ('worksheet_item_private','item_id','uuid'),
      ('worksheet_item_private','private','jsonb')
    ) AS expected(table_name, column_name, udt_name)
    LEFT JOIN information_schema.columns c ON c.table_schema = 'public'
      AND c.table_name = expected.table_name
      AND c.column_name = expected.column_name
    WHERE c.udt_name IS DISTINCT FROM expected.udt_name) THEN
    RAISE EXCEPTION 'weekly_save_prerequisites_unavailable';
  END IF;
END $$;
ALTER TABLE public.worksheet_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheet_item_private ENABLE ROW LEVEL SECURITY;
-- The preflight established that these REVOKEs cannot remove existing access.
-- They only clear default grants when either table was newly created above.
REVOKE ALL ON public.worksheet_collections, public.worksheet_item_private
  FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.worksheet_collections, public.worksheet_item_private
  FROM authenticated;
GRANT SELECT ON public.worksheet_collections, public.worksheet_item_private TO authenticated;
-- The base assessment schema must already grant the owner teacher key reads.
DO $$ BEGIN
  IF NOT pg_catalog.has_table_privilege('authenticated',
      'public.worksheet_item_keys', 'SELECT') THEN
    RAISE EXCEPTION 'weekly_save_key_reader_unavailable';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_collections' AND policyname = 'weekly_production_collections_owner_read') THEN
    CREATE POLICY weekly_production_collections_owner_read ON public.worksheet_collections
      FOR SELECT TO authenticated
      USING (teacher_id = auth.uid() OR public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'worksheet_item_private' AND policyname = 'weekly_production_private_owner_read') THEN
    CREATE POLICY weekly_production_private_owner_read ON public.worksheet_item_private
      FOR SELECT TO authenticated
      USING (public.teacher_owns_item(item_id) OR public.is_admin());
  END IF;
END $$;
-- Restrictive owner checks prevent another permissive policy from widening
-- authenticated reads. They preserve existing owner-teacher/admin readers.
CREATE POLICY weekly_production_collections_private ON public.worksheet_collections
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() OR public.is_admin());
CREATE POLICY weekly_production_item_private ON public.worksheet_item_private
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.teacher_owns_item(item_id) OR public.is_admin());
CREATE POLICY weekly_production_keys_private ON public.worksheet_item_keys
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.teacher_owns_item(item_id) OR public.is_admin());

CREATE FUNCTION public.eduscribe_weekly_job_save_v1(
  p_job_id uuid, p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job public.weekly_draft_generation_jobs%ROWTYPE;
  v_plan public.lesson_plans%ROWTYPE;
  v_year text;
  v_fingerprint text;
  v_existing public.worksheet_collections%ROWTYPE;
  v_collection_id uuid := pg_catalog.gen_random_uuid();
  v_receipt jsonb := '[]'::jsonb;
  v_day jsonb;
  v_section jsonb;
  v_question jsonb;
  v_option jsonb;
  v_alternative jsonb;
  v_rubric jsonb;
  v_part jsonb;
  v_day_number integer;
  v_position integer;
  v_count integer;
  v_points numeric;
  v_rubric_sum numeric;
  v_answers text[];
  v_answer_count integer;
  v_worksheet_id uuid;
  v_item_id uuid;
  v_key jsonb;
  v_private jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;
  IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  IF p_job_id IS NULL OR p_request_id IS NULL
      OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
      OR pg_catalog.octet_length(p_payload::text) > 2097152
      OR NOT (p_payload ?& ARRAY['sourceLessonPlanId','title','worksheets'])
      OR p_payload - ARRAY['sourceLessonPlanId','title','worksheets']::text[] <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(p_payload->'sourceLessonPlanId') IS DISTINCT FROM 'string'
      OR (p_payload->>'sourceLessonPlanId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(p_payload->'title') IS DISTINCT FROM 'string'
      OR pg_catalog.char_length(p_payload->>'title') NOT BETWEEN 1 AND 255
      OR pg_catalog.btrim(p_payload->>'title') = ''
      OR pg_catalog.jsonb_typeof(p_payload->'worksheets') IS DISTINCT FROM 'array'
      OR (CASE WHEN pg_catalog.jsonb_typeof(p_payload->'worksheets') = 'array'
        THEN pg_catalog.jsonb_array_length(p_payload->'worksheets') ELSE -1 END) <> 5
      OR p_payload::text ~ '<[A-Za-z/!?]' THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;

  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_job_id, p_payload)::text, 'UTF8')), 'hex');
  -- A committed replay is recoverable even after the generation job is purged.
  SELECT * INTO v_existing FROM public.worksheet_collections c
    WHERE c.teacher_id = v_user AND c.request_id = p_request_id FOR SHARE;
  IF FOUND THEN
    IF v_existing.source_job_id <> p_job_id
        OR v_existing.payload_fingerprint <> v_fingerprint
        OR v_existing.save_receipt IS NULL THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing.save_receipt;
  END IF;
  IF EXISTS (SELECT 1 FROM public.worksheet_collections c
      WHERE c.teacher_id = v_user AND c.source_job_id = p_job_id) THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs j
    WHERE j.id = p_job_id AND j.teacher_id = v_user
      AND j.status = 'COMPLETED' AND j.draft_result IS NOT NULL
      AND j.retention_expires_at > pg_catalog.clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job_unavailable'; END IF;
  IF v_job.draft_result->>'kind' IS DISTINCT FROM 'weekly-worksheet-collection'
      OR v_job.draft_result->>'status' IS DISTINCT FROM 'local-draft'
      OR v_job.draft_result->'saved' IS DISTINCT FROM 'false'::jsonb
      OR v_job.draft_result->>'teacherId' IS DISTINCT FROM v_user::text
      OR v_job.draft_result #>> '{sourceLessonPlan,id}' IS DISTINCT FROM
        v_job.source_lesson_plan_id::text
      OR pg_catalog.jsonb_typeof(v_job.draft_result->'worksheets') IS DISTINCT FROM 'array'
      OR (CASE WHEN pg_catalog.jsonb_typeof(v_job.draft_result->'worksheets') = 'array'
        THEN pg_catalog.jsonb_array_length(v_job.draft_result->'worksheets') ELSE -1 END) <> 5 THEN
    RAISE EXCEPTION 'job_unavailable';
  END IF;
  SELECT * INTO v_plan FROM public.lesson_plans lp
    WHERE lp.id = v_job.source_lesson_plan_id AND lp.teacher_id = v_user
      AND lp.status IN ('draft','published') AND lp.ai_generated IN (true,false)
    FOR SHARE;
  IF NOT FOUND OR p_payload->>'sourceLessonPlanId' <> v_plan.id::text THEN
    RAISE EXCEPTION 'source_plan_denied';
  END IF;
  IF v_job.source_hash IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(v_plan.title, v_plan.objectives,
        v_plan.subject, v_plan.grade_level, v_plan.subject_id,
        v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8')) THEN
    RAISE EXCEPTION 'source_changed';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.school_settings) <> 1 THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  SELECT s.school_year INTO v_year FROM public.school_settings s WHERE s.id = 1 FOR SHARE;
  IF v_year IS NULL OR v_year !~ '^[0-9]{4}-[0-9]{4}$'
      OR (CASE WHEN v_year ~ '^[0-9]{4}-[0-9]{4}$'
        THEN pg_catalog.right(v_year, 4)::integer - pg_catalog.left(v_year, 4)::integer
        ELSE -1 END) <> 1
      -- Legacy plans without a year still require the matching current teaching load below.
      OR (v_plan.academic_year IS NOT NULL
        AND v_plan.academic_year IS DISTINCT FROM v_year)
      OR v_plan.subject_id IS NULL OR v_plan.grade_level IS NULL THEN
    RAISE EXCEPTION 'assignment_denied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teacher_subjects ts
      JOIN public.subjects sub ON sub.id = ts.subject_id
      WHERE ts.teacher_id = v_user AND ts.subject_id = v_plan.subject_id
        AND ts.grade_level = v_plan.grade_level AND ts.school_year = v_year
        AND sub.is_active IS TRUE FOR SHARE OF ts, sub) THEN
    RAISE EXCEPTION 'assignment_denied';
  END IF;

  -- The unique keys serialize duplicate requests and duplicate Saves of one job.
  INSERT INTO public.worksheet_collections
    (id, teacher_id, source_job_id, source_lesson_plan_id,
      request_id, payload_fingerprint, title, revision, archived_at)
  VALUES (v_collection_id, v_user, p_job_id, v_plan.id,
    p_request_id, v_fingerprint, p_payload->>'title', 1, NULL)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.worksheet_collections c
      WHERE c.teacher_id = v_user
        AND (c.request_id = p_request_id OR c.source_job_id = p_job_id) FOR SHARE;
    IF NOT FOUND OR v_existing.request_id <> p_request_id
        OR v_existing.source_job_id <> p_job_id
        OR v_existing.payload_fingerprint <> v_fingerprint
        OR v_existing.save_receipt IS NULL THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_existing.save_receipt;
  END IF;

  FOR v_day IN SELECT value FROM pg_catalog.jsonb_array_elements(p_payload->'worksheets') LOOP
    IF pg_catalog.jsonb_typeof(v_day) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid_document';
    END IF;
    IF pg_catalog.jsonb_typeof(v_day) IS DISTINCT FROM 'object'
        OR NOT (v_day ?& ARRAY['day','title','instructions','sections','checkingMode','questions'])
        OR v_day - ARRAY['day','title','instructions','sections','checkingMode','questions']::text[] <> '{}'::jsonb
        OR pg_catalog.jsonb_typeof(v_day->'day') IS DISTINCT FROM 'number'
        OR (v_day->>'day') !~ '^[1-5]$'
        OR pg_catalog.jsonb_typeof(v_day->'title') IS DISTINCT FROM 'string'
        OR pg_catalog.char_length(v_day->>'title') NOT BETWEEN 1 AND 255
        OR pg_catalog.btrim(v_day->>'title') = ''
        OR pg_catalog.jsonb_typeof(v_day->'instructions') IS DISTINCT FROM 'string'
        OR pg_catalog.char_length(v_day->>'instructions') > 2000
        OR pg_catalog.jsonb_typeof(v_day->'sections') IS DISTINCT FROM 'array'
        OR (CASE WHEN pg_catalog.jsonb_typeof(v_day->'sections') = 'array'
          THEN pg_catalog.jsonb_array_length(v_day->'sections') ELSE -1 END) NOT BETWEEN 1 AND 12
        OR pg_catalog.jsonb_typeof(v_day->'questions') IS DISTINCT FROM 'array'
        OR (CASE WHEN pg_catalog.jsonb_typeof(v_day->'questions') = 'array'
          THEN pg_catalog.jsonb_array_length(v_day->'questions') ELSE -1 END) NOT BETWEEN 1 AND 60
        OR pg_catalog.jsonb_typeof(v_day->'checkingMode') IS DISTINCT FROM 'string'
        OR v_day->>'checkingMode' NOT IN ('auto','manual') THEN
      RAISE EXCEPTION 'invalid_document';
    END IF;
    v_day_number := (v_day->>'day')::integer;
    IF EXISTS (SELECT 1 FROM public.worksheets d
        WHERE d.collection_id = v_collection_id AND d.day_of_week = v_day_number) THEN
      RAISE EXCEPTION 'invalid_document';
    END IF;
    v_count := pg_catalog.jsonb_array_length(v_day->'questions');
    INSERT INTO public.worksheets
      (teacher_id, title, subject_id, subject, grade_level, items,
       status, task_type, checking_mode, origin,
       source_lesson_plan_id, collection_id, day_of_week, instructions, sections)
    VALUES (v_user, v_day->>'title', v_plan.subject_id, v_plan.subject,
      v_plan.grade_level, v_count, 'Draft', 'worksheet',
      v_day->>'checkingMode', 'ai_generated', v_plan.id, v_collection_id,
      v_day_number, v_day->>'instructions', v_day->'sections')
    RETURNING id INTO v_worksheet_id;
    FOR v_section IN SELECT value FROM pg_catalog.jsonb_array_elements(v_day->'sections') LOOP
      IF pg_catalog.jsonb_typeof(v_section) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF pg_catalog.jsonb_typeof(v_section) IS DISTINCT FROM 'object'
          OR NOT (v_section ?& ARRAY['id','title','directions'])
          OR v_section - ARRAY['id','title','directions']::text[] <> '{}'::jsonb
          OR pg_catalog.jsonb_typeof(v_section->'id') IS DISTINCT FROM 'string'
          OR pg_catalog.char_length(v_section->>'id') NOT BETWEEN 1 AND 128
          OR pg_catalog.jsonb_typeof(v_section->'title') IS DISTINCT FROM 'string'
          OR pg_catalog.char_length(v_section->>'title') NOT BETWEEN 1 AND 120
          OR pg_catalog.btrim(v_section->>'title') = ''
          OR pg_catalog.jsonb_typeof(v_section->'directions') IS DISTINCT FROM 'string'
          OR pg_catalog.char_length(v_section->>'directions') > 2000
          OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(v_day->'sections') s
            WHERE s->>'id' = v_section->>'id') <> 1 THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
    END LOOP;
    v_position := 0;
    FOR v_question IN SELECT value FROM pg_catalog.jsonb_array_elements(v_day->'questions') LOOP
      v_position := v_position + 1;
      IF pg_catalog.jsonb_typeof(v_question) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF pg_catalog.jsonb_typeof(v_question) IS DISTINCT FROM 'object'
          OR NOT (v_question ?& ARRAY['position','sectionId','question','item_type','options','points','correct_answer'])
          OR v_question - ARRAY['position','sectionId','question','item_type','options','points','correct_answer','enumeration','essay']::text[] <> '{}'::jsonb
          OR pg_catalog.jsonb_typeof(v_question->'position') IS DISTINCT FROM 'number'
          OR v_question->>'position' <> v_position::text
          OR pg_catalog.jsonb_typeof(v_question->'sectionId') IS DISTINCT FROM 'string'
          OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_day->'sections') s
            WHERE s->>'id' = v_question->>'sectionId')
          OR pg_catalog.jsonb_typeof(v_question->'question') IS DISTINCT FROM 'string'
          OR pg_catalog.char_length(v_question->>'question') NOT BETWEEN 1 AND 4000
          OR pg_catalog.btrim(v_question->>'question') = ''
          OR pg_catalog.jsonb_typeof(v_question->'item_type') IS DISTINCT FROM 'string'
          OR v_question->>'item_type' NOT IN
            ('multiple_choice','true_false','identification','enumeration','essay')
          OR pg_catalog.jsonb_typeof(v_question->'points') IS DISTINCT FROM 'number'
          OR (v_question->>'points') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      v_points := (v_question->>'points')::numeric;
      IF v_points <= 0 OR v_points > 100 THEN RAISE EXCEPTION 'invalid_document'; END IF;
      IF v_question->>'item_type' = 'multiple_choice' THEN
        IF pg_catalog.jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array'
            OR (CASE WHEN pg_catalog.jsonb_typeof(v_question->'options') = 'array'
              THEN pg_catalog.jsonb_array_length(v_question->'options') ELSE -1 END) <> 4
            OR pg_catalog.jsonb_typeof(v_question->'correct_answer') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_question->'options') LOOP
          IF pg_catalog.jsonb_typeof(v_option) IS DISTINCT FROM 'string'
              OR pg_catalog.char_length(v_option #>> '{}') NOT BETWEEN 1 AND 500
              OR pg_catalog.btrim(v_option #>> '{}') = ''
              OR v_option #>> '{}' <> pg_catalog.btrim(v_option #>> '{}') THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
        END LOOP;
        IF (SELECT pg_catalog.count(DISTINCT pg_catalog.lower(pg_catalog.btrim(value)))
            FROM pg_catalog.jsonb_array_elements_text(v_question->'options') o(value)) <> 4
            OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_question->'options') o(value)
              WHERE o.value = v_question->>'correct_answer') THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
      ELSIF v_question->'options' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF v_question->>'item_type' = 'true_false'
          AND v_question->>'correct_answer' NOT IN ('True','False') THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF v_question->>'item_type' IN ('identification','enumeration') THEN
        IF pg_catalog.jsonb_typeof(v_question->'correct_answer') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(v_question->>'correct_answer') NOT BETWEEN 1 AND 2000 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        SELECT pg_catalog.array_agg(pg_catalog.btrim(part) ORDER BY ord)
          INTO v_answers FROM pg_catalog.unnest(pg_catalog.string_to_array(
            v_question->>'correct_answer', ',')) WITH ORDINALITY AS t(part, ord)
          WHERE pg_catalog.btrim(part) <> '';
        IF COALESCE(pg_catalog.array_length(v_answers, 1), 0)
            NOT BETWEEN 1 AND 30 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        v_answer_count := pg_catalog.array_length(v_answers, 1);
      END IF;
      IF v_question->>'item_type' = 'enumeration'
          AND v_question ? 'enumeration' AND v_question->'enumeration' <> 'null'::jsonb THEN
        v_alternative := v_question->'enumeration';
        IF pg_catalog.jsonb_typeof(v_alternative) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        IF pg_catalog.jsonb_typeof(v_alternative) IS DISTINCT FROM 'object'
            OR NOT (v_alternative ?& ARRAY['alternatives','orderSensitive'])
            OR v_alternative - ARRAY['alternatives','orderSensitive']::text[] <> '{}'::jsonb
            OR pg_catalog.jsonb_typeof(v_alternative->'alternatives') IS DISTINCT FROM 'array'
            OR (CASE WHEN pg_catalog.jsonb_typeof(v_alternative->'alternatives') = 'array'
              THEN pg_catalog.jsonb_array_length(v_alternative->'alternatives') ELSE 11 END) > 10
            OR pg_catalog.jsonb_typeof(v_alternative->'orderSensitive') IS DISTINCT FROM 'boolean'
            OR (v_day->>'checkingMode' = 'auto'
              AND v_alternative->'orderSensitive' = 'true'::jsonb) THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        IF v_day->>'checkingMode' = 'auto'
            AND pg_catalog.jsonb_array_length(v_alternative->'alternatives') > 0 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_alternative->'alternatives') LOOP
          IF pg_catalog.jsonb_typeof(v_option) IS DISTINCT FROM 'string'
              OR pg_catalog.char_length(v_option #>> '{}') NOT BETWEEN 1 AND 2000 THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
          v_answers := pg_catalog.string_to_array(v_option #>> '{}', ',');
          IF pg_catalog.array_length(v_answers, 1) < 1
              OR pg_catalog.array_length(v_answers, 1) <> v_answer_count
              OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_answers) part
                WHERE pg_catalog.btrim(part) = '') THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
        END LOOP;
      ELSIF v_question ? 'enumeration' AND v_question->'enumeration' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF v_question->>'item_type' = 'essay' THEN
        v_rubric := v_question->'essay';
        IF pg_catalog.jsonb_typeof(v_rubric) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        IF v_question->'correct_answer' IS DISTINCT FROM 'null'::jsonb
            OR pg_catalog.jsonb_typeof(v_rubric) IS DISTINCT FROM 'object'
            OR NOT (v_rubric ?& ARRAY['referenceAnswer','minWords','maxWords','rubric'])
            OR v_rubric - ARRAY['referenceAnswer','minWords','maxWords','rubric']::text[] <> '{}'::jsonb
            OR pg_catalog.jsonb_typeof(v_rubric->'referenceAnswer') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(v_rubric->>'referenceAnswer') NOT BETWEEN 1 AND 8000
            OR pg_catalog.btrim(v_rubric->>'referenceAnswer') = ''
            OR pg_catalog.jsonb_typeof(v_rubric->'minWords') IS DISTINCT FROM 'number'
            OR pg_catalog.jsonb_typeof(v_rubric->'maxWords') IS DISTINCT FROM 'number'
            OR v_rubric->>'minWords' !~ '^[0-9]{1,4}$'
            OR v_rubric->>'maxWords' !~ '^[0-9]{1,4}$'
            OR (CASE WHEN v_rubric->>'minWords' ~ '^[0-9]{1,4}$'
              THEN (v_rubric->>'minWords')::integer ELSE -1 END) NOT BETWEEN 1 AND 3000
            OR (CASE WHEN v_rubric->>'maxWords' ~ '^[0-9]{1,4}$'
                AND v_rubric->>'minWords' ~ '^[0-9]{1,4}$'
              THEN (v_rubric->>'maxWords')::integer - (v_rubric->>'minWords')::integer
              ELSE -1 END) < 0
            OR (CASE WHEN v_rubric->>'maxWords' ~ '^[0-9]{1,4}$'
              THEN (v_rubric->>'maxWords')::integer ELSE 3001 END) > 3000
            OR pg_catalog.jsonb_typeof(v_rubric->'rubric') IS DISTINCT FROM 'array'
            OR (CASE WHEN pg_catalog.jsonb_typeof(v_rubric->'rubric') = 'array'
              THEN pg_catalog.jsonb_array_length(v_rubric->'rubric') ELSE -1 END) NOT BETWEEN 1 AND 20 THEN
          RAISE EXCEPTION 'invalid_document';
        END IF;
        v_rubric_sum := 0;
        FOR v_part IN SELECT value FROM pg_catalog.jsonb_array_elements(v_rubric->'rubric') LOOP
          IF pg_catalog.jsonb_typeof(v_part) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
          IF pg_catalog.jsonb_typeof(v_part) IS DISTINCT FROM 'object'
              OR NOT (v_part ?& ARRAY['criterion','points'])
              OR v_part - ARRAY['criterion','points']::text[] <> '{}'::jsonb
              OR pg_catalog.jsonb_typeof(v_part->'criterion') IS DISTINCT FROM 'string'
              OR pg_catalog.char_length(v_part->>'criterion') NOT BETWEEN 1 AND 500
              OR pg_catalog.btrim(v_part->>'criterion') = ''
              OR pg_catalog.jsonb_typeof(v_part->'points') IS DISTINCT FROM 'number'
              OR v_part->>'points' !~ '^[0-9]+(\.[0-9]+)?$' THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
          v_rubric_sum := v_rubric_sum + (v_part->>'points')::numeric;
          IF (v_part->>'points')::numeric <= 0 OR (v_part->>'points')::numeric > 100 THEN
            RAISE EXCEPTION 'invalid_document';
          END IF;
        END LOOP;
        IF v_rubric_sum <> v_points THEN RAISE EXCEPTION 'invalid_document'; END IF;
      ELSIF v_question ? 'essay' AND v_question->'essay' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      IF v_question->>'item_type' <> 'essay'
          AND pg_catalog.jsonb_typeof(v_question->'correct_answer') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'invalid_document';
      END IF;
      v_key := NULL;
      IF v_question->>'item_type' IN ('multiple_choice','true_false') THEN
        v_key := v_question->'correct_answer';
      ELSIF v_question->>'item_type' IN ('identification','enumeration') THEN
        SELECT pg_catalog.to_jsonb(pg_catalog.array_agg(pg_catalog.btrim(part) ORDER BY ord))
          INTO v_key FROM pg_catalog.unnest(pg_catalog.string_to_array(
            v_question->>'correct_answer', ',')) WITH ORDINALITY AS t(part, ord)
          WHERE pg_catalog.btrim(part) <> '';
      END IF;
      v_private := pg_catalog.jsonb_build_object('sectionId', v_question->>'sectionId');
      IF v_question->>'item_type' = 'enumeration'
          AND v_question->'enumeration' IS NOT NULL
          AND v_question->'enumeration' <> 'null'::jsonb THEN
        v_private := v_private || pg_catalog.jsonb_build_object(
          'enumeration', v_question->'enumeration');
      END IF;
      IF v_question->>'item_type' = 'essay' THEN
        v_private := v_private || pg_catalog.jsonb_build_object('essay', v_question->'essay');
      END IF;
      INSERT INTO public.worksheet_items
        (worksheet_id, position, question, item_type, options, points)
      VALUES (v_worksheet_id, v_position, v_question->>'question',
        v_question->>'item_type',
        CASE WHEN v_question->>'item_type' = 'multiple_choice'
          THEN v_question->'options' ELSE NULL END, v_points)
      RETURNING id INTO v_item_id;
      IF v_key IS NOT NULL THEN
        INSERT INTO public.worksheet_item_keys(item_id, correct_answer)
        VALUES (v_item_id, v_key);
      END IF;
      INSERT INTO public.worksheet_item_private(item_id, private)
      VALUES (v_item_id, v_private);
    END LOOP;
    v_count := pg_catalog.jsonb_array_length(v_day->'questions');
    v_receipt := v_receipt || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'day', v_day_number, 'id', v_worksheet_id, 'items', v_count));
  END LOOP;
  IF (SELECT pg_catalog.count(*) FROM public.worksheets d
      WHERE d.collection_id = v_collection_id) <> 5 THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  SELECT pg_catalog.jsonb_agg(value ORDER BY (value->>'day')::integer)
    INTO v_receipt FROM pg_catalog.jsonb_array_elements(v_receipt) t(value);
  v_receipt := pg_catalog.jsonb_build_object('ok', true, 'durable', true,
    'collectionId', v_collection_id, 'worksheets', v_receipt);
  UPDATE public.worksheet_collections
    SET save_receipt = v_receipt WHERE id = v_collection_id;
  RETURN v_receipt;
END $$;

ALTER FUNCTION public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_weekly_job_save_v1(uuid,uuid,jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
