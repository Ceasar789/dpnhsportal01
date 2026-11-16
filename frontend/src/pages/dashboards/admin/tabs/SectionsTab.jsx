// ============================================
// FILE: src/pages/dashboards/admin/tabs/SectionsTab.jsx
// Class sections and their student rosters. A section plus its schedule is
// what makes a teacher's My Students screen show anything.
// ============================================

import { useEffect, useRef, useState } from 'react';
import RowSheet from '../../../../components/ui/RowSheet';
import { useIsNarrow } from '../../../../lib/useMediaQuery';
import { Pencil, Trash2, Plus, Users, UserRound, X } from 'lucide-react';
import StudentProfileSheet from '../shared/StudentProfileSheet';
import Modal from '../../../../components/ui/Modal';
import { focusAfterRemoval } from '../../../../lib/focusAfterRemoval';
import { useAdminContext } from '../AdminContext';
import SectionFormDialog from '../shared/SectionFormDialog';
import SchoolYearNotice from '../shared/SchoolYearNotice';
import { coverageText, subjectCoverage } from '../shared/classSetup';
import { formatEnrollmentDate, membershipStatusLabel, REMOVAL_REASONS } from '../shared/sectionMembership';
import Button from '../../../../components/ui/Button';
import { validateSectionCapacity } from '../shared/sectionsValidation';

const SectionsTab = () => {
  const {
    schoolYear, settingsSchoolYear, schoolYearSource, teachers, sections, sectionsLoading, sectionsError, fetchSections,
    
    
    
    
    openCreateSection, openEditSection, deleteSection,
    activeSection, classList, classListLoading, classListError, unassignedStudents, previousMembers,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
    showToast,
    schedules, schedulesLoading, schedulesError, subjects, subjectsLoading, subjectsError,
    setPage, setScheduleOpenSectionId,
  } = useAdminContext();

  const [pick, setPick] = useState('');
  // UX-052: adding a student is two round trips. Without this the press
  // produces no visible change at all until the roster reloads.
  const narrow = useIsNarrow();
  const [sheetSection, setSheetSection] = useState(null);
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

  const beginCreate = () => openCreateSection();
  const beginEdit = (section) => openEditSection(section);
  const adviserName = (id) => teachers.find(t => t.id === id)?.name || '—';
  // Class setup line: the adviser and subject coverage, from the schedules and
  // subjects already loaded for the year. A failed read never reads as "0 of".
  const classSetupReady = Array.isArray(schedules) && Array.isArray(subjects);
  const activeSubjects = classSetupReady ? subjects.filter(subject => subject.is_active !== false) : [];
  const classSetupLine = (section) => {
    if (!classSetupReady) return '';
    const adviser = section.adviser_id ? `Adviser: ${adviserName(section.adviser_id)}` : 'No adviser yet';
    const coverage = schedulesError || subjectsError ? 'class setup unavailable'
      : schedulesLoading || subjectsLoading ? 'loading class setup…'
        : coverageText(subjectCoverage(section.id, schedules, activeSubjects));
    return `${adviser} · ${coverage}`;
  };
  const canOpenClassSetup = typeof setPage === 'function' && typeof setScheduleOpenSectionId === 'function';
  const openClassSetup = (section) => {
    setScheduleOpenSectionId(section.id);
    setPage('schedules');
  };

  return (
    <>
      <div ref={pageRootRef}>
        <div className="page-header-bar">
          <div className="page-title" ref={pageHeadingRef} tabIndex={-1}>Sections</div>
          <div className="page-sub">Class sections for {schoolYear || 'the school year'}, their advisers, and their student rosters.</div>
        </div>
        <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

        <div className="toolbar">
          <button className="btn btn-primary" onClick={beginCreate}>
            <Plus size={15} style={{ marginRight: 'var(--space-8)' }} />
            Add Section
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Section</th><th>Grade Level</th><th>Adviser</th><th>Capacity</th><th style={{ width: 160 }}>Actions</th></tr>
          </thead>
          <tbody>
            {sectionsLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>Loading sections…</td></tr>
            ) : sectionsError ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>
                Could not load sections. Check your connection and try again.
                <div style={{ marginTop: 'var(--space-12)' }}>
                  <button className="btn btn-ghost" onClick={() => fetchSections()}>Retry</button>
                </div>
              </td></tr>
            ) : sections.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>No sections for {schoolYear} yet.</td></tr>
            ) : sections.map(s => (
              <tr
                key={s.id}
                {...(narrow ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `Open ${s.name}`,
                  onClick: () => setSheetSection(s),
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheetSection(s); }
                  },
                } : {})}
              >
                <td data-cell="identity">
                  <strong>{s.name}</strong>
                  {classSetupReady && <div className="row-sub">{classSetupLine(s)}</div>}
                  {canOpenClassSetup && !narrow && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44, marginTop: 'var(--space-4)' }}
                      aria-label={`Open class setup for ${s.name}`} onClick={() => openClassSetup(s)}>
                      Open class setup
                    </button>
                  )}
                </td>
                <td data-cell="value">{s.grade_level}</td>
                <td data-cell="detail">{adviserName(s.adviser_id)}</td>
                <td data-cell="detail">{s.capacity}</td>
                <td data-cell="actions">
                  <button className="icon-action" aria-label={`Class list for ${s.name}`} title="Class list" onClick={() => openClassList(s)}><Users size={15} aria-hidden="true" /></button>
                  <button className="icon-action" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => beginEdit(s)}><Pencil size={15} aria-hidden="true" /></button>
                  <button className="icon-action archive-action" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => deleteSection(s.id, focusAfterDelete)}><Trash2 size={15} aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <RowSheet
        open={Boolean(sheetSection)}
        title={sheetSection?.name || ''}
        details={[
          ['Grade level', sheetSection?.grade_level],
          ['Adviser', sheetSection ? adviserName(sheetSection.adviser_id) : ''],
          ['Capacity', sheetSection?.capacity],
        ]}
        actions={sheetSection && (
          <>
            <Button variant="ghost" onClick={() => { const s = sheetSection; setSheetSection(null); openClassList(s); }}>Class list</Button>
            {canOpenClassSetup && (
              <Button variant="ghost" onClick={() => { const s = sheetSection; setSheetSection(null); openClassSetup(s); }}>Open class setup</Button>
            )}
            <Button variant="ghost" onClick={() => { const s = sheetSection; setSheetSection(null); beginEdit(s); }}>Edit</Button>
            <Button variant="danger" onClick={() => { const s = sheetSection; setSheetSection(null); deleteSection(s.id, focusAfterDelete); }}>Delete</Button>
          </>
        )}
        onClose={() => setSheetSection(null)}
      />

      <SectionFormDialog />

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
                <div role="status" aria-live="polite" className={full ? 'field-error' : 'form-hint'}>
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
    </>
  );
};

export default SectionsTab;
