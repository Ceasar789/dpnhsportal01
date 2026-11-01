-- Transactional checking and release for one submitted worksheet.
-- Apply after phase2-01-worksheet-assessment-tables.sql and
-- phase2-02-worksheet-rls.sql. Existing owner RLS and write guards remain in force.
BEGIN;

CREATE FUNCTION public.eduscribe_worksheet_score_release_v1(
  p_submission_id uuid, p_marks jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_worksheet_id uuid;
  v_status text;
  v_item_count bigint;
  v_entry jsonb;
  v_item_id uuid;
  v_item_points numeric;
  v_mark numeric;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_score numeric := 0;
  v_total_points numeric := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT s.worksheet_id, s.status INTO v_worksheet_id, v_status
  FROM public.worksheet_submissions s
  JOIN public.worksheets w ON w.id = s.worksheet_id
  WHERE s.id = p_submission_id AND w.teacher_id = v_actor
  FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_status NOT IN ('submitted', 'checked') THEN
    RAISE EXCEPTION 'invalid_state';
  END IF;

  IF pg_catalog.jsonb_typeof(p_marks) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_marks';
  END IF;
  SELECT pg_catalog.count(*) INTO v_item_count
  FROM public.worksheet_items i WHERE i.worksheet_id = v_worksheet_id;
  IF pg_catalog.jsonb_array_length(p_marks) <> v_item_count THEN
    RAISE EXCEPTION 'invalid_marks';
  END IF;

  FOR v_entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_marks) LOOP
    IF pg_catalog.jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
        OR NOT (v_entry ?& ARRAY['itemId', 'points'])
        OR v_entry - ARRAY['itemId', 'points']::text[] <> '{}'::jsonb
        OR pg_catalog.jsonb_typeof(v_entry->'itemId') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(v_entry->'points') IS DISTINCT FROM 'number'
        OR (v_entry->>'itemId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_marks';
    END IF;
    v_item_id := (v_entry->>'itemId')::uuid;
    IF v_item_id = ANY(v_seen) THEN RAISE EXCEPTION 'invalid_marks'; END IF;
    v_seen := pg_catalog.array_append(v_seen, v_item_id);

    SELECT i.points INTO v_item_points FROM public.worksheet_items i
    WHERE i.id = v_item_id AND i.worksheet_id = v_worksheet_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_marks'; END IF;
    v_mark := (v_entry->>'points')::numeric;
    IF v_mark < 0 OR v_mark > v_item_points OR pg_catalog.scale(v_mark) > 2 THEN
      RAISE EXCEPTION 'invalid_marks';
    END IF;
    v_score := v_score + v_mark;
    v_total_points := v_total_points + v_item_points;
  END LOOP;
  -- The destination columns are decimal(6,2); reject unrepresentable totals
  -- with the same fixed validation error before starting either table write.
  IF v_total_points <= 0 OR v_total_points > 9999.99 THEN
    RAISE EXCEPTION 'invalid_marks';
  END IF;

  FOR v_entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_marks) LOOP
    v_item_id := (v_entry->>'itemId')::uuid;
    v_mark := (v_entry->>'points')::numeric;
    SELECT i.points INTO v_item_points FROM public.worksheet_items i
    WHERE i.id = v_item_id AND i.worksheet_id = v_worksheet_id;
    INSERT INTO public.worksheet_answers
      (submission_id, item_id, answer, points_earned, is_correct, updated_at)
    VALUES (p_submission_id, v_item_id, NULL, v_mark,
      v_mark = v_item_points, pg_catalog.now())
    ON CONFLICT (submission_id, item_id) DO UPDATE
      SET points_earned = EXCLUDED.points_earned,
          is_correct = EXCLUDED.is_correct,
          updated_at = EXCLUDED.updated_at;
  END LOOP;

  UPDATE public.worksheet_submissions
  SET status = 'checked', released = true, score = v_score,
      total_points = v_total_points, checked_by = v_actor,
      checked_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  RETURN pg_catalog.jsonb_build_object('ok', true,
    'submissionId', p_submission_id, 'score', v_score,
    'totalPoints', v_total_points);
END;
$$;

REVOKE ALL ON FUNCTION public.eduscribe_worksheet_score_release_v1(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.eduscribe_worksheet_score_release_v1(uuid, jsonb)
  TO authenticated;
COMMIT;
