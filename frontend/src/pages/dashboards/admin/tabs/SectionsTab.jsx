// ============================================
// FILE: src/pages/dashboards/admin/tabs/SectionsTab.jsx
// Class sections and their student rosters. A section plus its schedule is
// what makes a teacher's My Students screen show anything.
// ============================================

import React, { useState } from 'react';
import { Pencil, Trash2, Plus, Users, X } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

const SectionsTab = () => {
  const {
    schoolYear, teachers, sections, sectionsLoading, sectionsError, fetchSections,
    sectionModal, editingSection,
    secName, setSecName, secGrade, setSecGrade, secAdviser, setSecAdviser,
    secCapacity, setSecCapacity, secSaving,
    openCreateSection, openEditSection, closeSectionModal, saveSection, deleteSection,
    activeSection, classList, classListLoading, classListError, unassignedStudents,
    openClassList, closeClassList, addStudentToSection, removeStudentFromSection,
  } = useAdminContext();

  const [pick, setPick] = useState('');
  const adviserName = (id) => teachers.find(t => t.id === id)?.name || '—';
  const closeSectionOverlay = (e) => { if (e.target === e.currentTarget) closeSectionModal(); };
  const closeClassListOverlay = (e) => { if (e.target === e.currentTarget) closeClassList(); };

  return (
    <>
      <div>
        <div className="page-header-bar">
          <div className="page-title">Sections</div>
          <div className="page-sub">Class sections for {schoolYear}, their advisers, and their student rosters.</div>
        </div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSection}>
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Section
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Section</th><th>Grade Level</th><th>Adviser</th><th>Capacity</th><th style={{ width: 160 }}>Actions</th></tr>
          </thead>
          <tbody>
            {sectionsLoading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Loading sections…</td></tr>
            ) : sectionsError ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                Could not load sections. Check your connection and try again.
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => fetchSections()}>Retry</button>
                </div>
              </td></tr>
            ) : sections.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No sections for {schoolYear} yet.</td></tr>
            ) : sections.map(s => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td>{s.grade_level}</td>
                <td>{adviserName(s.adviser_id)}</td>
                <td>{s.capacity}</td>
                <td>
                  <button className="icon-action" aria-label={`Class list for ${s.name}`} title="Class list" onClick={() => openClassList(s)}><Users size={15} aria-hidden="true" /></button>
                  <button className="icon-action" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => openEditSection(s)}><Pencil size={15} aria-hidden="true" /></button>
                  <button className="icon-action" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => deleteSection(s.id)}><Trash2 size={15} aria-hidden="true" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {sectionModal && (
        <Modal
          open
          title={editingSection ? 'Edit Section' : 'Add Section'}
          onClose={closeSectionModal}
          // Capacity has a default, so a untouched form is not dirty just
          // because it carries one.
          isDirty={() => Boolean(secName || secGrade || secAdviser)}
          footer={(requestClose) => (
            <>
              <button className="btn btn-ghost" onClick={requestClose}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSection} disabled={secSaving}>
                {editingSection ? 'Update' : 'Create'}
              </button>
            </>
          )}
        >

            <div className="form-row">
              <label className="form-label">Section Name</label>
              <input className="form-input" value={secName} onChange={e => setSecName(e.target.value)} placeholder="e.g. 7-Rizal" />
            </div>

            <div className="form-row">
              <label className="form-label">Grade Level</label>
              <select className="form-input" value={secGrade} onChange={e => setSecGrade(e.target.value)}>
                <option value="">Select…</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Adviser</label>
              <select className="form-input" value={secAdviser} onChange={e => setSecAdviser(e.target.value)}>
                <option value="">No adviser yet</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Capacity</label>
              <input className="form-input" type="number" value={secCapacity} onChange={e => setSecCapacity(e.target.value)} />
            </div>

        </Modal>
      )}

      {activeSection && (
        <Modal
          open
          title={`${activeSection.name} — Class List`}
          onClose={closeClassList}
          footer={(requestClose) => (
            <button className="btn btn-ghost" onClick={requestClose}>Close</button>
          )}
        >

            <div className="form-row" style={{ display: 'flex', gap: 8 }}>
              <select className="form-input" value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Add a student…</option>
                {unassignedStudents.map(s => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!pick} onClick={async () => {
                await addStudentToSection(pick);
                setPick('');
              }}>Add</button>
            </div>

            <div className="table-card"><table>
              <thead><tr><th>#</th><th>Student</th><th>Email</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {classListLoading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>Loading class list…</td></tr>
                ) : classListError ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>
                    Could not load. Check your connection and try again.
                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost" onClick={() => openClassList(activeSection)}>Retry</button>
                    </div>
                  </td></tr>
                ) : classList.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16 }}>No students in this section yet.</td></tr>
                ) : classList.map((c, i) => (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>{c.name}</td>
                    <td>{c.email}</td>
                    <td><button className="icon-action" aria-label={`Remove ${c.name} from this section`} title="Remove" onClick={() => removeStudentFromSection(c.id)}><X size={15} aria-hidden="true" /></button></td>
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
