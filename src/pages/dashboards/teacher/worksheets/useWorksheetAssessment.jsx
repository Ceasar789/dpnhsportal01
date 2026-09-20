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

  return {
    mySections, sectionsError, fetchMySections,
    postings, postingsError, fetchPostings,
    postWorksheet,
  };
};
