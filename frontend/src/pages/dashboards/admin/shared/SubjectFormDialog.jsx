// ============================================
// FILE: src/pages/dashboards/admin/shared/SubjectFormDialog.jsx
// U4: Add / Edit Subject on the form kit. One component for the classic
// SubjectsTab and the Clarity ClarityAdminSubjectsTab. Data and saving are
// unchanged (useAcademicLogic.saveSubject through the admin context).
// ============================================

import Field from '../../../../components/ui/form/Field';
import { useAdminContext } from '../AdminContext';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';
import { LIMITS, SUBJECT_FIELDS, subjectRules, validateSubjectForm } from './adminForms';

function SubjectForm() {
  const {
    editingSubject, sName = '', setSName, sCode = '', setSCode, sActive = true, setSActive, sSaving = false,
    closeSubjectModal, saveSubject,
  } = useAdminContext();
  const form = useFormDialog(Object.values(SUBJECT_FIELDS));
  const editing = Boolean(editingSubject);

  const submit = () => form.submit(validateSubjectForm({ name: sName, code: sCode }), saveSubject);

  return (
    <FormDialog
      title={editing ? 'Edit Subject' : 'Add Subject'}
      onClose={closeSubjectModal}
      summaryId="subjects-form-summary"
      form={form}
      primaryLabel={editing ? 'Save changes' : 'Add subject'}
      busyLabel="Saving…"
      saving={sSaving}
      onSubmit={submit}
    >
      <Field label="Subject name" id={SUBJECT_FIELDS.name} error={form.fieldError(SUBJECT_FIELDS.name)}
        validate={subjectRules.name} onValidate={form.clearError(SUBJECT_FIELDS.name)}>
        <input value={sName} onChange={e => setSName(e.target.value)} maxLength={LIMITS.subjectName} autoComplete="off" />
      </Field>
      <Field label="Code" id={SUBJECT_FIELDS.code} help="Short and unique, like MATH. Saved in capitals."
        error={form.fieldError(SUBJECT_FIELDS.code)} validate={subjectRules.code} onValidate={form.clearError(SUBJECT_FIELDS.code)}>
        <input value={sCode} onChange={e => setSCode(e.target.value)} maxLength={LIMITS.subjectCode}
          autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      </Field>
      <Field label="Status" id={SUBJECT_FIELDS.status}>
        <select value={sActive ? 'active' : 'inactive'} onChange={e => setSActive(e.target.value === 'active')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </Field>
    </FormDialog>
  );
}

/** Mounts fresh each time it opens, so no state carries over. */
export default function SubjectFormDialog() {
  const { subjectModal } = useAdminContext();
  return subjectModal ? <SubjectForm /> : null;
}
