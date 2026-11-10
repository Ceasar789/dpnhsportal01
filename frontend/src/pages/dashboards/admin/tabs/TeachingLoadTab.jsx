// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// Teacher-centred editing of teacher_subjects for one school year and grade.
// Additions and removals stay local until Save Assignment is pressed.
// ============================================

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { CheckCircle2, Copy, Lock, Plus, Search, UserRound, X } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { departmentSubject, LOCKED_REMOVAL_MESSAGE } from '../shared/departmentSubject';
import SchoolYearNotice from '../shared/SchoolYearNotice';
import TeacherProfileSheet from '../shared/TeacherProfileSheet';
import { useTeachingLoadUnsavedChanges } from '../../../../context/TeachingLoadUnsavedChangesContext';
import { focusAfterRemoval } from '../../../../lib/focusAfterRemoval';
import { useDelayedFlag } from '../../../../lib/useDelayedFlag';
import { GRADE_LEVELS } from '../../../../lib/academicRules';
import GradeTabs from '../GradeTabs';
import Button from '../../../../components/ui/Button';
import Modal from '../../../../components/ui/Modal';

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

const TeachingLoadTab = () => {
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
      '.assigned-subjects, .teaching-detail',
      '.subject-chip-remove',
      '.subject-section-title, #teaching-subject',
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

  return (
    <div className="teaching-load-page">
      {dataRouter && (
        <TeachingLoadRouteBlocker
          when={isDirty || saving}
          onBlocked={handleRouteBlocked}
        />
      )}

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

      {profileOpen && selectedTeacher && (
        <TeacherProfileSheet teacher={selectedTeacher} onClose={() => setProfileOpen(false)} />
      )}

      <div className="page-header-bar">
        <div className="page-title">Teaching Load</div>
        <div className="page-sub">Assign subjects with the teacher and grade always in view.</div>
      </div>
      <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

      <div className="toolbar">
        <label className="form-label" htmlFor="teaching-school-year" style={{ marginRight: 'var(--space-8)' }}>School Year</label>
        <input id="teaching-school-year" className="form-input" style={{ width: 140, flex: 'none' }}
          value={schoolYear ?? ''} onChange={event => setSchoolYear(event.target.value)} placeholder="2025-2026"
          disabled={isDirty || saving || schoolYearSource === 'loading'}
          aria-describedby={[isDirty && 'teaching-year-lock', settingsSchoolYear && 'teaching-year-teachers'].filter(Boolean).join(' ') || undefined} />
        {settingsSchoolYear && (
          <span id="teaching-year-teachers" className="teaching-toolbar-note">Teachers currently see {settingsSchoolYear}.</span>
        )}
        {prevYear && (
          <Button
            variant="ghost"
            busy={copying}
            busyLabel={`Copying from ${prevYear}…`}
            disabled={isDirty || saving}
            onClick={async () => {
              setCopying(true);
              try { await copyLoadFromYear(prevYear); } finally { setCopying(false); }
            }}
          >
            <Copy size={15} aria-hidden="true" />
            Copy from {prevYear}
          </Button>
        )}
        {isDirty && (
          <span id="teaching-year-lock" className="teaching-toolbar-note">
            Save or discard changes before changing the school year.
          </span>
        )}
      </div>

      <div className="grade-tabs-caption">
        Numbers show assignments per grade{isDirty ? ', including unsaved changes' : ''}.
      </div>
      <GradeTabs value={grade} onChange={changeGrade} counts={countsByGrade} unit="teaching assignment" />

      {teachingLoadError && (
        <div className="teaching-load-error" role="alert">
          <span>Could not load teaching assignments. Check your connection and try again.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fetchTeachingLoad()}>Retry</button>
        </div>
      )}

      <div className="teaching-workspace">
        <section className="card teaching-teachers" aria-labelledby="teacher-list-heading">
          <div className="teaching-panel-head">
            <div>
              <h2 id="teacher-list-heading" className="teaching-panel-title">Teachers</h2>
              <div className="teaching-panel-sub">{visibleTeachers.length} of {teachers.length} shown</div>
            </div>
          </div>

          <label className="sr-only" htmlFor="teacher-search">Search teachers</label>
          <div className="picker-search">
            <Search size={16} aria-hidden="true" />
            <input id="teacher-search" ref={searchRef} value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search by name, email or department…" />
          </div>

          <div className="teacher-list">
            {teachersError ? (
              <div className="picker-empty">
                Could not load teachers.{' '}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => fetchTeachers()}>Retry</button>
              </div>
            ) : teachersLoading ? (
              <div className="picker-empty">{slowTeachers ? 'Loading teachers…' : ''}</div>
            ) : teachers.length === 0 ? (
              <div className="picker-empty">No teachers yet. Create them in User Management first.</div>
            ) : visibleTeachers.length === 0 ? (
              <div className="picker-empty">No teacher matches “{query}”.</div>
            ) : visibleTeachers.map(teacher => {
              const count = assignmentCountByTeacher.get(teacher.id) || 0;
              const hasPending = pendingAdditions.some(row => row.teacher_id === teacher.id && row.grade_level === grade)
                || teachingLoad.some(row => row.teacher_id === teacher.id
                  && row.grade_level === grade && removalSet.has(row.id));
              return (
                <button key={teacher.id} type="button"
                  className={`teacher-option${selectedTeacherId === teacher.id ? ' selected' : ''}`}
                  aria-pressed={selectedTeacherId === teacher.id}
                  onClick={() => selectTeacher(teacher.id)}>
                  <span className="teacher-option-avatar" aria-hidden="true">{teacherInitials(teacher)}</span>
                  <span className="teacher-option-copy">
                    <span className="teacher-option-name">{teacherName(teacher)}</span>
                    <span className="teacher-option-meta">{teacher.department || teacher.email || 'Department not recorded'}</span>
                  </span>
                  <span className="teacher-option-count" aria-label={`${count} assigned subjects`}>
                    {count}{hasPending ? ' •' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card teaching-detail" aria-labelledby="teacher-detail-heading">
          {!selectedTeacher ? (
            <div className="teaching-empty">
              <div className="teaching-empty-icon" aria-hidden="true">T</div>
              <h2 id="teacher-detail-heading">Select a teacher</h2>
              <p>Select a teacher to begin assigning subjects.</p>
            </div>
          ) : (
            <>
              <div className="teacher-summary">
                <div className="teacher-summary-avatar" aria-hidden="true">{teacherInitials(selectedTeacher)}</div>
                <div className="teacher-summary-copy">
                  <div className="teaching-eyebrow">Selected teacher</div>
                  <h2 id="teacher-detail-heading">{teacherName(selectedTeacher)}</h2>
                  <div>{selectedTeacher.department || 'Department not recorded'}</div>
                </div>
                <span className={`badge ${statusClass(selectedTeacher.status)}`}>
                  {statusLabel(selectedTeacher.status)}
                </span>
              </div>
              {selectedLock.note && (
                <p className="teaching-lock-note" style={{ margin: 'var(--space-8) 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-12)' }}>
                  {selectedLock.note}
                </p>
              )}
              <div style={{ paddingTop: 'var(--space-12)' }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}
                  aria-describedby="teacher-detail-heading"
                  onClick={() => setProfileOpen(true)}>
                  <UserRound size={15} aria-hidden="true" />
                  View profile
                </button>
              </div>

              <dl className="teacher-summary-grid">
                <div><dt>Teacher</dt><dd>{teacherName(selectedTeacher)}</dd></div>
                <div><dt>Department</dt><dd>{selectedTeacher.department || 'Not recorded'}</dd></div>
                <div><dt>Current Grade</dt><dd>{grade}</dd></div>
                <div><dt>Assigned Subjects</dt><dd>{selectedRows.length}</dd></div>
                <div><dt>Status</dt><dd>{statusLabel(selectedTeacher.status)}</dd></div>
              </dl>

              <div className="assigned-subjects">
                <div className="subject-section-head">
                  <div>
                    <h3 className="subject-section-title">Assigned Subjects</h3>
                    <p>{grade} · {schoolYear}</p>
                  </div>
                  <span className="badge badge-grey">{selectedRows.length}</span>
                </div>

                {teachingLoadLoading ? (
                  <div className="subject-empty">Loading teaching load…</div>
                ) : selectedRows.length === 0 ? (
                  <div className="subject-empty">
                    <strong>No subjects assigned yet.</strong>
                    <span>Use the selector below to assign the first subject.</span>
                  </div>
                ) : (
                  <div className="subject-chip-list" aria-label={`Subjects assigned to ${teacherName(selectedTeacher)} for ${grade}`}>
                    {selectedRows.map(row => {
                      const subject = subjectById.get(row.subject_id);
                      const label = subject?.name || subject?.code || 'Unknown subject';
                      if (row.locked) {
                        // Not a toggle and no remove action: nothing here to press.
                        return (
                          <span className="subject-chip locked" key={`locked-${row.subject_id}`}
                            role="group" aria-label={`${label}, department subject, locked`}
                            style={{ paddingRight: 'var(--space-12)' }}>
                            <Lock size={14} aria-hidden="true" />
                            <span>{label} <span style={{ fontWeight: 400 }}>(department)</span></span>
                            {row.source === 'locked' && (
                              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-11)', fontWeight: 400 }}>
                                not saved for this grade yet
                              </span>
                            )}
                          </span>
                        );
                      }
                      return (
                        <span className={`subject-chip${row.source === 'pending' ? ' pending' : ''}`}
                          key={row.source === 'pending' ? `pending-${row.pendingIndex}` : row.id}>
                          <span>{label}</span>
                          {row.source === 'pending' && <span className="subject-chip-state">New</span>}
                          <button type="button" className="subject-chip-remove"
                            disabled={saving}
                            aria-label={`Remove ${label} from ${teacherName(selectedTeacher)} for ${grade}`}
                            title={`Remove ${label}`}
                            onClick={event => removeSubject(row, event.currentTarget)}>
                            <X size={14} aria-hidden="true" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="add-subject-panel">
                <label className="bulk-label" htmlFor="teaching-subject">Add Subject</label>
                {subjectsError && (
                  <div className="picker-empty subject-read-error">
                    Could not load subjects.{' '}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => fetchSubjects()}>Retry</button>
                  </div>
                )}
                <div className="add-subject-row">
                  <select id="teaching-subject" ref={subjectSelectRef}
                    className={`form-input${missingSubject ? ' is-invalid' : ''}`}
                    disabled={saving}
                    value={selectedSubjectId} onChange={event => setSelectedSubjectId(event.target.value)}>
                    <option value="">Select subject…</option>
                    {activeSubjects.map(subject => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-primary" onClick={addSubject} disabled={saving}>
                    <Plus size={15} aria-hidden="true" />
                    Add Subject
                  </button>
                </div>
                {missingSubject && <div className="field-error">Choose a subject to add for {grade}.</div>}
                <div className="bulk-hint">
                  Subjects appear above immediately and are saved when you press Save Assignment.
                </div>
              </div>

              <div className={`teaching-savebar${isDirty ? ' dirty' : ' saved'}`} aria-live="polite">
                <div>
                  <div className="teaching-save-title">
                    {isDirty ? 'Unsaved changes'
                      : lockedUnsavedHere ? `${selectedLock.subject.name} (department) is not saved for ${grade} yet`
                        : <><CheckCircle2 size={16} aria-hidden="true" /> All changes saved</>}
                  </div>
                  {isDirty && (
                    <div className="teaching-save-hint">
                      {unsavedCount} change{unsavedCount === 1 ? '' : 's'} across this teaching load
                    </div>
                  )}
                </div>
                {(isDirty || lockedUnsavedHere) && (
                  <div className="teaching-save-actions">
                    {isDirty && <button type="button" className="btn btn-ghost" onClick={discardChanges} disabled={saving}>Discard</button>}
                    <Button onClick={saveChanges} busy={saving} busyLabel="Saving assignment…">Save Assignment</Button>
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

export default TeachingLoadTab;
