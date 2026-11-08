-- Allows Auto checking for a day task that has essay items.
-- Before: eduscribe_day_task_distribute_v1 refused p_checking_mode = 'auto' when any
-- item was an essay (invalid_checking_mode). Now an Auto worksheet with essays can
-- be distributed: auto-score-submission.sql scores its objective items on submit as
-- PROVISIONAL marks only, and the student sees no score until the teacher releases.
-- The function body is day-task-distribute.sql's, with that one check removed;
-- the mode must still be 'auto' or 'manual', and the lock after the first
-- distribution (checking_mode_locked) is unchanged. Owner and grants are re-asserted
-- exactly as before.
-- Apply as postgres after day-task-distribute.sql (and auto-score-submission.sql for
-- the end-to-end check), then run day-task-distribute-auto-essay.selftest.sql.
-- Safe to run twice. Undo with day-task-distribute-auto-essay.rollback.sql.
BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'day_task_distribute_requires_postgres';
  END IF;
  IF pg_catalog.to_regprocedure('public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text)') IS NULL THEN
    RAISE EXCEPTION 'day_task_distribute_missing_function: apply day-task-distribute.sql first';
  END IF;
  SELECT pg_catalog.string_agg(e.object_name, ', ') INTO v_missing
    FROM (VALUES ('public.worksheets'), ('public.worksheet_items'),
      ('public.task_assignees'), ('public.worksheet_sections'))
      AS e(object_name)
    WHERE pg_catalog.to_regclass(e.object_name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'day_task_distribute_missing_tables: %', v_missing;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.eduscribe_day_task_distribute_v1(
  p_worksheet_id uuid, p_section_id uuid, p_student_ids uuid[],
  p_due_at timestamptz, p_checking_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_worksheet public.worksheets%ROWTYPE;
  v_students uuid[];
  v_member_count integer;
  v_due_local timestamp;
  v_added uuid[];
  v_already uuid[];
  v_elsewhere uuid[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;

  -- Locks the row, so two calls for one worksheet run one after the other.
  SELECT * INTO v_worksheet FROM public.worksheets w
    WHERE w.id = p_worksheet_id AND w.teacher_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_worksheet.collection_id IS NOT NULL
      OR NOT (EXISTS (SELECT 1 FROM public.worksheet_items i
          WHERE i.worksheet_id = p_worksheet_id)
        OR (v_worksheet.task_type = 'worksheet'
          AND pg_catalog.btrim(COALESCE(v_worksheet.instructions, '')) <> '')) THEN
    RAISE EXCEPTION 'invalid_document';
  END IF;

  IF p_section_id IS NULL OR NOT (EXISTS (SELECT 1 FROM public.schedules s
      WHERE s.section_id = p_section_id AND s.teacher_id = v_user)
    OR EXISTS (SELECT 1 FROM public.sections s
      WHERE s.id = p_section_id AND s.adviser_id = v_user)) THEN
    RAISE EXCEPTION 'section_not_allowed';
  END IF;

  -- The raw size is capped before any work, so a huge array costs nothing.
  IF p_student_ids IS NULL OR pg_catalog.cardinality(p_student_ids) NOT BETWEEN 1 AND 200
      OR pg_catalog.array_ndims(p_student_ids) IS DISTINCT FROM 1
      OR pg_catalog.array_position(p_student_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_student_list';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT s.student_id ORDER BY s.student_id) INTO v_students
    FROM pg_catalog.unnest(p_student_ids) AS s(student_id);
  SELECT pg_catalog.count(DISTINCT ss.student_id) INTO v_member_count
    FROM public.section_students ss
    WHERE ss.section_id = p_section_id AND ss.status = 'active'
      AND ss.student_id = ANY(v_students);
  IF v_member_count <> pg_catalog.cardinality(v_students) THEN
    RAISE EXCEPTION 'student_not_in_section';
  END IF;

  IF p_due_at IS NULL OR NOT pg_catalog.isfinite(p_due_at) OR p_due_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  -- due_at is a naive timestamp holding Asia/Manila wall-clock time.
  v_due_local := p_due_at AT TIME ZONE 'Asia/Manila';

  IF p_checking_mode IS NULL OR p_checking_mode NOT IN ('auto', 'manual') THEN
    RAISE EXCEPTION 'invalid_checking_mode';
  END IF;
  IF p_checking_mode IS DISTINCT FROM v_worksheet.checking_mode THEN
    IF EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = p_worksheet_id) THEN
      RAISE EXCEPTION 'checking_mode_locked';
    END IF;
    UPDATE public.worksheets SET checking_mode = p_checking_mode WHERE id = p_worksheet_id;
  END IF;

  INSERT INTO public.worksheet_sections (worksheet_id, section_id, due_at, posted_by)
    VALUES (p_worksheet_id, p_section_id, v_due_local, v_user)
    ON CONFLICT (worksheet_id, section_id) DO UPDATE SET due_at = EXCLUDED.due_at;

  WITH inserted AS (
    INSERT INTO public.task_assignees (task_id, student_id, section_id, due_at, assigned_by)
    SELECT p_worksheet_id, s.student_id, p_section_id, v_due_local, v_user
      FROM pg_catalog.unnest(v_students) AS s(student_id)
      ORDER BY s.student_id
    ON CONFLICT (task_id, student_id) DO NOTHING
    RETURNING student_id)
  SELECT COALESCE(pg_catalog.array_agg(i.student_id ORDER BY i.student_id), ARRAY[]::uuid[])
    INTO v_added FROM inserted i;

  SELECT COALESCE(pg_catalog.array_agg(a.student_id ORDER BY a.student_id)
      FILTER (WHERE a.section_id = p_section_id), ARRAY[]::uuid[]),
    COALESCE(pg_catalog.array_agg(a.student_id ORDER BY a.student_id)
      FILTER (WHERE a.section_id <> p_section_id), ARRAY[]::uuid[])
    INTO v_already, v_elsewhere
    FROM public.task_assignees a
    WHERE a.task_id = p_worksheet_id AND a.student_id = ANY(v_students)
      AND NOT (a.student_id = ANY(v_added));

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'durable', true, 'worksheetId', p_worksheet_id,
    'sectionId', p_section_id, 'requested', pg_catalog.cardinality(v_students),
    'added', pg_catalog.to_jsonb(v_added),
    'alreadyAssigned', pg_catalog.to_jsonb(v_already),
    'assignedElsewhere', pg_catalog.to_jsonb(v_elsewhere),
    'checkingMode', p_checking_mode);
END
$fn$;

ALTER FUNCTION public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
