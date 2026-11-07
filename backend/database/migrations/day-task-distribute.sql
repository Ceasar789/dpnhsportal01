-- Production contract for distributing one saved day task to chosen students.
-- Apply after live schema review, then run day-task-distribute.selftest.sql.
-- Run as postgres in one transaction. Notifications stay with the client: a
-- failed notification must not undo a distribution.
-- This function bypasses RLS as postgres, so it makes every authorization
-- decision itself. Error text is a stable code the client maps to a message.
BEGIN;

DO $$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'day_task_distribute_requires_postgres';
  END IF;

  SELECT pg_catalog.string_agg(e.object_name, ', ') INTO v_missing
    FROM (VALUES ('public.worksheets'), ('public.worksheet_items'),
      ('public.task_assignees'), ('public.worksheet_sections'), ('public.profiles'),
      ('public.schedules'), ('public.sections'), ('public.section_students'))
      AS e(object_name)
    WHERE pg_catalog.to_regclass(e.object_name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'day_task_distribute_missing_tables: %', v_missing;
  END IF;

  IF pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'day_task_distribute_missing_auth_uid';
  END IF;
  SELECT pg_catalog.string_agg(e.role_name, ', ') INTO v_missing
    FROM (VALUES ('authenticated'), ('anon'), ('service_role')) AS e(role_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = e.role_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'day_task_distribute_missing_roles: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.table_name || '.' || e.column_name, ', ') INTO v_missing
    FROM (VALUES
      ('worksheets', 'id'), ('worksheets', 'teacher_id'), ('worksheets', 'collection_id'),
      ('worksheets', 'task_type'), ('worksheets', 'instructions'), ('worksheets', 'checking_mode'),
      ('worksheet_items', 'worksheet_id'), ('worksheet_items', 'item_type'),
      ('task_assignees', 'id'), ('task_assignees', 'task_id'), ('task_assignees', 'student_id'),
      ('task_assignees', 'section_id'), ('task_assignees', 'due_at'),
      ('task_assignees', 'assigned_at'), ('task_assignees', 'assigned_by'),
      ('worksheet_sections', 'id'), ('worksheet_sections', 'worksheet_id'),
      ('worksheet_sections', 'section_id'), ('worksheet_sections', 'due_at'),
      ('worksheet_sections', 'posted_at'), ('worksheet_sections', 'posted_by'),
      ('profiles', 'id'), ('profiles', 'role'), ('profiles', 'status'),
      ('schedules', 'section_id'), ('schedules', 'teacher_id'),
      ('sections', 'id'), ('sections', 'adviser_id'),
      ('section_students', 'section_id'), ('section_students', 'student_id'),
      ('section_students', 'status')) AS e(table_name, column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = e.table_name
        AND c.column_name = e.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'day_task_distribute_missing_columns: %', v_missing;
  END IF;

  -- The conversion below writes Manila wall-clock time, which is only right
  -- for a naive timestamp column.
  IF EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'due_at'
        AND c.table_name IN ('task_assignees', 'worksheet_sections')
        AND c.data_type <> 'timestamp without time zone') THEN
    RAISE EXCEPTION 'day_task_distribute_due_at_type_mismatch';
  END IF;

  -- ON CONFLICT needs a full unique index on exactly these columns.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      WHERE i.indrelid = 'public.task_assignees'::regclass
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts = 2
        AND ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) AS k(attnum)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY 1) = ARRAY['student_id', 'task_id']) THEN
    RAISE EXCEPTION 'day_task_distribute_missing_unique: task_assignees(task_id, student_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      WHERE i.indrelid = 'public.worksheet_sections'::regclass
        AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnatts = 2
        AND ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) AS k(attnum)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY 1) = ARRAY['section_id', 'worksheet_id']) THEN
    RAISE EXCEPTION 'day_task_distribute_missing_unique: worksheet_sections(worksheet_id, section_id)';
  END IF;
END $$;

CREATE FUNCTION public.eduscribe_day_task_distribute_v1(
  p_worksheet_id uuid, p_section_id uuid, p_student_ids uuid[],
  p_due_at timestamptz, p_checking_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
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
  IF p_checking_mode = 'auto' AND EXISTS (SELECT 1 FROM public.worksheet_items i
      WHERE i.worksheet_id = p_worksheet_id AND i.item_type = 'essay') THEN
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
END $$;

ALTER FUNCTION public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_day_task_distribute_v1(uuid,uuid,uuid[],timestamptz,text)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
