// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx
// Posting, question and submission state for the Worksheets tab. Kept out of
// WorksheetsTab.jsx, which already carries the upload and CRUD flow.
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../../config/supabase';
import { useAuth } from '../../../../context/AuthContext';
import { withRetry } from '../../../../lib/supabaseRetry';
import { normalizePoints, round2 } from '../../../../lib/worksheetChecking';
import { TASK_TYPE_LABELS } from '../../../../lib/taskFormatting';

export const useWorksheetAssessment = (showToast) => {
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
    let from = 0;
    try {
      while (true) {
        const { data, error } = await withRetry(
          () => supabase.from('task_assignees')
            .select('task_id, student_id')
            .range(from, from + PAGE_SIZE - 1),
          { label: 'Task assignee counts fetch' }
        );
        if (error) {
          console.warn('Task assignee counts fetch failed —', error.message);
          setAssigneeCountsError(true);
          return;
        }
        (data || []).forEach(row => {
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
      showToast('Could not check for existing answers — not saving.', 'error');
      return false;
    }

    const { data: openSubs, error: openError } = await withRetry(
      () => supabase.from('worksheet_submissions').select('id').eq('worksheet_id', worksheetId),
      { label: 'Worksheet open submissions fetch' }
    );
    if (openError) {
      showToast('Could not check for existing answers — not saving.', 'error');
      return false;
    }

    let answered = [];
    if ((openSubs || []).length > 0) {
      const { data, error: answerError } = await withRetry(
        () => supabase.from('worksheet_answers').select('id')
          .in('submission_id', (openSubs || []).map(s => s.id)).limit(1),
        { label: 'Worksheet answers guard fetch' }
      );
      if (answerError) {
        showToast('Could not check for existing answers — not saving.', 'error');
        return false;
      }
      answered = data || [];
    }

    if ((finished || []).length > 0 || answered.length > 0) {
      showToast('Students have already answered this worksheet. Its questions can no longer be changed.', 'error');
      return false;
    }

    const { error: clearError } = await supabase
      .from('worksheet_items').delete().eq('worksheet_id', worksheetId);
    if (clearError) {
      showToast(`Could not save questions: ${clearError.message}`, 'error');
      return false;
    }

    if (items.length === 0) {
      const { error: countError } = await supabase
        .from('worksheets').update({ items: 0 }).eq('id', worksheetId);
      if (countError) console.warn('Worksheet item-count update failed —', countError.message);
      showToast('Questions saved');
      return true;
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
    if (insertError) {
      showToast(`Could not save questions: ${insertError.message}`, 'error');
      return false;
    }

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
        const { error: cleanupError } = await supabase
          .from('worksheet_items').delete().in('id', insertedIds);
        if (cleanupError) {
          showToast(
            `Could not save the answer key (${keyError.message}), and the half-saved ` +
            `questions could not be removed either (${cleanupError.message}). ` +
            `Reopen this worksheet and try saving again right away.`,
            'error'
          );
        } else {
          showToast(
            `Could not save the answer key: ${keyError.message}. ` +
            `The half-saved questions were removed — try saving again.`,
            'error'
          );
        }
        return false;
      }
    }

    // Keep the worksheet card's displayed item count truthful — it is a
    // hand-typed column from the old upload flow and saveItems is now the
    // source of truth for worksheets built here.
    const { error: countError } = await supabase
      .from('worksheets').update({ items: items.length }).eq('id', worksheetId);
    if (countError) {
      console.warn('Worksheet item-count update failed —', countError.message);
    }

    showToast('Questions saved');
    return true;
  }, [showToast]);

  const setCheckingMode = useCallback(async (worksheetId, mode) => {
    const { error } = await supabase.from('worksheets').update({ checking_mode: mode }).eq('id', worksheetId);
    if (error) return showToast(`Could not change checking mode: ${error.message}`, 'error');
    showToast(mode === 'auto' ? 'Auto-checking on' : 'Manual checking only');
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
  // distribution or the release that caused it. The caller reports that the
  // work went out but the message did not, which is the truth. Declared
  // ahead of releaseScore and distributeTask because both call it.
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

  // Writes every item's mark, then flips the submission to checked+released.
  // This is a multi-row write with no client transaction: if a per-item
  // update fails partway, the submission's `released` flag (set last) is
  // never reached, so the student still sees nothing — the gate fails safe.
  // The already-written item rows are simply overwritten with the same
  // values on retry, since the caller always resubmits the full perItem set
  // computed from its own review state, not a diff.
  // Upsert rather than update: a student who left an item blank may have no
  // answer row at all, and an UPDATE matching zero rows is not an error in
  // PostgREST — the teacher's mark for that item would vanish silently while
  // the submission-level score still counted it.
  const releaseScore = async (submissionId, worksheetId, score, totalPoints, perItem) => {
    const { error: itemError } = await supabase.from('worksheet_answers').upsert(
      perItem.map(row => ({
        submission_id: submissionId,
        item_id: row.item_id,
        is_correct: row.isCorrect,
        points_earned: row.pointsEarned,
      })),
      { onConflict: 'submission_id,item_id' }
    );
    if (itemError) {
      showToast(`Could not save item marks: ${itemError.message}. Try Save & Release again.`, 'error');
      return false;
    }

    // .select() piggybacks the student_id onto this same write's response —
    // this function is never handed one otherwise, and a separate read just
    // to notify would be a round trip the release itself does not need.
    const { data: updated, error } = await supabase.from('worksheet_submissions').update({
      status: 'checked',
      released: true,
      score,
      total_points: totalPoints,
      checked_by: userData?.uid || null,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', submissionId).select('student_id').maybeSingle();

    if (error) {
      showToast(`Could not release: ${error.message}. Item marks were saved — try Save & Release again.`, 'error');
      return false;
    }

    // The score is released either way — a failed notification must not
    // turn this into a failure, so its result is not checked here.
    if (updated?.student_id) {
      const subjectLabel = mySubject?.name ? `${mySubject.name} score` : 'Score';
      await notifyStudents([updated.student_id], {
        title: `${subjectLabel} released`,
        message: `Your score is ${score} out of ${totalPoints}.`,
        taskId: worksheetId,
      });
    }

    showToast('Score released to the student');
    return true;
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

  // The teacher's own subject, from their teaching load (teacher_subjects ->
  // subjects), rather than typed free text. One row per grade level is
  // normal — a teacher who teaches Math to two grade levels has two rows
  // naming the same subject — so rows are de-duplicated by subject id before
  // deciding whether this teacher has one subject, none, or a genuine
  // conflict (two DIFFERENT subjects, which the admin needs to fix).
  //
  // `subjectError` and `mySubject === null` are kept as separate states on
  // purpose: a failed read must never look like "no subject assigned" — one
  // means "retry", the other means "ask your admin", and collapsing them
  // would send the teacher to the wrong fix.
  const [mySubject, setMySubject] = useState(null);
  const [subjectError, setSubjectError] = useState(false);
  // More than one subject assigned. Not an error in the data — a small school
  // may well do this — but the design says one per teacher, and guessing which
  // one a task belongs to would file work under the wrong heading silently.
  const [subjectConflict, setSubjectConflict] = useState(false);
  // True until the first fetch settles. Without this, the initial triple
  // (mySubject=null, subjectError=false, subjectConflict=false) is
  // indistinguishable from "fetch finished, nothing assigned" — a teacher who
  // opens the create form before the first fetch resolves would be told to
  // go bother their admin over a load that simply hasn't come back yet.
  const [subjectLoading, setSubjectLoading] = useState(true);

  const fetchMySubject = useCallback(async () => {
    if (!userData?.uid) return;
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects')
        .select('subject_id, subjects(id, name)')
        .eq('teacher_id', userData.uid),
      { label: 'Teaching load fetch' }
    );
    if (error) {
      console.warn('Teaching load fetch failed —', error.message);
      setSubjectError(true);
      setSubjectLoading(false);
      return;
    }
    // One row per grade level, so the same subject appears more than once.
    const unique = [];
    (data || []).forEach(r => {
      if (r.subjects?.id && !unique.some(u => u.id === r.subjects.id)) {
        unique.push({ id: r.subjects.id, name: r.subjects.name });
      }
    });
    setSubjectError(false);
    setSubjectConflict(unique.length > 1);
    setMySubject(unique.length === 1 ? unique[0] : null);
    setSubjectLoading(false);
  }, [userData?.uid]);

  useEffect(() => { fetchMySubject(); }, [fetchMySubject]);

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

  // Writes the section posting and one assignee row per student. Students
  // already assigned are skipped rather than re-inserted, so re-opening the
  // modal to add a latecomer does not disturb anybody else or notify them
  // twice. Returns the ids actually added so the caller can notify exactly
  // those and nobody else.
  //
  // section_id on every inserted row is the SECTION PASSED IN, never a fresh
  // lookup of the student's current live enrolment. task_assignees.section_id
  // is what the RLS submission-insert check (student_assigned_task_in_section)
  // pins worksheet_submissions.section_id to, so writing anything other than
  // the section this distribution actually happened under would let that
  // student's own submission get rejected by the database with a bare RLS
  // error the student cannot make sense of.
  const distributeTask = async (taskId, sectionId, studentIds, dueAt) => {
    if (!sectionId) return { ok: false, message: 'Pick a section first.' };
    if (!dueAt) return { ok: false, message: 'Set a deadline first.' };
    if (studentIds.length === 0) return { ok: false, message: 'Tick at least one student.' };

    const existing = await loadAssignees(taskId);
    if (existing === null) {
      return { ok: false, message: 'Could not check who already has this task — nothing was sent.' };
    }
    const already = new Set(existing.map(a => a.student_id));
    const toAdd = studentIds.filter(id => !already.has(id));

    // Records that the task reached this section. Phase 2's teacher-facing
    // summary reads it; the student's own access comes from task_assignees.
    const { error: sectionError } = await supabase.from('worksheet_sections').upsert([{
      worksheet_id: taskId, section_id: sectionId, due_at: dueAt, posted_by: userData?.uid || null,
    }], { onConflict: 'worksheet_id,section_id' });
    if (sectionError) {
      return { ok: false, message: `Could not record the posting: ${sectionError.message}` };
    }

    if (toAdd.length === 0) {
      return { ok: true, added: [], skipped: studentIds.length, message: 'Everyone ticked already has this task.' };
    }

    const { error } = await supabase.from('task_assignees').insert(
      toAdd.map(id => ({
        task_id: taskId, student_id: id, section_id: sectionId,
        due_at: dueAt, assigned_by: userData?.uid || null,
      }))
    );
    if (error) {
      const message = error.code === '23503'
        ? 'One of these students is not on the class list yet. Ask your admin to add them to the section first.'
        : error.code === '23505'
        ? 'One of these students already has this task.'
        : `Could not distribute: ${error.message}`;
      return { ok: false, message };
    }

    fetchPostings();
    fetchAssigneeCounts();

    // The task already went out — a failed notification here must not turn
    // this into a failure, only into a truthful `notified: false` the modal
    // can pass along. `toAdd` is exactly who was newly assigned above: never
    // a student who already held this task, so a re-distribution notifies
    // nobody twice.
    let notified = true;
    const { data: meta, error: metaError } = await withRetry(
      () => supabase.from('worksheets').select('title, task_type').eq('id', taskId).maybeSingle(),
      { label: 'Task metadata fetch for notification' }
    );
    if (metaError || !meta) {
      console.warn('Task metadata fetch failed — notification skipped', metaError?.message);
      notified = false;
    } else {
      const typeLabel = TASK_TYPE_LABELS[meta.task_type] || 'Task';
      const title = mySubject?.name ? `${typeLabel} — ${mySubject.name}` : typeLabel;
      const deadline = new Date(dueAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      const message = `"${meta.title}" is due ${deadline}.`;
      notified = await notifyStudents(toAdd, { title, message, taskId });
    }

    return { ok: true, added: toAdd, skipped: studentIds.length - toAdd.length, message: '', notified };
  };

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    loadItems, saveItems, setCheckingMode,
    loadSubmissions, loadAnswers, releaseScore, encodeManualScore,
    loadClassList,
    mySubject, subjectError, subjectConflict, subjectLoading, fetchMySubject,
    loadAssignees, distributeTask,
    assigneeCounts, assigneeCountsError, assigneeCountsLoading, fetchAssigneeCounts,
  };
};
