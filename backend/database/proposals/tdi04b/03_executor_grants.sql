-- TDI-04B REVIEW ONLY. DO NOT EXECUTE. Reconcile every pre-existing grant,
-- RLS policy, function owner, trigger, and schema ACL in a VERIFIED disposable
-- database before applying. This grants only the NOLOGIN executor, never a
-- client role. There is no production activation or direct client write grant.
BEGIN;
GRANT USAGE ON SCHEMA public, auth TO eduscribe_authoring_executor;
GRANT EXECUTE ON FUNCTION auth.uid() TO eduscribe_authoring_executor;
GRANT SELECT ON public.profiles, public.school_settings, public.subjects,
  public.teacher_subjects, public.worksheet_sections,
  public.worksheet_submissions TO eduscribe_authoring_executor;
GRANT SELECT, INSERT, UPDATE ON public.lesson_plans, public.worksheets
  TO eduscribe_authoring_executor;

-- Policies give the NOLOGIN definer access to rows required for its own
-- checks. Never grant this role to authenticated, anon, or another login.
CREATE POLICY eduscribe_executor_profiles_read ON public.profiles
  FOR SELECT TO eduscribe_authoring_executor USING (true);
CREATE POLICY eduscribe_executor_settings_read ON public.school_settings
  FOR SELECT TO eduscribe_authoring_executor USING (true);
CREATE POLICY eduscribe_executor_subjects_read ON public.subjects
  FOR SELECT TO eduscribe_authoring_executor USING (true);
CREATE POLICY eduscribe_executor_loads_read ON public.teacher_subjects
  FOR SELECT TO eduscribe_authoring_executor USING (true);
CREATE POLICY eduscribe_executor_sections_read ON public.worksheet_sections
  FOR SELECT TO eduscribe_authoring_executor USING (true);
CREATE POLICY eduscribe_executor_submissions_read ON public.worksheet_submissions
  FOR SELECT TO eduscribe_authoring_executor USING (true);
CREATE POLICY eduscribe_executor_lesson_plans ON public.lesson_plans
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);
CREATE POLICY eduscribe_executor_worksheets ON public.worksheets
  FOR ALL TO eduscribe_authoring_executor USING (true) WITH CHECK (true);

-- Only authenticated JWT callers can reach public RPCs. The function still
-- derives auth.uid(), checks profile/load/owner/year, and never trusts client
-- teacher/owner/year claims. Verify anon has no inherited EXECUTE path.
GRANT EXECUTE ON FUNCTION public.eduscribe_manual_write_v1(text,text,uuid,bigint,text,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_manual_read_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_worksheet_write_v1(text,text,uuid,bigint,text,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_worksheet_read_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eduscribe_worksheet_projection_v1(uuid) TO authenticated;
COMMIT;

-- This proposal deliberately does NOT change existing authenticated/anon
-- direct-table grants or existing RLS. Their deployed values are unknown and
-- may support the legacy AI/worksheet paths. The production gate must remain
-- disabled until a coordinated rollout removes direct bypass paths and tests
-- private draft visibility and answer-key isolation with real test JWTs.
