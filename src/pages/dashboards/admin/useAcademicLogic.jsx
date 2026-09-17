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

  // ── Sections ──────────────────────────────────────────────────────────────
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionModal, setSectionModal] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [secName, setSecName] = useState('');
  const [secGrade, setSecGrade] = useState('');
  const [secAdviser, setSecAdviser] = useState('');
  const [secCapacity, setSecCapacity] = useState('40');
  const [secSaving, setSecSaving] = useState(false);

  const fetchSections = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('sections').select('*').eq('school_year', schoolYear).order('grade_level').order('name'),
      { label: 'Sections fetch' }
    );
    if (error) {
      console.warn('Sections fetch failed —', error.message);
      setSectionsLoading(false);
      return;
    }
    setSections(data || []);
    setSectionsLoading(false);
  }, [schoolYear]);

  const openCreateSection = () => {
    setEditingSection(null);
    setSecName(''); setSecGrade(''); setSecAdviser(''); setSecCapacity('40');
    setSectionModal('create');
  };

  const openEditSection = (section) => {
    setEditingSection(section);
    setSecName(section.name || '');
    setSecGrade(section.grade_level || '');
    setSecAdviser(section.adviser_id || '');
    setSecCapacity(String(section.capacity ?? 40));
    setSectionModal('edit');
  };

  const closeSectionModal = () => setSectionModal(null);

  const saveSection = async () => {
    const name = secName.trim();
    if (!name) return showToast('Section name is required', 'error');
    if (!secGrade) return showToast('Grade level is required', 'error');

    setSecSaving(true);
    const payload = {
      name,
      grade_level: secGrade,
      adviser_id: secAdviser || null,
      capacity: parseInt(secCapacity, 10) || 40,
      school_year: schoolYear,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingSection
      ? await supabase.from('sections').update(payload).eq('id', editingSection.id)
      : await supabase.from('sections').insert([payload]);

    setSecSaving(false);
    if (error) {
      return showToast(
        error.code === '23505'
          ? 'A section with that name already exists.'
          : `Could not save section: ${error.message}`,
        'error'
      );
    }
    showToast(editingSection ? 'Section updated' : 'Section created');
    setSectionModal(null);
    fetchSections();
  };

  const deleteSection = async (id) => {
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) return showToast(`Could not delete section: ${error.message}`, 'error');
    showToast('Section deleted');
    fetchSections();
  };

  // ── Class list ────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState(null);
  const [classList, setClassList] = useState([]);
  const [classListLoading, setClassListLoading] = useState(false);
  const [unassignedStudents, setUnassignedStudents] = useState([]);

  const loadClassList = useCallback(async (section) => {
    setClassListLoading(true);

    const { data: rows, error } = await withRetry(
      () => supabase.from('section_students').select('id, student_id').eq('section_id', section.id).eq('status', 'active'),
      { label: 'Class list fetch' }
    );
    if (error) {
      console.warn('Class list fetch failed —', error.message);
      setClassListLoading(false);
      return;
    }

    // students.id references auth.users, not profiles, so the name has to be
    // fetched separately rather than through a PostgREST embed.
    const ids = (rows || []).map(r => r.student_id);
    let names = [];
    if (ids.length > 0) {
      const { data: profiles } = await withRetry(
        () => supabase.from('profiles').select('id, name, email').in('id', ids),
        { label: 'Class list profiles fetch' }
      );
      names = profiles || [];
    }

    setClassList((rows || []).map(r => {
      const p = names.find(n => n.id === r.student_id);
      return { id: r.id, student_id: r.student_id, name: p?.name || '—', email: p?.email || '' };
    }));

    const { data: allStudents } = await withRetry(
      () => supabase.from('profiles').select('id, name, email').eq('role', 'student').eq('status', 'active').order('name'),
      { label: 'Student pool fetch' }
    );
    setUnassignedStudents((allStudents || []).filter(s => !ids.includes(s.id)));
    setClassListLoading(false);
  }, []);

  const openClassList = (section) => { setActiveSection(section); loadClassList(section); };
  const closeClassList = () => { setActiveSection(null); setClassList([]); };

  const addStudentToSection = async (studentId) => {
    if (!activeSection) return;

    // section_students.student_id is a foreign key to students(id), but nothing
    // in this app has ever written that table — a student exists only in
    // profiles. Without this row the insert below fails with a foreign key
    // violation for every student. students.id references auth.users(id), the
    // same id profiles uses, so the row can be created from the id alone.
    const { error: studentRowError } = await supabase
      .from('students')
      .upsert([{ id: studentId }], { onConflict: 'id', ignoreDuplicates: true });

    if (studentRowError) {
      return showToast(`Could not prepare student record: ${studentRowError.message}`, 'error');
    }

    const { error } = await supabase.from('section_students').insert([{
      section_id: activeSection.id, student_id: studentId, status: 'active',
    }]);
    if (error) {
      return showToast(
        error.code === '23505'
          ? 'That student is already in this section.'
          : `Could not add student: ${error.message}`,
        'error'
      );
    }
    showToast('Student added to section');
    loadClassList(activeSection);
  };

  const removeStudentFromSection = async (rowId) => {
    const { error } = await supabase.from('section_students').delete().eq('id', rowId);
    if (error) return showToast(`Could not remove student: ${error.message}`, 'error');
    showToast('Student removed from section');
    loadClassList(activeSection);
  };

  useEffect(() => { fetchSections(); }, [fetchSections]);

  return {
    subjects, subjectsLoading, fetchSubjects,
    subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
    schoolYear, setSchoolYear,
    teachingLoad, teachingLoadLoading, fetchTeachingLoad,
    teachers, addLoad, removeLoad, copyLoadFromYear,
    sections, sectionsLoading, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList, classListLoading, unassignedStudents,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
  };
};
