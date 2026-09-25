// ============================================
// FILE: src/pages/dashboards/admin/useAcademicLogic.jsx
// State and handlers for the academic structure tabs (Subjects, Teaching
// Load, Sections, Schedules). Kept separate from useAdminLogic.jsx, which is
// already ~1030 lines and covers users, news, calendar, memos and settings.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { canTeachSection } from '../../../lib/academicRules';

export const useAcademicLogic = (showToast, setDeleteConfirm) => {
  // ── Subjects ──────────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState(false);

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
    // A failed read must be visibly different from a genuinely empty table —
    // on first load there IS no "previous list" to fall back to, so leaving
    // state as [] here renders as "this school has no subjects", which is
    // exactly the confusion that has caused user-visible incidents before.
    if (error) {
      console.warn('Subjects fetch failed —', error.message);
      setSubjectsError(true);
      setSubjectsLoading(false);
      return;
    }
    setSubjectsError(false);
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

  const deleteSubject = (id) => {
    const subject = subjects.find(s => s.id === id);
    setDeleteConfirm({
      label: subject?.name || subject?.code || 'this subject',
      title: 'Delete Subject?',
      message: 'This subject will be permanently deleted.',
      warning: 'Every teaching-load entry for this subject will be deleted along with it. This cannot be undone.',
      confirmLabel: 'Yes, Delete',
      onConfirm: async () => {
        const { error } = await supabase.from('subjects').delete().eq('id', id);
        if (error) return showToast(`Could not delete subject: ${error.message}`, 'error');
        showToast('Subject deleted');
        fetchSubjects();
      },
    });
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
  const [teachingLoadError, setTeachingLoadError] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [teachersError, setTeachersError] = useState(false);

  const fetchTeachers = useCallback(async () => {
    const { data, error } = await withRetry(
      // `department` is read so the picker can show and search on it. With a
      // department per teacher, "math" narrows 48 teachers to 6 — without it
      // the only thing to search is a name the admin would have to know
      // already.
      () => supabase.from('profiles').select('id, name, email, department').eq('role', 'teacher').order('name'),
      { label: 'Teachers fetch' }
    );
    if (error) {
      console.warn('Teachers fetch failed —', error.message);
      setTeachersError(true);
      return;
    }
    setTeachersError(false);
    setTeachers(data || []);
  }, []);

  const fetchTeachingLoad = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('teacher_subjects').select('*').eq('school_year', schoolYear),
      { label: 'Teaching load fetch' }
    );
    if (error) {
      console.warn('Teaching load fetch failed —', error.message);
      setTeachingLoadError(true);
      setTeachingLoadLoading(false);
      return;
    }
    setTeachingLoadError(false);
    setTeachingLoad(data || []);
    setTeachingLoadLoading(false);
  }, [schoolYear]);

  /**
   * Writes a list of (teacher, subject, grade level) entries for the school
   * year on screen, in a single round trip.
   *
   * The admin builds that list on the Teaching Load screen one line at a
   * time and presses Assign once, rather than paying a round trip per line —
   * eight subjects across six grade levels is 48 of them.
   *
   * Upserted with ignoreDuplicates rather than inserted, so a list that
   * overlaps what a teacher already holds writes the rest instead of failing
   * the whole batch on the first unique violation. That is the same conflict
   * target copyLoadFromYear uses, and it makes the button safe to press twice.
   *
   * .select() after an ignoreDuplicates upsert returns ONLY the rows that
   * were actually written, which is how the toast can say how many were new
   * without guessing. If PostgREST returns no body at all, the count is
   * reported as unknown rather than invented — claiming "added 12" when
   * twelve already existed would be exactly the kind of quiet lie this
   * codebase keeps having to hunt down.
   *
   * @param {{teacher_id: string, subject_id: string, grade_level: string}[]} entries
   * @returns {Promise<number|null>} rows written, or null if not knowable
   */
  const addLoadEntries = async (entries) => {
    const clean = (entries || []).filter(
      e => e && e.teacher_id && e.subject_id && e.grade_level
    );
    if (clean.length === 0) {
      showToast('Nothing to assign — add at least one entry to the list first', 'error');
      return null;
    }

    // Deduplicated here as well as in the UI. The same triple twice in one
    // payload is not a unique violation Postgres can resolve — ON CONFLICT
    // cannot act on a row the same statement is still inserting, and the
    // whole batch fails with "cannot affect row a second time".
    const seen = new Set();
    const rows = [];
    for (const e of clean) {
      const key = `${e.teacher_id}|${e.subject_id}|${e.grade_level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        teacher_id: e.teacher_id, subject_id: e.subject_id,
        grade_level: e.grade_level, school_year: schoolYear,
      });
    }

    const { data, error } = await supabase
      .from('teacher_subjects')
      .upsert(rows, {
        onConflict: 'teacher_id,subject_id,grade_level,school_year',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      showToast(`Could not add: ${error.message}`, 'error');
      return null;
    }

    const written = Array.isArray(data) ? data.length : null;
    const skipped = written === null ? null : rows.length - written;

    if (written === null) {
      showToast('Teaching load saved');
    } else if (written === 0) {
      showToast('Nothing to add — every one of those was already assigned');
    } else {
      showToast(
        `Added ${written} entr${written === 1 ? 'y' : 'ies'}`
        + (skipped > 0 ? ` · ${skipped} already assigned` : '')
      );
    }

    fetchTeachingLoad();
    return written;
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
  const [sectionsError, setSectionsError] = useState(false);
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
      setSectionsError(true);
      setSectionsLoading(false);
      return;
    }
    setSectionsError(false);
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
          ? `A section named "${name}" already exists for ${schoolYear}.`
          : `Could not save section: ${error.message}`,
        'error'
      );
    }
    showToast(editingSection ? 'Section updated' : 'Section created');
    setSectionModal(null);
    fetchSections();
  };

  const deleteSection = (id) => {
    const section = sections.find(s => s.id === id);
    setDeleteConfirm({
      label: section?.name || 'this section',
      title: 'Delete Section?',
      message: 'This section will be permanently deleted, along with its class list and any schedules tied to it.',
      warning: null,
      confirmLabel: 'Yes, Delete',
      onConfirm: async () => {
        const { error } = await supabase.from('sections').delete().eq('id', id);
        if (error) return showToast(`Could not delete section: ${error.message}`, 'error');
        showToast('Section deleted');
        fetchSections();
      },
    });
  };

  // ── Class list ────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState(null);
  const [classList, setClassList] = useState([]);
  const [classListLoading, setClassListLoading] = useState(false);
  const [classListError, setClassListError] = useState(false);
  const [unassignedStudents, setUnassignedStudents] = useState([]);

  const loadClassList = useCallback(async (section) => {
    setClassListLoading(true);

    const { data: rows, error } = await withRetry(
      () => supabase.from('section_students').select('id, student_id').eq('section_id', section.id).eq('status', 'active'),
      { label: 'Class list fetch' }
    );
    if (error) {
      console.warn('Class list fetch failed —', error.message);
      setClassListError(true);
      setClassListLoading(false);
      return;
    }

    // students.id references auth.users, not profiles, so the name has to be
    // fetched separately rather than through a PostgREST embed.
    const ids = (rows || []).map(r => r.student_id);

    // These two reads are independent of each other — the student pool query
    // doesn't need `ids` until the client-side filter below — so they run
    // concurrently instead of one after the other. On the free-tier
    // connection pool this halves the round trips this function makes,
    // which is what was making every open/add/remove feel sluggish.
    const [profilesResult, allStudentsResult] = await Promise.all([
      ids.length > 0
        ? withRetry(
            () => supabase.from('profiles').select('id, name, email').in('id', ids),
            { label: 'Class list profiles fetch' }
          )
        : Promise.resolve({ data: [], error: null }),
      withRetry(
        () => supabase.from('profiles').select('id, name, email').eq('role', 'student').eq('status', 'active').order('name'),
        { label: 'Student pool fetch' }
      ),
    ]);

    if (profilesResult.error || allStudentsResult.error) {
      console.warn(
        'Class list load failed —',
        (profilesResult.error || allStudentsResult.error).message
      );
      setClassListError(true);
      setClassListLoading(false);
      return;
    }

    const names = profilesResult.data || [];
    setClassList((rows || []).map(r => {
      const p = names.find(n => n.id === r.student_id);
      return { id: r.id, student_id: r.student_id, name: p?.name || '—', email: p?.email || '' };
    }));

    setClassListError(false);
    setUnassignedStudents((allStudentsResult.data || []).filter(s => !ids.includes(s.id)));
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

  // ── Schedules ─────────────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedulesError, setSchedulesError] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [schedTeacher, setSchedTeacher] = useState('');
  const [schedSubject, setSchedSubject] = useState('');
  const [schedSection, setSchedSection] = useState('');
  const [schedDay, setSchedDay] = useState('Monday');
  const [schedStart, setSchedStart] = useState('08:00');
  const [schedEnd, setSchedEnd] = useState('09:00');
  const [schedRoom, setSchedRoom] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);

  const fetchSchedules = useCallback(async () => {
    const { data, error } = await withRetry(
      () => supabase.from('schedules').select('*').eq('school_year', schoolYear).order('day_of_week').order('start_time'),
      { label: 'Schedules fetch' }
    );
    if (error) {
      console.warn('Schedules fetch failed —', error.message);
      setSchedulesError(true);
      setSchedulesLoading(false);
      return;
    }
    setSchedulesError(false);
    setSchedules(data || []);
    setSchedulesLoading(false);
  }, [schoolYear]);

  const openCreateSchedule = () => {
    setSchedTeacher(''); setSchedSubject(''); setSchedSection('');
    setSchedDay('Monday'); setSchedStart('08:00'); setSchedEnd('09:00'); setSchedRoom('');
    setScheduleModal('create');
  };

  const closeScheduleModal = () => setScheduleModal(null);

  const saveSchedule = async () => {
    if (!schedTeacher || !schedSubject || !schedSection) {
      return showToast('Teacher, subject and section are all required', 'error');
    }
    if (schedEnd <= schedStart) {
      return showToast('End time must be after start time', 'error');
    }

    const section = sections.find(s => s.id === schedSection);
    const teacherLoad = teachingLoad.filter(l => l.teacher_id === schedTeacher);

    // The guard: a teacher may only be scheduled to a subject and grade level
    // they actually hold. Tested in src/lib/academicRules.test.js.
    const verdict = canTeachSection(teacherLoad, schedSubject, section);
    if (!verdict.ok) return showToast(verdict.reason, 'error');

    setSchedSaving(true);
    const { error } = await supabase.from('schedules').insert([{
      section_id: schedSection,
      teacher_id: schedTeacher,
      subject_id: schedSubject,
      day_of_week: schedDay,
      start_time: schedStart,
      end_time: schedEnd,
      room_number: schedRoom.trim() || null,
      school_year: schoolYear,
    }]);
    setSchedSaving(false);

    if (error) return showToast(`Could not save schedule: ${error.message}`, 'error');
    showToast('Schedule created');
    setScheduleModal(null);
    fetchSchedules();
  };

  const deleteSchedule = (id) => {
    const schedule = schedules.find(s => s.id === id);
    const sectionName = sections.find(s => s.id === schedule?.section_id)?.name;
    const subjectName = subjects.find(s => s.id === schedule?.subject_id)?.name;
    const label = [subjectName, sectionName].filter(Boolean).join(' — ') || 'this schedule';
    setDeleteConfirm({
      label,
      title: 'Delete Schedule?',
      message: 'This schedule entry will be permanently deleted.',
      warning: null,
      confirmLabel: 'Yes, Delete',
      onConfirm: async () => {
        const { error } = await supabase.from('schedules').delete().eq('id', id);
        if (error) return showToast(`Could not delete schedule: ${error.message}`, 'error');
        showToast('Schedule deleted');
        fetchSchedules();
      },
    });
  };

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  return {
    subjects, subjectsLoading, subjectsError, fetchSubjects,
    subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
    schoolYear, setSchoolYear,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad,
    teachers, teachersError, fetchTeachers, addLoadEntries, removeLoad, copyLoadFromYear,
    sections, sectionsLoading, sectionsError, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList, classListLoading, classListError, unassignedStudents,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
    schedules, schedulesLoading, schedulesError, fetchSchedules,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject, setSchedSubject,
    schedSection, setSchedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
  };
};
