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
CREATE POLICY ws_subs_read ON worksheet_submissions FOR SELECT TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id) OR student_id = auth.uid());
CREATE POLICY ws_subs_teacher_write ON worksheet_submissions FOR ALL TO authenticated
  USING (is_admin() OR teacher_owns_worksheet(worksheet_id))
  WITH CHECK (is_admin() OR teacher_owns_worksheet(worksheet_id));
-- The scoring columns are pinned NULL here as well as in the trigger below,
-- because the trigger only fires BEFORE UPDATE — without this a student could
-- INSERT their own submission with a score already filled in.
CREATE POLICY ws_subs_student_write ON worksheet_submissions FOR ALL TO authenticated
  USING (student_id = auth.uid() AND status <> 'checked')
  WITH CHECK (student_id = auth.uid()
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
              AND is_correct IS NULL AND points_earned IS NULL);

-- A student may move their submission in_progress -> submitted, and nothing
-- else. RLS cannot express a column restriction, so this does.
CREATE OR REPLACE FUNCTION guard_worksheet_submission_write()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF is_admin() OR teacher_owns_worksheet(NEW.worksheet_id) THEN RETURN NEW; END IF;

  IF NEW.score        IS DISTINCT FROM OLD.score
     OR NEW.total_points IS DISTINCT FROM OLD.total_points
     OR NEW.released     IS DISTINCT FROM OLD.released
     OR NEW.checked_by   IS DISTINCT FROM OLD.checked_by
     OR NEW.checked_at   IS DISTINCT FROM OLD.checked_at THEN
    RAISE EXCEPTION 'Only the worksheet owner may set scoring fields';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS guard_worksheet_submission ON worksheet_submissions;
CREATE TRIGGER guard_worksheet_submission
  BEFORE UPDATE ON worksheet_submissions
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
