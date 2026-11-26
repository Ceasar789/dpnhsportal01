// ============================================
// FILE: src/components/clarity/teacher/materials/MaterialFormModal.jsx
// Learning Materials (M2): the Add / Edit dialog and the Delete confirm.
// ClarityModal + useDialogSafety: unsaved-changes guard, busy while saving,
// no double submit, close disabled while saving.
// U-PDF-T-FIX-B: no Subject or Grade. Add material has "Grade and section
// (optional)" (the teacher's real classes); saving creates the material, then
// shares it with that class. Edit shows "Shared with: ..." read-only.
// ============================================

import { useId, useRef, useState } from 'react';
import ClarityModal from '../../ui/ClarityModal';
import TeacherFilePicker from '../../../../pages/dashboards/teacher/shared/TeacherFilePicker';
import useDialogSafety from '../../../../pages/dashboards/teacher/worksheets/useDialogSafety';
import {
  DESCRIPTION_MAX, MATERIAL_ACCEPT, MATERIAL_FILE_GUIDANCE, TITLE_MAX,
  classLabel, classesByGrade, createFields, descriptionProblem, draftFromRow, draftIsDirty, emptyDraft, fileProblem, formatBytes, linkProblem,
  rowFields, sharedWithLine, titleProblem, typeLabel,
} from './materialRules';
import { createFileMaterial, createLinkMaterial, deleteMaterial, shareMaterialToClass, updateMaterial } from './materialsApi';
import { NO_TEACHING_LOAD_MESSAGE } from '../../../../lib/academicRules';
import FormErrorSummary from '../../../ui/form/FormErrorSummary';
import ToggleChoice from '../../../ui/form/ToggleChoice';

const BUSY_LABEL = { uploading: 'Uploading…', saving: 'Saving…', deleting: 'Deleting…' };
const KINDS = [{ value: 'file', label: 'File' }, { value: 'link', label: 'Link' }];

export const CLASS_HELP = 'Pick one of your classes, for example Grade 7 — Rizal, and only its students can see this material. '
  + 'Leave it empty to keep it private. You can repost it to other classes later.';
export const SHARE_FAILED_NOTE = "Saved, but couldn't share it with the class. You can repost it.";

// U5: every problem with a draft, each on its field, in the order the fields appear
// (the same rules as materialRules.draftProblem, which is unchanged).
const materialProblems = (draft, { editing = false, ids }) => [
  [ids.url, draft.kind === 'link' ? linkProblem(draft.url) : null],
  ['material-file', draft.kind === 'file' && !editing ? fileProblem(draft.file) : null],
  [ids.title, titleProblem(draft.title)],
  [ids.description, descriptionProblem(draft.description)],
].filter(([, message]) => message).map(([fieldId, message]) => ({ fieldId, message }));

const MaterialFormModal = ({
  mode, row = null, teacherId, classes = [], classesState = 'ready', onRetryClasses, sharedWith = [], onSaved, onDeleted, onClose,
}) => {
  const editing = mode === 'edit';
  const [baseline] = useState(() => (editing ? draftFromRow(row) : emptyDraft()));
  const [draft, setDraft] = useState(baseline);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busyRef = useRef(false);
  const formId = useId();
  const ids = { title: useId(), description: useId(), section: useId(), url: useId(), error: useId() };

  const dirty = draftIsDirty(draft, baseline);
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending: Boolean(busy), onClose, discardMessage: 'Discard this material?', leaveMessage: 'Discard this material?',
  });
  const groups = classesByGrade(classes);
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
    const section = editing ? null : classes.find(s => s.id === draft.sectionId) || null;
    const fields = editing ? rowFields(draft) : createFields(draft, section);
    const result = await run(!editing && draft.kind === 'file' ? 'uploading' : 'saving', async () => {
      const saved = await (editing
        ? updateMaterial({ row, fields, url: draft.url })
        : draft.kind === 'file'
          ? createFileMaterial({ teacherId, file: draft.file, fields })
          : createLinkMaterial({ teacherId, url: draft.url, fields }));
      if (!saved.ok || !section) return saved;
      // The material (and its file) is saved; a failed share leaves it Private.
      const shared = await shareMaterialToClass({ materialId: saved.row.id, sectionId: section.id });
      return { ...saved, section, shareFailed: !shared.ok };
    });
    if (!result) return;
    if (!result.ok) { setError(result.error); return; }
    onSaved(result.row, editing, { section: result.section || null, shareFailed: Boolean(result.shareFailed) });
  };

  const remove = async () => {
    const result = await run('deleting', () => deleteMaterial({ row }));
    if (!result) return;
    if (!result.ok) { setConfirmDelete(false); setError(result.error); return; }
    onDeleted(row, result.orphan);
  };

  const classHint = classesState === 'loading' ? 'Loading your classes…'
    : classesState === 'error' ? 'Your classes could not be loaded.'
      : groups.length === 0 ? NO_TEACHING_LOAD_MESSAGE : '';

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
            <ToggleChoice legend="Material type" name="material-kind" options={KINDS} value={draft.kind}
              disabled={Boolean(busy)} onChange={kind => update({ kind })} />
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
              <label className="x-label" htmlFor={ids.url}>Link address</label>
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

          {editing ? (
            <div className="x-field">
              <p className="x-label">Shared with</p>
              <p className="x-tlm-filename">Shared with: {sharedWithLine(sharedWith)}</p>
              <p className="x-hint">Use Repost to share it with another class.</p>
            </div>
          ) : (
            <div className="x-field">
              <label className="x-label" htmlFor={ids.section}>Grade and section <span className="x-tlm-opt">(optional)</span></label>
              <select id={ids.section} className="x-select x-tlm-wide" value={draft.sectionId} disabled={Boolean(busy) || classesState !== 'ready'}
                aria-describedby={`${ids.section}-help`} onChange={e => update({ sectionId: e.target.value })}>
                <option value="">Not shared (only me)</option>
                {groups.map(([grade, sections]) => (
                  <optgroup key={grade} label={grade}>
                    {sections.map(section => <option key={section.id} value={section.id}>{classLabel(section)}</option>)}
                  </optgroup>
                ))}
              </select>
              <p className="x-hint" id={`${ids.section}-help`}>{CLASS_HELP}</p>
              {classHint && (
                <p className="x-hint x-tlm-subjhint" role={classesState === 'loading' ? 'status' : undefined}>
                  {classHint}
                  {classesState === 'error' && onRetryClasses && (
                    <> <button type="button" className="x-btn gh x-tlm-retry" onClick={onRetryClasses}>Retry</button></>
                  )}
                </p>
              )}
            </div>
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
