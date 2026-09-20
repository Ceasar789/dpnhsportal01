// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/useWorksheetAssessment.jsx
// Posting, question and submission state for the Worksheets tab. Kept out of
// WorksheetsTab.jsx, which already carries the upload and CRUD flow.
// ============================================

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../../../config/supabase';
import { useAuth } from '../../../../context/AuthContext';
import { withRetry } from '../../../../lib/supabaseRetry';

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
      keys = Object.fromEntries((keyRows || []).map(k => [k.item_id, k.correct_answer]));
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

    if (items.length === 0) { showToast('Questions saved'); return true; }

    const rows = items.map((it, index) => ({
      worksheet_id: worksheetId,
      position: index + 1,
      question: it.question,
      item_type: it.item_type,
      options: it.options && it.options.length > 0 ? it.options : null,
      points: Number(it.points) || 1,
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
        showToast(`Questions saved but the answer key failed: ${keyError.message}`, 'error');
        return false;
      }
    }

    showToast('Questions saved');
    return true;
  }, [showToast]);

  const setCheckingMode = useCallback(async (worksheetId, mode) => {
    const { error } = await supabase.from('worksheets').update({ checking_mode: mode }).eq('id', worksheetId);
    if (error) return showToast(`Could not change checking mode: ${error.message}`, 'error');
    showToast(mode === 'auto' ? 'Auto-checking on' : 'Manual checking only');
  }, [showToast]);

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    postWorksheet,
    loadItems, saveItems, setCheckingMode,
  };
};
