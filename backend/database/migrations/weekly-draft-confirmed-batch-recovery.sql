-- Optional, forward-only recovery for confirmed weekly draft batch failures.
-- Apply after weekly-draft-generation-jobs.sql and before deploying a worker
-- that calls weekly_draft_job_finish_confirmed_failure_v1. No existing job is
-- requeued or modified by this migration. At most one extra reservation per
-- batch and two per job are permitted; uncertain outcomes remain terminal.
BEGIN;

ALTER TABLE public.weekly_draft_generation_jobs
  ADD COLUMN retry_budget_used smallint NOT NULL DEFAULT 0
    CHECK (retry_budget_used BETWEEN 0 AND 2),
  ADD COLUMN retry_batch_index smallint
    CHECK (retry_batch_index IS NULL OR retry_batch_index BETWEEN 0 AND planned_calls - 1),
  ADD CONSTRAINT weekly_draft_retry_marker_check
    CHECK ((retry_budget_used = 0) = (retry_batch_index IS NULL));

-- The original unnamed checks have installation-dependent generated names.
-- Identify their actual definitions and fail closed if the deployed contract
-- differs, instead of dropping any unrelated constraint.
DO $$
DECLARE v_column_name text; v_joint_name text; v_column_count integer; v_joint_count integer;
BEGIN
  SELECT pg_catalog.count(*), pg_catalog.min(c.conname)
    INTO v_column_count, v_column_name
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.weekly_draft_generation_jobs'::pg_catalog.regclass
      AND c.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%attempted_calls >= 0%'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%attempted_calls <= 20%';
  SELECT pg_catalog.count(*), pg_catalog.min(c.conname)
    INTO v_joint_count, v_joint_name
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.weekly_draft_generation_jobs'::pg_catalog.regclass
      AND c.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%completed_batches <= attempted_calls%'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%attempted_calls <= planned_calls%';
  IF v_column_count <> 1 OR v_joint_count <> 1 OR v_column_name = v_joint_name THEN
    RAISE EXCEPTION 'weekly_draft_retry_schema_mismatch';
  END IF;
  EXECUTE pg_catalog.format('ALTER TABLE public.weekly_draft_generation_jobs DROP CONSTRAINT %I', v_column_name);
  EXECUTE pg_catalog.format('ALTER TABLE public.weekly_draft_generation_jobs DROP CONSTRAINT %I', v_joint_name);
END $$;

ALTER TABLE public.weekly_draft_generation_jobs
  ADD CONSTRAINT weekly_draft_attempt_cap_check CHECK (attempted_calls BETWEEN 0 AND 22),
  ADD CONSTRAINT weekly_draft_attempt_budget_check CHECK (
    completed_batches <= attempted_calls
    AND attempted_calls <= planned_calls + retry_budget_used);

CREATE FUNCTION public.weekly_draft_job_finish_confirmed_failure_v1(
  p_job_id uuid, p_lease_token uuid, p_failure_category text, p_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_job public.weekly_draft_generation_jobs%ROWTYPE; v_now timestamptz;
BEGIN
  IF ((p_failure_category = 'provider' AND p_reason = 'groq_json_validate_failed')
    OR (p_failure_category = 'validation' AND p_reason = 'invalid_output')) IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  SELECT * INTO v_job FROM public.weekly_draft_generation_jobs
    WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'RUNNING' OR v_job.cancel_requested
    OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR NOT v_job.dispatch_reserved
    OR v_job.active_batch IS DISTINCT FROM v_job.completed_batches THEN
    RETURN 'stale';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  IF v_job.expires_at <= v_now OR v_job.lease_expires_at <= v_now THEN
    UPDATE public.weekly_draft_generation_jobs SET
      status = 'INTERRUPTED_UNKNOWN_OUTCOME', active_batch = NULL,
      lease_token = NULL, lease_expires_at = NULL, dispatch_reserved = false,
      updated_at = v_now,
      retention_expires_at = CASE WHEN v_job.expires_at <= v_now
        THEN v_now + interval '7 days' ELSE v_job.retention_expires_at END
      WHERE id = p_job_id;
    RETURN 'stale';
  END IF;
  IF v_job.retry_budget_used >= 2 OR v_job.retry_batch_index = v_job.active_batch THEN
    UPDATE public.weekly_draft_generation_jobs SET status = 'FAILED',
      failure_category = p_failure_category, active_batch = NULL,
      lease_token = NULL, lease_expires_at = NULL, dispatch_reserved = false,
      updated_at = v_now WHERE id = p_job_id;
    RETURN 'failed';
  END IF;
  UPDATE public.weekly_draft_generation_jobs SET status = 'QUEUED',
    retry_budget_used = retry_budget_used + 1,
    retry_batch_index = v_job.active_batch,
    failure_category = NULL, active_batch = NULL, lease_token = NULL,
    lease_expires_at = NULL, dispatch_reserved = false, updated_at = v_now
    WHERE id = p_job_id;
  RETURN 'retry_queued';
END $$;

REVOKE ALL ON FUNCTION public.weekly_draft_job_finish_confirmed_failure_v1(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.weekly_draft_job_finish_confirmed_failure_v1(uuid,uuid,text,text)
  TO service_role;
COMMIT;
