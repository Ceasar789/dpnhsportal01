// ============================================
// FILE: src/pages/dashboards/admin/shared/MemoFormDialog.jsx
// U4: Compose / Edit Memo on the form kit. One component for the classic
// MemosTab and the Clarity ClarityAdminMemosTab. Data and saving are
// unchanged (useAdminLogic.saveMemo through the admin context).
// ============================================

import Field from '../../../../components/ui/form/Field';
import { composeOptions } from '../../../../lib/memoRecipients';
import { useAdminContext } from '../AdminContext';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';
import { LIMITS, MEMO_FIELDS, memoRules, validateMemoForm } from './adminForms';

function MemoForm() {
  const {
    closeModal, editMemo, mBody = '', mFrom = '', mSaving = false, mSubj = '', mTo = '', saveMemo,
    setMBody, setMFrom, setMSubj, setMTo, users,
  } = useAdminContext();
  const form = useFormDialog(Object.values(MEMO_FIELDS));
  const editing = Boolean(editMemo);
  const recipientOptions = composeOptions(users);

  const submit = () => form.submit(validateMemoForm({ subject: mSubj }), saveMemo);

  return (
    <FormDialog
      title={editing ? 'Edit Memo' : 'Compose Memo'}
      onClose={closeModal}
      summaryId="memos-form-summary"
      form={form}
      primaryLabel={editing ? 'Save changes' : 'Send memo'}
      busyLabel={editing ? 'Saving…' : 'Sending…'}
      saving={mSaving}
      onSubmit={submit}
    >
      <Field label="From office" id={MEMO_FIELDS.from} optional help="For example, Principal's Office.">
        <input value={mFrom} onChange={e => setMFrom(e.target.value)} autoComplete="organization" />
      </Field>
      <Field label="Recipient" id={MEMO_FIELDS.to}>
        <select value={mTo} onChange={e => setMTo(e.target.value)}>
          {/* A memo being EDITED may be addressed to something no longer
              offered (a renamed department). Keep its own value selectable
              so opening the form does not silently re-address it. */}
          {mTo && !recipientOptions.includes(mTo) && <option>{mTo}</option>}
          {recipientOptions.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Subject" id={MEMO_FIELDS.subject} error={form.fieldError(MEMO_FIELDS.subject)}
        validate={memoRules.subject} onValidate={form.clearError(MEMO_FIELDS.subject)}>
        <input value={mSubj} onChange={e => setMSubj(e.target.value)} maxLength={LIMITS.title} autoComplete="off" />
      </Field>
      <Field label="Message" id={MEMO_FIELDS.body} optional>
        <textarea rows={6} value={mBody} onChange={e => setMBody(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

/** Mounts fresh each time it opens, so no state carries over. */
export default function MemoFormDialog() {
  const { modal } = useAdminContext();
  return modal === 'memo' ? <MemoForm /> : null;
}
