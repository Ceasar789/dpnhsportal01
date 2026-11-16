// ============================================
// FILE: src/pages/dashboards/admin/shared/EventFormDialog.jsx
// U4: Add / Edit Calendar Event on the form kit. One component for the
// classic CalendarTab and the Clarity ClarityAdminCalendarTab. Data and
// saving are unchanged (useAdminLogic.saveEvent / deleteEvent).
// The end-date rule is the same isInvalidCalendarRange check as before; it
// now shows on blur as well as on submit, like every other field.
// ============================================

import Field from '../../../../components/ui/form/Field';
import { isInvalidCalendarRange } from '../../../../lib/calendarRules';
import { useAdminContext } from '../AdminContext';
import { EVENT_TYPES } from './helpers';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';
import { EVENT_FIELDS, FORM_MESSAGES, LIMITS, eventRules, validateEventForm } from './adminForms';

function EventForm() {
  const {
    closeModal, deleteEvent, editEvent, evDate = '', evDesc = '', evEnd = '', evSaving = false, evTitle = '',
    evCustomType = '', evType = 'Event', saveEvent, setEvCustomType, setEvDate, setEvDesc, setEvEnd, setEvTitle, setEvType,
  } = useAdminContext();
  const form = useFormDialog(Object.values(EVENT_FIELDS));
  const editing = Boolean(editEvent);
  const checkEnd = value => (isInvalidCalendarRange(evDate, value) ? FORM_MESSAGES.eventRange : null);

  const submit = () => form.submit(
    validateEventForm({ title: evTitle, start: evDate, end: evEnd, type: evType, custom: evCustomType }),
    saveEvent,
  );

  return (
    <FormDialog
      title={editing ? 'Edit Event' : 'Add Calendar Event'}
      onClose={closeModal}
      summaryId="calendar-form-summary"
      form={form}
      primaryLabel={editing ? 'Save changes' : 'Add event'}
      busyLabel="Saving…"
      saving={evSaving}
      onSubmit={submit}
      extraActions={editing && (
        <button type="button" className="fk-btn fk-danger" onClick={() => deleteEvent(editEvent.id)}>Delete</button>
      )}
    >
      <Field label="Title" id={EVENT_FIELDS.title} error={form.fieldError(EVENT_FIELDS.title)}
        validate={eventRules.title} onValidate={form.clearError(EVENT_FIELDS.title)}>
        <input value={evTitle} onChange={e => setEvTitle(e.target.value)} maxLength={LIMITS.title} autoComplete="off" />
      </Field>
      <Field label="Start date" id={EVENT_FIELDS.start} error={form.fieldError(EVENT_FIELDS.start)}
        validate={eventRules.start} onValidate={form.clearError(EVENT_FIELDS.start)}>
        <input type="date" value={evDate} onChange={e => setEvDate(e.target.value)} />
      </Field>
      <Field label="End date" id={EVENT_FIELDS.end} optional help="Leave empty for a one-day event."
        error={form.fieldError(EVENT_FIELDS.end)} validate={checkEnd} onValidate={form.clearError(EVENT_FIELDS.end)}>
        <input type="date" value={evEnd} min={evDate || undefined} onChange={e => setEvEnd(e.target.value)} />
      </Field>
      <Field label="Type" id={EVENT_FIELDS.type}>
        <select value={evType} onChange={e => setEvType(e.target.value)}>
          {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>
      {evType === 'Custom Type' && (
        <Field label="Custom event type" id={EVENT_FIELDS.custom} help="For example, Foundation Day or Faculty Meeting."
          error={form.fieldError(EVENT_FIELDS.custom)} validate={eventRules.custom} onValidate={form.clearError(EVENT_FIELDS.custom)}>
          <input value={evCustomType} onChange={e => setEvCustomType(e.target.value)} autoComplete="off" />
        </Field>
      )}
      <Field label="Description" id={EVENT_FIELDS.desc} optional>
        <textarea rows={3} value={evDesc} onChange={e => setEvDesc(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

/** Mounts fresh each time it opens, so no state carries over. */
export default function EventFormDialog() {
  const { modal } = useAdminContext();
  return modal === 'event' ? <EventForm /> : null;
}
