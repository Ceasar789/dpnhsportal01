// ============================================
// FILE: src/pages/dashboards/admin/tabs/SectionsTab.jsx
// Class sections and their student rosters. A section plus its schedule is
// what makes a teacher's My Students screen show anything.
// ============================================

import { useEffect, useState } from 'react';
import RowSheet from '../../../../components/ui/RowSheet';
import { useIsNarrow } from '../../../../lib/useMediaQuery';
import { Pencil, Trash2, Plus, Users, X } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { focusAfterRemoval } from '../../../../lib/focusAfterRemoval';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';
import Button from '../../../../components/ui/Button';

const SectionsTab = () => {
  const {
    schoolYear, teachers, sections, sectionsLoading, sectionsError, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secSaving,
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

  const [adding, setAdding] = useState(false);

  // UX-062: two of these four fields are required and nothing said which.
  // The rules are unchanged and still live in saveSection; this is where
  // the answer is shown.
  const [tried, setTried] = useState(false);
  useEffect(() => { setTried(false); }, [sectionModal]);
  const missingName = tried && !secName.trim();
  const missingGrade = tried && !secGrade;
  const adviserName = (id) => teachers.find(t => t.id === id)?.name || '—';

  return (
    <>
      <div>
        <div className="page-header-bar">
          <div className="page-title">Sections</div>
          <div className="page-sub">Class sections for {schoolYear}, their advisers, and their student rosters.</div>
        </div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSection}>
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
                  <button className="icon-action" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => openEditSection(s)}><Pencil size={15} aria-hidden="true" /></button>
                  <button className="icon-action archive-action" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => deleteSection(s.id)}><Trash2 size={15} aria-hidden="true" /></button>
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
            <Button variant="ghost" onClick={() => { const s = sheetSection; setSheetSection(null); openEditSection(s); }}>Edit</Button>
            <Button variant="danger" onClick={() => { const s = sheetSection; setSheetSection(null); deleteSection(s.id); }}>Delete</Button>
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
              <Button onClick={() => { setTried(true); saveSection(); }} busy={secSaving} busyLabel={editingSection ? 'Updating…' : 'Creating…'}>
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
              <select id="sections-adviser" className="form-input" value={secAdviser} onChange={e => setSecAdviser(e.target.value)}>
                <option value="">No adviser yet</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="sections-capacity">Capacity</label>
              <input id="sections-capacity" className="form-input" type="number" value={secCapacity} onChange={e => setSecCapacity(e.target.value)} />
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

            <div className="form-row" style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <select className="form-input" value={pick} onChange={e => setPick(e.target.value)}>
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
                    await addStudentToSection(pick);
                    setPick('');
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
                      onClick={(e) => {
                        // Losing focus here drops the user on the body with
                        // a modal still open over it.
                        const settle = focusAfterRemoval(
                          e.currentTarget, 'table', '.icon-action', '.modal-title',
                        );
                        removeStudentFromSection(c.id);
                        settle();
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
