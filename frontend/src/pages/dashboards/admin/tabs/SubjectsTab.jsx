// ============================================
// FILE: src/pages/dashboards/admin/tabs/SubjectsTab.jsx
// The subject registry every schedule, lesson plan and worksheet refers to.
// ============================================

import React, { useEffect, useState } from 'react';
import RowSheet from '../../../../components/ui/RowSheet';
import { useIsNarrow } from '../../../../lib/useMediaQuery';
import { Pencil, Trash2, Plus } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { useAdminContext } from '../AdminContext';
import Button from '../../../../components/ui/Button';

const SubjectsTab = () => {
  const {
    subjects, subjectsLoading, subjectsError, fetchSubjects, subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
  } = useAdminContext();

  const closeSubjectOverlay = (e) => { if (e.target === e.currentTarget) closeSubjectModal(); };

  // UX-061: the required-field rules ran only on press and surfaced as a
  // toast that disappears, never on the field that caused them. The rules
  // themselves are unchanged and still live in saveSubject - what is added
  // here is where the answer is shown. Same shape as TeachingLoadTab.
  // R5. Below the drawer breakpoint the row shows two lines and the rest
  // of the record — and its actions, whose cell is hidden — live in a
  // sheet the row opens.
  const narrow = useIsNarrow();
  const [sheetSubject, setSheetSubject] = useState(null);

  const [tried, setTried] = useState(false);
  useEffect(() => { setTried(false); }, [subjectModal]);
  const missingName = tried && !sName.trim();
  const missingCode = tried && !sCode.trim();

  return (
    <>
      <div>
        <div className="page-header-bar">
          <div className="page-title">Subjects</div>
          <div className="page-sub">The subjects taught at this school. Schedules and lesson plans refer to this list.</div>
        </div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSubject}>
            <Plus size={15} style={{ marginRight: 'var(--space-8)' }} />
            Add Subject
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Code</th><th>Subject</th><th>Status</th><th style={{ width: 110 }}>Actions</th></tr>
          </thead>
          <tbody>
            {subjectsLoading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>Loading subjects…</td></tr>
            ) : subjectsError ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>
                Could not load subjects. Check your connection and try again.
                <div style={{ marginTop: 'var(--space-12)' }}>
                  <button className="btn btn-ghost" onClick={() => fetchSubjects()}>Retry</button>
                </div>
              </td></tr>
            ) : subjects.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>No subjects yet. Add the first one.</td></tr>
            ) : subjects.map(s => (
              <tr
                key={s.id}
                {...(narrow ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': `Open ${s.code}`,
                  onClick: () => setSheetSubject(s),
                  // A row that answers a tap must answer the keyboard too.
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheetSubject(s); }
                  },
                } : {})}
              >
                <td data-cell="identity"><strong>{s.code}</strong></td>
                <td data-cell="value">{s.name}</td>
                <td data-cell="state">{s.is_active === false ? 'Inactive' : 'Active'}</td>
                <td data-cell="actions">
                  <button className="icon-action" aria-label={`Edit ${s.code}`} title="Edit" onClick={() => openEditSubject(s)}><Pencil size={15} aria-hidden="true" /></button>
                  <button className="icon-action archive-action" aria-label={`Delete ${s.code}`} title="Delete" onClick={() => deleteSubject(s.id)}><Trash2 size={15} aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <RowSheet
        open={Boolean(sheetSubject)}
        title={sheetSubject?.code || ''}
        subtitle={sheetSubject?.name}
        details={[
          ['Name', sheetSubject?.name],
          ['Status', sheetSubject?.is_active === false ? 'Inactive' : 'Active'],
        ]}
        actions={sheetSubject && (
          <>
            <Button variant="ghost" onClick={() => { const s = sheetSubject; setSheetSubject(null); openEditSubject(s); }}>Edit</Button>
            <Button variant="danger" onClick={() => { const s = sheetSubject; setSheetSubject(null); deleteSubject(s.id); }}>Delete</Button>
          </>
        )}
        onClose={() => setSheetSubject(null)}
      />

      {subjectModal && (
        <Modal
          open
          title={editingSubject ? 'Edit Subject' : 'Add Subject'}
          onClose={closeSubjectModal}
          footer={(requestClose) => (
            <>
              <Button variant="ghost" onClick={requestClose}>Cancel</Button>
              <Button onClick={() => { setTried(true); saveSubject(); }} busy={sSaving} busyLabel={editingSubject ? 'Updating…' : 'Creating…'}>
                {editingSubject ? 'Update' : 'Create'}
              </Button>
            </>
          )}
        >

            <div className="form-legend"><span className="form-req" aria-hidden="true">*</span> Required</div>

            <div className="form-row">
              <label className="form-label" htmlFor="subjects-subject-name">Subject Name<span className="form-req" aria-hidden="true">*</span></label>
              <input id="subjects-subject-name" className={`form-input${missingName ? ' is-invalid' : ''}`} value={sName} onChange={e => setSName(e.target.value)} placeholder="e.g. Mathematics"
                aria-required="true" aria-invalid={missingName || undefined} aria-describedby={missingName ? 'subjects-subject-name-error' : undefined} />
              {missingName && <div className="field-error" id="subjects-subject-name-error">Subject name is required.</div>}
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="subjects-code">Code<span className="form-req" aria-hidden="true">*</span></label>
              <input id="subjects-code" className={`form-input${missingCode ? ' is-invalid' : ''}`} value={sCode} onChange={e => setSCode(e.target.value)} placeholder="e.g. MATH"
                aria-required="true" aria-invalid={missingCode || undefined} aria-describedby={missingCode ? 'subjects-code-error' : undefined} />
              {missingCode && <div className="field-error" id="subjects-code-error">Subject code is required.</div>}
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="subjects-status">Status</label>
              <select id="subjects-status" className="form-input" value={sActive ? 'active' : 'inactive'} onChange={e => setSActive(e.target.value === 'active')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

        </Modal>
      )}
    </>
  );
};

export default SubjectsTab;
