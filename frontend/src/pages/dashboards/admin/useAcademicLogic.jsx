// ============================================
// FILE: src/pages/dashboards/admin/useAcademicLogic.jsx
// State and handlers for the academic structure tabs (Subjects, Teaching
// Load, Sections, Schedules). Kept separate from useAdminLogic.jsx, which is
// already ~1030 lines and covers users, news, calendar, memos and settings.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { canTeachSection, currentSchoolYear } from '../../../lib/academicRules';
import { hasExactDeletedIds } from '../../../lib/deleteVerification';
import {
  validateCapacityAgainstEnrollment,
  validateSectionAdviser,
  validateSectionCapacity,
} from './shared/sectionsValidation';

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
  // Rule B2 took the disabled attribute off the save buttons, so the second
  // half of a double click now reaches the handler. A ref is what stops it:
  // it is set synchronously, where a state flag would not update until the
  // next render and both clicks would get through.
  const savingSubjectRef = useRef(false);

  const fetchSubjects = useCallback(async () => {
    setSubjectsLoading(true);
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
    if (savingSubjectRef.current) return;   // the second of a double click
    savingSubjectRef.current = true;

    setSSaving(true);
    const payload = { name, code, is_active: sActive, updated_at: new Date().toISOString() };

    const { error } = editingSubject
      ? await supabase.from('subjects').update(payload).eq('id', editingSubject.id)
      : await supabase.from('subjects').insert([payload]);

    setSSaving(false);
    savingSubjectRef.current = false;
    if (error) return showToast(`Could not save subject: ${error.message}`, 'error');

    showToast(editingSubject ? 'Subject updated' : 'Subject created');
    setSubjectModal(null);
    fetchSubjects();
  };

  const deleteSubject = (id, focusAfterConfirm) => {
    const subject = subjects.find(s => s.id === id);
    setDeleteConfirm({
      label: subject?.name || subject?.code || 'this subject',
      title: 'Delete Subject?',
      message: 'This subject will be permanently deleted.',
      warning: 'Every teaching-load entry for this subject will be deleted along with it. This cannot be undone.',
      confirmLabel: 'Yes, Delete',
      requireConfirmedResult: true,
      focusAfterConfirm,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.from('subjects').delete().eq('id', id).select('id');
          if (error) throw error;
          if (!hasExactDeletedIds(data, id)) throw new Error('Delete result was not verified');
        } catch (error) {
          console.warn('Subject delete failed —', error?.message || String(error));
          showToast('Could not delete the subject. Please try again.', 'error');
          return false;
        }
        showToast('Subject deleted');
        await fetchSubjects();
        return true;
      },
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchSubjects, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSubjects]);

  // ── School year ───────────────────────────────────────────────────────────
  // Every academic record is scoped by year, so one selector drives the
  // Teaching Load, Sections and Schedules screens.
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());

  // ── Teaching load ─────────────────────────────────────────────────────────
  const [teachingLoad, setTeachingLoad] = useState([]);
  const [teachingLoadLoading, setTeachingLoadLoading] = useState(true);
  const [teachingLoadError, setTeachingLoadError] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [teachersError, setTeachersError] = useState(false);
  // UX-047: without this the picker's empty state was what rendered during
  // the fetch, telling the admin to go and create teachers that exist.
  const [teachersLoading, setTeachersLoading] = useState(true);

  const fetchTeachers = useCallback(async () => {
    setTeachersLoading(true);
    const { data, error } = await withRetry(
      // `department` is read so the picker can show and search on it. With a
      // department per teacher, "math" narrows 48 teachers to 6 — without it
      // the only thing to search is a name the admin would have to know
      // already.
      () => supabase.from('profiles').select('id, name, email, department, role, status').eq('role', 'teacher').order('name'),
      { label: 'Teachers fetch' }
    );
    if (error) {
      console.warn('Teachers fetch failed —', error.message);
      setTeachersError(true);
      setTeachersLoading(false);
      return;
    }
    setTeachersError(false);
    setTeachers(data || []);
    setTeachersLoading(false);
  }, []);

  const fetchTeachingLoad = useCallback(async () => {
    setTeachingLoadLoading(true);
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

  const removeLoad = async (idOrIds, { refresh = true } = {}) => {
    const ids = [...new Set((Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean))];
    if (ids.length === 0) return false;

    const deletion = supabase.from('teacher_subjects').delete();
    let result;
    try {
      result = await (ids.length === 1
        ? deletion.eq('id', ids[0]).select('id')
        : deletion.in('id', ids).select('id'));
    } catch (error) {
      console.warn('Teaching load removal request failed —', error?.message || String(error));
      showToast('Could not remove the teaching assignment. Please try again.', 'error');
      return false;
    }
    if (result.error) {
      console.warn('Teaching load removal failed —', result.error.message);
      showToast('Could not remove the teaching assignment. Please try again.', 'error');
      return false;
    }
    if (!hasExactDeletedIds(result.data, ids)) {
      const deletedIds = Array.isArray(result.data) ? result.data.map(row => row?.id).filter(Boolean) : [];
      showToast('The teaching-load removal could not be fully verified. Review the remaining changes and retry.', 'error');
      return { ok: false, deletedIds };
    }
    showToast(ids.length === 1 ? 'Teaching load removed' : `${ids.length} teaching load entries removed`);
    if (refresh) fetchTeachingLoad();
    return true;
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

  useEffect(() => {
    const timer = window.setTimeout(fetchTeachers, 0);
    return () => window.clearTimeout(timer);
  }, [fetchTeachers]);
  useEffect(() => {
    const timer = window.setTimeout(fetchTeachingLoad, 0);
    return () => window.clearTimeout(timer);
  }, [fetchTeachingLoad]);

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
  const [secCapacityError, setSecCapacityError] = useState('');
  const [secAdviserError, setSecAdviserError] = useState('');
  const [secSaving, setSecSaving] = useState(false);
  const savingSectionRef = useRef(false);

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
    setSecName(''); setSecGrade(''); setSecAdviser(''); setSecCapacity('');
    setSecCapacityError(''); setSecAdviserError('');
    setSectionModal('create');
  };

  const openEditSection = (section) => {
    setEditingSection(section);
    setSecName(section.name || '');
    setSecGrade(section.grade_level || '');
    setSecAdviser(section.adviser_id || '');
    setSecCapacity(section.capacity == null ? '' : String(section.capacity));
    setSecCapacityError(''); setSecAdviserError('');
    setSectionModal('edit');
  };

  const closeSectionModal = () => setSectionModal(null);

  const saveSection = async () => {
    const name = secName.trim();
    if (!name) return showToast('Section name is required', 'error');
    if (!secGrade) return showToast('Grade level is required', 'error');

    const capacityResult = validateSectionCapacity(secCapacity);
    setSecCapacityError(capacityResult.message);
    if (!capacityResult.valid) return false;

    const adviserResult = validateSectionAdviser({
      adviserId: secAdviser,
      teachers,
      existingAdviserId: editingSection?.adviser_id || null,
    });
    setSecAdviserError(adviserResult.message);
    if (!adviserResult.valid) {
      showToast(adviserResult.message, 'error');
      return false;
    }
    if (savingSectionRef.current) return;   // the second of a double click
    savingSectionRef.current = true;

    setSecSaving(true);
    if (editingSection) {
      const previousCapacity = validateSectionCapacity(editingSection.capacity);
      const capacityChanged = !previousCapacity.valid || previousCapacity.value !== capacityResult.value;
      if (capacityChanged) {
        const { count, error: countError } = await supabase
          .from('section_students')
          .select('id', { count: 'exact' })
          .eq('section_id', editingSection.id)
          .eq('status', 'active');

        if (countError || count == null) {
          const message = 'Could not verify current enrollment. No changes were saved.';
          setSecCapacityError(message);
          setSecSaving(false);
          savingSectionRef.current = false;
          showToast(message, 'error');
          return false;
        }

        const enrollmentResult = validateCapacityAgainstEnrollment(capacityResult.value, count);
        if (!enrollmentResult.valid) {
          setSecCapacityError(enrollmentResult.message);
          setSecSaving(false);
          savingSectionRef.current = false;
          showToast(enrollmentResult.message, 'error');
          return false;
        }
      }
    }

    const payload = {
      name,
      grade_level: secGrade,
      adviser_id: secAdviser || null,
      capacity: capacityResult.value,
      school_year: schoolYear,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingSection
      ? await supabase.from('sections').update(payload).eq('id', editingSection.id)
      : await supabase.from('sections').insert([payload]);

    setSecSaving(false);
    savingSectionRef.current = false;
    if (error) {
      return showToast(
        error.code === '23505'
          ? `A section named "${name}" already exists for ${schoolYear}.`
          : 'Could not save section. Check your connection and try again.',
        'error'
      );
    }
    showToast(editingSection ? 'Section updated' : 'Section created');
    setSectionModal(null);
    fetchSections();
    return true;
  };

  const deleteSection = (id, focusAfterConfirm) => {
    const section = sections.find(s => s.id === id);
    setDeleteConfirm({
      label: section?.name || 'this section',
      title: 'Delete Section?',
      message: 'This section will be permanently deleted, along with its class list and any schedules tied to it.',
      warning: null,
      confirmLabel: 'Yes, Delete',
      requireConfirmedResult: true,
      focusAfterConfirm,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.from('sections').delete().eq('id', id).select('id');
          if (error) throw error;
          if (!hasExactDeletedIds(data, id)) throw new Error('Delete result was not verified');
        } catch (error) {
          console.warn('Section delete failed —', error?.message || String(error));
          showToast('Could not delete section. Check your connection and try again.', 'error');
          return false;
        }
        showToast('Section deleted');
        await fetchSections();
        return true;
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

  const addingStudentRef = useRef(false);
  const addStudentToSection = async (studentId) => {
    if (!activeSection || addingStudentRef.current) return false;
    addingStudentRef.current = true;

    const capacityResult = validateSectionCapacity(activeSection.capacity);
    if (!capacityResult.valid) {
      showToast('This section has an invalid capacity. Correct it before adding students.', 'error');
      addingStudentRef.current = false;
      return false;
    }

    const { count, error: countError } = await supabase
      .from('section_students')
      .select('id', { count: 'exact' })
      .eq('section_id', activeSection.id)
      .eq('status', 'active');

    if (countError || count == null) {
      showToast('Could not verify current enrollment. No student was added.', 'error');
      addingStudentRef.current = false;
      return false;
    }
    if (count >= capacityResult.value) {
      const state = count > capacityResult.value ? 'over capacity' : 'full';
      showToast(`This section is ${state} (${count} of ${capacityResult.value}). Remove a student or increase its capacity before adding another.`, 'error');
      addingStudentRef.current = false;
      return false;
    }

    // section_students.student_id is a foreign key to students(id), but nothing
    // in this app has ever written that table — a student exists only in
    // profiles. Without this row the insert below fails with a foreign key
    // violation for every student. students.id references auth.users(id), the
    // same id profiles uses, so the row can be created from the id alone.
    const { error: studentRowError } = await supabase
      .from('students')
      .upsert([{ id: studentId }], { onConflict: 'id', ignoreDuplicates: true });

    if (studentRowError) {
      showToast('Could not prepare the student record. No student was added.', 'error');
      addingStudentRef.current = false;
      return false;
    }

    const { error } = await supabase.from('section_students').insert([{
      section_id: activeSection.id, student_id: studentId, status: 'active',
    }]);
    if (error) {
      showToast(
        error.code === '23505'
          ? 'That student is already in this section.'
          : 'Could not add the student to this section. Please try again.',
        'error'
      );
      addingStudentRef.current = false;
      return false;
    }
    showToast('Student added to section');
    loadClassList(activeSection);
    addingStudentRef.current = false;
    return true;
  };

  const removeStudentFromSection = async (rowId) => {
    if (!activeSection) return false;
    let result;
    try {
      result = await supabase.from('section_students').delete()
        .eq('id', rowId).eq('section_id', activeSection.id).select('id');
    } catch (error) {
      console.warn('Student membership removal request failed —', error?.message || String(error));
      showToast('Could not remove the student from this section. Please try again.', 'error');
      return false;
    }
    if (result.error || !hasExactDeletedIds(result.data, rowId)) {
      if (result.error) console.warn('Student membership removal failed —', result.error.message);
      showToast('Could not remove the student from this section. Please try again.', 'error');
      return false;
    }
    showToast('Student removed from section');
    loadClassList(activeSection);
    return true;
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchSections, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSections]);

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
  const savingScheduleRef = useRef(false);

  const fetchSchedules = useCallback(async () => {
    setSchedulesLoading(true);
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

  // The Schedules screen opens this from inside one section's subject row, so
  // the section and subject are already decided and are passed in — leaving
  // the admin only the teacher, day and time to fill. Called bare it still
  // opens an empty form.
  const openCreateSchedule = ({ sectionId = '', subjectId = '' } = {}) => {
    const subject = subjects.find(item => item.id === subjectId);
    if (subject?.is_active === false) {
      showToast('New periods cannot be added to an inactive subject.', 'error');
      return false;
    }
    setSchedTeacher(''); setSchedSubject(subjectId); setSchedSection(sectionId);
    setSchedDay('Monday'); setSchedStart('08:00'); setSchedEnd('09:00'); setSchedRoom('');
    setScheduleModal('create');
    return true;
  };

  const closeScheduleModal = () => setScheduleModal(null);

  const saveSchedule = async () => {
    if (teachersLoading || teachingLoadLoading || teachersError || teachingLoadError) {
      showToast('Teacher eligibility is still unavailable. Retry the failed data before creating a schedule.', 'error');
      return false;
    }
    if (!schedTeacher || !schedSubject || !schedSection) {
      showToast('Teacher, subject and section are all required', 'error');
      return false;
    }
    if (schedEnd <= schedStart) {
      showToast('End time must be after start time', 'error');
      return false;
    }

    const subject = subjects.find(item => item.id === schedSubject);
    if (!subject || subject.is_active === false) {
      showToast('New periods cannot be added to an inactive or unavailable subject.', 'error');
      return false;
    }

    const section = sections.find(s => s.id === schedSection);
    const teacherLoad = teachingLoad.filter(l => l.teacher_id === schedTeacher);

    // The guard: a teacher may only be scheduled to a subject and grade level
    // they actually hold. Tested in src/lib/academicRules.test.js.
    const verdict = canTeachSection(teacherLoad, schedSubject, section);
    if (!verdict.ok) {
      showToast(verdict.reason, 'error');
      return false;
    }

    if (savingScheduleRef.current) return false;   // the second of a double click
    savingScheduleRef.current = true;
    setSchedSaving(true);
    try {
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
      if (error) {
        console.warn('Schedule create failed —', error.message);
        showToast('Could not create the schedule. Please review the details and try again.', 'error');
        return false;
      }
      showToast('Schedule created');
      setScheduleModal(null);
      await fetchSchedules();
      return true;
    } catch (error) {
      console.warn('Schedule create request failed —', error?.message || String(error));
      showToast('Could not create the schedule. Check your connection and try again.', 'error');
      return false;
    } finally {
      setSchedSaving(false);
      savingScheduleRef.current = false;
    }
  };

  const deleteSchedule = (id, focusAfterConfirm) => {
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
      busyLabel: 'Deleting…',
      requireConfirmedResult: true,
      focusAfterConfirm,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.from('schedules').delete().eq('id', id).select('id');
          if (error) {
            console.warn('Schedule delete failed —', error.message);
            showToast('Could not delete the schedule. Please try again.', 'error');
            return false;
          }
          if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== id) {
            showToast('The schedule deletion could not be confirmed. It may have already changed; retry or cancel.', 'error');
            return false;
          }
          showToast('Schedule deleted');
          await fetchSchedules();
          return true;
        } catch (error) {
          console.warn('Schedule delete request failed —', error?.message || String(error));
          showToast('Could not delete the schedule. Check your connection and try again.', 'error');
          return false;
        }
      },
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(fetchSchedules, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSchedules]);

  return {
    subjects, subjectsLoading, subjectsError, fetchSubjects,
    subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
    schoolYear, setSchoolYear,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad,
    teachers, teachersError, teachersLoading, fetchTeachers, addLoadEntries, removeLoad, copyLoadFromYear,
    sections, sectionsLoading, sectionsError, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secCapacityError, setSecCapacityError,
    secAdviserError, setSecAdviserError, secSaving,
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
