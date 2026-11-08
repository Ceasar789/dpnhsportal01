// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx
// Posting, question and submission state for the Worksheets tab. Kept out of
// WorksheetsTab.jsx, which already carries the upload and CRUD flow.
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../../../config/supabase';
import { useAuth } from '../../../../context/AuthContext';
import { withRetry } from '../../../../lib/supabaseRetry';
import { normalizePoints, round2 } from '../../../../lib/worksheetChecking';
import { TASK_TYPE_LABELS } from '../../../../lib/taskFormatting';
import { distributeDayTask } from './dayTaskDistributeClient';

const validSchoolYear = value => typeof value === 'string' && /^(\d{4})-\d{4}$/.test(value)
  && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
// No trusted distribution operation is mounted. Keep legacy reads available,
// but block the client-side multi-table write until a server transaction exists.
const trustedDistributionAvailable = false;
const trustedScoreWritesAvailable = false;
const CHECK_FAILED = 'Could not check for existing answers — not saving.';
const SAVE_FAILED = 'Your questions could not be saved. Keep this window open and press Save again.';
const COUNT_FAILED = 'Your questions were saved, but the question count could not be updated. Press Save again.';
// task_assignees.assigned_at is a naive TIMESTAMP holding UTC wall-clock time.
const utcMs = value => typeof value === 'string'
  ? Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}Z`) : NaN;

export const useWorksheetAssessment = (showToast, { distributionEnabled = trustedDistributionAvailable } = {}) => {
  const { userData } = useAuth();

  const [mySections, setMySections] = useState([]);
  const [sectionsError, setSectionsError] = useState(false);
  const [postings, setPostings] = useState([]);
  const [postingsError, setPostingsError] = useState(false);

  // Sections this teacher is scheduled into, plus any they advise.
  const fetchMySections = useCallback(async () => {
    if (!userData?.uid) return;

    const { data: sched, error: schedError } = await withRetry(
      () => supabase.from('schedules').select('section_id').eq('teacher_id', userData.uid),
      { label: 'Teacher schedules fetch' }
    );
    if (schedError) {
      console.warn('Teacher schedules fetch failed —', schedError.message);
      setSectionsError(true);
      return;
    }

    const { data: advised, error: advisedError } = await withRetry(
      () => supabase.from('sections').select('id, name, grade_level').eq('adviser_id', userData.uid),
      { label: 'Advised sections fetch' }
    );
    if (advisedError) {
      console.warn('Advised sections fetch failed —', advisedError.message);
      setSectionsError(true);
      return;
    }

    const ids = [...new Set((sched || []).map(s => s.section_id))];
    let scheduled = [];
    if (ids.length > 0) {
      const { data, error } = await withRetry(
        () => supabase.from('sections').select('id, name, grade_level').in('id', ids),
        { label: 'Scheduled sections fetch' }
      );
      if (error) {
        console.warn('Scheduled sections fetch failed —', error.message);
        setSectionsError(true);
        return;
      }
      scheduled = data || [];
    }

    // Advised sections are listed first — DistributeModal offers the section
    // a teacher advises before the ones they merely teach into. A section
    // that is both (an adviser also scheduled into their own section) must
    // dedupe to the advised copy, so advised is spread first: the dedupe
    // below keeps the FIRST occurrence of a given id.
    const merged = [
      ...(advised || []).map(s => ({ ...s, isAdviser: true })),
      ...scheduled.map(s => ({ ...s, isAdviser: false })),
    ]
      .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
      .sort((a, b) => (b.isAdviser - a.isAdviser) || (a.name || '').localeCompare(b.name || ''));

    setSectionsError(false);
    setMySections(merged);
  }, [userData?.uid]);

  const fetchPostings = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('worksheet_sections').select('id, worksheet_id, section_id, due_at'),
      { label: 'Worksheet postings fetch' }
    );
    if (error) {
      console.warn('Worksheet postings fetch failed —', error.message);
      setPostingsError(true);
      return;
    }
    setPostingsError(false);
    setPostings(data || []);
  }, []);

  // How many students currently hold each task, across every section —
  // one bulk read for the whole card grid rather than a per-card
  // loadAssignees(taskId) call. The `status` column this used to derive from
  // is dead (distribution is task_assignees now); this is its truthful
  // replacement, for both the per-card badge and the "Distributed" tile.
  // Returns null-equivalent via the error flag — never a quietly-empty
  // `{}` — so a failed read cannot be mistaken for "nothing distributed".
  //
  // `assigneeCountsLoading` starts true and only clears once the first fetch
  // settles, on the success path AND the error path. Without it, the window
  // between mount and the first response has assigneeCounts = {} and
  // assigneeCountsError = false — indistinguishable from "genuinely nobody
  // has anything" — so every badge would flash "Not distributed" and every
  // tile would read 0 on every page load, and for as long as withRetry keeps
  // backing off on a flaky connection. That is the exact false statement
  // this whole feature exists to stop making, just moved to a different
  // window. Consumers must treat "loading" as its own state, never as 0.
  const [assigneeCounts, setAssigneeCounts] = useState({});
  const [assigneeCountsError, setAssigneeCountsError] = useState(false);
  const [assigneeCountsLoading, setAssigneeCountsLoading] = useState(true);
  // Earliest assigned_at per task, as epoch milliseconds.
  const [firstAssignedAt, setFirstAssignedAt] = useState({});

  // Paged rather than one unbounded select: task_assignees is one row per
  // (task, student), so a modest school (30 tasks x 40 students) clears
  // PostgREST's default 1000-row response cap easily. A capped select does
  // not error when it's truncated — it just quietly hands back page one,
  // which would make older tasks read "Not distributed" and undercount the
  // tile with nothing on screen suggesting anything is wrong. Paging with
  // .range() until a short page comes back gets the whole table; a page
  // that errors discards whatever was accumulated so far and reports a
  // failure instead of a confidently wrong partial count. Do not simplify
  // this back to a single unbounded select.
  const fetchAssigneeCounts = useCallback(async () => {
    setAssigneeCountsLoading(true);
    // Deliberately UNDER PostgREST's default 1000-row cap (db-max-rows), not
    // equal to it. A page size at or above whatever the server enforces makes
    // the first page come back short the moment a project tightens that
    // setting below 1000 — which this loop reads as "that was the last page"
    // and breaks after one iteration, silently reintroducing the exact
    // undercount this pagination exists to prevent. A page size below the cap
    // is never wrong; worst case it costs one extra round trip.
    const PAGE_SIZE = 500;
    const seen = new Set();
    const counts = {};
    const first = {};
    let from = 0;
    try {
      while (true) {
        const { data, error } = await withRetry(
          () => supabase.from('task_assignees')
            .select('task_id, student_id, assigned_at')
            .range(from, from + PAGE_SIZE - 1),
          { label: 'Task assignee counts fetch' }
        );
        if (error) {
          console.warn('Task assignee counts fetch failed —', error.message);
          setAssigneeCountsError(true);
          return;
        }
        (data || []).forEach(row => {
          const at = utcMs(row.assigned_at);
          if (Number.isFinite(at) && !(first[row.task_id] <= at)) first[row.task_id] = at;
          const key = `${row.task_id}:${row.student_id}`;
          if (seen.has(key)) return;
          seen.add(key);
          counts[row.task_id] = (counts[row.task_id] || 0) + 1;
        });
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setAssigneeCountsError(false);
      setAssigneeCounts(counts);
      setFirstAssignedAt(first);
    } finally {
      // Cleared here, structurally, rather than at every return above —
      // so an exception thrown anywhere in this chain (rather than the
      // { error } shape supabase-js normally resolves with) still lands on
      // a state with a working Retry instead of a permanent "Checking…".
      setAssigneeCountsLoading(false);
    }
  }, []);

  useEffect(() => { fetchMySections(); }, [fetchMySections]);
  useEffect(() => { fetchPostings(); }, [fetchPostings]);
  useEffect(() => { fetchAssigneeCounts(); }, [fetchAssigneeCounts]);

  // Loads one worksheet's questions plus its answer key (keyed by item id).
  // The key lives in a separate table so students never fetch it.
  //
  // `keys` maps item id -> the whole key ROW ({ correct_answer }), not the
  // bare correct_answer value: checkItem/scoreSubmission in worksheetChecking
  // both expect `key?.correct_answer`, and its own tests assert that shape.
  // Mapping to the bare value here would make Task 7's auto-checker read
  // `undefined.correct_answer` for every item and mark the whole class wrong.
  const loadItems = useCallback(async (worksheetId) => {
    const { data: items, error } = await withRetry(
      () => supabase.from('worksheet_items').select('*').eq('worksheet_id', worksheetId).order('position'),
      { label: 'Worksheet items fetch' }
    );
    if (error) {
      console.warn('Worksheet items fetch failed —', error.message);
      showToast('Could not load the questions. Check your connection.', 'error');
      return null;
    }

    const ids = (items || []).map(i => i.id);
    let keys = {};
    if (ids.length > 0) {
      const { data: keyRows, error: keyError } = await withRetry(
        () => supabase.from('worksheet_item_keys').select('item_id, correct_answer').in('item_id', ids),
        { label: 'Worksheet keys fetch' }
      );
      if (keyError) {
        console.warn('Worksheet keys fetch failed —', keyError.message);
        showToast('Could not load the answer key. Check your connection.', 'error');
        return null;
      }
      keys = Object.fromEntries((keyRows || []).map(k => [k.item_id, { correct_answer: k.correct_answer }]));
    }

    return { items: items || [], keys };
  }, [showToast]);

  // Replaces the worksheet's items wholesale — which means DELETING the old
  // ones, and worksheet_answers.item_id cascades on delete. Once anyone has
  // answered, saving would silently destroy their answers, so this refuses.
  // The check lives here, in the hook, rather than only in the UI, because a
  // second caller (or a disabled-button bug) would otherwise reintroduce the
  // data loss — a guard that only disables a button is not a guard.
  //
  // This is a multi-statement write with no client-side transaction: delete,
  // then insert items, then insert keys. If the key insert fails after items
  // were written, the items already exist (readable, but with no/partial
  // keys) while the old items and their keys are already gone. There is no
  // way to fully roll back from the client, so instead the function reports
  // the partial state truthfully ("saved but the answer key failed") rather
  // than pretending success, and the teacher can immediately reopen the
  // builder and re-save — the guard above still protects them because no
  // submissions exist yet at this point (that's the case that got them here).
  // The count is retried once: a wrong count hides real questions from the card's
  // distribute rule and from the student Activity check.
  const updateItemCount = async (worksheetId, count) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { error } = await supabase.from('worksheets').update({ items: count }).eq('id', worksheetId);
        if (!error) return true;
      } catch { /* try again once */ }
    }
    return false;
  };

  // Returns { ok, message }. Database text is never shown; the editor shows the message.
  const saveItems = useCallback(async (worksheetId, items) => {
    // Keyed on WORK, not on a row existing. The student surface inserts a
    // submission the moment someone taps Start — before answering anything,
    // and even for a worksheet with no questions — so checking for any row at
    // all meant one curious student permanently froze the question builder.
    // What must not be destroyed is an answer already written, or a submission
    // the student has finished. Mirrors guard_worksheet_item_delete, which
    // enforces the same condition in the database.
    const { data: finished, error: checkError } = await withRetry(
      () => supabase.from('worksheet_submissions')
        .select('id, status').eq('worksheet_id', worksheetId).neq('status', 'in_progress').limit(1),
      { label: 'Worksheet submissions guard fetch' }
    );
    if (checkError) {
      return { ok: false, message: CHECK_FAILED };
    }

    const { data: openSubs, error: openError } = await withRetry(
      () => supabase.from('worksheet_submissions').select('id').eq('worksheet_id', worksheetId),
      { label: 'Worksheet open submissions fetch' }
    );
    if (openError) return { ok: false, message: CHECK_FAILED };

    let answered = [];
    if ((openSubs || []).length > 0) {
      const { data, error: answerError } = await withRetry(
        () => supabase.from('worksheet_answers').select('id')
          .in('submission_id', (openSubs || []).map(s => s.id)).limit(1),
        { label: 'Worksheet answers guard fetch' }
      );
      if (answerError) return { ok: false, message: CHECK_FAILED };
      answered = data || [];
    }

    if ((finished || []).length > 0 || answered.length > 0) {
      return { ok: false, message: 'Students have already answered this worksheet. Its questions can no longer be changed.' };
    }

    // Old items go first: UNIQUE(worksheet_id, position) blocks inserting the new ones beside them.
    // A transactional save function (Option B) is the planned hardening.
    const { error: clearError } = await supabase
      .from('worksheet_items').delete().eq('worksheet_id', worksheetId);
    if (clearError) return { ok: false, message: SAVE_FAILED };

    if (items.length === 0) {
      if (!await updateItemCount(worksheetId, 0)) return { ok: false, message: COUNT_FAILED };
      showToast('Questions saved');
      return { ok: true };
    }

    const rows = items.map((it, index) => ({
      worksheet_id: worksheetId,
      position: index + 1,
      question: it.question,
      item_type: it.item_type,
      options: it.options && it.options.length > 0 ? it.options : null,
      points: normalizePoints(it.points),
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('worksheet_items').insert(rows).select('id, position');
    if (insertError) return { ok: false, message: SAVE_FAILED };

    const keyRows = (inserted || [])
      .map(row => {
        const source = items[row.position - 1];
        if (source.item_type === 'essay') return null;
        return { item_id: row.id, correct_answer: source.correct_answer ?? null };
      })
      .filter(Boolean);

    if (keyRows.length > 0) {
      const { error: keyError } = await supabase.from('worksheet_item_keys').insert(keyRows);
      if (keyError) {
        // Items are already committed with no (or a partial) key. Leaving
        // them in place would make the worksheet look answerable while every
        // auto-check silently fails, and once a student submits, the guard
        // above makes the questions permanently un-fixable. So clean up the
        // half-written items immediately rather than leaving that trap.
        const insertedIds = (inserted || []).map(row => row.id);
        // If this cleanup fails too, the next Save deletes every item for the worksheet anyway.
        await supabase.from('worksheet_items').delete().in('id', insertedIds);
        return { ok: false, message: SAVE_FAILED };
      }
    }

    // Keep the worksheet card's displayed item count truthful — it is a
    // hand-typed column from the old upload flow and saveItems is now the
    // source of truth for worksheets built here.
    if (!await updateItemCount(worksheetId, items.length)) return { ok: false, message: COUNT_FAILED };

    showToast('Questions saved');
    return { ok: true };
  }, [showToast]);

  const setCheckingMode = useCallback(async (worksheetId, mode) => {
    const { error } = await supabase.from('worksheets').update({ checking_mode: mode }).eq('id', worksheetId);
    if (error) {
      showToast(`Could not change checking mode: ${error.message}`, 'error');
      return false;
    }
    showToast(mode === 'auto' ? 'Auto-checking on' : 'Manual checking only');
    return true;
  }, [showToast]);

  // Every submission for a worksheet, with the answering student's name
  // attached. student_id references students(id), which is itself keyed to
  // auth.users — not profiles — so the name has to be fetched as a second
  // round trip rather than through a PostgREST embed.
  const loadSubmissions = useCallback(async (worksheetId) => {
    const { data: subs, error } = await withRetry(
      () => supabase.from('worksheet_submissions')
        .select('id, student_id, section_id, status, released, score, total_points, source')
        .eq('worksheet_id', worksheetId),
      { label: 'Worksheet submissions fetch' }
    );
    if (error) {
      console.warn('Worksheet submissions fetch failed —', error.message);
      return null;
    }

    const ids = [...new Set((subs || []).map(s => s.student_id))];
    let names = [];
    if (ids.length > 0) {
      const { data, error: nameError } = await withRetry(
        () => supabase.from('profiles').select('id, name').in('id', ids),
        { label: 'Submission student names fetch' }
      );
      if (nameError) {
        console.warn('Submission names fetch failed —', nameError.message);
        return null;
      }
      names = data || [];
    }

    // Which submissions carry real work. A submission row exists from the
    // moment a student taps Start, so `status` alone cannot tell an untouched
    // one from a half-answered one — and encoding a paper score over the
    // second silently buries answers the student wrote. One read for the whole
    // worksheet rather than one per student.
    let answeredIds = new Set();
    const subIds = (subs || []).map(s => s.id);
    if (subIds.length > 0) {
      const { data, error: answerError } = await withRetry(
        () => supabase.from('worksheet_answers').select('submission_id').in('submission_id', subIds),
        { label: 'Submission answer presence fetch' }
      );
      if (answerError) {
        console.warn('Submission answer presence fetch failed —', answerError.message);
        return null;
      }
      answeredIds = new Set((data || []).map(a => a.submission_id));
    }

    return (subs || []).map(s => ({
      hasAnswers: answeredIds.has(s.id),
      ...s,
      name: names.find(n => n.id === s.student_id)?.name || '—',
    }));
  }, []);

  // `{ [item_id]: answer }` for one submission. A failed read returns null,
  // never `{}` — the caller must treat those two cases differently, since an
  // empty object here is indistinguishable from "the student answered
  // nothing" and would let a teacher release a zero for someone who actually
  // answered everything.
  // `prior` carries the marks from a previous release, so reopening a checked
  // submission shows what the teacher actually approved rather than a blank
  // scoresheet they would have to retype from memory — and then release a
  // different score than the one on record.
  const loadAnswers = useCallback(async (submissionId) => {
    const { data, error } = await withRetry(
      () => supabase.from('worksheet_answers')
        .select('item_id, answer, points_earned, is_correct')
        .eq('submission_id', submissionId),
      { label: 'Worksheet answers fetch' }
    );
    if (error) {
      console.warn('Worksheet answers fetch failed —', error.message);
      return null;
    }
    return {
      answers: Object.fromEntries((data || []).map(a => [a.item_id, a.answer])),
      prior: Object.fromEntries(
        (data || [])
          .filter(a => a.points_earned !== null && a.points_earned !== undefined)
          .map(a => [a.item_id, Number(a.points_earned)])
      ),
    };
  }, []);

  // Best-effort by design: a failed notification must never roll back the
  // distribution that caused it. The caller reports that the work went out
  // but the message did not, which is the truth.
  const notifyStudents = async (studentIds, { title, message, taskId }) => {
    if (!studentIds || studentIds.length === 0) return true;
    const { error } = await supabase.from('notifications').insert(
      studentIds.map(id => ({
        user_id: id,
        title,
        message,
        notification_type: 'task',
        related_entity_type: 'worksheet',
        related_entity_id: taskId,
        action_url: '/student-dashboard/tasks',
      }))
    );
    if (error) {
      // RLS only allows a teacher to address a student they actually teach,
      // so a failed insert here can legitimately mean "not your student" as
      // easily as a real outage — neither is a Postgres error worth showing
      // the teacher raw. Best-effort: the caller already succeeded at the
      // thing that matters (the task went out, the score was released).
      console.warn('Notification write failed —', error.message);
      return false;
    }
    return true;
  };

  // Keep the modal's arguments; the database recomputes both totals and writes
  // all item marks with the released submission in one transaction.
  const releaseScore = async (submissionId, worksheetId, score, totalPoints, perItem) => {
    void worksheetId;
    void score;
    void totalPoints;
    const unconfirmed = 'Could not confirm the release. Check the submission and try again.';
    if (typeof supabase.rpc !== 'function') {
      showToast(unconfirmed, 'error');
      return false;
    }
    try {
      const { data, error } = await supabase.rpc('eduscribe_worksheet_score_release_v1', {
        p_submission_id: submissionId,
        p_marks: perItem.map(row => ({ itemId: row.item_id, points: row.pointsEarned })),
      });
      if (error) {
        const messages = {
          not_authenticated: 'Your session has ended. Sign in again before releasing this score.',
          not_found: 'This submission is no longer available to you. Refresh and try again.',
          invalid_state: 'This submission is not ready for score release. Refresh and review its status.',
          invalid_marks: 'One or more item scores are invalid. Review every mark and try again.',
        };
        showToast(Object.prototype.hasOwnProperty.call(messages, error.message)
          ? messages[error.message] : unconfirmed, 'error');
        return false;
      }
      if (data?.ok !== true || String(data.submissionId).toLowerCase() !== String(submissionId).toLowerCase()) {
        showToast(unconfirmed, 'error');
        return false;
      }
      showToast('Score released to the student');
      return true;
    } catch {
      showToast(unconfirmed, 'error');
      return false;
    }
  };

  // The active class list for one section, names attached.
  //
  // Returns null — never [] — when either read fails. The caller has to be
  // able to tell "this read broke" from "this section really is empty":
  // rendering a failed read as an empty class list would tell a teacher their
  // section has no students, and they would go and re-add a class that is
  // already there.
  const loadClassList = useCallback(async (sectionId) => {
    const { data: rows, error } = await withRetry(
      () => supabase.from('section_students')
        .select('student_id').eq('section_id', sectionId).eq('status', 'active'),
      { label: 'Class list fetch' }
    );
    if (error) {
      console.warn('Class list fetch failed —', error.message);
      return null;
    }

    const ids = [...new Set((rows || []).map(r => r.student_id))];
    if (ids.length === 0) return [];

    // students.id references auth.users, not profiles, so the name comes from
    // a separate query rather than a PostgREST embed.
    const { data: names, error: nameError } = await withRetry(
      () => supabase.from('profiles').select('id, name').in('id', ids),
      { label: 'Class list names fetch' }
    );
    if (nameError) {
      console.warn('Class list names fetch failed —', nameError.message);
      return null;
    }

    return ids.map(id => ({
      student_id: id,
      name: (names || []).find(n => n.id === id)?.name || '—',
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // For a class that answered on paper: writes a submission directly with
  // released already true. There is no per-item review here because there
  // are no online per-item answers to review — the teacher is attesting to
  // the total score themselves, so the gate this hook otherwise enforces
  // (release only after seeing items) does not apply to this path.
  //
  // Returns `{ ok, reason, message }`, not a bare boolean, because the caller
  // encodes a whole class in a loop and has to tell the outcomes apart: an
  // invalid box, a student who is not on the class list, and a student who
  // already answered ONLINE each need a different thing said about them, next
  // to that student's row, not as a single anonymous toast. Nothing here
  // toasts: a class of forty would otherwise fire forty toasts.
  //
  // `reason` is one of: 'invalid-total', 'invalid-score', 'lookup-failed',
  // 'online-conflict', 'not-in-class-list', 'write-failed'.
  const encodeManualScore = async (
    worksheetId, sectionId, studentId, score, totalPoints, { overwriteOnline = false } = {}
  ) => {
    if (!trustedScoreWritesAvailable) {
      return { ok: false, reason: 'unavailable', message: 'Paper score saving and release are unavailable until trusted Teacher authorization is connected. Nothing was saved.' };
    }
    // Number('') is 0 and Number('abc') is NaN — and NaN JSON-serialises to
    // null. Unguarded, an empty box would release a zero the teacher never
    // typed, and a typo would release a NULL score with released = true,
    // which the student's Overview would then have to make sense of. Both
    // are rejected here rather than in the UI alone, because a guard that
    // only lives in the caller is one caller away from being gone.
    const total = Number(totalPoints);
    if (!Number.isFinite(total) || total <= 0) {
      return { ok: false, reason: 'invalid-total', message: 'Set a total above zero first.' };
    }
    const raw = typeof score === 'string' ? score.trim() : score;
    if (raw === '' || raw === null || raw === undefined) {
      return { ok: false, reason: 'invalid-score', message: 'No score typed.' };
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: 'invalid-score', message: 'That score is not a number.' };
    }
    // A number input's min/max only constrain its steppers — a typed value
    // goes straight through, and DECIMAL(6,2) will happily store 55 out of 20.
    if (value < 0 || value > total) {
      return { ok: false, reason: 'invalid-score', message: `Score must be between 0 and ${total}.` };
    }

    // Look the row up before writing. A blind upsert on (worksheet_id,
    // student_id) would overwrite an ONLINE submission's source, status and
    // score — silently converting a student's real, item-by-item answers into
    // a hand-typed paper total, with the answers still sitting in
    // worksheet_answers contradicting it. That decision is the teacher's, so
    // it is surfaced ('online-conflict') and only carried out when they come
    // back with overwriteOnline.
    const { data: existing, error: lookupError } = await withRetry(
      () => supabase.from('worksheet_submissions')
        .select('id, source, status, score, total_points, released')
        .eq('worksheet_id', worksheetId).eq('student_id', studentId).maybeSingle(),
      { label: 'Existing submission lookup' }
    );
    if (lookupError) {
      console.warn('Existing submission lookup failed —', lookupError.message);
      return {
        ok: false,
        reason: 'lookup-failed',
        message: `Could not check for an existing submission (${lookupError.message}) — nothing was saved.`,
      };
    }

    // An in-progress online submission is only a conflict if the student
    // actually wrote something into it. Same definition of "work" saveItems
    // uses, so the two guards in this file cannot disagree about whether a
    // half-answered worksheet counts.
    let existingHasAnswers = false;
    if (existing && existing.source === 'online' && existing.status === 'in_progress') {
      const { data: answerRows, error: answerError } = await withRetry(
        () => supabase.from('worksheet_answers').select('id').eq('submission_id', existing.id).limit(1),
        { label: 'Existing submission answer check' }
      );
      if (answerError) {
        console.warn('Existing submission answer check failed —', answerError.message);
        return {
          ok: false,
          reason: 'lookup-failed',
          message: 'Could not check whether this student already answered in the app — nothing was saved.',
        };
      }
      existingHasAnswers = (answerRows || []).length > 0;
    }

    // Only a submission the student actually FINISHED is a conflict. The
    // student surface inserts an `online` row the moment someone taps Start,
    // so treating every online row as a conflict made the teacher tick
    // "replace their online submission" for a student who merely opened the
    // worksheet and answered nothing.
    if (existing && existing.source === 'online'
        && (existing.status !== 'in_progress' || existingHasAnswers) && !overwriteOnline) {
      return {
        ok: false,
        reason: 'online-conflict',
        existing,
        message: 'This student answered in the app. Choose whether to replace that submission.',
      };
    }

    const stamp = new Date().toISOString();
    const scored = {
      source: 'manual',
      status: 'checked',
      released: true,
      score: round2(value),
      total_points: round2(total),
      checked_by: userData?.uid || null,
      checked_at: stamp,
      // The old upsert never set this on its conflict-update path, so an
      // edited score kept the created_at-era updated_at forever.
      updated_at: stamp,
    };

    // Explicit update/insert rather than upsert: the conflict path of an
    // upsert is exactly where updated_at went missing, and an update by id
    // also leaves created_at and section_id history alone.
    const { error } = existing
      ? await supabase.from('worksheet_submissions').update(scored).eq('id', existing.id)
      : await supabase.from('worksheet_submissions')
          .insert([{ worksheet_id: worksheetId, student_id: studentId, section_id: sectionId, ...scored }]);

    if (error) {
      // 23503 is foreign_key_violation. worksheet_submissions.student_id
      // references students(id) — not profiles — so someone who was never
      // added to a class list has no row there to point at.
      if (error.code === '23503') {
        return {
          ok: false,
          reason: 'not-in-class-list',
          message: 'This person has no student record yet — add them to a section in Class List first.',
        };
      }
      // 23505 is unique_violation on (worksheet_id, student_id): a submission
      // appeared between the lookup above and this insert.
      if (error.code === '23505') {
        return {
          ok: false,
          reason: 'write-failed',
          message: 'A submission for this student was created just now — reopen this window and try again.',
        };
      }
      return { ok: false, reason: 'write-failed', message: error.message };
    }
    return { ok: true, score: round2(value), totalPoints: round2(total) };
  };

  // Group this year's teaching-load rows by real subject ID. Keep each
  // assigned grade so create/upload can only offer an eligible pairing.
  const teacherId = userData?.uid;
  const [subjectRows, setSubjectRows] = useState([]);
  const [subjectOwner, setSubjectOwner] = useState(null);
  const mySubjects = subjectOwner === teacherId ? subjectRows : [];
  const mySubject = mySubjects.length === 1 ? mySubjects[0] : null;
  const [subjectError, setSubjectError] = useState(false);
  // Loading and error stay distinct from a confirmed empty teaching load.
  const [subjectPending, setSubjectPending] = useState(true);
  const [schoolYear, setSchoolYear] = useState(null);
  const subjectLoading = subjectPending || Boolean(teacherId && subjectOwner !== teacherId && !subjectError);
  const subjectRequest = useRef(0);

  const fetchMySubject = useCallback(async () => {
    const request = ++subjectRequest.current;
    setSubjectPending(true);
    setSubjectError(false);
    setSubjectOwner(null);
    setSubjectRows([]);
    setSchoolYear(null);
    if (!teacherId) {
      setSubjectPending(false);
      return;
    }
    const { data: settings, error: settingsError } = await withRetry(
      () => supabase.from('school_settings').select('school_year').eq('id', 1).single(),
      { label: 'Official academic year fetch' }
    );
    if (request !== subjectRequest.current) return;
    if (settingsError || !validSchoolYear(settings?.school_year)) {
      setSubjectError(true);
      setSubjectPending(false);
      return;
    }
    const officialYear = settings.school_year;
    const { data, error } = await withRetry(
      // Scope authoring choices to the official Settings year.
      () => supabase.from('teacher_subjects')
        .select('subject_id, grade_level, subjects(id, name)')
        .eq('teacher_id', teacherId)
        .eq('school_year', officialYear),
      { label: 'Teaching load fetch' }
    );
    if (request !== subjectRequest.current) return;
    if (error) {
      console.warn('Teaching load fetch failed —', error.message);
      setSubjectError(true);
      setSubjectPending(false);
      return;
    }
    // One row per grade level, so the same subject appears more than once.
    const byId = new Map();
    (data || []).forEach(r => {
      if (!r.subject_id || r.subjects?.id !== r.subject_id || !r.subjects?.name || !r.grade_level) return;
      if (!byId.has(r.subject_id)) byId.set(r.subject_id, { id: r.subject_id, name: r.subjects.name, grades: [] });
      const subject = byId.get(r.subject_id);
      if (!subject.grades.includes(r.grade_level)) subject.grades.push(r.grade_level);
    });
    setSubjectError(false);
    setSchoolYear(officialYear);
    setSubjectRows([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    setSubjectOwner(teacherId);
    setSubjectPending(false);
  }, [teacherId, setSubjectRows, setSubjectOwner, setSubjectPending, setSubjectError]);

  useEffect(() => { Promise.resolve().then(fetchMySubject); }, [fetchMySubject]);

  // Who currently holds this task, and under which section — the source of
  // truth DistributeModal checks before re-inserting anyone, and the thing
  // that decides which section_id a resubmit-safe retry writes. Returns
  // null — never [] — on a failed read: an empty array here would read as
  // "nobody has this yet" and let a re-open silently re-add students who
  // already do, or (worse) tell distributeTask nobody needs skipping.
  const loadAssignees = useCallback(async (taskId) => {
    const { data, error } = await withRetry(
      () => supabase.from('task_assignees')
        .select('student_id, section_id, due_at').eq('task_id', taskId),
      { label: 'Task assignees fetch' }
    );
    if (error) {
      console.warn('Task assignees fetch failed —', error.message);
      return null;
    }
    return data || [];
  }, []);

  // One database transaction records the posting and adds every student who
  // does not already hold the task, so a failure leaves nothing half written.
  // Students already assigned are skipped there, and the receipt's `added` list
  // is exactly who gets notified, so re-opening the modal for a latecomer tells
  // nobody twice. Without a checkingMode the stored mode is sent unchanged.
  const distributeTask = async (taskId, sectionId, studentIds, dueAt, checkingMode) => {
    if (!distributionEnabled) {
      return { ok: false, message: 'Distribution is unavailable until trusted authorization is connected. No students were assigned.' };
    }
    if (!sectionId) return { ok: false, message: 'Pick a section first.' };
    if (!dueAt) return { ok: false, message: 'Set a deadline first.' };
    if (studentIds.length === 0) return { ok: false, message: 'Tick at least one student.' };

    const { data: meta, error: metaError } = await withRetry(
      () => supabase.from('worksheets').select('title, task_type, checking_mode').eq('id', taskId).maybeSingle(),
      { label: 'Task metadata fetch for distribution' }
    );
    if (metaError || !meta) {
      console.warn('Task metadata fetch failed — nothing was sent', metaError?.message);
      return { ok: false, message: 'Could not check this task — nothing was sent.' };
    }

    const result = await distributeDayTask({ worksheetId: taskId, sectionId, studentIds, dueAt,
      checkingMode: checkingMode ?? meta.checking_mode });
    if (!result.ok) return { ok: false, message: result.message };

    fetchPostings();
    fetchAssigneeCounts();

    const { added, alreadyAssigned, assignedElsewhere } = result.receipt;
    if (added.length === 0) {
      return { ok: true, added: [], skipped: studentIds.length, postingSaved: true,
        message: 'Everyone ticked already has this task.', alreadyAssigned, assignedElsewhere };
    }

    // The task already went out — a failed notification here must not turn
    // this into a failure, only into a truthful `notified: false` the modal
    // can pass along.
    const typeLabel = TASK_TYPE_LABELS[meta.task_type] || 'Task';
    const title = mySubject?.name ? `${typeLabel} — ${mySubject.name}` : typeLabel;
    const deadline = new Date(dueAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const message = `"${meta.title}" is due ${deadline}.`;
    const notified = await notifyStudents(added, { title, message, taskId });

    return { ok: true, added, skipped: studentIds.length - added.length, message: '', notified, alreadyAssigned, assignedElsewhere };
  };

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    loadItems, saveItems, setCheckingMode,
    loadSubmissions, loadAnswers, releaseScore, encodeManualScore,
    loadClassList,
    mySubject, mySubjects, schoolYear: subjectOwner === teacherId ? schoolYear : null,
    subjectError, subjectLoading, fetchMySubject,
    loadAssignees, distributeTask,
    assigneeCounts, assigneeCountsError, assigneeCountsLoading, fetchAssigneeCounts, firstAssignedAt,
  };
};
