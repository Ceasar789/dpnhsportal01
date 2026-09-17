// ============================================
// FILE: src/pages/dashboards/admin/tabs/SubjectsTab.jsx
// The subject registry every schedule, lesson plan and worksheet refers to.
// ============================================

import React from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../AdminContext';

const SubjectsTab = () => {
  const {
    subjects, subjectsLoading, subjectsError, fetchSubjects, subjectModal, editingSubject,
    sName, setSName, sCode, setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
  } = useAdminContext();

  const closeSubjectOverlay = (e) => { if (e.target === e.currentTarget) closeSubjectModal(); };

  return (
    <>
      <div>
        <div className="page-header-bar">
          <div className="page-title">Subjects</div>
          <div className="page-sub">The subjects taught at this school. Schedules and lesson plans refer to this list.</div>
        </div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSubject}>
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Subject
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Code</th><th>Subject</th><th>Status</th><th style={{ width: 110 }}>Actions</th></tr>
          </thead>
          <tbody>
            {subjectsLoading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>Loading subjects…</td></tr>
            ) : subjectsError ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>
                Could not load subjects. Check your connection and try again.
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => fetchSubjects()}>Retry</button>
                </div>
              </td></tr>
            ) : subjects.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>No subjects yet. Add the first one.</td></tr>
            ) : subjects.map(s => (
              <tr key={s.id}>
                <td><strong>{s.code}</strong></td>
                <td>{s.name}</td>
                <td>{s.is_active === false ? 'Inactive' : 'Active'}</td>
                <td>
                  <button className="icon-action" title="Edit" onClick={() => openEditSubject(s)}><Pencil size={15} /></button>
                  <button className="icon-action" title="Delete" onClick={() => deleteSubject(s.id)}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {subjectModal && (
        <div className="modal-overlay open" onClick={closeSubjectOverlay}>
          <div className="modal">
            <div className="modal-title">{editingSubject ? 'Edit Subject' : 'Add Subject'}</div>

            <div className="form-row">
              <label className="form-label">Subject Name</label>
              <input className="form-input" value={sName} onChange={e => setSName(e.target.value)} placeholder="e.g. Mathematics" />
            </div>

            <div className="form-row">
              <label className="form-label">Code</label>
              <input className="form-input" value={sCode} onChange={e => setSCode(e.target.value)} placeholder="e.g. MATH" />
            </div>

            <div className="form-row">
              <label className="form-label">Status</label>
              <select className="form-input" value={sActive ? 'active' : 'inactive'} onChange={e => setSActive(e.target.value === 'active')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeSubjectModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSubject} disabled={sSaving}>
                {editingSubject ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubjectsTab;
