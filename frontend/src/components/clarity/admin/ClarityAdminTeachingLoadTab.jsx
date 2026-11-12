// ============================================
// FILE: src/components/clarity/admin/ClarityAdminTeachingLoadTab.jsx
// The Admin Teaching Load tab in Clarity (final design, real data only).
// Grade tabs with the real per-grade counts, the teacher list on the left,
// and the selected teacher's subjects for that grade on the right, with the
// floating save bar. Additions and removals stay local until Save, exactly
// as in the classic tab.
//
// A teaching assignment is one teacher_subjects row: a teacher, a subject
// and a grade level for the school year. It has no section, hours or units,
// so the design's Section column is not drawn.
//
// The unsaved-change guard is the classic one: this tab registers itself
// with the app-wide TeachingLoadUnsavedChangesProvider (sidebar and in-app
// navigation), mounts the same route blocker (useBlocker) and the same
// beforeunload warning, and shows the same "Leave Teaching Load?" dialog.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// (source-parity and behaviour-parity tested in
// ClarityAdminTeachingLoadTab.test.jsx); after the defense the classic tab and
// this one should share them:
//   - the route blocker and the helpers, :22-57
//   - all state, derived data and handlers, :60-329 (removeSubject's focus
//     selectors name this tab's rows instead of the classic chips)
//   - the leave dialog, :340-365 (the shared Modal, unchanged)
// ============================================

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { CheckCircle2, Copy, Lock, Plus, Search, UserRound } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { departmentSubject, LOCKED_REMOVAL_MESSAGE } from '../../../pages/dashboards/admin/shared/departmentSubject';
import SchoolYearNotice from '../../../pages/dashboards/admin/shared/SchoolYearNotice';
import TeacherProfileSheet from '../../../pages/dashboards/admin/shared/TeacherProfileSheet';
import { useTeachingLoadUnsavedChanges } from '../../../context/TeachingLoadUnsavedChangesContext';
import { focusAfterRemoval } from '../../../lib/focusAfterRemoval';
import { useDelayedFlag } from '../../../lib/useDelayedFlag';
import { GRADE_LEVELS } from '../../../lib/academicRules';
import Modal from '../../ui/Modal';

// ---- TEMPORARY copy (TeachingLoadTab.jsx:22-57) ----
const TeachingLoadRouteBlocker = ({ when, onBlocked }) => {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (blocker.state === 'blocked') onBlocked(blocker);
  }, [blocker, onBlocked]);

  return null;
};

const matchesQuery = (teacher, query) => {
  if (!query?.trim()) return true;
  const q = query.trim().toLowerCase();
  return [teacher.name, teacher.email, teacher.department]
    .some(field => String(field || '').toLowerCase().includes(q));
};

const teacherName = teacher => teacher?.name || teacher?.email || 'Unknown teacher';

const teacherInitials = (teacher) => {
  const source = teacherName(teacher).trim();
  const words = source.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)[0]}` : source.slice(0, 2)).toUpperCase();
};

const statusLabel = (status) => {
  const value = String(status || '').trim().toLowerCase();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Not recorded';
};

const statusClass = (status) => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'active') return 'badge-green';
  if (value === 'archived' || !value) return 'badge-grey';
  return 'badge-yellow';
};
// ---- end of the copy ----

// The classic badge colours, as Clarity pill tones.
const STATUS_TONE = { 'badge-green': 'ok', 'badge-grey': '', 'badge-yellow': 'wa' };

const ClarityAdminTeachingLoadTab = () => {
  // ---- TEMPORARY copy (TeachingLoadTab.jsx:60-329) ----
  const { registerTeachingLoadGuard } = useTeachingLoadUnsavedChanges();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const {
    schoolYear, setSchoolYear, settingsSchoolYear, schoolYearSource, teachers, teachersError, teachersLoading, subjects,
    subjectsError, fetchSubjects,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad, fetchTeachers,
    addLoadEntries, removeLoad, copyLoadFromYear, showToast,
  } = useAdminContext();

  const slowTeachers = useDelayedFlag(teachersLoading);
  const [grade, setGrade] = useState(GRADE_LEVELS[0]);
  const [query, setQuery] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [pendingAdditions, setPendingAdditions] = useState([]);
  const [pendingRemovalIds, setPendingRemovalIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [triedAdd, setTriedAdd] = useState(false);
  const [pendingLeave, setPendingLeave] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const savingRef = useRef(false);
  const searchRef = useRef(null);
  const subjectSelectRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(min-width: 1024px) and (pointer: fine)').matches) {
      searchRef.current?.focus();
    }
  }, []);

  const teacherById = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const selectedTeacher = teacherById.get(selectedTeacherId) || null;
  // The department subject is shown, selected and locked, in every grade.
  // Browser-only: the database does not enforce it (future work).
  const selectedLock = useMemo(
    () => departmentSubject(selectedTeacher?.department, subjects), [selectedTeacher, subjects]
  );
  const lockedId = selectedLock.subject?.id ?? null;
  const activeSubjects = useMemo(
    () => subjects.filter(subject => subject.is_active !== false), [subjects]
  );
  const visibleTeachers = useMemo(
    () => teachers.filter(teacher => matchesQuery(teacher, query)), [teachers, query]
  );
  const removalSet = useMemo(() => new Set(pendingRemovalIds), [pendingRemovalIds]);

  const workingRows = useMemo(() => [
    ...teachingLoad
      .filter(row => !removalSet.has(row.id))
      .map(row => ({ ...row, source: 'saved' })),
    ...pendingAdditions.map((row, index) => ({ ...row, source: 'pending', pendingIndex: index })),
  ], [teachingLoad, pendingAdditions, removalSet]);

  const selectedRows = useMemo(() => {
    const rows = workingRows
      .filter(row => row.grade_level === grade && row.teacher_id === selectedTeacherId)
      .map(row => (lockedId && row.subject_id === lockedId ? { ...row, locked: true } : row));
    // Not saved for this grade yet: shown anyway, written on the next save.
    if (lockedId && selectedTeacherId && !rows.some(row => row.subject_id === lockedId)) {
      rows.push({
        id: `locked-${grade}`, teacher_id: selectedTeacherId, subject_id: lockedId,
        grade_level: grade, source: 'locked', locked: true,
      });
    }
    return rows.sort((a, b) => {
      const aName = subjectById.get(a.subject_id)?.name || '';
      const bName = subjectById.get(b.subject_id)?.name || '';
      return aName.localeCompare(bName);
    });
  }, [workingRows, grade, selectedTeacherId, subjectById, lockedId]);
  // Only once the load has been read: a failed or pending read is not "missing".
  const lockedUnsavedHere = !teachingLoadLoading && !teachingLoadError
    && selectedRows.some(row => row.source === 'locked');

  // The department subject rows a save writes: only for the selected teacher,
  // in the current grade and in any grade with staged changes for them.
  const lockedEntries = () => {
    if (!lockedId || !selectedTeacher) return [];
    const teacherId = selectedTeacher.id;
    const grades = new Set([grade]);
    for (const row of pendingAdditions) if (row.teacher_id === teacherId) grades.add(row.grade_level);
    for (const row of teachingLoad) if (removalSet.has(row.id) && row.teacher_id === teacherId) grades.add(row.grade_level);
    const held = level => [...teachingLoad.filter(row => !removalSet.has(row.id)), ...pendingAdditions]
      .some(row => row.teacher_id === teacherId && row.subject_id === lockedId && row.grade_level === level);
    return GRADE_LEVELS.filter(level => grades.has(level) && !held(level))
      .map(level => ({ teacher_id: teacherId, subject_id: lockedId, grade_level: level }));
  };

  const assignmentCountByTeacher = useMemo(() => {
    const counts = new Map();
    for (const row of workingRows) {
      if (row.grade_level !== grade) continue;
      counts.set(row.teacher_id, (counts.get(row.teacher_id) || 0) + 1);
    }
    return counts;
  }, [workingRows, grade]);

  const countsByGrade = useMemo(() => {
    const counts = Object.fromEntries(GRADE_LEVELS.map(level => [level, 0]));
    for (const row of workingRows) {
      if (counts[row.grade_level] !== undefined) counts[row.grade_level] += 1;
    }
    return counts;
  }, [workingRows]);

  const unsavedCount = pendingAdditions.length + pendingRemovalIds.length;
  const isDirty = unsavedCount > 0;
  const missingSubject = triedAdd && !selectedSubjectId;

  const selectTeacher = (teacherId) => {
    setSelectedTeacherId(teacherId);
    setSelectedSubjectId('');
    setTriedAdd(false);
  };

  const changeGrade = (nextGrade) => {
    setGrade(nextGrade);
    setSelectedSubjectId('');
    setTriedAdd(false);
  };

  const addSubject = () => {
    setTriedAdd(true);
    if (!selectedTeacher || !selectedSubjectId) return;

    const subject = subjectById.get(selectedSubjectId);
    const duplicate = selectedRows.some(row => row.subject_id === selectedSubjectId);
    if (duplicate) {
      showToast(
        `${subject?.name || 'This subject'} is already assigned to ${teacherName(selectedTeacher)} for ${grade}.`,
        'error',
      );
      return;
    }

    setPendingAdditions(previous => [...previous, {
      teacher_id: selectedTeacher.id,
      subject_id: selectedSubjectId,
      grade_level: grade,
    }]);
    setSelectedSubjectId('');
    setTriedAdd(false);
    requestAnimationFrame(() => subjectSelectRef.current?.focus());
  };

  const removeSubject = (row, button) => {
    if (row.locked) {
      showToast(LOCKED_REMOVAL_MESSAGE, 'error');
      return;
    }
    const settle = focusAfterRemoval(
      button,
      '.x-tld-rows, .x-tld-detail',
      '.x-tld-remove',
      '.x-tld-rows-title, #teaching-subject',
    );

    if (row.source === 'pending') {
      setPendingAdditions(previous => previous.filter((_, index) => index !== row.pendingIndex));
    } else {
      setPendingRemovalIds(previous => previous.includes(row.id) ? previous : [...previous, row.id]);
    }
    settle();
  };

  const discardChanges = useCallback((restoreFocus = true) => {
    setPendingAdditions([]);
    setPendingRemovalIds([]);
    setSelectedSubjectId('');
    setTriedAdd(false);
    if (restoreFocus) requestAnimationFrame(() => subjectSelectRef.current?.focus());
  }, []);

  const requestLeave = useCallback((action, destination = '') => {
    setPendingLeave(current => current || {
      proceed: action,
      cancel: null,
      destination,
      saveInProgress: savingRef.current,
    });
  }, []);

  useEffect(() => registerTeachingLoadGuard({
    shouldBlock: () => isDirty || savingRef.current,
    requestLeave,
  }), [isDirty, registerTeachingLoadGuard, requestLeave]);

  useEffect(() => {
    if (!isDirty && !saving) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, saving]);

  useEffect(() => {
    if (!pendingLeave?.saveInProgress || saving) return;
    pendingLeave.cancel?.();
    // The dialog mirrors an external async save. Settling that save invalidates
    // the blocked navigation request and must close its transient UI.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingLeave(null);
  }, [pendingLeave, saving]);

  const handleRouteBlocked = useCallback((blocker) => {
    setPendingLeave(current => current || {
      proceed: blocker.proceed,
      cancel: blocker.reset,
      destination: blocker.location?.pathname || 'the requested page',
      saveInProgress: savingRef.current,
    });
  }, []);

  const cancelLeave = useCallback(() => {
    pendingLeave?.cancel?.();
    setPendingLeave(null);
  }, [pendingLeave]);

  const confirmLeave = useCallback(() => {
    if (!pendingLeave || pendingLeave.saveInProgress) return;
    const proceed = pendingLeave.proceed;
    discardChanges(false);
    setPendingLeave(null);
    proceed();
  }, [discardChanges, pendingLeave]);

  const saveChanges = async () => {
    if (savingRef.current || (!isDirty && !lockedUnsavedHere)) return;
    savingRef.current = true;
    setSaving(true);
    // Read before the removals refresh the load, so the grades match this save.
    const locked = lockedEntries();

    try {
      if (pendingRemovalIds.length > 0) {
        const removed = await removeLoad(pendingRemovalIds, { refresh: false });
        if (removed !== true) {
          if (removed?.deletedIds?.length) {
            await fetchTeachingLoad();
            setPendingRemovalIds(previous => previous.filter(id => !removed.deletedIds.includes(id)));
          }
          return;
        }
        await fetchTeachingLoad();
        setPendingRemovalIds([]);
      }

      const additions = [...pendingAdditions, ...locked];
      if (additions.length > 0) {
        const written = await addLoadEntries(additions);
        if (written === null) return;
        setPendingAdditions([]);
      }
      requestAnimationFrame(() => subjectSelectRef.current?.focus());
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const prevYear = /^\d{4}-\d{4}$/.test(schoolYear)
    ? (() => {
      const start = parseInt(schoolYear.split('-')[0], 10) - 1;
      return `${start}-${start + 1}`;
    })()
    : null;
  // ---- end of the copy ----

  const name = selectedTeacher ? teacherName(selectedTeacher) : '';

  return (
    <div className="x-tld">
      {dataRouter && (
        <TeachingLoadRouteBlocker
          when={isDirty || saving}
          onBlocked={handleRouteBlocked}
        />
      )}

      {/* ---- TEMPORARY copy (TeachingLoadTab.jsx:340-365): LEAVE DIALOG ---- */}
      <Modal
        open={Boolean(pendingLeave)}
        title={pendingLeave?.saveInProgress ? 'Teaching load save in progress' : 'Leave Teaching Load?'}
        onClose={cancelLeave}
        isDirty={() => false}
        footer={(requestClose) => pendingLeave?.saveInProgress ? (
          <button type="button" className="btn btn-ghost" onClick={requestClose}>
            Stay on Teaching Load
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={requestClose}>
              Stay on Teaching Load
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmLeave}>
              Leave without saving
            </button>
          </>
        )}
      >
        <p>
          {pendingLeave?.saveInProgress
            ? 'Wait for the current save to finish before leaving this page.'
            : `You have unsaved teaching load changes. Leaving${pendingLeave?.destination ? ` for ${pendingLeave.destination}` : ''} will discard those changes.`}
        </p>
      </Modal>
      {/* ---- end of the copy ---- */}

      {profileOpen && selectedTeacher && (
        <TeacherProfileSheet teacher={selectedTeacher} onClose={() => setProfileOpen(false)} />
      )}

      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1" tabIndex={-1}>Teaching Load</h1>
          <p className="x-sub">Assign subjects with the teacher and grade always in view.</p>
        </div>
        <div className="x-tld-year">
          <label htmlFor="teaching-school-year">School year</label>
          <input id="teaching-school-year" className="x-input"
            value={schoolYear ?? ''} onChange={event => setSchoolYear(event.target.value)} placeholder="2025-2026"
            disabled={isDirty || saving || schoolYearSource === 'loading'}
            aria-describedby={[isDirty && 'teaching-year-lock', settingsSchoolYear && 'teaching-year-teachers'].filter(Boolean).join(' ') || undefined} />
        </div>
      </div>
      <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

      {(settingsSchoolYear || prevYear || isDirty) && (
        <div className="x-tld-tools">
          {settingsSchoolYear && (
            <span id="teaching-year-teachers" className="x-cs">Teachers currently see {settingsSchoolYear}.</span>
          )}
          {prevYear && (
            <button type="button" className="x-btn" aria-busy={copying || undefined} disabled={isDirty || saving}
              onClick={async () => {
                setCopying(true);
                try { await copyLoadFromYear(prevYear); } finally { setCopying(false); }
              }}>
              <Copy size={15} aria-hidden="true" />
              {copying ? `Copying from ${prevYear}…` : `Copy from ${prevYear}`}
            </button>
          )}
          {isDirty && (
            <span id="teaching-year-lock" className="x-cs">Save or discard changes before changing the school year.</span>
          )}
        </div>
      )}

      <div className="x-usr-tabs x-tld-grades" role="group" aria-label="Grade level">
        {GRADE_LEVELS.map(g => {
          const n = countsByGrade[g];
          return (
            <button key={g} type="button" className={grade === g ? 'on' : ''}
              aria-pressed={grade === g} aria-label={`${g}, ${n} teaching assignment${n === 1 ? '' : 's'}`}
              onClick={() => changeGrade(g)}>
              {g}<span className="x-tld-n" aria-hidden="true">{n}</span>
            </button>
          );
        })}
      </div>
      <p className="x-cs x-tld-caption">Numbers show assignments per grade{isDirty ? ', including unsaved changes' : ''}.</p>

      {teachingLoadError && (
        <div className="x-card x-pad x-rail" role="alert" style={{ marginBottom: 16 }}>
          <span>Could not load teaching assignments. Check your connection and try again.</span>
          <button type="button" className="x-btn" onClick={() => fetchTeachingLoad()}>Retry</button>
        </div>
      )}

      <div className="x-tld-layout">
        <section className="x-card x-pad x-tld-teachers" aria-labelledby="teacher-list-heading">
          <h2 id="teacher-list-heading" className="x-ct">Teachers</h2>
          <p className="x-cs x-tld-count">{visibleTeachers.length} of {teachers.length} shown</p>
          <label className="x-search x-tld-search">
            <Search size={16} aria-hidden="true" />
            <span className="x-sr">Search teachers</span>
            <input id="teacher-search" ref={searchRef} value={query}
              onChange={event => setQuery(event.target.value)} placeholder="Search teachers..." />
          </label>

          <div className="x-tld-list">
            {teachersError ? (
              <p className="x-empty">
                Could not load teachers.{' '}
                <button type="button" className="x-btn" onClick={() => fetchTeachers()}>Retry</button>
              </p>
            ) : teachersLoading ? (
              <p className="x-empty" role="status">{slowTeachers ? 'Loading teachers…' : ''}</p>
            ) : teachers.length === 0 ? (
              <p className="x-empty">No teachers yet. Create them in User Management first.</p>
            ) : visibleTeachers.length === 0 ? (
              <p className="x-empty">No teacher matches “{query}”.</p>
            ) : visibleTeachers.map(teacher => {
              const count = assignmentCountByTeacher.get(teacher.id) || 0;
              const hasPending = pendingAdditions.some(row => row.teacher_id === teacher.id && row.grade_level === grade)
                || teachingLoad.some(row => row.teacher_id === teacher.id
                  && row.grade_level === grade && removalSet.has(row.id));
              return (
                <button key={teacher.id} type="button"
                  className={`x-tld-teacher${selectedTeacherId === teacher.id ? ' on' : ''}`}
                  aria-pressed={selectedTeacherId === teacher.id}
                  onClick={() => selectTeacher(teacher.id)}>
                  <span className="x-avatar sm tint" aria-hidden="true">{teacherInitials(teacher)}</span>
                  <span className="x-tld-tcopy">
                    <b>{teacherName(teacher)}</b>
                    <span>{count} assignment{count === 1 ? '' : 's'}{hasPending ? ' · unsaved changes' : ''}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="x-card x-pad x-tld-detail" aria-labelledby="teacher-detail-heading">
          {!selectedTeacher ? (
            <div className="x-tld-empty">
              <h2 id="teacher-detail-heading" className="x-ct">Select a teacher</h2>
              <p className="x-cs">Select a teacher to begin assigning subjects.</p>
            </div>
          ) : (
            <>
              <div className="x-tld-dhead">
                <div style={{ minWidth: 0 }}>
                  <p className="x-tld-eyebrow">{grade} · {schoolYear}</p>
                  <h2 id="teacher-detail-heading" className="x-ct">{name}</h2>
                  <div className="x-news-pills">
                    {selectedTeacher.department && <span className="x-cs">{selectedTeacher.department}</span>}
                    {selectedTeacher.status && (
                      <span className={`x-badge ${STATUS_TONE[statusClass(selectedTeacher.status)]}`}>{statusLabel(selectedTeacher.status)}</span>
                    )}
                  </div>
                </div>
                <button type="button" className="x-btn" aria-describedby="teacher-detail-heading" onClick={() => setProfileOpen(true)}>
                  <UserRound size={15} aria-hidden="true" />
                  View profile
                </button>
              </div>
              {selectedLock.note && <p className="x-cs x-tld-note">{selectedLock.note}</p>}

              <div className="x-tld-add">
                <label className="x-label" htmlFor="teaching-subject">Add subject</label>
                {subjectsError && (
                  <p className="x-empty">
                    Could not load subjects.{' '}
                    <button type="button" className="x-btn" onClick={() => fetchSubjects()}>Retry</button>
                  </p>
                )}
                <div className="x-tld-addrow">
                  <select id="teaching-subject" ref={subjectSelectRef} className="x-select"
                    aria-invalid={missingSubject || undefined} aria-describedby={missingSubject ? 'teaching-subject-error' : undefined}
                    disabled={saving}
                    value={selectedSubjectId} onChange={event => setSelectedSubjectId(event.target.value)}>
                    <option value="">Select subject…</option>
                    {activeSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                  <button type="button" className="x-btn pri" onClick={addSubject} disabled={saving}>
                    <Plus size={15} aria-hidden="true" />
                    Add assignment
                  </button>
                </div>
                {missingSubject && <p className="x-tld-err" id="teaching-subject-error">Choose a subject to add for {grade}.</p>}
                <p className="x-cs">Subjects appear below immediately and are saved when you press Save.</p>
              </div>

              <div className="x-tld-rows">
                <h3 className="x-tld-rows-title">Assigned subjects ({selectedRows.length})</h3>
                {teachingLoadLoading ? (
                  <p className="x-empty" role="status">Loading teaching load…</p>
                ) : selectedRows.length === 0 ? (
                  <p className="x-empty"><b>No subjects assigned yet.</b> Use the selector above to assign the first subject.</p>
                ) : (
                  <div className="x-tld-scroll">
                    <table className="x-table x-tld-table" aria-label={`Subjects assigned to ${name} for ${grade}`}>
                      <thead><tr><th scope="col">Subject</th><th scope="col"><span className="x-sr">Actions</span></th></tr></thead>
                      <tbody>
                        {selectedRows.map(row => {
                          const subject = subjectById.get(row.subject_id);
                          const label = subject?.name || subject?.code || 'Unknown subject';
                          if (row.locked) {
                            // Not removable: nothing here to press.
                            return (
                              <tr key={`locked-${row.subject_id}`}>
                                <td>
                                  <span className="x-tld-subj">
                                    <Lock size={14} aria-hidden="true" />
                                    <b>{label}</b> <span>(department)</span><span className="x-sr">, locked</span>
                                    {row.source === 'locked' && <span className="x-cs">not saved for this grade yet</span>}
                                  </span>
                                </td>
                                <td />
                              </tr>
                            );
                          }
                          return (
                            <tr key={row.source === 'pending' ? `pending-${row.pendingIndex}` : row.id}>
                              <td>
                                <span className="x-tld-subj">
                                  <b>{label}</b>
                                  {row.source === 'pending' && <span className="x-badge in">New</span>}
                                </span>
                              </td>
                              <td className="x-tld-act">
                                <button type="button" className="x-btn x-tld-remove"
                                  disabled={saving}
                                  aria-label={`Remove ${label} from ${name} for ${grade}`}
                                  onClick={event => removeSubject(row, event.currentTarget)}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={`x-savebar x-tld-savebar${isDirty ? ' dirty' : ''}`} aria-live="polite">
                <div className="x-tld-savecopy">
                  <b>
                    {isDirty ? 'Unsaved changes'
                      : lockedUnsavedHere ? `${selectedLock.subject.name} (department) is not saved for ${grade} yet`
                        : <><CheckCircle2 size={16} aria-hidden="true" /> All changes saved</>}
                  </b>
                  {isDirty && (
                    <span>{unsavedCount} change{unsavedCount === 1 ? '' : 's'} across this teaching load</span>
                  )}
                </div>
                {(isDirty || lockedUnsavedHere) && (
                  <div className="x-tld-saveact">
                    {isDirty && <button type="button" className="x-btn gh" onClick={discardChanges} disabled={saving}>Discard</button>}
                    <button type="button" className="x-btn pri" aria-busy={saving || undefined} onClick={saveChanges}>
                      {saving ? 'Saving assignment…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ClarityAdminTeachingLoadTab;
