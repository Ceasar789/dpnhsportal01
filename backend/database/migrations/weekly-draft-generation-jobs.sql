-- Production contract for private, draft-only weekly generation jobs.
-- Prerequisites: public.profiles and public.lesson_plans with the columns used below,
-- including lesson_plans.subject_id from phase1-02-subject-id-columns.sql;
-- auth.uid(), pg_catalog.gen_random_uuid(), and service_role/authenticated roles.
-- Apply as a trusted migration owner. Review grants and live schema before applying.
-- This migration does not create or write any worksheet, answer, assignment, or distribution row.
-- Work expires seven days after creation. Terminal status (and a completed
-- result) remains visible for seven more days. An expired queued job or running
-- attempt gets seven days from its locked expiry reconciliation.
-- No provider work resumes after work expiry.
-- A trusted scheduler may call the service_role-only purge RPC; no scheduler is installed here.
-- Purge examines at most 100 expired jobs per call and deletes only after retention.

BEGIN;

CREATE TABLE public.weekly_draft_generation_jobs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE RESTRICT,
  request_id varchar(128) NOT NULL,
  request_fingerprint bytea NOT NULL CHECK (pg_catalog.octet_length(request_fingerprint) = 32),
  source_hash bytea NOT NULL CHECK (pg_catalog.octet_length(source_hash) = 32),
  source_days jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(source_days) = 'array'
    AND pg_catalog.jsonb_array_length(source_days) = 5),
  question_count smallint NOT NULL CHECK (question_count IN (20, 30, 40)),
  planned_calls smallint NOT NULL CHECK (planned_calls IN (10, 15, 20)),
  attempted_calls smallint NOT NULL DEFAULT 0 CHECK (attempted_calls BETWEEN 0 AND 20),
  completed_batches smallint NOT NULL DEFAULT 0 CHECK (completed_batches BETWEEN 0 AND 20),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN
    ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME')),
  cancel_requested boolean NOT NULL DEFAULT false,
  active_batch smallint,
  lease_token uuid,
  lease_expires_at timestamptz,
  dispatch_reserved boolean NOT NULL DEFAULT false,
  failure_category text,
  draft_result jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  expires_at timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '7 days'),
  retention_expires_at timestamptz NOT NULL DEFAULT (pg_catalog.now() + interval '14 days'),
  UNIQUE (teacher_id, request_id),
  CHECK (retention_expires_at > expires_at),
  CHECK (planned_calls = question_count / 2),
  CHECK (completed_batches <= attempted_calls AND attempted_calls <= planned_calls),
  CHECK ((status = 'RUNNING') =
    (active_batch IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (active_batch IS NULL OR active_batch BETWEEN 0 AND planned_calls - 1),
  CHECK (NOT dispatch_reserved OR status = 'RUNNING'),
  CHECK (cancel_requested = (status = 'CANCELED')),
  CHECK ((status = 'COMPLETED') = (draft_result IS NOT NULL)),
  CHECK (draft_result IS NULL OR pg_catalog.jsonb_typeof(draft_result) = 'object')
);

CREATE TABLE public.weekly_draft_generation_checkpoints (
  job_id uuid NOT NULL REFERENCES public.weekly_draft_generation_jobs(id) ON DELETE CASCADE,
  batch_index smallint NOT NULL CHECK (batch_index BETWEEN 0 AND 19),
  validated_response jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(validated_response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (job_id, batch_index)
);

CREATE INDEX weekly_draft_generation_expiry_idx
  ON public.weekly_draft_generation_jobs (expires_at);
CREATE INDEX weekly_draft_generation_owner_idx
  ON public.weekly_draft_generation_jobs (teacher_id, created_at DESC);

ALTER TABLE public.weekly_draft_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_draft_generation_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.weekly_draft_generation_jobs,
  public.weekly_draft_generation_checkpoints FROM PUBLIC, anon, authenticated, service_role;
-- No direct table policy or client table grant: all access is through the narrow RPCs.

-- Internal RPC. The route must supply p_teacher_id from a verified active Teacher,
-- not from request JSON. The saved plan and its current content are checked again here.
CREATE FUNCTION public.weekly_draft_job_submit_v1(
  p_teacher_id uuid, p_request_id text, p_source_lesson_plan_id uuid,
  p_question_count integer, p_source_days jsonb, p_expected_source jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_plan record; v_hash bytea; v_fingerprint bytea;
  v_job public.weekly_draft_generation_jobs%ROWTYPE;
BEGIN
  IF p_teacher_id IS NULL OR p_source_lesson_plan_id IS NULL OR
    p_request_id IS NULL OR pg_catalog.length(pg_catalog.btrim(p_request_id)) NOT BETWEEN 1 AND 128 OR
    p_question_count IS NULL OR p_question_count NOT IN (20, 30, 40) OR
    pg_catalog.jsonb_typeof(p_source_days) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;
  IF pg_catalog.jsonb_array_length(p_source_days) <> 5 OR
    pg_catalog.octet_length(p_source_days::text) > 65536 THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;
  IF pg_catalog.jsonb_typeof(p_expected_source) IS DISTINCT FROM 'object' OR
    pg_catalog.octet_length(p_expected_source::text) > 1048576 THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_expected_source)) <> 7 OR
    NOT (p_expected_source ?& ARRAY['title', 'objectives', 'subject', 'grade_level',
      'subject_id', 'academic_year', 'ai_generated']) OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'title') IS DISTINCT FROM 'string' OR
    pg_catalog.btrim(p_expected_source ->> 'title') = '' OR
    pg_catalog.length(p_expected_source ->> 'title') > 255 OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'objectives') IS DISTINCT FROM 'string' OR
    pg_catalog.btrim(p_expected_source ->> 'objectives') = '' OR
    pg_catalog.octet_length(p_expected_source ->> 'objectives') > 262144 OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'subject') NOT IN ('string', 'null') OR
    (pg_catalog.jsonb_typeof(p_expected_source -> 'subject') = 'string' AND
      pg_catalog.length(p_expected_source ->> 'subject') > 100) OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'grade_level') NOT IN ('string', 'null') OR
    (pg_catalog.jsonb_typeof(p_expected_source -> 'grade_level') = 'string' AND
      pg_catalog.length(p_expected_source ->> 'grade_level') > 50) OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'subject_id') NOT IN ('string', 'null') OR
    (pg_catalog.jsonb_typeof(p_expected_source -> 'subject_id') = 'string' AND
      (p_expected_source ->> 'subject_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'academic_year') NOT IN ('string', 'null') OR
    (pg_catalog.jsonb_typeof(p_expected_source -> 'academic_year') = 'string' AND
      pg_catalog.length(p_expected_source ->> 'academic_year') > 20) OR
    pg_catalog.jsonb_typeof(p_expected_source -> 'ai_generated') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_teacher_id
      AND p.role = 'teacher' AND p.status = 'active') THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT lp.id, lp.title, lp.objectives, lp.subject, lp.grade_level, lp.subject_id,
    lp.academic_year, lp.ai_generated
    INTO v_plan FROM public.lesson_plans lp
    WHERE lp.id = p_source_lesson_plan_id AND lp.teacher_id = p_teacher_id
      AND lp.status IN ('draft', 'published') FOR SHARE;
  IF NOT FOUND OR v_plan.objectives IS NULL OR pg_catalog.btrim(v_plan.title) = '' OR
    pg_catalog.btrim(v_plan.objectives) = '' THEN
    RAISE EXCEPTION 'source_denied';
  END IF;
  IF p_expected_source IS DISTINCT FROM pg_catalog.jsonb_build_object(
    'title', v_plan.title, 'objectives', v_plan.objectives, 'subject', v_plan.subject,
    'grade_level', v_plan.grade_level, 'subject_id', v_plan.subject_id,
    'academic_year', v_plan.academic_year, 'ai_generated', v_plan.ai_generated) THEN
    RAISE EXCEPTION 'source_changed';
  END IF;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(v_plan.title, v_plan.objectives,
      v_plan.subject, v_plan.grade_level, v_plan.subject_id,
      v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8'));
  v_fingerprint := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(p_source_lesson_plan_id, p_question_count,
      pg_catalog.encode(v_hash, 'hex'), p_source_days)::text, 'UTF8'));
  INSERT INTO public.weekly_draft_generation_jobs
    (teacher_id, source_lesson_plan_id, request_id, request_fingerprint,
     source_hash, source_days, question_count, planned_calls)
  VALUES (p_teacher_id, p_source_lesson_plan_id, p_request_id, v_fingerprint,
    v_hash, p_source_days, p_question_count, 5 * p_question_count / 10)
  ON CONFLICT (teacher_id, request_id) DO NOTHING;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE teacher_id = p_teacher_id AND request_id = p_request_id;
  IF v_job.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_job.id, 'status', v_job.status,
    'plannedCalls', v_job.planned_calls, 'attemptedCalls', v_job.attempted_calls,
    'completedBatches', v_job.completed_batches);
END $$;

-- Owner read returns metadata only. Checkpoints and draft answers stay private.
CREATE FUNCTION public.weekly_draft_job_status_v1(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_job public.weekly_draft_generation_jobs%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.role = 'teacher' AND p.status = 'active') THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id AND teacher_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.status = 'QUEUED' AND v_job.expires_at <= v_now THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = 'timeout', updated_at = v_now,
      retention_expires_at = v_now + interval '7 days' WHERE id = p_job_id;
    v_job.status := 'FAILED';
    v_job.failure_category := 'timeout';
    v_job.retention_expires_at := v_now + interval '7 days';
  ELSIF v_job.status = 'RUNNING' AND v_job.expires_at <= v_now THEN
    UPDATE public.weekly_draft_generation_jobs SET
      status = CASE WHEN v_job.dispatch_reserved THEN 'INTERRUPTED_UNKNOWN_OUTCOME' ELSE 'FAILED' END,
      failure_category = CASE WHEN v_job.dispatch_reserved THEN v_job.failure_category ELSE 'timeout' END,
      active_batch = NULL, lease_token = NULL, lease_expires_at = NULL,
      dispatch_reserved = false, updated_at = v_now,
      retention_expires_at = v_now + interval '7 days' WHERE id = p_job_id;
    v_job.status := CASE WHEN v_job.dispatch_reserved THEN 'INTERRUPTED_UNKNOWN_OUTCOME' ELSE 'FAILED' END;
    IF NOT v_job.dispatch_reserved THEN v_job.failure_category := 'timeout'; END IF;
    v_job.retention_expires_at := v_now + interval '7 days';
  END IF;
  IF (v_job.status NOT IN ('COMPLETED', 'CANCELED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME')
    AND v_job.expires_at <= v_now) OR v_job.retention_expires_at <= v_now THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_job.id, 'status', v_job.status,
    'plannedCalls', v_job.planned_calls, 'attemptedCalls', v_job.attempted_calls,
    'completedBatches', v_job.completed_batches,
    'failureCategory', v_job.failure_category);
END $$;

-- Private worker observation only. Reservation and finish still serialize with Cancel.
CREATE FUNCTION public.weekly_draft_job_worker_status_v1(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_status text; v_cancel_requested boolean;
BEGIN
  SELECT status, cancel_requested INTO v_status, v_cancel_requested
    FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id AND expires_at > pg_catalog.now();
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN pg_catalog.jsonb_build_object('id', p_job_id, 'status', v_status,
    'cancelRequested', v_cancel_requested);
END $$;

-- Cancel and reserve_dispatch lock the SAME row. Whichever commits first wins.
-- If reserve wins, an in-flight provider call may consume tokens; completion still
-- discards its result. If Cancel wins, reserve returns false before dispatch.
CREATE FUNCTION public.weekly_draft_job_cancel_v1(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_job public.weekly_draft_generation_jobs%ROWTYPE;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.role = 'teacher' AND p.status = 'active') THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id AND teacher_id = v_user AND expires_at > pg_catalog.now()
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_job.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_job.status IN ('QUEUED', 'RUNNING') THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'CANCELED',
      cancel_requested = true, active_batch = NULL, lease_token = NULL,
      lease_expires_at = NULL, dispatch_reserved = false,
      updated_at = pg_catalog.now() WHERE id = p_job_id;
    v_job.status := 'CANCELED';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_job.id, 'status', v_job.status);
END $$;

-- A claim allocates a bounded lease but does NOT authorize provider dispatch.
-- It returns current plan metadata and bounded prior questions from this day only.
-- An expired lease can be reclaimed only if dispatch was never reserved.
CREATE FUNCTION public.weekly_draft_job_claim_v1(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE; v_token uuid; v_now timestamptz;
  v_plan record; v_hash bytea; v_day_start integer; v_prior_batches integer;
  v_count integer; v_first integer; v_last integer; v_invalid integer;
  v_prior_questions jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_job.status IN ('CANCELED', 'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME')
    OR v_job.cancel_requested THEN RETURN NULL; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.status = 'RUNNING' AND v_job.expires_at <= v_now THEN
    UPDATE public.weekly_draft_generation_jobs SET
      status = CASE WHEN v_job.dispatch_reserved THEN 'INTERRUPTED_UNKNOWN_OUTCOME' ELSE 'FAILED' END,
      failure_category = CASE WHEN v_job.dispatch_reserved THEN v_job.failure_category ELSE 'timeout' END,
      active_batch = NULL, lease_token = NULL, lease_expires_at = NULL,
      dispatch_reserved = false, updated_at = v_now,
      retention_expires_at = v_now + interval '7 days' WHERE id = p_job_id;
    RETURN NULL;
  END IF;
  IF v_job.status = 'RUNNING' AND v_job.lease_expires_at <= pg_catalog.clock_timestamp() THEN
    IF v_job.dispatch_reserved THEN
      UPDATE public.weekly_draft_generation_jobs SET
        status = 'INTERRUPTED_UNKNOWN_OUTCOME', active_batch = NULL,
        lease_token = NULL, lease_expires_at = NULL, dispatch_reserved = false,
        updated_at = pg_catalog.now() WHERE id = p_job_id;
      RETURN NULL;
    END IF;
    UPDATE public.weekly_draft_generation_jobs SET status = 'QUEUED',
      active_batch = NULL, lease_token = NULL, lease_expires_at = NULL,
      dispatch_reserved = false, updated_at = pg_catalog.now() WHERE id = p_job_id;
    v_job.status := 'QUEUED';
  END IF;
  IF v_job.status <> 'QUEUED' OR v_job.cancel_requested THEN RETURN NULL; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.expires_at <= v_now THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = 'timeout', updated_at = v_now,
      retention_expires_at = v_now + interval '7 days' WHERE id = p_job_id;
    RETURN NULL;
  END IF;
  IF v_job.completed_batches >= v_job.planned_calls THEN RETURN NULL; END IF;
  SELECT lp.id, lp.title, lp.objectives, lp.subject, lp.grade_level, lp.subject_id,
    lp.academic_year, lp.ai_generated
    INTO v_plan FROM public.lesson_plans lp
    WHERE lp.id = v_job.source_lesson_plan_id AND lp.teacher_id = v_job.teacher_id
      AND lp.status IN ('draft', 'published') FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = 'source_changed', updated_at = pg_catalog.now()
      WHERE id = p_job_id;
    RETURN NULL;
  END IF;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(v_plan.title, v_plan.objectives,
      v_plan.subject, v_plan.grade_level, v_plan.subject_id,
      v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8'));
  IF v_hash IS DISTINCT FROM v_job.source_hash THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = 'source_changed', updated_at = pg_catalog.now()
      WHERE id = p_job_id;
    RETURN NULL;
  END IF;
  v_day_start := (v_job.completed_batches / (v_job.question_count / 10)) *
    (v_job.question_count / 10);
  v_prior_batches := v_job.completed_batches - v_day_start;
  IF v_prior_batches > 0 THEN
    SELECT pg_catalog.count(*)::integer, pg_catalog.min(c.batch_index),
      pg_catalog.max(c.batch_index),
      pg_catalog.count(*) FILTER (WHERE
        pg_catalog.octet_length(c.validated_response::text) > 1048576 OR
        pg_catalog.jsonb_typeof(c.validated_response -> 'questions') IS DISTINCT FROM 'array'
        OR CASE WHEN pg_catalog.jsonb_typeof(c.validated_response -> 'questions') = 'array'
          THEN pg_catalog.jsonb_array_length(c.validated_response -> 'questions') <> 10
          ELSE true END)::integer
      INTO v_count, v_first, v_last, v_invalid
      FROM public.weekly_draft_generation_checkpoints c
      WHERE c.job_id = p_job_id AND c.batch_index >= v_day_start
        AND c.batch_index < v_job.completed_batches;
    IF v_count <> v_prior_batches OR v_first <> v_day_start OR
      v_last <> v_job.completed_batches - 1 OR v_invalid <> 0 THEN
      UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
        failure_category = 'validation', updated_at = pg_catalog.now()
        WHERE id = p_job_id;
      RETURN NULL;
    END IF;
    SELECT pg_catalog.jsonb_agg(q.item ->> 'question' ORDER BY c.batch_index, q.item_index),
      pg_catalog.count(*) FILTER (WHERE
        pg_catalog.jsonb_typeof(q.item -> 'question') IS DISTINCT FROM 'string' OR
        pg_catalog.btrim(q.item ->> 'question') = '' OR
        pg_catalog.length(q.item ->> 'question') > 2000 OR
        pg_catalog.octet_length(q.item ->> 'question') > 8192)::integer
      INTO v_prior_questions, v_invalid
      FROM public.weekly_draft_generation_checkpoints c,
        LATERAL pg_catalog.jsonb_array_elements(c.validated_response -> 'questions')
          WITH ORDINALITY AS q(item, item_index)
      WHERE c.job_id = p_job_id AND c.batch_index >= v_day_start
        AND c.batch_index < v_job.completed_batches;
    IF v_invalid <> 0 OR pg_catalog.jsonb_array_length(v_prior_questions) <>
      v_prior_batches * 10 OR pg_catalog.octet_length(v_prior_questions::text) > 262144 THEN
      UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
        failure_category = 'validation', updated_at = pg_catalog.now()
        WHERE id = p_job_id;
      RETURN NULL;
    END IF;
  END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.expires_at <= v_now + interval '110 seconds' THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = 'timeout', active_batch = NULL, lease_token = NULL,
      lease_expires_at = NULL, dispatch_reserved = false,
      updated_at = v_now,
      retention_expires_at = CASE WHEN v_job.expires_at <= v_now
        THEN v_now + interval '7 days' ELSE v_job.retention_expires_at END
      WHERE id = p_job_id;
    RETURN NULL;
  END IF;
  v_token := pg_catalog.gen_random_uuid();
  UPDATE public.weekly_draft_generation_jobs SET status = 'RUNNING',
    active_batch = v_job.completed_batches, lease_token = v_token,
    lease_expires_at = v_now + interval '110 seconds',
    dispatch_reserved = false, updated_at = v_now
    WHERE id = p_job_id;
  RETURN pg_catalog.jsonb_build_object('id', v_job.id, 'leaseToken', v_token,
    'batchIndex', v_job.completed_batches, 'questionCount', v_job.question_count,
    'sourceLessonPlanId', v_job.source_lesson_plan_id,
    'sourceDays', v_job.source_days,
    'plan', pg_catalog.jsonb_build_object('id', v_plan.id, 'title', v_plan.title,
      'subject', v_plan.subject, 'grade_level', v_plan.grade_level,
      'subject_id', v_plan.subject_id, 'academic_year', v_plan.academic_year),
    'priorQuestions', v_prior_questions);
END $$;

CREATE FUNCTION public.weekly_draft_job_reserve_dispatch_v1(
  p_job_id uuid, p_lease_token uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE; v_plan record; v_hash bytea;
BEGIN
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'RUNNING' OR v_job.cancel_requested OR
    v_job.expires_at <= pg_catalog.clock_timestamp() OR
    v_job.lease_token IS DISTINCT FROM p_lease_token OR
    v_job.lease_expires_at <= pg_catalog.clock_timestamp() OR v_job.dispatch_reserved THEN
    RETURN false;
  END IF;
  SELECT lp.title, lp.objectives, lp.subject, lp.grade_level, lp.subject_id,
    lp.academic_year, lp.ai_generated
    INTO v_plan FROM public.lesson_plans lp
    WHERE lp.id = v_job.source_lesson_plan_id AND lp.teacher_id = v_job.teacher_id
      AND lp.status IN ('draft', 'published') FOR SHARE;
  IF FOUND THEN
    v_hash := pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(v_plan.title, v_plan.objectives,
        v_plan.subject, v_plan.grade_level, v_plan.subject_id,
        v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8'));
  END IF;
  IF NOT FOUND OR v_hash IS DISTINCT FROM v_job.source_hash THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = 'source_changed', active_batch = NULL,
      lease_token = NULL, lease_expires_at = NULL, dispatch_reserved = false,
      updated_at = pg_catalog.now() WHERE id = p_job_id;
    RETURN false;
  END IF;
  IF v_job.expires_at <= pg_catalog.clock_timestamp() OR
    v_job.lease_expires_at <= pg_catalog.clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.weekly_draft_generation_jobs SET dispatch_reserved = true,
    attempted_calls = attempted_calls + 1, updated_at = pg_catalog.now()
    WHERE id = p_job_id;
  RETURN true;
END $$;

-- The backend validates the provider response before this call. Only a valid
-- checkpoint object is accepted; failure categories are fixed and input is bounded.
CREATE FUNCTION public.weekly_draft_job_finish_batch_v1(
  p_job_id uuid, p_lease_token uuid, p_checkpoint jsonb, p_failure_category text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE; v_now timestamptz;
BEGIN
  IF (p_checkpoint IS NULL) = (p_failure_category IS NULL) OR
    (p_failure_category IS NOT NULL AND p_failure_category NOT IN
      ('provider', 'validation', 'timeout', 'capacity', 'source_changed')) THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  IF p_checkpoint IS NOT NULL AND
    (pg_catalog.jsonb_typeof(p_checkpoint) <> 'object' OR
      pg_catalog.octet_length(p_checkpoint::text) > 1048576) THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.status = 'RUNNING' AND v_job.expires_at <= v_now THEN
    UPDATE public.weekly_draft_generation_jobs SET
      status = CASE WHEN v_job.dispatch_reserved THEN 'INTERRUPTED_UNKNOWN_OUTCOME' ELSE 'FAILED' END,
      failure_category = CASE WHEN v_job.dispatch_reserved THEN v_job.failure_category ELSE 'timeout' END,
      active_batch = NULL, lease_token = NULL, lease_expires_at = NULL,
      dispatch_reserved = false, updated_at = v_now,
      retention_expires_at = v_now + interval '7 days' WHERE id = p_job_id;
    RETURN false;
  END IF;
  IF v_job.status <> 'RUNNING' OR v_job.cancel_requested OR
    v_job.lease_token IS DISTINCT FROM p_lease_token OR
    NOT v_job.dispatch_reserved THEN RETURN false; END IF;
  IF v_job.lease_expires_at <= pg_catalog.clock_timestamp() THEN
    UPDATE public.weekly_draft_generation_jobs SET
      status = 'INTERRUPTED_UNKNOWN_OUTCOME', active_batch = NULL,
      lease_token = NULL, lease_expires_at = NULL, dispatch_reserved = false,
      updated_at = pg_catalog.now() WHERE id = p_job_id;
    RETURN false;
  END IF;
  IF p_checkpoint IS NOT NULL THEN
    INSERT INTO public.weekly_draft_generation_checkpoints
      (job_id, batch_index, validated_response)
    VALUES (p_job_id, v_job.active_batch, p_checkpoint);
  END IF;
  UPDATE public.weekly_draft_generation_jobs SET
    completed_batches = completed_batches + CASE WHEN p_checkpoint IS NULL THEN 0 ELSE 1 END,
    status = CASE WHEN p_checkpoint IS NULL THEN 'FAILED' ELSE 'QUEUED' END,
    failure_category = p_failure_category, active_batch = NULL,
    lease_token = NULL, lease_expires_at = NULL, dispatch_reserved = false,
    updated_at = pg_catalog.now() WHERE id = p_job_id;
  RETURN true;
END $$;

-- Private final-assembly read. Locking the job serializes this snapshot with
-- Cancel and finish_batch. The primary key plus count/min/max prove indexes
-- are exactly 0..planned_calls-1; no checkpoint table grant is exposed.
CREATE FUNCTION public.weekly_draft_job_read_checkpoints_v1(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE; v_plan record; v_hash bytea;
  v_count integer; v_first integer; v_last integer; v_bytes bigint; v_largest integer;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id AND expires_at > pg_catalog.now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_job.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_job.status IN ('CANCELED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME', 'COMPLETED')
    OR v_job.cancel_requested THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF v_job.status <> 'QUEUED' OR v_job.completed_batches <> v_job.planned_calls THEN
    RAISE EXCEPTION 'not_ready';
  END IF;
  SELECT lp.id, lp.title, lp.objectives, lp.subject, lp.grade_level, lp.subject_id,
    lp.academic_year, lp.ai_generated INTO v_plan FROM public.lesson_plans lp
    WHERE lp.id = v_job.source_lesson_plan_id AND lp.teacher_id = v_job.teacher_id
      AND lp.status IN ('draft', 'published') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_changed'; END IF;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(v_plan.title, v_plan.objectives,
      v_plan.subject, v_plan.grade_level, v_plan.subject_id,
      v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8'));
  IF v_hash IS DISTINCT FROM v_job.source_hash THEN RAISE EXCEPTION 'source_changed'; END IF;
  SELECT pg_catalog.count(*)::integer, pg_catalog.min(c.batch_index),
    pg_catalog.max(c.batch_index),
    COALESCE(pg_catalog.sum(pg_catalog.octet_length(c.validated_response::text)), 0),
    COALESCE(pg_catalog.max(pg_catalog.octet_length(c.validated_response::text)), 0)
    INTO v_count, v_first, v_last, v_bytes, v_largest
    FROM public.weekly_draft_generation_checkpoints c WHERE c.job_id = p_job_id;
  IF v_count <> v_job.planned_calls OR v_first <> 0 OR
    v_last <> v_job.planned_calls - 1 OR v_bytes > 20971520 OR
    v_largest > 1048576 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('batchIndex', c.batch_index,
    'validatedResponse', c.validated_response) ORDER BY c.batch_index)
    INTO v_rows FROM public.weekly_draft_generation_checkpoints c
    WHERE c.job_id = p_job_id;
  IF v_job.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  RETURN pg_catalog.jsonb_build_object('id', v_job.id,
    'teacherId', v_job.teacher_id, 'sourceLessonPlanId', v_job.source_lesson_plan_id,
    'sourceDays', v_job.source_days, 'questionCount', v_job.question_count,
    'plannedCalls', v_job.planned_calls,
    'plan', pg_catalog.jsonb_build_object('id', v_plan.id, 'title', v_plan.title,
      'subject', v_plan.subject, 'grade_level', v_plan.grade_level,
      'subject_id', v_plan.subject_id, 'academic_year', v_plan.academic_year),
    'checkpoints', v_rows);
END $$;

-- Only the trusted worker can close an unfinalizable, fully checkpointed job.
-- The job lock is the same Cancel/complete serialization boundary.
CREATE FUNCTION public.weekly_draft_job_fail_finalization_v1(
  p_job_id uuid, p_failure_category text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE;
BEGIN
  IF p_failure_category IS NULL OR p_failure_category NOT IN
    ('validation', 'source_changed') THEN RAISE EXCEPTION 'invalid_request'; END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'QUEUED' OR v_job.cancel_requested OR
    v_job.expires_at <= pg_catalog.clock_timestamp() OR
    v_job.completed_batches <> v_job.planned_calls OR
    v_job.active_batch IS NOT NULL OR v_job.lease_token IS NOT NULL OR
    v_job.lease_expires_at IS NOT NULL OR v_job.dispatch_reserved OR
    v_job.failure_category IS NOT NULL OR v_job.draft_result IS NOT NULL THEN
    RETURN false;
  END IF;
  UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
    failure_category = p_failure_category, updated_at = pg_catalog.now()
    WHERE id = p_job_id;
  RETURN true;
END $$;

-- Final assembly is performed by the backend from validated checkpoints.
-- No worksheet row is created. A canceled job can never acquire a draft result.
CREATE FUNCTION public.weekly_draft_job_complete_v1(
  p_job_id uuid, p_draft jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE; v_plan record; v_hash bytea;
BEGIN
  IF pg_catalog.jsonb_typeof(p_draft) IS DISTINCT FROM 'object' OR
    pg_catalog.octet_length(p_draft::text) > 5242880 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  IF pg_catalog.jsonb_typeof(p_draft -> 'worksheets') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  IF pg_catalog.jsonb_array_length(p_draft -> 'worksheets') <> 5 OR
    p_draft ->> 'kind' IS DISTINCT FROM 'weekly-worksheet-collection' OR
    p_draft ->> 'status' IS DISTINCT FROM 'local-draft' OR
    p_draft ->> 'saved' IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id AND expires_at > pg_catalog.now() FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'QUEUED' OR v_job.cancel_requested OR
    v_job.completed_batches <> v_job.planned_calls OR
    v_job.expires_at <= pg_catalog.clock_timestamp() THEN RETURN false; END IF;
  IF p_draft ->> 'teacherId' IS DISTINCT FROM v_job.teacher_id::text OR
    p_draft -> 'sourceLessonPlan' ->> 'id' IS DISTINCT FROM v_job.source_lesson_plan_id::text OR
    EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_draft -> 'worksheets')
      WITH ORDINALITY AS w(document, day_number)
      WHERE w.document ->> 'day' IS DISTINCT FROM
        (ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])[w.day_number::integer]) THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  SELECT lp.title, lp.objectives, lp.subject, lp.grade_level, lp.subject_id,
    lp.academic_year, lp.ai_generated INTO v_plan
    FROM public.lesson_plans lp WHERE lp.id = v_job.source_lesson_plan_id
      AND lp.teacher_id = v_job.teacher_id
      AND lp.status IN ('draft', 'published') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_changed'; END IF;
  v_hash := pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(v_plan.title, v_plan.objectives,
      v_plan.subject, v_plan.grade_level, v_plan.subject_id,
      v_plan.academic_year, v_plan.ai_generated)::text, 'UTF8'));
  IF v_hash IS DISTINCT FROM v_job.source_hash THEN RAISE EXCEPTION 'source_changed'; END IF;
  IF v_job.expires_at <= pg_catalog.clock_timestamp() THEN RETURN false; END IF;
  UPDATE public.weekly_draft_generation_jobs SET status = 'COMPLETED',
    draft_result = p_draft, updated_at = pg_catalog.now() WHERE id = p_job_id;
  RETURN true;
END $$;

CREATE FUNCTION public.weekly_draft_job_result_v1(p_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_job public.weekly_draft_generation_jobs%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = v_user AND p.role = 'teacher' AND p.status = 'active') THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id AND teacher_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.status IN ('QUEUED', 'RUNNING') AND v_job.expires_at <= v_now THEN
    -- An exception rolls back writes; owner status or purge performs reconciliation.
    RAISE EXCEPTION 'not_ready';
  END IF;
  IF v_job.retention_expires_at <= v_now THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_job.status <> 'COMPLETED' THEN RAISE EXCEPTION 'not_ready'; END IF;
  RETURN v_job.draft_result;
END $$;

-- Private scheduling hint only. Claim, recovery, and completion recheck state
-- under the job lock. Expired rows are reconciled by owner status or purge,
-- never dispatched or assembled.
CREATE FUNCTION public.weekly_draft_job_discover_work_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job_id uuid; v_action text; v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT j.id, CASE
      WHEN j.status = 'RUNNING' THEN 'recover'
      WHEN j.completed_batches = j.planned_calls THEN 'assemble'
      ELSE 'claim' END
    INTO v_job_id, v_action
    FROM public.weekly_draft_generation_jobs j
    WHERE j.expires_at > v_now AND NOT j.cancel_requested
      AND ((j.status = 'QUEUED' AND j.completed_batches < j.planned_calls)
        OR (j.status = 'QUEUED' AND j.completed_batches = j.planned_calls)
        OR (j.status = 'RUNNING' AND j.lease_expires_at <= v_now))
    ORDER BY j.created_at, j.id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN pg_catalog.jsonb_build_object('jobId', v_job_id, 'action', v_action);
END $$;

-- Optional bounded cleanup. An expired queued or running job becomes terminal
-- under the same row lock as Cancel and complete. Retention starts at this
-- transition, so a late purge cannot erase it immediately.
CREATE FUNCTION public.weekly_draft_job_purge_v1()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_count integer := 0; v_job record; v_now timestamptz;
BEGIN
  FOR v_job IN SELECT id, status, completed_batches, planned_calls, dispatch_reserved,
      failure_category, retention_expires_at FROM public.weekly_draft_generation_jobs
      WHERE expires_at <= pg_catalog.clock_timestamp()
        AND (status = 'QUEUED'
          OR status = 'RUNNING'
          OR retention_expires_at <= pg_catalog.clock_timestamp())
      ORDER BY expires_at, id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
    v_now := pg_catalog.clock_timestamp();
    IF v_job.status = 'QUEUED' THEN
      UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
        failure_category = 'timeout', updated_at = v_now,
        retention_expires_at = v_now + interval '7 days' WHERE id = v_job.id;
    ELSIF v_job.status = 'RUNNING' THEN
      UPDATE public.weekly_draft_generation_jobs SET
        status = CASE WHEN v_job.dispatch_reserved THEN 'INTERRUPTED_UNKNOWN_OUTCOME' ELSE 'FAILED' END,
        failure_category = CASE WHEN v_job.dispatch_reserved THEN v_job.failure_category ELSE 'timeout' END,
        active_batch = NULL, lease_token = NULL, lease_expires_at = NULL,
        dispatch_reserved = false, updated_at = v_now,
        retention_expires_at = v_now + interval '7 days' WHERE id = v_job.id;
    ELSIF v_job.retention_expires_at <= v_now THEN
      DELETE FROM public.weekly_draft_generation_jobs WHERE id = v_job.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION
  public.weekly_draft_job_submit_v1(uuid,text,uuid,integer,jsonb,jsonb),
  public.weekly_draft_job_status_v1(uuid),
  public.weekly_draft_job_worker_status_v1(uuid),
  public.weekly_draft_job_cancel_v1(uuid),
  public.weekly_draft_job_claim_v1(uuid),
  public.weekly_draft_job_reserve_dispatch_v1(uuid,uuid),
  public.weekly_draft_job_finish_batch_v1(uuid,uuid,jsonb,text),
  public.weekly_draft_job_read_checkpoints_v1(uuid),
  public.weekly_draft_job_fail_finalization_v1(uuid,text),
  public.weekly_draft_job_complete_v1(uuid,jsonb),
  public.weekly_draft_job_result_v1(uuid),
  public.weekly_draft_job_discover_work_v1(),
  public.weekly_draft_job_purge_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.weekly_draft_job_status_v1(uuid),
  public.weekly_draft_job_cancel_v1(uuid),
  public.weekly_draft_job_result_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.weekly_draft_job_submit_v1(uuid,text,uuid,integer,jsonb,jsonb),
  public.weekly_draft_job_worker_status_v1(uuid),
  public.weekly_draft_job_claim_v1(uuid),
  public.weekly_draft_job_reserve_dispatch_v1(uuid,uuid),
  public.weekly_draft_job_finish_batch_v1(uuid,uuid,jsonb,text),
  public.weekly_draft_job_read_checkpoints_v1(uuid),
  public.weekly_draft_job_fail_finalization_v1(uuid,text),
  public.weekly_draft_job_complete_v1(uuid,jsonb),
  public.weekly_draft_job_discover_work_v1(),
  public.weekly_draft_job_purge_v1() TO service_role;

COMMIT;
