// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx
// Posting, question and submission state for the Worksheets tab. Kept out of
// WorksheetsTab.jsx, which already carries the upload and CRUD flow.
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../../config/supabase';
import { useAuth } from '../../../../context/AuthContext';
import { withRetry } from '../../../../lib/supabaseRetry';
import { normalizePoints } from '../../../../lib/worksheetChecking';

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
  const loadAnswers = useCallback(async (submissionId) => {
    const { data, error } = await withRetry(
      () => supabase.from('worksheet_answers').select('item_id, answer').eq('submission_id', submissionId),
      { label: 'Worksheet answers fetch' }
    );
    if (error) {
      console.warn('Worksheet answers fetch failed —', error.message);
      return null;
    }
    return Object.fromEntries((data || []).map(a => [a.item_id, a.answer]));
  }, []);

  // Writes every item's mark, then flips the submission to checked+released.
  // This is a multi-row write with no client transaction: if a per-item
  // update fails partway, the submission's `released` flag (set last) is
  // never reached, so the student still sees nothing — the gate fails safe.
  // The already-written item rows are simply overwritten with the same
  // values on retry, since the caller always resubmits the full perItem set
  // computed from its own review state, not a diff.
  const releaseScore = async (submissionId, worksheetId, score, totalPoints, perItem) => {
    for (const row of perItem) {
      const { error } = await supabase.from('worksheet_answers')
        .update({ is_correct: row.isCorrect, points_earned: row.pointsEarned })
        .eq('submission_id', submissionId).eq('item_id', row.item_id);
      if (error) {
        showToast(`Could not save item marks: ${error.message}. Try Save & Release again.`, 'error');
        return false;
      }
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

  // For a class that answered on paper: writes a submission directly with
  // released already true. There is no per-item review here because there
  // are no online per-item answers to review — the teacher is attesting to
  // the total score themselves, so the gate this hook otherwise enforces
  // (release only after seeing items) does not apply to this path.
  const encodeManualScore = async (worksheetId, sectionId, studentId, score, totalPoints) => {
    const { error } = await supabase.from('worksheet_submissions').upsert([{
      worksheet_id: worksheetId,
      student_id: studentId,
      section_id: sectionId,
      source: 'manual',
      status: 'checked',
      released: true,
      score: Number(score),
      total_points: Number(totalPoints),
      checked_by: userData?.uid || null,
      checked_at: new Date().toISOString(),
    }], { onConflict: 'worksheet_id,student_id' });

    if (error) {
      showToast(`Could not save the score: ${error.message}`, 'error');
      return false;
    }
    showToast('Score saved');
    return true;
  };

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    postWorksheet,
    loadItems, saveItems, setCheckingMode,
    loadSubmissions, loadAnswers, releaseScore, encodeManualScore,
  };
};
