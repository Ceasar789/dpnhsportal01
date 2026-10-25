-- TEST DATA ONLY. Apply after dev-ai-lesson-plan-save.sql; do not apply automatically.
-- Keep the existing trusted writer, but make teaching assignments optional for AI Save.
BEGIN;
SET eduscribe.dev_ai_save_migration = 'approved';

DO $$ BEGIN
  IF pg_catalog.current_setting('eduscribe.dev_ai_save_migration', true) IS DISTINCT FROM 'approved' OR
      NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lesson_plans'
          AND column_name = 'subject_id' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'AI Save requires an approved test-data session and nullable lesson_plans.subject_id';
  END IF;
  IF pg_catalog.to_regprocedure('public.eduscribe_ai_uid()') IS NULL OR
      pg_catalog.to_regprocedure('public.eduscribe_ai_save_assignments_v1()') IS NULL OR
      pg_catalog.to_regprocedure('public.eduscribe_ai_html_save_v1(text,text,text,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'the initial AI Save migration must be installed first';
  END IF;
END $$;

GRANT eduscribe_ai_save_executor TO postgres;

CREATE OR REPLACE FUNCTION public.eduscribe_ai_save_assignments_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := public.eduscribe_ai_uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active') THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'version', 2);
END $$;

-- A changed argument list creates an overload, so remove the old RPC explicitly.
DROP FUNCTION public.eduscribe_ai_html_save_v1(text,text,text,uuid,text);

CREATE FUNCTION public.eduscribe_ai_html_save_v1(
  p_request_id text, p_title text, p_html text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := public.eduscribe_ai_uid(); v_year text;
  v_parts text[]; v_subject text; v_grade_level text; v_subject_id uuid;
  v_fingerprint bytea; v_id uuid := pg_catalog.gen_random_uuid();
  v_receipt public.ai_lesson_plan_save_receipts%ROWTYPE;
  v_inserted boolean; v_row public.lesson_plans%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9_-]{1,128}$' OR
      p_title IS NULL OR p_title <> pg_catalog.btrim(p_title) OR
      pg_catalog.char_length(p_title) NOT BETWEEN 1 AND 255 OR
      p_title ~ '[[:cntrl:]]' OR p_html IS NULL OR
      pg_catalog.octet_length(p_html) NOT BETWEEN 1 AND 131072 OR
      pg_catalog.btrim(p_html) = '' THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;

  IF (SELECT count(*) FROM public.school_settings) = 1 THEN
    SELECT s.school_year INTO v_year FROM public.school_settings s WHERE s.id = 1 FOR SHARE;
  END IF;
  IF v_year IS NULL OR v_year !~ '^[0-9]{4}-[0-9]{4}$' THEN
    v_year := NULL;
  ELSIF pg_catalog.right(v_year, 4)::integer <> pg_catalog.left(v_year, 4)::integer + 1 THEN
    v_year := NULL;
  END IF;

  v_parts := pg_catalog.regexp_match(p_title, '^\[G([1-9]|1[0-2])\][[:space:]]+(.+)$');
  IF v_parts IS NOT NULL THEN
    v_grade_level := 'Grade ' || v_parts[1];
    v_subject := NULLIF(pg_catalog.btrim(v_parts[2]), '');
    IF v_subject IS NULL OR pg_catalog.char_length(v_subject) > 100 THEN
      v_subject := NULL;
      v_grade_level := NULL;
    END IF;
  END IF;
  IF v_subject IS NOT NULL THEN
    SELECT CASE WHEN count(*) = 1 THEN (pg_catalog.array_agg(s.id))[1] END
      INTO v_subject_id FROM public.subjects s
      WHERE pg_catalog.lower(pg_catalog.btrim(s.name)) = pg_catalog.lower(v_subject);
  END IF;

  v_fingerprint := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('title', p_title, 'html', p_html)::text, 'UTF8'));
  INSERT INTO public.ai_lesson_plan_save_receipts
    (teacher_id, request_id, fingerprint, record_id)
  VALUES (v_user, p_request_id, v_fingerprint, v_id)
  ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF v_inserted IS DISTINCT FROM true THEN
    SELECT * INTO v_receipt FROM public.ai_lesson_plan_save_receipts
      WHERE teacher_id = v_user AND request_id = p_request_id FOR SHARE;
    IF v_receipt.fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    SELECT * INTO v_row FROM public.lesson_plans l
      WHERE l.id = v_receipt.record_id AND l.teacher_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  ELSE
    INSERT INTO public.lesson_plans
      (id, teacher_id, title, subject_id, subject, grade_level, academic_year,
       objectives, ai_generated, status, file_url, file_name, file_path)
    VALUES (v_id, v_user, p_title, v_subject_id, v_subject, v_grade_level, v_year,
       p_html, true, 'draft', null, null, null) RETURNING * INTO v_row;
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'durable', true, 'record',
    pg_catalog.jsonb_build_object('id', v_row.id, 'teacher_id', v_row.teacher_id,
      'title', v_row.title, 'subject_id', v_row.subject_id, 'subject', v_row.subject,
      'grade_level', v_row.grade_level, 'academic_year', v_row.academic_year,
      'objectives', v_row.objectives, 'ai_generated', v_row.ai_generated,
      'status', v_row.status, 'file_url', v_row.file_url, 'file_name', v_row.file_name,
      'file_path', v_row.file_path, 'updated_at', v_row.updated_at));
END $$;

GRANT CREATE ON SCHEMA public TO eduscribe_ai_save_executor;
ALTER FUNCTION public.eduscribe_ai_html_save_v1(text,text,text)
  OWNER TO eduscribe_ai_save_executor;
REVOKE CREATE ON SCHEMA public FROM eduscribe_ai_save_executor;
REVOKE ALL ON FUNCTION public.eduscribe_ai_html_save_v1(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_ai_html_save_v1(text,text,text)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
