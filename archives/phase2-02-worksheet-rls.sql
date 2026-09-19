-- ============================================
-- PHASE 2 / 02 — Row-level security for worksheet assessment
--
-- Shared predicates live in SECURITY DEFINER functions, as in Phase 1: a
-- policy that sub-selects the table it protects recurses, and one that joins
-- through another RLS-protected table silently narrows when that table's own
-- policy changes.
--
-- The scoring columns on worksheet_submissions are guarded by a trigger
-- rather than a policy, because RLS grants or denies a whole row — it cannot
-- say "this student may set status but not score".
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

CREATE OR REPLACE FUNCTION teacher_owns_worksheet(p_worksheet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheets WHERE id = p_worksheet_id AND teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION teacher_owns_item(p_item_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_items wi
    JOIN worksheets w ON w.id = wi.worksheet_id
    WHERE wi.id = p_item_id AND w.teacher_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION student_can_see_worksheet(p_worksheet_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_sections ws
    JOIN section_students ss ON ss.section_id = ws.section_id
    WHERE ws.worksheet_id = p_worksheet_id
      AND ss.student_id = auth.uid()
      AND ss.status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION own_submission(p_submission_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_submissions WHERE id = p_submission_id AND student_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION submission_open(p_submission_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_submissions WHERE id = p_submission_id AND status = 'in_progress'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- Ties an answer's item to the worksheet its submission actually belongs to,
-- so a student cannot attach an answer for an item from an unrelated worksheet.
CREATE OR REPLACE FUNCTION item_belongs_to_submission(p_submission_id UUID, p_item_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM worksheet_submissions sub
    JOIN worksheet_items wi ON wi.worksheet_id = sub.worksheet_id
    WHERE sub.id = p_submission_id AND wi.id = p_item_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER TABLE worksheet_sections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_item_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksheet_answers      ENABLE ROW LEVEL SECURITY;

-- worksheet_sections — the teacher who owns the worksheet, and the students
-- of the section it was posted to.
DROP POLICY IF EXISTS ws_sections_read  ON worksheet_sections;
DROP POLICY IF EXISTS ws_sections_write ON worksheet_sections;
CREATE POLICY ws_sections_read ON worksheet_sections FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_in_section(section_id));
CREATE POLICY ws_sections_write ON worksheet_sections FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));

-- worksheet_items — questions are readable by the students they were posted to.
DROP POLICY IF EXISTS ws_items_read  ON worksheet_items;
DROP POLICY IF EXISTS ws_items_write ON worksheet_items;
CREATE POLICY ws_items_read ON worksheet_items FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_can_see_worksheet(worksheet_id));
CREATE POLICY ws_items_write ON worksheet_items FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));

-- worksheets — students otherwise have no path to this table at all: they can
-- read worksheet_items/worksheet_sections but not the worksheet row those
-- point at, so title/description/checking_mode come back null on every
-- embed. This adds the narrow student path only; the existing teacher-owner
-- and admin policies on worksheets are untouched (permissive policies OR
-- together).
DROP POLICY IF EXISTS ws_worksheets_student_read ON worksheets;
CREATE POLICY ws_worksheets_student_read ON worksheets FOR SELECT TO authenticated
  USING (student_can_see_worksheet(id));

-- worksheet_item_keys — no student branch at all, by design.
DROP POLICY IF EXISTS ws_keys_all ON worksheet_item_keys;
CREATE POLICY ws_keys_all ON worksheet_item_keys FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_item(item_id))
  WITH CHECK (is_admin() OR teacher_owns_item(item_id));

-- worksheet_submissions — a student reads and writes only their own row.
-- Which COLUMNS they may change is enforced by the trigger below.
DROP POLICY IF EXISTS ws_subs_read         ON worksheet_submissions;
DROP POLICY IF EXISTS ws_subs_teacher_write ON worksheet_submissions;
DROP POLICY IF EXISTS ws_subs_student_write ON worksheet_submissions;
DROP POLICY IF EXISTS ws_subs_student_insert ON worksheet_submissions;
DROP POLICY IF EXISTS ws_subs_student_update ON worksheet_submissions;
CREATE POLICY ws_subs_read ON worksheet_submissions FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_id = auth.uid());
CREATE POLICY ws_subs_teacher_write ON worksheet_submissions FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));
-- The scoring columns are pinned NULL here as well as in the trigger below,
-- because the trigger only fires BEFORE UPDATE — without this a student could
-- INSERT their own submission with a score already filled in.
--
-- Students get INSERT and UPDATE only, never DELETE: FOR ALL would let a
-- student DELETE their own row (no BEFORE UPDATE/INSERT trigger fires on
-- DELETE, and there is no WITH CHECK on DELETE to stop it) and re-INSERT a
-- fresh in_progress one — un-submission by another route, and one that also
-- destroys a submission the teacher already scored and released. Clearing a
-- submission for a retry is a teacher action, already covered by
-- ws_subs_teacher_write.
CREATE POLICY ws_subs_student_insert ON worksheet_submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid()
              AND student_can_see_worksheet(worksheet_id)
              AND student_in_section(section_id)
              AND status IN ('in_progress','submitted')
              AND released = FALSE
              AND score IS NULL AND total_points IS NULL
              AND checked_by IS NULL AND checked_at IS NULL);
CREATE POLICY ws_subs_student_update ON worksheet_submissions FOR UPDATE TO authenticated
  USING (student_id = auth.uid() AND status <> 'checked')
  WITH CHECK (student_id = auth.uid()
              AND student_can_see_worksheet(worksheet_id)
              AND student_in_section(section_id)
              AND status IN ('in_progress','submitted')
              AND released = FALSE
              AND score IS NULL AND total_points IS NULL
              AND checked_by IS NULL AND checked_at IS NULL);

-- worksheet_answers — a student writes only `answer`, and only while their
-- submission is still open. is_correct and points_earned stay the teacher's.
DROP POLICY IF EXISTS ws_answers_read          ON worksheet_answers;
DROP POLICY IF EXISTS ws_answers_teacher_write ON worksheet_answers;
DROP POLICY IF EXISTS ws_answers_student_write ON worksheet_answers;
CREATE POLICY ws_answers_read ON worksheet_answers FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_item(item_id) OR own_submission(submission_id));
CREATE POLICY ws_answers_teacher_write ON worksheet_answers FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_item(item_id))
  WITH CHECK (is_admin() OR teacher_owns_item(item_id));
CREATE POLICY ws_answers_student_write ON worksheet_answers FOR ALL TO authenticated
  USING (own_submission(submission_id) AND submission_open(submission_id))
  WITH CHECK (own_submission(submission_id) AND submission_open(submission_id)
              AND item_belongs_to_submission(submission_id, item_id)
              AND is_correct IS NULL AND points_earned IS NULL);

-- A student may move their submission in_progress -> submitted, and nothing
-- else. RLS cannot express a column restriction, so this does.
CREATE OR REPLACE FUNCTION guard_worksheet_submission_write()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.uid() IS NULL means this write did not come through a user session
  -- at all (Supabase SQL Editor, service role, seed/migration scripts) — it
  -- is not a student bypass, so let it through unguarded.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_admin() OR teacher_owns_worksheet(NEW.worksheet_id) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.remarks IS NOT NULL OR NEW.status <> 'in_progress' OR NEW.source <> 'online' THEN
      RAISE EXCEPTION 'A student may only create an online submission with status in_progress and no remarks';
    END IF;
    NEW.submitted_at := NULL;
    RETURN NEW;
  END IF;

  -- From here on TG_OP = 'UPDATE'.
  IF NEW.score        IS DISTINCT FROM OLD.score
     OR NEW.total_points IS DISTINCT FROM OLD.total_points
     OR NEW.released     IS DISTINCT FROM OLD.released
     OR NEW.checked_by   IS DISTINCT FROM OLD.checked_by
     OR NEW.checked_at   IS DISTINCT FROM OLD.checked_at THEN
    RAISE EXCEPTION 'Only the worksheet owner may set scoring fields';
  END IF;

  IF NEW.remarks      IS DISTINCT FROM OLD.remarks
     OR NEW.source       IS DISTINCT FROM OLD.source
     OR NEW.worksheet_id IS DISTINCT FROM OLD.worksheet_id
     OR NEW.section_id   IS DISTINCT FROM OLD.section_id THEN
    RAISE EXCEPTION 'Only the worksheet owner may change remarks, source, worksheet_id or section_id';
  END IF;

  -- Status may only move in_progress -> in_progress (no-op), in_progress ->
  -- submitted (server sets submitted_at), or submitted -> submitted (no-op).
  -- Anything else, including submitted -> in_progress, is rejected.
  IF OLD.status = 'in_progress' AND NEW.status = 'in_progress' THEN
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Students may not set submitted_at';
    END IF;
  ELSIF OLD.status = 'in_progress' AND NEW.status = 'submitted' THEN
    NEW.submitted_at := NOW();
  ELSIF OLD.status = 'submitted' AND NEW.status = 'submitted' THEN
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Students may not change submitted_at';
    END IF;
  ELSE
    RAISE EXCEPTION 'Students may not change submission status from % to %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS guard_worksheet_submission ON worksheet_submissions;
CREATE TRIGGER guard_worksheet_submission
  BEFORE INSERT OR UPDATE ON worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_worksheet_submission_write();

-- ============================================
-- VERIFY — every table below must show rls_on = true and at least one policy.
-- Any policy name you do not recognise should be investigated.
-- ============================================
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, p.policyname, p.cmd
FROM pg_class c
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = 'public'
WHERE c.relname IN ('worksheet_sections','worksheet_items','worksheet_item_keys',
                    'worksheet_submissions','worksheet_answers')
ORDER BY c.relname, p.cmd;

SELECT tgname FROM pg_trigger
WHERE tgrelid = 'worksheet_submissions'::regclass AND NOT tgisinternal;
