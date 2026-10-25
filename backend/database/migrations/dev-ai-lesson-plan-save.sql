-- TEST DATA ONLY. Review the target project, schema, grants and policies before applying.
-- This project must be wiped before real use. No source PDF is stored.
-- This independent migration does not require the unapplied TDI-04B proposal.
BEGIN;
SET eduscribe.dev_ai_save_migration = 'approved';
DO $$ BEGIN
  IF pg_catalog.current_setting('eduscribe.dev_ai_save_migration', true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'dev AI save migration requires an explicitly verified dev session';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'lesson_plans' AND column_name = 'subject_id') THEN
    RAISE EXCEPTION 'lesson_plans.subject_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'eduscribe_ai_save_executor') THEN
    CREATE ROLE eduscribe_ai_save_executor NOLOGIN NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'eduscribe_ai_save_executor'
      AND (rolcanlogin OR rolbypassrls)) THEN
    RAISE EXCEPTION 'ai save executor role is not safe';
  END IF;
END $$;
GRANT eduscribe_ai_save_executor TO postgres;

ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS academic_year varchar(20);
-- The old browser INSERT is no longer used. Fail if a client role retains a direct INSERT path.
REVOKE INSERT ON TABLE public.lesson_plans FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF pg_catalog.has_any_column_privilege('authenticated', 'public.lesson_plans', 'INSERT') OR
      pg_catalog.has_any_column_privilege('anon', 'public.lesson_plans', 'INSERT') THEN
    RAISE EXCEPTION 'direct lesson_plans INSERT remains granted to a client role';
  END IF;
END $$;
CREATE TABLE public.ai_lesson_plan_save_receipts (
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  request_id varchar(128) NOT NULL,
  fingerprint bytea NOT NULL CHECK (pg_catalog.octet_length(fingerprint) = 32),
  record_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, request_id)
);
ALTER TABLE public.ai_lesson_plan_save_receipts ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO eduscribe_ai_save_executor;
CREATE OR REPLACE FUNCTION public.eduscribe_ai_uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
REVOKE ALL ON FUNCTION public.eduscribe_ai_uid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_ai_uid() TO eduscribe_ai_save_executor;
GRANT SELECT, UPDATE ON public.profiles, public.school_settings, public.teacher_subjects,
  public.subjects TO eduscribe_ai_save_executor;
GRANT SELECT, INSERT ON public.lesson_plans TO eduscribe_ai_save_executor;
GRANT SELECT, INSERT, UPDATE ON public.ai_lesson_plan_save_receipts TO eduscribe_ai_save_executor;
CREATE POLICY ai_save_executor_profiles ON public.profiles FOR SELECT
  TO eduscribe_ai_save_executor USING (true);
CREATE POLICY ai_save_executor_settings ON public.school_settings FOR SELECT
  TO eduscribe_ai_save_executor USING (true);
CREATE POLICY ai_save_executor_load ON public.teacher_subjects FOR SELECT
  TO eduscribe_ai_save_executor USING (true);
CREATE POLICY ai_save_executor_subjects ON public.subjects FOR SELECT
  TO eduscribe_ai_save_executor USING (true);
CREATE POLICY ai_save_executor_plans_select ON public.lesson_plans FOR SELECT
  TO eduscribe_ai_save_executor USING (teacher_id = public.eduscribe_ai_uid());
CREATE POLICY ai_save_executor_plans_insert ON public.lesson_plans FOR INSERT
  TO eduscribe_ai_save_executor WITH CHECK (teacher_id = public.eduscribe_ai_uid() AND ai_generated IS TRUE AND status = 'draft');
CREATE POLICY ai_save_executor_receipts ON public.ai_lesson_plan_save_receipts FOR ALL
  TO eduscribe_ai_save_executor USING (teacher_id = public.eduscribe_ai_uid()) WITH CHECK (teacher_id = public.eduscribe_ai_uid());

CREATE FUNCTION public.eduscribe_ai_save_assignments_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := public.eduscribe_ai_uid(); v_year text; v_assignments jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active') THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;
  IF (SELECT count(*) FROM public.school_settings) <> 1 THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  SELECT s.school_year INTO v_year FROM public.school_settings s WHERE s.id = 1;
  IF v_year IS NULL OR v_year !~ '^[0-9]{4}-[0-9]{4}$' OR
      right(v_year, 4)::integer <> left(v_year, 4)::integer + 1 THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'subjectId', ts.subject_id, 'subjectName', sub.name, 'gradeLevel', ts.grade_level)
    ORDER BY sub.name, ts.grade_level), '[]'::jsonb) INTO v_assignments
  FROM public.teacher_subjects ts JOIN public.subjects sub ON sub.id = ts.subject_id
  WHERE ts.teacher_id = v_user AND ts.school_year = v_year AND sub.is_active IS TRUE;
  RETURN pg_catalog.jsonb_build_object('ok', true, 'assignments', v_assignments);
END $$;

CREATE FUNCTION public.eduscribe_ai_html_save_v1(
  p_request_id text, p_title text, p_html text, p_subject_id uuid, p_grade_level text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := public.eduscribe_ai_uid(); v_year text; v_subject text;
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
  IF (SELECT count(*) FROM public.school_settings) <> 1 THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  SELECT s.school_year INTO v_year FROM public.school_settings s WHERE s.id = 1 FOR SHARE;
  IF v_year IS NULL OR v_year !~ '^[0-9]{4}-[0-9]{4}$' OR
      right(v_year, 4)::integer <> left(v_year, 4)::integer + 1 THEN
    RAISE EXCEPTION 'settings_unavailable';
  END IF;
  SELECT sub.name INTO v_subject FROM public.teacher_subjects ts
    JOIN public.subjects sub ON sub.id = ts.subject_id
    WHERE ts.teacher_id = v_user AND ts.subject_id = p_subject_id
      AND ts.grade_level = p_grade_level AND ts.school_year = v_year
      AND sub.is_active IS TRUE FOR SHARE OF ts, sub;
  IF v_subject IS NULL THEN RAISE EXCEPTION 'assignment_denied'; END IF;

  v_fingerprint := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('title', p_title, 'html', p_html,
      'subjectId', p_subject_id, 'gradeLevel', p_grade_level)::text, 'UTF8'));
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
    VALUES (v_id, v_user, p_title, p_subject_id, v_subject, p_grade_level, v_year,
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
ALTER FUNCTION public.eduscribe_ai_save_assignments_v1() OWNER TO eduscribe_ai_save_executor;
ALTER FUNCTION public.eduscribe_ai_html_save_v1(text,text,text,uuid,text)
  OWNER TO eduscribe_ai_save_executor;
REVOKE CREATE ON SCHEMA public FROM eduscribe_ai_save_executor;
REVOKE ALL ON FUNCTION public.eduscribe_ai_save_assignments_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eduscribe_ai_html_save_v1(text,text,text,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_ai_save_assignments_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_ai_html_save_v1(text,text,text,uuid,text)
  TO authenticated;
COMMIT;
