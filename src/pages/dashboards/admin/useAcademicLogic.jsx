// ============================================
// FILE: src/pages/dashboards/admin/useAcademicLogic.jsx
// State and handlers for the academic structure tabs (Subjects, Teaching
// Load, Sections, Schedules). Kept separate from useAdminLogic.jsx, which is
// already ~1030 lines and covers users, news, calendar, memos and settings.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';

export const useAcademicLogic = (showToast) => {
  // ── Subjects ──────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const [subjectModal, setSubjectModal] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [sName, setSName] = useState('');
  const [sCode, setSCode] = useState('');
  const [sActive, setSActive] = useState(true);
  const [sSaving, setSSaving] = useState(false);

  const fetchSubjects = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('subjects').select('*').order('name'),
      { label: 'Subjects fetch' }
    );
    // A failed read keeps the previous list. Rendering an empty table here
    // would read as "this school has no subjects".
    if (error) {
      console.warn('Subjects fetch failed —', error.message);
      setSubjectsLoading(false);
      return;
    }
    setSubjects(data || []);
    setSubjectsLoading(false);
  }, []);

  const openCreateSubject = () => {
    setEditingSubject(null);
    setSName(''); setSCode(''); setSActive(true);
    setSubjectModal('create');
  };

  const openEditSubject = (subject) => {
    setEditingSubject(subject);
    setSName(subject.name || '');
    setSCode(subject.code || '');
    setSActive(subject.is_active !== false);
    setSubjectModal('edit');
  };

  const closeSubjectModal = () => setSubjectModal(null);

  const saveSubject = async () => {
    const name = sName.trim();
    const code = sCode.trim().toUpperCase();
    if (!name) return showToast('Subject name is required', 'error');
    if (!code) return showToast('Subject code is required', 'error');

    setSSaving(true);
    const payload = { name, code, is_active: sActive, updated_at: new Date().toISOString() };

    const { error } = editingSubject
      ? await supabase.from('subjects').update(payload).eq('id', editingSubject.id)
      : await supabase.from('subjects').insert([payload]);

    setSSaving(false);
    if (error) return showToast(`Could not save subject: ${error.message}`, 'error');

    showToast(editingSubject ? 'Subject updated' : 'Subject created');
    setSubjectModal(null);
    fetchSubjects();
  };

  const deleteSubject = async (id) => {
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) return showToast(`Could not delete subject: ${error.message}`, 'error');
    showToast('Subject deleted');
    fetchSubjects();
  };

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);

  return {
    subjects, subjectsLoading, fetchSubjects,
    subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
  };
};
