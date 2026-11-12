// ============================================
// FILE: src/components/clarity/admin/ClarityAdminSubjectsTab.jsx
// The Admin Subjects tab in Clarity (final design): one card with a table of
// subjects and the grade levels each one runs in. Data comes only from
// useAdminContext(): subjects, and the teaching load (teacher_subjects for the
// school year) for the grade cells and the teacher count. There is no
// department column: the subjects table has no department.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/SubjectsTab.jsx
// (parity-tested in ClarityAdminSubjectsTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - the validation state (tried / missingName / missingCode), :39-42
//   - focusAfterDelete, :31-37
//   - the Add/Edit Subject dialog, :119-158 (the shared Modal, unchanged, so
//     the discard-changes guard, focus return and stacking are the same)
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { GRADE_LEVELS, normalizeGradeLevel } from '../../../lib/academicRules';

// Grade 7 to 10 always (the design's columns); a higher grade only when the
// teaching load really uses it.
const BASE_GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
const shortGrade = grade => `G${grade.replace(/\D/g, '')}`;

const ClarityAdminSubjectsTab = () => {
  const {
    // Defaults only for a context that has not provided these (the real one always does).
    subjects = [], subjectsLoading, subjectsError, fetchSubjects, subjectModal, editingSubject,
    sName = '', setSName, sCode = '', setSCode, sActive, setSActive, sSaving,
    openCreateSubject, openEditSubject, closeSubjectModal, saveSubject, deleteSubject,
    teachingLoad = [], teachingLoadLoading = false, teachingLoadError = null,
  } = useAdminContext();

  // TEMPORARY copy (SubjectsTab.jsx:31-37).
  const pageRootRef = useRef(null);
  const pageHeadingRef = useRef(null);
  const focusAfterDelete = () => {
    const nextDelete = pageRootRef.current?.querySelector('.archive-action');
    if (nextDelete) nextDelete.focus();
    else pageHeadingRef.current?.focus();
  };

  // TEMPORARY copy (SubjectsTab.jsx:39-42).
  const [tried, setTried] = useState(false);
  // Kept word-for-word from the classic tab (which has the same lint finding at
  // SubjectsTab.jsx:40); changing the pattern is a follow-up for both copies.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTried(false); }, [subjectModal]);
  const missingName = tried && !sName.trim();
  const missingCode = tried && !sCode.trim();

  // The grade cells and teacher counts, only when the teaching load loaded.
  const loadReady = !teachingLoadLoading && !teachingLoadError && Array.isArray(teachingLoad);
  const loadGrades = loadReady ? teachingLoad.map(row => normalizeGradeLevel(row.grade_level)).filter(Boolean) : [];
  const grades = GRADE_LEVELS.filter(g => BASE_GRADES.includes(g) || loadGrades.includes(g));
  const runsIn = (subjectId, grade) => teachingLoad.some(row => row.subject_id === subjectId && normalizeGradeLevel(row.grade_level) === grade);
  const teacherCount = subjectId => new Set(teachingLoad.filter(row => row.subject_id === subjectId).map(row => row.teacher_id)).size;
  const columns = 3 + (loadReady ? grades.length + 1 : 0);

  return (
    <>
      <div ref={pageRootRef} className="x-subj">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1" ref={pageHeadingRef} tabIndex={-1}>Subjects</h1>
            <p className="x-sub">Which subjects run in which grade level.</p>
          </div>
          <div className="x-act">
            <button type="button" className="x-btn pri" onClick={openCreateSubject}>
              <Plus size={16} aria-hidden="true" /> Add subject
            </button>
          </div>
        </div>

        <div className="x-card x-tw">
          <table className="x-table">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                {loadReady && grades.map(g => (
                  <th scope="col" key={g} className="x-sub-g"><abbr title={g}>{shortGrade(g)}</abbr></th>
                ))}
                {loadReady && <th scope="col">Teachers</th>}
                <th scope="col">Status</th>
                <th scope="col"><span className="x-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {subjectsLoading ? (
                <tr><td colSpan={columns} className="x-sub-msg">Loading subjects…</td></tr>
              ) : subjectsError ? (
                <tr><td colSpan={columns} className="x-sub-msg">
                  Could not load subjects. Check your connection and try again.
                  <div style={{ marginTop: 12 }}>
                    <button type="button" className="x-btn" onClick={() => fetchSubjects()}>Retry</button>
                  </div>
                </td></tr>
              ) : subjects.length === 0 ? (
                <tr><td colSpan={columns} className="x-sub-msg">No subjects yet. Add the first one.</td></tr>
              ) : subjects.map(s => (
                <tr key={s.id}>
                  <td>
                    <span className="nm">{s.name}<span>{s.code}</span></span>
                  </td>
                  {loadReady && grades.map(g => (
                    <td key={g} className="x-sub-g">
                      {runsIn(s.id, g)
                        ? <span className="x-sub-cell on"><span aria-hidden="true" className="x-sub-dot" /><span className="x-sr">Runs in {g}</span></span>
                        : <span className="x-sub-cell"><span aria-hidden="true">—</span><span className="x-sr">Not in {g}</span></span>}
                    </td>
                  ))}
                  {loadReady && <td>{teacherCount(s.id)}</td>}
                  <td>
                    <span className={s.is_active === false ? 'x-badge' : 'x-badge ok'}>{s.is_active === false ? 'Inactive' : 'Active'}</span>
                  </td>
                  <td>
                    <div className="x-rowact">
                      <button type="button" className="x-iconbtn" aria-label={`Edit ${s.code}`} title="Edit" onClick={() => openEditSubject(s)}><Pencil size={15} aria-hidden="true" /></button>
                      <button type="button" className="x-iconbtn archive-action" aria-label={`Delete ${s.code}`} title="Delete" onClick={() => deleteSubject(s.id, focusAfterDelete)}><Trash2 size={15} aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TEMPORARY copy (SubjectsTab.jsx:119-158). */}
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

export default ClarityAdminSubjectsTab;
