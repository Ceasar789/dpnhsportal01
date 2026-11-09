-- Production contract for saving one advisory section's daily attendance for
-- one date. Apply after the preflight duplicate check, then run
-- attendance-save.selftest.sql. Run as postgres in one transaction.
--
-- 1. attendance_daily_unique: one daily row per student, section and date.
--    The table's UNIQUE(student_id, section_id, date, subject) does not stop two
--    daily rows, because subject is NULL for them and NULLs never collide. The
--    index is created only when no duplicate daily rows exist; otherwise this
--    file stops with attendance_duplicates_exist and nothing is created.
-- 2. eduscribe_attendance_save_v1: saves the marks atomically. It bypasses RLS
--    as postgres, so it makes every authorization decision itself: an active
--    teacher, the section's adviser, the current school year, a date that is
--    not in the future (Manila), and active enrolment for every student.
--    Error text is a stable code the client maps to a message.
BEGIN;

DO $guard$
DECLARE
  v_missing text;
BEGIN
  IF current_user <> 'postgres'
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'attendance_save_requires_postgres';
  END IF;

  SELECT pg_catalog.string_agg(e.object_name, ', ') INTO v_missing
    FROM (VALUES ('public.attendance'), ('public.sections'), ('public.section_students'),
      ('public.profiles'), ('public.school_settings'), ('public.students')) AS e(object_name)
    WHERE pg_catalog.to_regclass(e.object_name) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_save_missing_tables: %', v_missing;
  END IF;

  IF pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'attendance_save_missing_auth_uid';
  END IF;
  SELECT pg_catalog.string_agg(e.role_name, ', ') INTO v_missing
    FROM (VALUES ('authenticated'), ('anon'), ('service_role')) AS e(role_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = e.role_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_save_missing_roles: %', v_missing;
  END IF;

  SELECT pg_catalog.string_agg(e.table_name || '.' || e.column_name, ', ') INTO v_missing
    FROM (VALUES
      ('attendance', 'student_id'), ('attendance', 'section_id'), ('attendance', 'date'),
      ('attendance', 'subject'), ('attendance', 'status'), ('attendance', 'remarks'),
      ('attendance', 'recorded_by'), ('attendance', 'created_at'), ('attendance', 'updated_at'),
      ('sections', 'id'), ('sections', 'adviser_id'), ('sections', 'school_year'),
      ('section_students', 'section_id'), ('section_students', 'student_id'),
      ('section_students', 'status'),
      ('profiles', 'id'), ('profiles', 'role'), ('profiles', 'status'),
      ('school_settings', 'id'), ('school_settings', 'school_year')) AS e(table_name, column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = e.table_name
        AND c.column_name = e.column_name);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'attendance_save_missing_columns: %', v_missing;
  END IF;

  -- attendance.date is compared with a Manila calendar date.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'attendance'
        AND c.column_name = 'date' AND c.data_type = 'date') THEN
    RAISE EXCEPTION 'attendance_save_date_type_mismatch';
  END IF;

  -- The current school year comes from school_settings row 1, as in the Attendance tab.
  IF NOT EXISTS (SELECT 1 FROM public.school_settings s
      WHERE s.id = 1 AND s.school_year IS NOT NULL) THEN
    RAISE EXCEPTION 'attendance_save_missing_school_year';
  END IF;
END
$guard$;

-- Duplicate daily rows must be reviewed by hand first; nothing is cleaned up here.
DO $dupes$
DECLARE
  v_groups bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_groups FROM (
    SELECT 1 FROM public.attendance a WHERE a.subject IS NULL
    GROUP BY a.student_id, a.section_id, a.date HAVING pg_catalog.count(*) > 1) AS d;
  IF v_groups > 0 THEN
    RAISE EXCEPTION 'attendance_duplicates_exist: % duplicate daily groups', v_groups;
  END IF;
END
$dupes$;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_daily_unique
  ON public.attendance (student_id, section_id, date) WHERE subject IS NULL;

-- IF NOT EXISTS skips a same-named index; make sure it is the one the function needs.
DO $index$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      WHERE i.indexrelid = pg_catalog.to_regclass('public.attendance_daily_unique')
        AND i.indrelid = 'public.attendance'::regclass
        AND i.indisunique AND i.indisvalid AND i.indexprs IS NULL AND i.indnatts = 3
        AND pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(subject IS NULL)'
        AND ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) AS k(attnum)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          ORDER BY 1) = ARRAY['date', 'section_id', 'student_id']) THEN
    RAISE EXCEPTION 'attendance_daily_unique_mismatch';
  END IF;
END
$index$;

CREATE OR REPLACE FUNCTION public.eduscribe_attendance_save_v1(
  p_section_id uuid, p_date date, p_marks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_year text;
  v_section uuid;
  v_entry jsonb;
  v_status jsonb;
  v_remark jsonb;
  v_id text;
  v_seen text[] := ARRAY[]::text[];
  v_students uuid[];
  v_enrolled integer;
  v_saved integer := 0;
  v_cleared integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user
      AND p.role = 'teacher' AND p.status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'inactive_teacher';
  END IF;

  IF p_date IS NULL THEN RAISE EXCEPTION 'invalid_date'; END IF;
  IF p_section_id IS NULL OR p_marks IS NULL
      OR pg_catalog.jsonb_typeof(p_marks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_marks';
  END IF;

  -- The adviser of a current-year section only. The row lock makes two saves of
  -- one section run one after the other.
  SELECT s.school_year INTO v_year FROM public.school_settings s WHERE s.id = 1;
  SELECT s.id INTO v_section FROM public.sections s
    WHERE s.id = p_section_id AND s.adviser_id = v_user
      AND v_year IS NOT NULL AND s.school_year = v_year
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF p_date > (pg_catalog.now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'future_date';
  END IF;

  IF pg_catalog.jsonb_array_length(p_marks) > 200 THEN RAISE EXCEPTION 'invalid_marks'; END IF;
  FOR v_entry IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_marks) AS e(value) LOOP
    IF pg_catalog.jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(v_entry->'student_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid_marks';
    END IF;
    -- A pattern check first, so a malformed id is invalid_marks, not a cast error.
    v_id := pg_catalog.lower(v_entry->>'student_id');
    IF v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR v_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'invalid_marks';
    END IF;
    v_seen := pg_catalog.array_append(v_seen, v_id);

    -- status must be present: one of the four exact values, or JSON null to clear.
    v_status := v_entry->'status';
    IF v_status IS NULL
        OR (pg_catalog.jsonb_typeof(v_status) <> 'null'
          AND (pg_catalog.jsonb_typeof(v_status) <> 'string'
            OR (v_status #>> '{}') NOT IN ('Present', 'Absent', 'Late', 'Excused'))) THEN
      RAISE EXCEPTION 'invalid_marks';
    END IF;

    v_remark := v_entry->'remark';
    IF v_remark IS NOT NULL AND pg_catalog.jsonb_typeof(v_remark) <> 'null'
        AND (pg_catalog.jsonb_typeof(v_remark) <> 'string'
          OR pg_catalog.char_length(v_remark #>> '{}') > 500) THEN
      RAISE EXCEPTION 'invalid_marks';
    END IF;
  END LOOP;

  v_students := ARRAY(SELECT x.id::uuid FROM pg_catalog.unnest(v_seen) AS x(id));
  SELECT pg_catalog.count(DISTINCT ss.student_id) INTO v_enrolled
    FROM public.section_students ss
    WHERE ss.section_id = p_section_id AND ss.status = 'active'
      AND ss.student_id = ANY(v_students);
  IF v_enrolled <> pg_catalog.cardinality(v_students) THEN
    RAISE EXCEPTION 'invalid_students';
  END IF;

  -- Daily rows only (subject IS NULL). A row that already holds the same status,
  -- remark and recorder is left untouched, so repeating a save changes nothing.
  INSERT INTO public.attendance AS a
    (student_id, section_id, date, status, remarks, recorded_by, created_at, updated_at)
  SELECT (e.value->>'student_id')::uuid, p_section_id, p_date, e.value->>'status',
    e.value->>'remark', v_user, pg_catalog.now(), pg_catalog.now()
  FROM pg_catalog.jsonb_array_elements(p_marks) AS e(value)
  WHERE pg_catalog.jsonb_typeof(e.value->'status') = 'string'
  ON CONFLICT (student_id, section_id, date) WHERE subject IS NULL
  DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks,
    recorded_by = EXCLUDED.recorded_by, updated_at = EXCLUDED.updated_at
  WHERE (a.status, a.remarks, a.recorded_by)
    IS DISTINCT FROM (EXCLUDED.status, EXCLUDED.remarks, EXCLUDED.recorded_by);
  GET DIAGNOSTICS v_saved = ROW_COUNT;

  DELETE FROM public.attendance a
  USING pg_catalog.jsonb_array_elements(p_marks) AS e(value)
  WHERE pg_catalog.jsonb_typeof(e.value->'status') = 'null'
    AND a.student_id = (e.value->>'student_id')::uuid
    AND a.section_id = p_section_id AND a.date = p_date AND a.subject IS NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object('ok', true, 'sectionId', p_section_id,
    'date', p_date, 'saved', v_saved, 'cleared', v_cleared);
END
$fn$;

ALTER FUNCTION public.eduscribe_attendance_save_v1(uuid, date, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.eduscribe_attendance_save_v1(uuid, date, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_attendance_save_v1(uuid, date, jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
