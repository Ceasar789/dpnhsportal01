// ============================================
// FILE: src/components/clarity/admin/ClarityAdminSectionsTab.jsx
// The Admin Sections tab in Clarity (final design): sections grouped into
// one column per grade level that really has sections. Data comes only from
// useAdminContext(). There is no per-section student count in the loaded
// data (section_students is read only for the open class list), so no
// progress bar and no "N / capacity" caption: the card shows the real
// capacity instead.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/SectionsTab.jsx
// (parity-tested in ClarityAdminSectionsTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - the local state and handlers, :37-126 (without the phone row-sheet
//     state, :40-41: the cards here show their actions at every width)
//   - the Add/Edit Section dialog, the Class List dialog and the student
//     profile sheet, :218-452 (the shared Modal, unchanged, so the
//     discard-changes guard, focus return and dialog stacking are the same)
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Plus, Users, UserRound, X } from 'lucide-react';
import StudentProfileSheet from '../../../pages/dashboards/admin/shared/StudentProfileSheet';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { focusAfterRemoval } from '../../../lib/focusAfterRemoval';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import SchoolYearNotice from '../../../pages/dashboards/admin/shared/SchoolYearNotice';
import { coverageText, subjectCoverage } from '../../../pages/dashboards/admin/shared/classSetup';
import { formatEnrollmentDate, membershipStatusLabel, REMOVAL_REASONS } from '../../../pages/dashboards/admin/shared/sectionMembership';
import { GRADE_LEVELS, normalizeGradeLevel } from '../../../lib/academicRules';
import { isActiveSectionAdviser, otherAdvisedSections, validateSectionCapacity } from '../../../pages/dashboards/admin/shared/sectionsValidation';

// Sections grouped by grade, in the school's grade order; a grade_level the
// list does not know keeps its own column after the known ones.
const groupByGrade = (sections) => {
  const groups = new Map();
  for (const section of sections) {
    const grade = normalizeGradeLevel(section.grade_level) || String(section.grade_level || '').trim() || 'No grade level';
    if (!groups.has(grade)) groups.set(grade, []);
    groups.get(grade).push(section);
  }
  const rank = grade => { const i = GRADE_LEVELS.indexOf(grade); return i === -1 ? GRADE_LEVELS.length : i; };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
};

const ClarityAdminSectionsTab = () => {
  const {
    // Defaults only for a context that has not provided these (the real one always does).
    schoolYear, settingsSchoolYear, schoolYearSource, teachers = [], sections = [], sectionsLoading, sectionsError, fetchSections,
    sectionModal, editingSection,
    secName = '', setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secCapacityError, setSecCapacityError,
    secAdviserError, setSecAdviserError, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList = [], classListLoading, classListError, unassignedStudents = [], previousMembers,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
    showToast,
    schedules, schedulesLoading, schedulesError, subjects, subjectsLoading, subjectsError,
    setPage, setScheduleOpenSectionId,
  } = useAdminContext();

  // ---- TEMPORARY copy (SectionsTab.jsx:37-126, without :40-41) ----
  const [pick, setPick] = useState('');
  // UX-052: adding a student is two round trips. Without this the press
  // produces no visible change at all until the roster reloads.
  const [profileStudent, setProfileStudent] = useState(null);
  const pageRootRef = useRef(null);
  const pageHeadingRef = useRef(null);
  const focusAfterDelete = () => {
    const nextDelete = pageRootRef.current?.querySelector('.archive-action');
    if (nextDelete) nextDelete.focus();
    else pageHeadingRef.current?.focus();
  };

  const [adding, setAdding] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState(null);
  const removingStudentRef = useRef(false);

  // Removing a student asks why, inside the class list (no second overlay on
  // top of this dialog): Dropped and Transferred keep the row as history,
  // Added by mistake deletes it. No reason is preselected.
  const [removal, setRemoval] = useState(null);
  const [removalReason, setRemovalReason] = useState('');
  const removeTriggerRef = useRef(null);
  const removalLegendRef = useRef(null);
  useEffect(() => { if (removal) removalLegendRef.current?.focus(); }, [removal]);
  const cancelRemoval = () => {
    setRemoval(null);
    setRemovalReason('');
    removeTriggerRef.current?.focus();
  };
  const confirmRemoval = async () => {
    if (!removal || !removalReason || removingStudentRef.current) return;
    const trigger = removeTriggerRef.current;
    // Losing focus here drops the user on the body with a modal still open over it.
    const settle = trigger ? focusAfterRemoval(trigger, 'table', '.icon-action', '.modal-title') : () => {};
    removingStudentRef.current = true;
    setRemovingStudentId(removal.id);
    try {
      if (await removeStudentFromSection(removal.id, removalReason)) {
        setRemoval(null);
        setRemovalReason('');
        settle();
      }
    } finally {
      removingStudentRef.current = false;
      setRemovingStudentId(null);
    }
  };

  // UX-062: two of these four fields are required and nothing said which.
  // The rules are unchanged and still live in saveSection; this is where
  // the answer is shown.
  const [tried, setTried] = useState(false);
  const beginCreate = () => { setTried(false); openCreateSection(); };
  const beginEdit = (section) => { setTried(false); openEditSection(section); };
  const missingName = tried && !secName.trim();
  const missingGrade = tried && !secGrade;
  const localCapacityError = tried ? validateSectionCapacity(secCapacity).message : '';
  const capacityError = secCapacityError || localCapacityError;
  const adviserName = (id) => teachers.find(t => t.id === id)?.name || '—';
  const eligibleTeachers = teachers.filter(isActiveSectionAdviser);
  const existingAdviser = editingSection?.adviser_id
    ? teachers.find((teacher) => teacher.id === editingSection.adviser_id)
    : null;
  const existingAdviserIsIneligible = existingAdviser && !isActiveSectionAdviser(existingAdviser);
  // Class setup line: the adviser and subject coverage, from the schedules and
  // subjects already loaded for the year. A failed read never reads as "0 of".
  const classSetupReady = Array.isArray(schedules) && Array.isArray(subjects);
  const activeSubjects = classSetupReady ? subjects.filter(subject => subject.is_active !== false) : [];
  const canOpenClassSetup = typeof setPage === 'function' && typeof setScheduleOpenSectionId === 'function';
  const openClassSetup = (section) => {
    setScheduleOpenSectionId(section.id);
    setPage('schedules');
  };
  // Uses the sections already loaded for this year; never blocks saving.
  const alsoAdvises = otherAdvisedSections({
    adviserId: secAdviser, sections, editingSectionId: editingSection?.id, schoolYear,
  });
  const adviserWarning = alsoAdvises.length > 0
    ? `${adviserName(secAdviser)} already advises ${alsoAdvises.map(s => s.name).join(', ')} this school year. A teacher normally advises one section.`
    : '';
  // ---- end of the copy ----

  // The card's lines. The adviser as the design shows it; the coverage is the
  // second half of the classic "class setup" line, with the same wording.
  const adviserLine = (section) => {
    if (!section.adviser_id) return 'No adviser yet';
    const found = teachers.find(t => t.id === section.adviser_id);
    return found?.name ? found.name : 'Adviser not found';
  };
  const coverageLine = (section) => (!classSetupReady ? ''
    : schedulesError || subjectsError ? 'class setup unavailable'
      : schedulesLoading || subjectsLoading ? 'loading class setup…'
        : coverageText(subjectCoverage(section.id, schedules, activeSubjects)));

  return (
    <>
      <div ref={pageRootRef} className="x-sec">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1" ref={pageHeadingRef} tabIndex={-1}>Sections</h1>
            <p className="x-sub">Grouped by grade level.</p>
          </div>
          <div className="x-act">
            <button type="button" className="x-btn pri" onClick={beginCreate}>
              <Plus size={16} aria-hidden="true" /> Add section
            </button>
          </div>
        </div>
        <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

        {sectionsLoading ? (
          <p className="x-empty">Loading sections…</p>
        ) : sectionsError ? (
          <div className="x-card x-empty">
            <p>Could not load sections. Check your connection and try again.</p>
            <button type="button" className="x-btn" style={{ marginTop: 12 }} onClick={() => fetchSections()}>Retry</button>
          </div>
        ) : sections.length === 0 ? (
          <p className="x-card x-empty">No sections for {schoolYear} yet.</p>
        ) : (
          <div className="x-sec-board">
            {groupByGrade(sections).map(([grade, list]) => (
              <section key={grade} className="x-sec-col" aria-labelledby={`x-sec-${grade.replace(/\W+/g, '-')}`}>
                <div className="x-sec-colhead">
                  <h2 id={`x-sec-${grade.replace(/\W+/g, '-')}`}>{grade}</h2>
                  <span>{list.length}<span className="x-sr"> {list.length === 1 ? 'section' : 'sections'}</span></span>
                </div>
                {list.map(s => (
                  <article key={s.id} className="x-card x-sec-card" aria-labelledby={`x-sec-card-${s.id}`}>
                    <h3 id={`x-sec-card-${s.id}`} className="x-sec-name">{s.name}</h3>
                    <p className="x-sec-meta">{adviserLine(s)}</p>
                    {coverageLine(s) && <p className="x-sec-meta">{coverageLine(s)}</p>}
                    {s.capacity !== null && s.capacity !== undefined && s.capacity !== '' && (
                      <p className="x-sec-cap">Capacity {s.capacity}</p>
                    )}
                    <div className="x-sec-act">
                      <button type="button" className="x-iconbtn" aria-label={`Class list for ${s.name}`} title="Class list" onClick={() => openClassList(s)}><Users size={15} aria-hidden="true" /></button>
                      <button type="button" className="x-iconbtn" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => beginEdit(s)}><Pencil size={15} aria-hidden="true" /></button>
                      <button type="button" className="x-iconbtn archive-action" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => deleteSection(s.id, focusAfterDelete)}><Trash2 size={15} aria-hidden="true" /></button>
                      {canOpenClassSetup && (
                        <button type="button" className="x-btn gh x-sec-setup" aria-label={`Open class setup for ${s.name}`} onClick={() => openClassSetup(s)}>
                          Open class setup
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* ---- TEMPORARY copy (SectionsTab.jsx:218-452) ---- */}
      {sectionModal && (
        <Modal
          open
          title={editingSection ? 'Edit Section' : 'Add Section'}
          onClose={closeSectionModal}
          footer={(requestClose) => (
            <>
              <Button variant="ghost" onClick={requestClose}>Cancel</Button>
              <Button onClick={() => {
                setTried(true);
                if (!secName.trim() || !secGrade || !validateSectionCapacity(secCapacity).valid) return;
                saveSection();
              }} busy={secSaving} busyLabel={editingSection ? 'Updating…' : 'Creating…'}>
                {editingSection ? 'Update' : 'Create'}
              </Button>
            </>
          )}
        >

            <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />
            <div className="form-legend"><span className="form-req" aria-hidden="true">*</span> Required</div>

            <div className="form-row">
              <label className="form-label" htmlFor="sections-section-name">Section Name<span className="form-req" aria-hidden="true">*</span></label>
              <input id="sections-section-name" className={`form-input${missingName ? ' is-invalid' : ''}`} value={secName} onChange={e => setSecName(e.target.value)} placeholder="e.g. 7-Rizal"
                aria-required="true" aria-invalid={missingName || undefined} aria-describedby={missingName ? 'sections-section-name-error' : undefined} />
              {missingName && <div className="field-error" id="sections-section-name-error">Section name is required.</div>}
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="sections-grade-level">Grade Level<span className="form-req" aria-hidden="true">*</span></label>
              <select id="sections-grade-level" className={`form-input${missingGrade ? ' is-invalid' : ''}`} value={secGrade} onChange={e => setSecGrade(e.target.value)}
                aria-required="true" aria-invalid={missingGrade || undefined} aria-describedby={missingGrade ? 'sections-grade-level-error' : undefined}>
                <option value="">Select…</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {missingGrade && <div className="field-error" id="sections-grade-level-error">Grade level is required.</div>}
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="sections-adviser">Adviser</label>
              <select id="sections-adviser" className={`form-input${secAdviserError ? ' is-invalid' : ''}`} value={secAdviser}
                onChange={e => { setSecAdviser(e.target.value); setSecAdviserError(''); }}
                aria-invalid={Boolean(secAdviserError) || undefined}
                aria-describedby={[secAdviserError && 'sections-adviser-error', adviserWarning && 'sections-adviser-warning'].filter(Boolean).join(' ') || undefined}>
                <option value="">No adviser yet</option>
                {existingAdviserIsIneligible && (
                  <option value={existingAdviser.id} disabled>
                    {existingAdviser.name || existingAdviser.email} ({existingAdviser.status || 'inactive'} — existing adviser)
                  </option>
                )}
                {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
              {secAdviserError && <div className="field-error" id="sections-adviser-error">{secAdviserError}</div>}
              {adviserWarning && (
                <div className="form-hint" id="sections-adviser-warning" role="status"
                  style={{ color: 'var(--badge-yellow-fg)', background: 'var(--badge-yellow-bg)', border: '1px solid var(--badge-yellow-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-8)' }}>
                  {adviserWarning}
                </div>
              )}
              {existingAdviserIsIneligible && secAdviser === existingAdviser.id && (
                <div className="field-help">This adviser is no longer active. The existing assignment will be preserved unless you choose a replacement.</div>
              )}
              {eligibleTeachers.length === 0 && <div className="field-help">No active teachers are currently available.</div>}
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="sections-capacity">Capacity<span className="form-req" aria-hidden="true">*</span></label>
              <input id="sections-capacity" className={`form-input${capacityError ? ' is-invalid' : ''}`} type="number" min="1" max="60" step="1" required value={secCapacity}
                onChange={e => { setSecCapacity(e.target.value); setSecCapacityError(''); }}
                aria-required="true" aria-invalid={Boolean(capacityError) || undefined} aria-describedby={capacityError ? 'sections-capacity-error' : 'sections-capacity-help'} />
              {capacityError
                ? <div className="field-error" id="sections-capacity-error">{capacityError}</div>
                : <div className="field-help" id="sections-capacity-help">Enter a whole number from 1 to 60.</div>}
            </div>

        </Modal>
      )}

      {activeSection && (
        <Modal
          open
          title={`${activeSection.name} — Class List`}
          onClose={closeClassList}
          isDirty={() => false}
          footer={(requestClose) => (
            <button className="btn btn-ghost" onClick={requestClose}>Close</button>
          )}
        >

            {!classListLoading && !classListError && (() => {
              const capacity = validateSectionCapacity(activeSection.capacity);
              if (!capacity.valid) return <div className="field-error" role="alert">This section has an invalid capacity. Correct it before adding students.</div>;
              const full = classList.length >= capacity.value;
              return (
                <div role="status" aria-live="polite" className={full ? 'field-error' : 'field-help'}>
                  Enrollment: {classList.length} of {capacity.value}.
                  {full ? ` This section is ${classList.length > capacity.value ? 'over capacity' : 'full'}; additional enrollment is blocked.` : ''}
                </div>
              );
            })()}

            <div className="form-row" style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <label className="sr-only" htmlFor="sections-add-student">Add a student</label>
              <select id="sections-add-student" className="form-input" value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Add a student…</option>
                {unassignedStudents.map(s => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
              </select>
              {/* Rule B1: not disabled on an empty choice. A disabled button
                  leaves the tab order and cannot say why it is unavailable,
                  so the check runs on press and answers in words. */}
              <Button
                busy={adding}
                busyLabel="Adding…"
                onClick={async () => {
                  if (!pick) return showToast('Choose a student to add', 'error');
                  setAdding(true);
                  try {
                    const added = await addStudentToSection(pick);
                    if (added) setPick('');
                  } finally { setAdding(false); }
                }}
              >Add</Button>
            </div>

            {removal && (
              <fieldset aria-describedby="sections-remove-reason-help"
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-12)', margin: '0 0 var(--space-12)' }}>
                <legend ref={removalLegendRef} tabIndex={-1} style={{ fontWeight: 600, color: 'var(--text)', padding: '0 var(--space-4)' }}>
                  Why is {removal.name} being removed from {activeSection.name}?
                </legend>
                <p id="sections-remove-reason-help" className="form-hint" style={{ marginTop: 0 }}>
                  Dropped and Transferred keep the record under Previously in this section. Added by mistake deletes it.
                </p>
                {REMOVAL_REASONS.map(reason => (
                  <label key={reason.value} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', minHeight: 44, cursor: 'pointer', color: 'var(--text)' }}>
                    <input type="radio" name="sections-remove-reason" value={reason.value}
                      checked={removalReason === reason.value} onChange={() => setRemovalReason(reason.value)} />
                    {reason.label}
                  </label>
                ))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)', justifyContent: 'flex-end', marginTop: 'var(--space-8)' }}>
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={cancelRemoval}>Cancel</button>
                  <button type="button" className="btn btn-primary btn-danger-solid" style={{ minHeight: 44 }}
                    disabled={!removalReason || removingStudentId === removal.id}
                    aria-busy={removingStudentId === removal.id || undefined}
                    onClick={confirmRemoval}>
                    {removingStudentId === removal.id ? 'Removing…' : 'Remove from section'}
                  </button>
                </div>
              </fieldset>
            )}

            <div className="table-card"><table>
              <thead><tr><th>#</th><th>Student</th><th>Email</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {classListLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-16)' }}>Loading class list…</td></tr>
                ) : classListError ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
                    Could not load. Check your connection and try again.
                    <div style={{ marginTop: 'var(--space-12)' }}>
                      <button className="btn btn-ghost" onClick={() => openClassList(activeSection)}>Retry</button>
                    </div>
                  </td></tr>
                ) : classList.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-16)' }}>No students in this section yet.</td></tr>
                ) : classList.map((c, i) => (
                  /* No row sheet here, deliberately: this table is already
                     inside a dialog, so the actions stay on the row. Two
                     lines, actions inline. View profile is the one
                     exception: the profile dialog may open over this class
                     list dialog, and only the top dialog handles Escape
                     and Tab (Modal's stack). */
                  <tr key={c.id}>
                    <td data-cell="detail">{i + 1}</td>
                    <td data-cell="identity">{c.name}</td>
                    <td data-cell="value">{c.email}</td>
                    <td data-cell="actions-inline"><button
                      type="button"
                      className="icon-action"
                      aria-label={`View profile of ${c.name}`}
                      title="View profile"
                      onClick={() => setProfileStudent({ id: c.student_id, name: c.name, email: c.email })}
                    ><UserRound size={15} aria-hidden="true" /></button><button
                      className="icon-action"
                      aria-label={`Remove ${c.name} from this section`}
                      title="Remove"
                      disabled={removingStudentId === c.id}
                      aria-busy={removingStudentId === c.id || undefined}
                      onClick={(e) => {
                        if (removingStudentRef.current) return;
                        removeTriggerRef.current = e.currentTarget;
                        setRemovalReason('');
                        setRemoval(c);
                      }}
                    ><X size={15} aria-hidden="true" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            {!classListLoading && !classListError && previousMembers?.length > 0 && (
              <details className="table-card" style={{ marginTop: 'var(--space-12)', padding: '0 var(--space-12) var(--space-8)' }}>
                <summary style={{ minHeight: 44, paddingTop: 'var(--space-12)', cursor: 'pointer', fontWeight: 600, color: 'var(--text)' }}>
                  Previously in this section ({previousMembers.length})
                </summary>
                <table aria-label="Previously in this section">
                  <thead><tr><th>Student</th><th>Status</th><th>Enrolled</th><th><span className="sr-only">Profile</span></th></tr></thead>
                  <tbody>
                    {previousMembers.map(member => (
                      <tr key={member.id}>
                        <td data-cell="identity">{member.name}</td>
                        <td data-cell="value">{membershipStatusLabel(member.status)}</td>
                        <td data-cell="detail">{formatEnrollmentDate(member.enrollment_date)}</td>
                        <td data-cell="actions-inline"><button
                          type="button"
                          className="icon-action"
                          aria-label={`View profile of ${member.name}`}
                          title="View profile"
                          onClick={() => setProfileStudent({ id: member.student_id, name: member.name })}
                        ><UserRound size={15} aria-hidden="true" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

        </Modal>
      )}

      {activeSection && profileStudent && (
        <StudentProfileSheet student={profileStudent} onClose={() => setProfileStudent(null)} />
      )}
      {/* ---- end of the copy ---- */}
    </>
  );
};

export default ClarityAdminSectionsTab;
