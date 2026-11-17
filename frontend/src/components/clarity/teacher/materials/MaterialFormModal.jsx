// ============================================
// FILE: src/components/clarity/teacher/materials/MaterialFormModal.jsx
// Learning Materials (M2): the Add / Edit dialog and the Delete confirm.
// ClarityModal + useDialogSafety: unsaved-changes guard, busy while saving,
// no double submit, close disabled while saving. Subject and grade come only
// from the teacher's own teacher_subjects pairs.
// ============================================

import { useId, useMemo, useRef, useState } from 'react';
import ClarityModal from '../../ui/ClarityModal';
import TeacherFilePicker from '../../../../pages/dashboards/teacher/shared/TeacherFilePicker';
import useDialogSafety from '../../../../pages/dashboards/teacher/worksheets/useDialogSafety';
import {
  DESCRIPTION_MAX, MATERIAL_ACCEPT, MATERIAL_FILE_GUIDANCE, TITLE_MAX,
  descriptionProblem, draftFromRow, draftIsDirty, emptyDraft, fileProblem, formatBytes, linkProblem, rowFields, titleProblem, typeLabel,
} from './materialRules';
import { createFileMaterial, createLinkMaterial, deleteMaterial, updateMaterial } from './materialsApi';
import { NO_TEACHING_LOAD_MESSAGE, isRetiredGradeLevel } from '../../../../lib/academicRules';
import FormErrorSummary from '../../../ui/form/FormErrorSummary';

const BUSY_LABEL = { uploading: 'Uploading…', saving: 'Saving…', deleting: 'Deleting…' };

// The teacher's subjects, plus the row's own subject and grade when they are
// no longer in this year's load (so an edit never drops them silently).
const choicesFor = (subjects, row) => {
  const list = subjects.map(s => ({ ...s, grades: [...s.grades] }));
  if (row?.subject_id && row.subjects?.name) {
    let own = list.find(s => s.id === row.subject_id);
    if (!own) { own = { id: row.subject_id, name: row.subjects.name, grades: [] }; list.push(own); }
    if (row.grade_level && !own.grades.includes(row.grade_level)) own.grades.push(row.grade_level);
  }
  return list;
};

// U5: every problem with a draft, each on its field, in the order the fields appear
// (the same rules as materialRules.draftProblem, which is unchanged).
const materialProblems = (draft, { editing = false, ids }) => [
  [ids.url, draft.kind === 'link' ? linkProblem(draft.url) : null],
  ['material-file', draft.kind === 'file' && !editing ? fileProblem(draft.file) : null],
  [ids.title, titleProblem(draft.title)],
  [ids.description, descriptionProblem(draft.description)],
  [ids.grade, draft.subjectId && isRetiredGradeLevel(draft.gradeLevel) ? 'Choose a grade level from Grade 7 to Grade 10.' : null],
].filter(([, message]) => message).map(([fieldId, message]) => ({ fieldId, message }));

const MaterialFormModal = ({ mode, row = null, teacherId, subjects, subjectsState, onRetrySubjects, onSaved, onDeleted, onClose }) => {
  const editing = mode === 'edit';
  const [baseline] = useState(() => (editing ? draftFromRow(row) : emptyDraft()));
  const [draft, setDraft] = useState(baseline);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busyRef = useRef(false);
  const formId = useId();
  const ids = { title: useId(), description: useId(), subject: useId(), grade: useId(), url: useId(), error: useId() };

  const dirty = draftIsDirty(draft, baseline);
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending: Boolean(busy), onClose, discardMessage: 'Discard this material?', leaveMessage: 'Discard this material?',
  });
  const choices = useMemo(() => choicesFor(subjects, editing ? row : null), [subjects, editing, row]);
  const grades = choices.find(s => s.id === draft.subjectId)?.grades ?? [];
  const update = changes => setDraft(current => ({ ...current, ...changes }));
  // After a failed save the problems are re-checked on every change, so a fixed field clears at once.
  const problems = attempt ? materialProblems(draft, { editing, ids }) : [];
  const problemFor = id => problems.find(p => p.fieldId === id)?.message;
  const errorProps = id => (problemFor(id) ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-error` } : {});
  const errorLine = id => (problemFor(id) ? <p className="fk-error" id={`${id}-error`}>{problemFor(id)}</p> : null);

  const run = async (kind, action) => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(kind);
    setError('');
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  const save = async (event) => {
    event?.preventDefault();
    if (busyRef.current) return;
    if (materialProblems(draft, { editing, ids }).length) { setAttempt(a => a + 1); return; }
    const fields = rowFields(draft);
    const result = await run(!editing && draft.kind === 'file' ? 'uploading' : 'saving', () => (editing
      ? updateMaterial({ row, fields, url: draft.url })
      : draft.kind === 'file'
        ? createFileMaterial({ teacherId, file: draft.file, fields })
        : createLinkMaterial({ teacherId, url: draft.url, fields })));
    if (!result) return;
    if (!result.ok) { setError(result.error); return; }
    onSaved(result.row, editing);
  };

  const remove = async () => {
    const result = await run('deleting', () => deleteMaterial({ row }));
    if (!result) return;
    if (!result.ok) { setConfirmDelete(false); setError(result.error); return; }
    onDeleted(row, result.orphan);
  };

  const subjectHint = subjectsState === 'loading' ? 'Loading your subjects…'
    : subjectsState === 'error' ? 'Your subjects could not be loaded.'
      : choices.length === 0 ? NO_TEACHING_LOAD_MESSAGE : '';

  return (
    <>
      <ClarityModal
        title={editing ? 'Edit material' : 'Add material'}
        onClose={() => requestClose()}
        closeDisabled={Boolean(busy)}
        footer={(
          <div className="x-tlm-mf">
            {editing && (
              <button type="button" className="x-btn dng x-tlm-del" disabled={Boolean(busy)} onClick={() => setConfirmDelete(true)}>Delete</button>
            )}
            <button type="button" className="x-btn" disabled={Boolean(busy)} onClick={() => requestClose()}>Cancel</button>
            <button type="submit" form={formId} className="x-btn pri" aria-busy={busy ? 'true' : undefined} aria-disabled={busy ? 'true' : undefined}>
              {BUSY_LABEL[busy] || (editing ? 'Save changes' : 'Add material')}
            </button>
          </div>
        )}
      >
        <form id={formId} noValidate onSubmit={save} aria-describedby={error ? ids.error : undefined}>
          {error && <p id={ids.error} role="alert" className="x-tlm-err">{error}</p>}
          {busyNotice && <p role="status" className="x-cs">{busyNotice}</p>}
          <FormErrorSummary id="material-form-summary" errors={problems} attempt={attempt} focusTo="first-field" />

          {!editing && (
            <div className="x-seg x-tlm-kind" role="group" aria-label="Material type">
              {[['file', 'File'], ['link', 'Link']].map(([kind, label]) => (
                <button key={kind} type="button" className={draft.kind === kind ? 'on' : undefined} aria-pressed={draft.kind === kind}
                  disabled={Boolean(busy)} onClick={() => update({ kind })}>{label}</button>
              ))}
            </div>
          )}

          {draft.kind === 'file' && !editing && (
            <div className="x-field x-tlm-file">
              <TeacherFilePicker id="material-file" accept={MATERIAL_ACCEPT} guidance={MATERIAL_FILE_GUIDANCE} file={draft.file}
                disabled={Boolean(busy)} onSelect={file => update({ file })} onRemove={() => update({ file: null })} error={problemFor('material-file')} />
            </div>
          )}
          {draft.kind === 'file' && editing && (
            <div className="x-field">
              <p className="x-label">File</p>
              <p className="x-tlm-filename">{[row.file_name, typeLabel(row), formatBytes(row.size_bytes)].filter(Boolean).join(' · ')}</p>
            </div>
          )}
          {draft.kind === 'link' && (
            <div className="x-field">
              <label className="x-label" htmlFor={ids.url}>Link</label>
              <input id={ids.url} className="x-input" type="url" inputMode="url" autoComplete="off" placeholder="https://"
                value={draft.url} disabled={Boolean(busy)} onChange={e => update({ url: e.target.value })} {...errorProps(ids.url)} />
              <p className="x-hint">Starts with http:// or https://</p>
              {errorLine(ids.url)}
            </div>
          )}

          <div className="x-field">
            <label className="x-label" htmlFor={ids.title}>Title</label>
            <input id={ids.title} className="x-input" value={draft.title} maxLength={TITLE_MAX} autoComplete="off" required
              disabled={Boolean(busy)} onChange={e => update({ title: e.target.value })} {...errorProps(ids.title)} />
            {errorLine(ids.title)}
          </div>
          <div className="x-field">
            <label className="x-label" htmlFor={ids.description}>Description <span className="x-tlm-opt">(optional)</span></label>
            <textarea id={ids.description} className="x-input x-tlm-desc-input" rows={4} value={draft.description} maxLength={DESCRIPTION_MAX}
              disabled={Boolean(busy)} onChange={e => update({ description: e.target.value })} {...errorProps(ids.description)} />
            {errorLine(ids.description)}
          </div>

          <div className="x-tlm-row">
            <div className="x-field">
              <label className="x-label" htmlFor={ids.subject}>Subject <span className="x-tlm-opt">(optional)</span></label>
              <select id={ids.subject} className="x-select" value={draft.subjectId} disabled={Boolean(busy) || choices.length === 0}
                onChange={e => update({ subjectId: e.target.value, gradeLevel: '' })}>
                <option value="">No subject</option>
                {choices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="x-field">
              <label className="x-label" htmlFor={ids.grade}>Grade <span className="x-tlm-opt">(optional)</span></label>
              <select id={ids.grade} className="x-select" value={draft.gradeLevel} disabled={Boolean(busy) || !draft.subjectId || grades.length === 0}
                onChange={e => update({ gradeLevel: e.target.value })} {...errorProps(ids.grade)}>
                <option value="">No grade</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {errorLine(ids.grade)}
            </div>
          </div>
          {subjectHint && (
            <p className="x-hint x-tlm-subjhint" role={subjectsState === 'loading' ? 'status' : undefined}>
              {subjectHint}
              {subjectsState === 'error' && onRetrySubjects && (
                <> <button type="button" className="x-btn gh x-tlm-retry" onClick={onRetrySubjects}>Retry</button></>
              )}
            </p>
          )}
        </form>
        {routeBlocker}
      </ClarityModal>

      {confirmDelete && (
        <ClarityModal
          title="Delete this material?"
          description={`“${row.title}” will be removed from your learning materials${row.kind === 'file' ? ', together with its file' : ''}. This cannot be undone.`}
          onClose={() => { if (!busy) setConfirmDelete(false); }}
          closeDisabled={Boolean(busy)}
          footer={(
            <div className="x-tlm-mf">
              <button type="button" className="x-btn" disabled={Boolean(busy)} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className="x-btn dng" disabled={Boolean(busy)} aria-busy={busy === 'deleting' ? 'true' : undefined} onClick={remove}>
                {busy === 'deleting' ? 'Deleting…' : 'Delete material'}
              </button>
            </div>
          )}
        />
      )}
    </>
  );
};

export default MaterialFormModal;
