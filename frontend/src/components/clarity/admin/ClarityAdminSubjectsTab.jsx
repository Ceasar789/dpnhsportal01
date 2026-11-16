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
//   - focusAfterDelete, :31-37
//   - U4: the Add/Edit Subject dialog is now the shared SubjectFormDialog
//     (pages/dashboards/admin/shared), rendered by this tab and the classic one
// ============================================

import { useRef } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import SubjectFormDialog from '../../../pages/dashboards/admin/shared/SubjectFormDialog';
import { GRADE_LEVELS, isRetiredGradeLevel, normalizeGradeLevel } from '../../../lib/academicRules';
import { Skeleton, SkeletonTable } from '../../ui/Skeleton';

// One column per offered grade (Grade 7 to 10). A Grade 11/12 row left in the
// load never adds a column or counts a teacher.
const shortGrade = grade => `G${grade.replace(/\D/g, '')}`;

const ClarityAdminSubjectsTab = () => {
  const {
    // Defaults only for a context that has not provided these (the real one always does).
    subjects = [], subjectsLoading, subjectsError, fetchSubjects, 
    
    openCreateSubject, openEditSubject, deleteSubject,
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


  // The grade cells and teacher counts, only when the teaching load loaded.
  const loadReady = !teachingLoadLoading && !teachingLoadError && Array.isArray(teachingLoad);
  const grades = GRADE_LEVELS;
  const runsIn = (subjectId, grade) => teachingLoad.some(row => row.subject_id === subjectId && normalizeGradeLevel(row.grade_level) === grade);
  const teacherCount = subjectId => new Set(teachingLoad.filter(row => row.subject_id === subjectId && !isRetiredGradeLevel(row.grade_level)).map(row => row.teacher_id)).size;
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
                <>
                  <tr><td colSpan={columns} className="x-sr">Loading subjects…</td></tr>
                  <SkeletonTable rows={5} cols={columns} cell={c => (c === 0 ? (
                    <span className="nm"><Skeleton inline h="0.8em" w={140} /><span><Skeleton inline h="0.8em" w={48} /></span></span>
                  ) : c === columns - 1 ? (
                    <div className="x-rowact"><span className="x-iconbtn"><Skeleton w="100%" h="100%" /></span><span className="x-iconbtn"><Skeleton w="100%" h="100%" /></span></div>
                  ) : <Skeleton inline h={22} w={56} className="sk-round" />)} />
                </>
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

      <SubjectFormDialog />
    </>
  );
};

export default ClarityAdminSubjectsTab;
