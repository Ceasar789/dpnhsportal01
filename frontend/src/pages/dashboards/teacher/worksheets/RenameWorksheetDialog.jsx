// U-T3: the Rename dialog for a saved worksheet (form kit; one field).
import { useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import Field from '../../../../components/ui/form/Field';
import { TITLE_MAX, renameWorksheet, titleProblem } from './worksheetRename';

export default function RenameWorksheetDialog({ worksheet, onClose, onRenamed }) {
  const [title, setTitle] = useState(worksheet.title || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event?.preventDefault?.();
    if (saving) return;
    const problem = titleProblem(title);
    if (problem) { setError(problem); return; }
    setSaving(true);
    const result = await renameWorksheet(worksheet.id, title);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    onRenamed(worksheet.id, result.title);
  };

  return (
    <Modal title="Rename worksheet" onClose={onClose} closeDisabled={saving} escapeCloses={!saving} footer={
      <div className="fk-footer">
        <Btn variant="outline" className="fk-btn" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" className="fk-btn" onClick={submit} busy={saving}>{saving ? 'Saving…' : 'Save title'}</Btn>
      </div>
    }>
      <form onSubmit={submit} noValidate>
        <Field label="Worksheet title" id="rename-worksheet-title" error={error} validate={titleProblem}
          help="Students see this title on their task list.">
          <input value={title} maxLength={TITLE_MAX} disabled={saving} autoComplete="off"
            onChange={event => { setTitle(event.target.value); setError(''); }} />
        </Field>
      </form>
    </Modal>
  );
}
