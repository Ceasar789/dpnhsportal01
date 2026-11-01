-- REVIEW ONLY. These are owner-scoped read/status RPCs and safe Teacher state
-- transitions. Worker writes and final commit use the separately gated direct
-- PostgreSQL transaction adapter; no production connection exists. The NOLOGIN
-- executor must never be granted to anon/authenticated or used by a browser.
-- Reconcile all referenced deployed columns, policies and grants first.
BEGIN;

GRANT SELECT, INSERT, UPDATE ON public.weekly_worksheet_jobs
  TO eduscribe_authoring_executor;
GRANT SELECT, INSERT ON public.weekly_worksheet_job_receipts,
  public.weekly_worksheet_checkpoints TO eduscribe_authoring_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_worksheet_collections,
  public.weekly_worksheet_daily_drafts TO eduscribe_authoring_executor;
GRANT SELECT ON public.task_assignees TO eduscribe_authoring_executor;
GRANT DELETE ON public.worksheets TO eduscribe_authoring_executor;
CREATE POLICY eduscribe_weekly_jobs_executor ON public.weekly_worksheet_jobs
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_weekly_receipts_executor ON public.weekly_worksheet_job_receipts
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_weekly_checkpoints_executor ON public.weekly_worksheet_checkpoints
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_weekly_collections_executor ON public.weekly_worksheet_collections
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_weekly_daily_executor ON public.weekly_worksheet_daily_drafts
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_weekly_assignees_read ON public.task_assignees
  FOR SELECT TO eduscribe_authoring_executor USING (true);

CREATE FUNCTION public.eduscribe_weekly_job_status_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_job public.weekly_worksheet_jobs%ROWTYPE;
        v_completed integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
    AND p.role = 'teacher' AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT * INTO v_job FROM public.weekly_worksheet_jobs j
    WHERE j.id = p_id AND j.teacher_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  SELECT count(*) INTO v_completed FROM public.weekly_worksheet_checkpoints c WHERE c.job_id = p_id;
  RETURN pg_catalog.jsonb_build_object('id',v_job.id,'version',v_job.job_version,
    'sourceLessonPlanId',v_job.source_lesson_plan_id,'questionCount',v_job.question_count,
    'createdAt',v_job.created_at,'status',v_job.status,'plannedProviderCalls',v_job.planned_calls,
    'attemptedProviderCalls',v_job.attempted_calls,'completedValidatedBatches',v_completed,
    'retryAfter',v_job.retry_after,'failureCategory',v_job.failure_category,
    'saved',v_job.status = 'COMPLETED','collectionId',CASE WHEN v_job.status = 'COMPLETED'
      THEN v_job.collection_id ELSE NULL END);
END $$;

CREATE FUNCTION public.eduscribe_weekly_job_list_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
    AND p.role = 'teacher' AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(public.eduscribe_weekly_job_status_v1(j.id)
    ORDER BY j.created_at DESC), '[]'::jsonb) INTO v_result
    FROM (SELECT id, created_at FROM public.weekly_worksheet_jobs
      WHERE teacher_id = v_user ORDER BY created_at DESC LIMIT 50) j;
  RETURN v_result;
END $$;

CREATE FUNCTION public.eduscribe_weekly_collection_read_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_document jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
    AND p.role = 'teacher' AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT c.private_document INTO v_document FROM public.weekly_worksheet_collections c
    WHERE c.id = p_id AND c.teacher_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN v_document;
END $$;

CREATE FUNCTION public.eduscribe_weekly_job_cancel_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_job public.weekly_worksheet_jobs%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
    AND p.role = 'teacher' AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT * INTO v_job FROM public.weekly_worksheet_jobs
    WHERE id = p_id AND teacher_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_job.status NOT IN ('COMPLETED','CANCELED') THEN
    UPDATE public.weekly_worksheet_jobs j SET
      status = CASE WHEN v_job.status = 'RUNNING' THEN 'RUNNING' ELSE 'CANCELED' END,
      cancel_requested = true,
      private_state = pg_catalog.jsonb_set(pg_catalog.jsonb_set(j.private_state,
        '{status}', pg_catalog.to_jsonb(CASE WHEN v_job.status = 'RUNNING' THEN 'RUNNING' ELSE 'CANCELED' END)),
        '{cancelRequested}', 'true'::jsonb),
      revision = j.revision + 1, updated_at = now() WHERE j.id = p_id;
  END IF;
  RETURN public.eduscribe_weekly_job_status_v1(p_id);
END $$;

CREATE FUNCTION public.eduscribe_weekly_job_resume_v1(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_user uuid := auth.uid(); v_job public.weekly_worksheet_jobs%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
    AND p.role = 'teacher' AND p.status = 'active') THEN RAISE EXCEPTION 'inactive_teacher'; END IF;
  SELECT * INTO v_job FROM public.weekly_worksheet_jobs
    WHERE id = p_id AND teacher_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_job.status <> 'WAITING_FOR_CAPACITY' OR
    (v_job.retry_after IS NOT NULL AND v_job.retry_after > now()) THEN
    RAISE EXCEPTION 'resume_unavailable';
  END IF;
  UPDATE public.weekly_worksheet_jobs j SET status = 'QUEUED', retry_after = NULL,
    private_state = pg_catalog.jsonb_set(pg_catalog.jsonb_set(j.private_state,
      '{status}', '"QUEUED"'::jsonb), '{retryAfter}', 'null'::jsonb),
    revision = j.revision + 1, updated_at = now() WHERE j.id = p_id;
  RETURN public.eduscribe_weekly_job_status_v1(p_id);
END $$;

ALTER FUNCTION public.eduscribe_weekly_job_status_v1(uuid) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_weekly_job_list_v1() OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_weekly_collection_read_v1(uuid) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_weekly_job_cancel_v1(uuid) OWNER TO eduscribe_authoring_executor;
ALTER FUNCTION public.eduscribe_weekly_job_resume_v1(uuid) OWNER TO eduscribe_authoring_executor;
REVOKE ALL ON FUNCTION public.eduscribe_weekly_job_status_v1(uuid),
  public.eduscribe_weekly_job_list_v1(), public.eduscribe_weekly_collection_read_v1(uuid),
  public.eduscribe_weekly_job_cancel_v1(uuid), public.eduscribe_weekly_job_resume_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_weekly_job_status_v1(uuid),
  public.eduscribe_weekly_job_list_v1(), public.eduscribe_weekly_collection_read_v1(uuid),
  public.eduscribe_weekly_job_cancel_v1(uuid), public.eduscribe_weekly_job_resume_v1(uuid)
  TO authenticated;
COMMIT;
