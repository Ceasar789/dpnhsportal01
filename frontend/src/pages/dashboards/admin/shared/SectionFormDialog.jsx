// ============================================
// FILE: src/pages/dashboards/admin/shared/SectionFormDialog.jsx
// U4: Add / Edit Section on the form kit. One component for the classic
// SectionsTab and the Clarity ClarityAdminSectionsTab. Data and saving are
// unchanged (useAcademicLogic.saveSection through the admin context); the
// capacity and adviser answers that saveSection works out against the
// database (enrolment, an adviser who is no longer active) still arrive
// through secCapacityError / secAdviserError and show on their fields.
// The Capacity hint is now the kit's help text (the old "field-help" class
// had no style at all).
// ============================================

import Field from '../../../../components/ui/form/Field';
import { GRADE_LEVELS } from '../../../../lib/academicRules';
import { useAdminContext } from '../AdminContext';
import SchoolYearNotice from './SchoolYearNotice';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';
import { SECTION_FIELDS, sectionRules, validateSectionForm } from './adminForms';
import { isActiveSectionAdviser, otherAdvisedSections } from './sectionsValidation';

function SectionForm() {
  const {
    schoolYear, settingsSchoolYear, schoolYearSource, teachers = [], sections = [], editingSection,
    secName = '', setSecName, secGrade = '', setSecGrade, secAdviser = '', setSecAdviser,
    secCapacity = '', setSecCapacity, secCapacityError = '', setSecCapacityError,
    secAdviserError = '', setSecAdviserError, secSaving = false,
    closeSectionModal, saveSection,
  } = useAdminContext();
  const form = useFormDialog(Object.values(SECTION_FIELDS));
  const editing = Boolean(editingSection);

  const adviserName = id => teachers.find(t => t.id === id)?.name || '—';
  const eligibleTeachers = teachers.filter(isActiveSectionAdviser);
  const existingAdviser = editingSection?.adviser_id ? teachers.find(t => t.id === editingSection.adviser_id) : null;
  const existingAdviserIsIneligible = existingAdviser && !isActiveSectionAdviser(existingAdviser);
  // Uses the sections already loaded for this year; never blocks saving.
  const alsoAdvises = otherAdvisedSections({ adviserId: secAdviser, sections, editingSectionId: editingSection?.id, schoolYear });
  const adviserWarning = alsoAdvises.length > 0
    ? `${adviserName(secAdviser)} already advises ${alsoAdvises.map(s => s.name).join(', ')} this school year. A teacher normally advises one section.`
    : '';
  const adviserHelp = [
    existingAdviserIsIneligible && secAdviser === existingAdviser.id
      && 'This adviser is no longer active. The existing assignment will be preserved unless you choose a replacement.',
    eligibleTeachers.length === 0 && 'No active teachers are currently available.',
  ].filter(Boolean).join(' ');

  const submit = () => form.submit(
    validateSectionForm({ name: secName, grade: secGrade, capacity: secCapacity }),
    saveSection,
  );

  return (
    <FormDialog
      title={editing ? 'Edit Section' : 'Add Section'}
      onClose={closeSectionModal}
      summaryId="sections-form-summary"
      form={form}
      primaryLabel={editing ? 'Save changes' : 'Add section'}
      busyLabel="Saving…"
      saving={secSaving}
      onSubmit={submit}
    >
      <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

      <Field label="Section name" id={SECTION_FIELDS.name} help="For example 7-Rizal."
        error={form.fieldError(SECTION_FIELDS.name)} validate={sectionRules.name} onValidate={form.clearError(SECTION_FIELDS.name)}>
        <input value={secName} onChange={e => setSecName(e.target.value)} autoComplete="off" />
      </Field>

      <Field label="Grade level" id={SECTION_FIELDS.grade}
        error={form.fieldError(SECTION_FIELDS.grade)} validate={sectionRules.grade} onValidate={form.clearError(SECTION_FIELDS.grade)}>
        <select value={secGrade} onChange={e => setSecGrade(e.target.value)}>
          <option value="">Choose a grade…</option>
          {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </Field>

      <Field label="Adviser" id={SECTION_FIELDS.adviser} optional help={adviserHelp || undefined}
        error={form.fieldError(SECTION_FIELDS.adviser) || secAdviserError || undefined}>
        <select value={secAdviser} onChange={e => { setSecAdviser(e.target.value); setSecAdviserError?.(''); }}
          aria-describedby={adviserWarning ? 'sections-adviser-warning' : undefined}>
          <option value="">No adviser yet</option>
          {existingAdviserIsIneligible && (
            <option value={existingAdviser.id} disabled>
              {existingAdviser.name || existingAdviser.email} ({existingAdviser.status || 'inactive'} — existing adviser)
            </option>
          )}
          {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
        </select>
      </Field>
      {adviserWarning && (
        <p className="fk-note" id="sections-adviser-warning" role="status">{adviserWarning}</p>
      )}

      <Field label="Capacity" id={SECTION_FIELDS.capacity} help="A whole number from 1 to 60."
        error={form.fieldError(SECTION_FIELDS.capacity) || secCapacityError || undefined}
        validate={sectionRules.capacity}
        onValidate={(message) => { form.clearError(SECTION_FIELDS.capacity)(message); if (!message) setSecCapacityError?.(''); }}>
        <input type="number" inputMode="numeric" min="1" max="60" step="1" required value={secCapacity}
          onChange={e => { setSecCapacity(e.target.value); setSecCapacityError?.(''); }} autoComplete="off" />
      </Field>
    </FormDialog>
  );
}

/** Mounts fresh each time it opens, so no state carries over. */
export default function SectionFormDialog() {
  const { sectionModal } = useAdminContext();
  return sectionModal ? <SectionForm /> : null;
}
