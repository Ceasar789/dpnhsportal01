// ============================================
// FILE: src/pages/dashboards/admin/tabs/SectionsTab.jsx
// Class sections and their student rosters. A section plus its schedule is
// what makes a teacher's My Students screen show anything.
// ============================================

import { useRef, useState } from 'react';
import RowSheet from '../../../../components/ui/RowSheet';
import { useIsNarrow } from '../../../../lib/useMediaQuery';
import { Pencil, Trash2, Plus, Users, X } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { focusAfterRemoval } from '../../../../lib/focusAfterRemoval';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';
import Button from '../../../../components/ui/Button';
import { isActiveSectionAdviser, validateSectionCapacity } from '../shared/sectionsValidation';

const SectionsTab = () => {
  const {
    schoolYear, teachers, sections, sectionsLoading, sectionsError, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secCapacityError, setSecCapacityError,
    secAdviserError, setSecAdviserError, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList, classListLoading, classListError, unassignedStudents,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
    showToast,
  } = useAdminContext();

  const [pick, setPick] = useState('');
  // UX-052: adding a student is two round trips. Without this the press
  // produces no visible change at all until the roster reloads.
  const narrow = useIsNarrow();
  const [sheetSection, setSheetSection] = useState(null);
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

  return (
    <>
      <div ref={pageRootRef}>
        <div className="page-header-bar">
          <div className="page-title" ref={pageHeadingRef} tabIndex={-1}>Sections</div>
          <div className="page-sub">Class sections for {schoolYear}, their advisers, and their student rosters.</div>
        </div>

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
                <td data-cell="identity"><strong>{s.name}</strong></td>
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
            <Button variant="ghost" onClick={() => { const s = sheetSection; setSheetSection(null); beginEdit(s); }}>Edit</Button>
            <Button variant="danger" onClick={() => { const s = sheetSection; setSheetSection(null); deleteSection(s.id, focusAfterDelete); }}>Delete</Button>
          </>
        )}
        onClose={() => setSheetSection(null)}
      />

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
                aria-invalid={Boolean(secAdviserError) || undefined} aria-describedby={secAdviserError ? 'sections-adviser-error' : undefined}>
                <option value="">No adviser yet</option>
                {existingAdviserIsIneligible && (
                  <option value={existingAdviser.id} disabled>
                    {existingAdviser.name || existingAdviser.email} ({existingAdviser.status || 'inactive'} — existing adviser)
                  </option>
                )}
                {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
              {secAdviserError && <div className="field-error" id="sections-adviser-error">{secAdviserError}</div>}
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
                  /* No sheet here, deliberately. This table is already
                     inside a dialog, and opening a second overlay on top
                     of the first to reveal one action is worse than
                     keeping that action on the row. Two lines, actions
                     inline. */
                  <tr key={c.id}>
                    <td data-cell="detail">{i + 1}</td>
                    <td data-cell="identity">{c.name}</td>
                    <td data-cell="value">{c.email}</td>
                    <td data-cell="actions-inline"><button
                      className="icon-action"
                      aria-label={`Remove ${c.name} from this section`}
                      title="Remove"
                      disabled={removingStudentId === c.id}
                      aria-busy={removingStudentId === c.id || undefined}
                      onClick={async (e) => {
                        // Losing focus here drops the user on the body with
                        // a modal still open over it.
                        const settle = focusAfterRemoval(
                          e.currentTarget, 'table', '.icon-action', '.modal-title',
                        );
                        if (removingStudentRef.current) return;
                        removingStudentRef.current = true;
                        setRemovingStudentId(c.id);
                        try {
                          if (await removeStudentFromSection(c.id)) settle();
                        } finally {
                          removingStudentRef.current = false;
                          setRemovingStudentId(null);
                        }
                      }}
                    ><X size={15} aria-hidden="true" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>

        </Modal>
      )}
    </>
  );
};

export default SectionsTab;
