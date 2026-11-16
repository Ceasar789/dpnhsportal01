// ============================================
// FILE: src/pages/dashboards/admin/tabs/SubjectsTab.jsx
// The subject registry every schedule, lesson plan and worksheet refers to.
// ============================================

import { useRef, useState } from 'react';
import RowSheet from '../../../../components/ui/RowSheet';
import { useIsNarrow } from '../../../../lib/useMediaQuery';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import SubjectFormDialog from '../shared/SubjectFormDialog';
import Button from '../../../../components/ui/Button';

const SubjectsTab = () => {
  const {
    subjects, subjectsLoading, subjectsError, fetchSubjects, 
    
    openCreateSubject, openEditSubject, deleteSubject,
  } = useAdminContext();


  // UX-061: the required-field rules ran only on press and surfaced as a
  // toast that disappears, never on the field that caused them. The rules
  // themselves are unchanged and still live in saveSubject - what is added
  // here is where the answer is shown. Same shape as TeachingLoadTab.
  // R5. Below the drawer breakpoint the row shows two lines and the rest
  // of the record — and its actions, whose cell is hidden — live in a
  // sheet the row opens.
  const narrow = useIsNarrow();
  const [sheetSubject, setSheetSubject] = useState(null);
  const pageRootRef = useRef(null);
  const pageHeadingRef = useRef(null);
  const focusAfterDelete = () => {
    const nextDelete = pageRootRef.current?.querySelector('.archive-action');
    if (nextDelete) nextDelete.focus();
    else pageHeadingRef.current?.focus();
  };


  return (
    <>
      <div ref={pageRootRef}>
        <div className="page-header-bar">
          <div className="page-title" ref={pageHeadingRef} tabIndex={-1}>Subjects</div>
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
                  <button className="icon-action archive-action" aria-label={`Delete ${s.code}`} title="Delete" onClick={() => deleteSubject(s.id, focusAfterDelete)}><Trash2 size={15} aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <RowSheet
        open={Boolean(sheetSubject)}
        title={sheetSubject?.code || ''}
        details={[
          ['Name', sheetSubject?.name],
          ['Code', sheetSubject?.code],
          ['Status', sheetSubject?.is_active === false ? 'Inactive' : 'Active'],
        ]}
        actions={sheetSubject && (
          <>
            <Button variant="ghost" onClick={() => { const s = sheetSubject; setSheetSubject(null); openEditSubject(s); }}>Edit</Button>
            <Button variant="danger" onClick={() => { const s = sheetSubject; setSheetSubject(null); deleteSubject(s.id, focusAfterDelete); }}>Delete</Button>
          </>
        )}
        onClose={() => setSheetSubject(null)}
      />

      <SubjectFormDialog />
    </>
  );
};

export default SubjectsTab;
