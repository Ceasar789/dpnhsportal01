-- TEST DATA ONLY. Review the target project before applying this whole file.
-- Apply after dev-ai-weekly-worksheet-manage.sql and phase3-04-assignee-read-scope.sql.
-- Distribution is per saved worksheet day. This migration does not change
-- worksheet status, collection revision, answer keys, or existing client policies.
BEGIN;
SET eduscribe.dev_ai_weekly_distribute_migration = 'approved';

DO $$ BEGIN
  IF pg_catalog.current_setting('eduscribe.dev_ai_weekly_distribute_migration', true) IS DISTINCT FROM 'approved'
      OR pg_catalog.to_regprocedure('public.eduscribe_ai_uid()') IS NULL
      OR pg_catalog.to_regprocedure('public.eduscribe_ai_weekly_worksheets_update_v1(uuid,bigint,jsonb)') IS NULL
      OR pg_catalog.to_regprocedure('public.eduscribe_ai_weekly_worksheets_archive_v1(uuid,bigint,boolean)') IS NULL
      OR pg_catalog.to_regclass('public.worksheet_collections') IS NULL
      OR pg_catalog.to_regclass('public.worksheets') IS NULL
      OR pg_catalog.to_regclass('public.task_assignees') IS NULL
      OR pg_catalog.to_regclass('public.sections') IS NULL
      OR pg_catalog.to_regclass('public.schedules') IS NULL
      OR pg_catalog.to_regclass('public.section_students') IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'eduscribe_ai_save_executor' AND NOT rolcanlogin AND NOT rolbypassrls)
      OR NOT pg_catalog.has_table_privilege('eduscribe_ai_save_executor',
        'public.task_assignees', 'SELECT')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'task_assignees'
          AND policyname = 'ai_weekly_manage_assignees_read') THEN
    RAISE EXCEPTION 'weekly distribution prerequisites are unavailable';
  END IF;
END $$;

-- Manage already grants owner-scoped SELECT on task_assignees. Reuse it so an
-- undo of this migration cannot revoke Manage's existing read capability.
GRANT SELECT ON public.sections, public.schedules, public.section_students
  TO eduscribe_ai_save_executor;
GRANT INSERT ON public.task_assignees TO eduscribe_ai_save_executor;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'schedules' AND policyname = 'ai_weekly_distribute_schedules_read') THEN
    CREATE POLICY ai_weekly_distribute_schedules_read ON public.schedules
      FOR SELECT TO eduscribe_ai_save_executor
      USING (teacher_id = public.eduscribe_ai_uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'sections' AND policyname = 'ai_weekly_distribute_sections_read') THEN
    CREATE POLICY ai_weekly_distribute_sections_read ON public.sections
      FOR SELECT TO eduscribe_ai_save_executor
      USING (adviser_id = public.eduscribe_ai_uid()
        OR EXISTS (SELECT 1 FROM public.schedules s
          WHERE s.section_id = sections.id AND s.teacher_id = public.eduscribe_ai_uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'section_students' AND policyname = 'ai_weekly_distribute_members_read') THEN
    CREATE POLICY ai_weekly_distribute_members_read ON public.section_students
      FOR SELECT TO eduscribe_ai_save_executor
      USING (EXISTS (SELECT 1 FROM public.schedules s
          WHERE s.section_id = section_students.section_id
            AND s.teacher_id = public.eduscribe_ai_uid())
        OR EXISTS (SELECT 1 FROM public.sections s
          WHERE s.id = section_students.section_id
            AND s.adviser_id = public.eduscribe_ai_uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public'
      AND tablename = 'task_assignees' AND policyname = 'ai_weekly_distribute_assignees_insert') THEN
    CREATE POLICY ai_weekly_distribute_assignees_insert ON public.task_assignees
      FOR INSERT TO eduscribe_ai_save_executor
      WITH CHECK (assigned_by = public.eduscribe_ai_uid()
        AND EXISTS (SELECT 1 FROM public.worksheets w
          WHERE w.id = task_assignees.task_id AND w.collection_id IS NOT NULL
            AND w.teacher_id = public.eduscribe_ai_uid())
        AND (EXISTS (SELECT 1 FROM public.schedules s
            WHERE s.section_id = task_assignees.section_id
              AND s.teacher_id = public.eduscribe_ai_uid())
          OR EXISTS (SELECT 1 FROM public.sections s
            WHERE s.id = task_assignees.section_id
              AND s.adviser_id = public.eduscribe_ai_uid()))
        AND EXISTS (SELECT 1 FROM public.section_students ss
          WHERE ss.section_id = task_assignees.section_id
            AND ss.student_id = task_assignees.student_id AND ss.status = 'active'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.eduscribe_ai_weekly_worksheets_distribute_v1(
  p_collection_id uuid, p_expected_revision bigint, p_section_id uuid,
  p_days smallint[], p_student_ids uuid[], p_due_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_user uuid := public.eduscribe_ai_uid();
  v_existing public.worksheet_collections%ROWTYPE;
  v_day_count integer;
  v_member_count integer;
  v_requested integer;
  v_inserted integer;
  v_elsewhere integer;
  v_due_local timestamp;
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
  IF v_existing.archived_at IS NOT NULL THEN RAISE EXCEPTION 'collection_archived'; END IF;
  PERFORM 1 FROM public.worksheets w WHERE w.collection_id = p_collection_id
    ORDER BY w.id FOR UPDATE;

  IF p_days IS NULL OR pg_catalog.cardinality(p_days) NOT BETWEEN 1 AND 5
      OR pg_catalog.array_ndims(p_days) IS DISTINCT FROM 1
      OR pg_catalog.array_position(p_days, NULL) IS NOT NULL
      OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_days) AS d(day)
        WHERE d.day NOT BETWEEN 1 AND 5)
      OR (SELECT pg_catalog.count(DISTINCT d.day)
          FROM pg_catalog.unnest(p_days) AS d(day)) <> pg_catalog.cardinality(p_days) THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;
  SELECT pg_catalog.count(*) INTO v_day_count FROM public.worksheets w
    WHERE w.collection_id = p_collection_id AND w.teacher_id = v_user
      AND w.day_of_week = ANY(p_days);
  IF v_day_count <> pg_catalog.cardinality(p_days) THEN RAISE EXCEPTION 'invalid_document'; END IF;

  IF p_section_id IS NULL OR NOT (EXISTS (SELECT 1 FROM public.schedules s
      WHERE s.section_id = p_section_id AND s.teacher_id = v_user)
    OR EXISTS (SELECT 1 FROM public.sections s
      WHERE s.id = p_section_id AND s.adviser_id = v_user)) THEN
    RAISE EXCEPTION 'section_not_allowed';
  END IF;

  IF p_student_ids IS NULL OR pg_catalog.cardinality(p_student_ids) NOT BETWEEN 1 AND 200
      OR pg_catalog.array_ndims(p_student_ids) IS DISTINCT FROM 1
      OR pg_catalog.array_position(p_student_ids, NULL) IS NOT NULL
      OR (SELECT pg_catalog.count(DISTINCT s.student_id)
          FROM pg_catalog.unnest(p_student_ids) AS s(student_id))
        <> pg_catalog.cardinality(p_student_ids) THEN
    RAISE EXCEPTION 'student_not_in_section';
  END IF;
  SELECT pg_catalog.count(DISTINCT ss.student_id) INTO v_member_count
    FROM public.section_students ss
    WHERE ss.section_id = p_section_id AND ss.status = 'active'
      AND ss.student_id = ANY(p_student_ids);
  IF v_member_count <> pg_catalog.cardinality(p_student_ids) THEN
    RAISE EXCEPTION 'student_not_in_section';
  END IF;

  IF p_due_at IS NOT NULL
      AND (NOT pg_catalog.isfinite(p_due_at) OR p_due_at <= pg_catalog.now()) THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  -- due_at is a naive timestamp holding Asia/Manila wall-clock time.
  v_due_local := p_due_at AT TIME ZONE 'Asia/Manila';
  v_requested := pg_catalog.cardinality(p_days) * pg_catalog.cardinality(p_student_ids);
  INSERT INTO public.task_assignees (task_id, student_id, section_id, due_at, assigned_by)
  SELECT w.id, s.student_id, p_section_id, v_due_local, v_user
    FROM public.worksheets w
    CROSS JOIN pg_catalog.unnest(p_student_ids) AS s(student_id)
    WHERE w.collection_id = p_collection_id AND w.teacher_id = v_user
      AND w.day_of_week = ANY(p_days)
    ORDER BY w.id, s.student_id
  ON CONFLICT (task_id, student_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT pg_catalog.count(*) INTO v_elsewhere
    FROM public.task_assignees a
    JOIN public.worksheets w ON w.id = a.task_id
    WHERE w.collection_id = p_collection_id AND w.teacher_id = v_user
      AND w.day_of_week = ANY(p_days) AND a.student_id = ANY(p_student_ids)
      AND a.section_id <> p_section_id;
  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'durable', true, 'collectionId', p_collection_id,
    'sectionId', p_section_id, 'days', pg_catalog.to_jsonb(p_days),
    'requested', v_requested, 'inserted', v_inserted,
    'alreadyAssigned', v_requested - v_inserted, 'assignedElsewhere', v_elsewhere);
END $$;

GRANT CREATE ON SCHEMA public TO eduscribe_ai_save_executor;
ALTER FUNCTION public.eduscribe_ai_weekly_worksheets_distribute_v1(
  uuid,bigint,uuid,smallint[],uuid[],timestamptz) OWNER TO eduscribe_ai_save_executor;
REVOKE CREATE ON SCHEMA public FROM eduscribe_ai_save_executor;
REVOKE ALL ON FUNCTION public.eduscribe_ai_weekly_worksheets_distribute_v1(
  uuid,bigint,uuid,smallint[],uuid[],timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_ai_weekly_worksheets_distribute_v1(
  uuid,bigint,uuid,smallint[],uuid[],timestamptz) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
