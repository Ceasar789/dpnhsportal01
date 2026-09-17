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

  // ── School year ───────────────────────────────────────────────────────────
  // Every academic record is scoped by year, so one selector drives the
  // Teaching Load, Sections and Schedules screens.
  const currentSchoolYear = () => {
    const now = new Date();
    // The DepEd school year opens in June; before then we are still in the
    // year that began last calendar year.
    const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
  };
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());

  // ── Teaching load ─────────────────────────────────────────────────────────
  const [teachingLoad, setTeachingLoad] = useState([]);
  const [teachingLoadLoading, setTeachingLoadLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);

  const fetchTeachers = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('profiles').select('id, name, email').eq('role', 'teacher').order('name'),
      { label: 'Teachers fetch' }
    );
    if (error) { console.warn('Teachers fetch failed —', error.message); return; }
    setTeachers(data || []);
  }, []);

  const fetchTeachingLoad = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects').select('*').eq('school_year', schoolYear),
      { label: 'Teaching load fetch' }
    );
    if (error) {
      console.warn('Teaching load fetch failed —', error.message);
      setTeachingLoadLoading(false);
      return;
    }
    setTeachingLoad(data || []);
    setTeachingLoadLoading(false);
  }, [schoolYear]);

  const addLoad = async (teacherId, subjectId, gradeLevel) => {
    if (!teacherId || !subjectId || !gradeLevel) {
      return showToast('Pick a teacher, a subject and a grade level', 'error');
    }
    const { error } = await supabase.from('teacher_subjects').insert([{
      teacher_id: teacherId, subject_id: subjectId,
      grade_level: gradeLevel, school_year: schoolYear,
    }]);
    // 23505 is unique_violation: this teacher already holds that subject and grade.
    if (error) {
      return showToast(
        error.code === '23505'
          ? 'That teacher already holds this subject at this grade level.'
          : `Could not add: ${error.message}`,
        'error'
      );
    }
    showToast('Teaching load added');
    fetchTeachingLoad();
  };

  const removeLoad = async (id) => {
    const { error } = await supabase.from('teacher_subjects').delete().eq('id', id);
    if (error) return showToast(`Could not remove: ${error.message}`, 'error');
    showToast('Teaching load removed');
    fetchTeachingLoad();
  };

  const copyLoadFromYear = async (fromYear) => {
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects').select('teacher_id, subject_id, grade_level').eq('school_year', fromYear),
      { label: 'Teaching load copy read' }
    );
    if (error) { showToast(`Could not read ${fromYear}: ${error.message}`, 'error'); return 0; }
    if (!data || data.length === 0) { showToast(`No teaching load found for ${fromYear}`, 'error'); return 0; }

    const rows = data.map(r => ({ ...r, school_year: schoolYear }));
    // Rows already present in the target year are skipped rather than failing
    // the whole copy, so the button is safe to press twice.
    const { error: insertError } = await supabase
      .from('teacher_subjects')
      .upsert(rows, { onConflict: 'teacher_id,subject_id,grade_level,school_year', ignoreDuplicates: true });

    if (insertError) { showToast(`Could not copy: ${insertError.message}`, 'error'); return 0; }

    showToast(`Copied ${rows.length} entries from ${fromYear}`);
    fetchTeachingLoad();
    return rows.length;
  };

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);
  useEffect(() => { fetchTeachingLoad(); }, [fetchTeachingLoad]);

  return {
    subjects, subjectsLoading, fetchSubjects,
    subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
    schoolYear, setSchoolYear,
    teachingLoad, teachingLoadLoading, fetchTeachingLoad,
    teachers, addLoad, removeLoad, copyLoadFromYear,
  };
};
