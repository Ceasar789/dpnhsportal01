-- ============================================
-- PHASE 4 / 02 — Notify the teacher when a student submits
--
-- Requested in the handoff note: a student submitting a task should put a
-- notification in the owning teacher's bell. The obvious client-side move —
-- have TasksTab.jsx call the same `notifications` insert notifyStudents()
-- already uses — needs an RLS policy letting a STUDENT insert a notification
-- addressed to somebody else. phase3-03-notifications-rls.sql's
-- notifications_staff_insert_for_student deliberately only opens staff ->
-- student. Opening the reverse direction would hand the largest population
-- of accounts in the system (45 of 60 test users are students) a brand new
-- write capability aimed at other people, exercisable through the raw API
-- without ever actually submitting anything — a policy predicate cannot
-- distinguish "the student who owns this row just transitioned it to
-- submitted" from "any student, at any time, inserting a row that merely
-- claims that happened".
--
-- A trigger has none of that exposure: it only runs as a side effect of the
-- real UPDATE the student already has permission to make (guarded by
-- ws_subs_student_update / guard_worksheet_submission_write from
-- phase3-02), fires on the server regardless of who is asking, and grants no
-- new capability to any client role. SECURITY DEFINER lets it write into
-- notifications on the teacher's behalf without needing a student-facing
-- INSERT policy at all.
--
-- Depends on phase2-01 (worksheet_submissions, worksheets.task_type via
-- phase3-01) and phase3-03 (notifications table + RLS) already being live.
-- Idempotent — safe to run more than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run (without RLS)
-- ============================================

-- Fires once per submission, on the exact transition guard_worksheet_
-- submission_write (phase3-02) already treats as "the student just
-- submitted": OLD.status = 'in_progress' AND NEW.status = 'submitted'. Not
-- on INSERT (a submission is always created 'in_progress' — the INSERT
-- branch of the guard function rejects anything else), not on a teacher
-- scoring or releasing (those touch score/total_points/released/checked_*,
-- never status), and not on the no-op UPDATEs the guard allows through
-- (in_progress -> in_progress, submitted -> submitted).
--
-- Whether a teacher reopening a submission could re-fire this: the guard
-- function's very first check is `IF is_admin() OR
-- teacher_owns_worksheet(NEW.worksheet_id) THEN RETURN NEW; END IF` — an
-- admin or the owning teacher bypasses every transition rule in that
-- function, including the one that rejects 'submitted' -> 'in_progress' for
-- students. Nothing in this repo's current UI exercises that path (grep of
-- src/pages/dashboards/teacher and src/pages/dashboards/admin turns up no
-- code that sets worksheet_submissions.status back to 'in_progress'), but
-- the guard structurally permits it, so if a future "reopen for
-- resubmission" feature is built the way the guard already allows, a second
-- in_progress -> submitted transition on the same row would fire this
-- trigger again and send a second notification. That is a real gap, not
-- covered by this file, and worth flagging to whoever builds that feature —
-- see the header note in phase3-02 before adding one.
CREATE OR REPLACE FUNCTION notify_teacher_of_submission()
RETURNS TRIGGER AS $$
DECLARE
  v_teacher_id UUID;
  v_title      TEXT;
  v_task_type  TEXT;
  v_student    TEXT;
BEGIN
  -- Everything below is best-effort. The student's submission is the thing
  -- that matters here, not the notification; if anything in this block
  -- raises (a null teacher_id despite the NOT NULL constraint, a renamed
  -- column, a transient error), it must not take the UPDATE down with it.
  -- RAISE WARNING logs it to the Postgres log so it can be noticed and
  -- fixed without ever surfacing to the student as a failed submit.
  BEGIN
    SELECT w.teacher_id, w.title, w.task_type
      INTO v_teacher_id, v_title, v_task_type
    FROM worksheets w
    WHERE w.id = NEW.worksheet_id;

    -- worksheets.teacher_id is NOT NULL, so this should be unreachable in
    -- practice, but the worksheet could in principle have been deleted out
    -- from under a submission that survives via a different FK path; if so,
    -- there is nobody to notify, so exit quietly rather than insert a
    -- notification with a null user_id (notifications.user_id is NOT NULL,
    -- so that insert would raise anyway and be caught below).
    IF v_teacher_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT p.name INTO v_student
    FROM profiles p
    WHERE p.id = NEW.student_id;

    INSERT INTO notifications (
      user_id, title, message,
      notification_type, related_entity_type, related_entity_id, action_url
    ) VALUES (
      v_teacher_id,
      format('New %s submission', v_task_type),
      format('%s submitted "%s".', COALESCE(v_student, 'A student'), v_title),
      'task',
      'worksheet',
      NEW.worksheet_id,
      '/teacher-dashboard/worksheets'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_teacher_of_submission: failed for submission % (worksheet %): %',
      NEW.id, NEW.worksheet_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Separate AFTER UPDATE trigger, deliberately not folded into
-- guard_worksheet_submission_write (a BEFORE trigger on the same table).
-- guard_worksheet_submission_write took four review rounds to get right and
-- is not touched here. Splitting these means this trigger's WHEN clause
-- sees the same OLD/NEW the guard already finalized, runs once per row per
-- UPDATE, and its own failure (caught above) can never interact with the
-- guard's RAISE EXCEPTION paths.
DROP TRIGGER IF EXISTS trg_notify_teacher_on_submit ON worksheet_submissions;
CREATE TRIGGER trg_notify_teacher_on_submit
  AFTER UPDATE ON worksheet_submissions
  FOR EACH ROW
  WHEN (OLD.status = 'in_progress' AND NEW.status = 'submitted')
  EXECUTE FUNCTION notify_teacher_of_submission();

-- ============================================
-- VERIFY
-- ============================================

-- Expect one row: trg_notify_teacher_on_submit, AFTER UPDATE, and the
-- pre-existing guard trigger from phase2-02 (BEFORE INSERT OR UPDATE)
-- still present alongside it.
SELECT tgname, tgtype,
       pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'worksheet_submissions'::regclass AND NOT tgisinternal
ORDER BY tgname;

-- Expect notify_teacher_of_submission with security_type = 'DEFINER'.
SELECT p.proname, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'notify_teacher_of_submission';
