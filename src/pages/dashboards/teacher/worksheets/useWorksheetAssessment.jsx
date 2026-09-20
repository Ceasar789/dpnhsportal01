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

    const merged = [...scheduled, ...(advised || [])]
      .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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

  const postWorksheet = async (worksheetId, sectionId, dueAt) => {
    if (!sectionId) { showToast('Pick a section', 'error'); return false; }
    if (!dueAt) { showToast('Set a due date', 'error'); return false; }

    const { error } = await supabase.from('worksheet_sections').insert([{
      worksheet_id: worksheetId,
      section_id: sectionId,
      due_at: dueAt,
      posted_by: userData?.uid || null,
    }]);

    if (error) {
      // 23505 is unique_violation: already posted to this section.
      showToast(
        error.code === '23505'
          ? 'This worksheet is already posted to that section.'
          : `Could not post: ${error.message}`,
        'error'
      );
      return false;
    }
    showToast('Worksheet posted');
    fetchPostings();
    return true;
  };

  useEffect(() => { fetchMySections(); }, [fetchMySections]);
  useEffect(() => { fetchPostings(); }, [fetchPostings]);

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
    const { data: existing, error: checkError } = await withRetry(
      () => supabase.from('worksheet_submissions').select('id').eq('worksheet_id', worksheetId).limit(1),
      { label: 'Worksheet submissions guard fetch' }
    );
    if (checkError) {
      showToast('Could not check for existing answers — not saving.', 'error');
      return false;
    }
    if ((existing || []).length > 0) {
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

    return (subs || []).map(s => ({
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

    const { error } = await supabase.from('worksheet_submissions').update({
      status: 'checked',
      released: true,
      score,
      total_points: totalPoints,
      checked_by: userData?.uid || null,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', submissionId);

    if (error) {
      showToast(`Could not release: ${error.message}. Item marks were saved — try Save & Release again.`, 'error');
      return false;
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

    if (existing && existing.source === 'online' && !overwriteOnline) {
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

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    postWorksheet,
    loadItems, saveItems, setCheckingMode,
    loadSubmissions, loadAnswers, releaseScore, encodeManualScore,
    loadClassList,
  };
};
