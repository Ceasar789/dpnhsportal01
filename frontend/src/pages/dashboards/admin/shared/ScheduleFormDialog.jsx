// ============================================
// FILE: src/pages/dashboards/admin/shared/ScheduleFormDialog.jsx
// U4: the "schedule a period" dialog on the form kit. One component for the
// classic SchedulesTab and the Clarity ClarityAdminSchedulesTab. Data and
// saving are unchanged (useAcademicLogic.saveSchedule). The section and
// subject come from the row it was opened from, so the tab passes in what
// only it knows: the title, the grade and who may teach the subject there.
// The clash answer from the last press (nothing saved) stays at the end of
// the form and is scrolled into view, as before.
// ============================================

import { useEffect, useRef, useState } from 'react';
import Field from '../../../../components/ui/form/Field';
import { useAdminContext } from '../AdminContext';
import SchoolYearNotice from './SchoolYearNotice';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';
import { FORM_MESSAGES, SCHEDULE_FIELDS, validateScheduleForm } from './adminForms';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function ScheduleForm({ title, grade, eligibleTeachers, eligibilityLoading, eligibilityError, onRetryEligibility }) {
  const {
    schoolYear, settingsSchoolYear, schoolYearSource, closeScheduleModal, saveSchedule,
    schedTeacher = '', setSchedTeacher, schedDay = 'Monday', setSchedDay,
    schedStart = '', setSchedStart, schedEnd = '', setSchedEnd, schedRoom = '', setSchedRoom, schedSaving = false,
    scheduleConflicts, scheduleCheckError,
  } = useAdminContext();
  const form = useFormDialog(Object.values(SCHEDULE_FIELDS));
  const teacherChoosable = !eligibilityLoading && !eligibilityError && eligibleTeachers.length > 0;

  const conflictRef = useRef(null);
  useEffect(() => {
    if (scheduleCheckError || scheduleConflicts?.length > 0) conflictRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [scheduleCheckError, scheduleConflicts]);

  // Pressing Add while eligibility is loading or failed, or with no teacher
  // to choose, does nothing new: the field already says why, and
  // saveSchedule would refuse anyway (as before U4).
  const submit = () => {
    if (eligibilityLoading || eligibilityError || (!teacherChoosable && !schedTeacher)) return;
    form.submit(validateScheduleForm({ teacher: schedTeacher, start: schedStart, end: schedEnd, teacherChoosable }), saveSchedule);
  };

  const teacherHelp = eligibilityLoading ? 'Loading teachers and teaching-load assignments…'
    : eligibilityError ? 'Teacher eligibility could not be loaded.'
      : eligibleTeachers.length === 0 ? `Assign someone this subject for ${grade} in Teaching Load first.`
        : undefined;
  // Start and End are one rule, so both boxes are marked and point to the
  // one message (decision 3, as before U4). The pair is built on the kit
  // classes by hand: Field marks only its own control.
  const badTime = schedEnd <= schedStart;
  const [timeTouched, setTimeTouched] = useState(false);
  const timeError = (form.fieldError(SCHEDULE_FIELDS.end) || timeTouched) && badTime ? FORM_MESSAGES.scheduleTime : '';
  const timeInput = (id, value, set, isStart) => (
    <input id={id} type="time" value={value} required aria-required="true"
      className={`fk-control${timeError ? ' is-invalid' : ''}`}
      aria-invalid={timeError ? 'true' : undefined}
      aria-describedby={timeError ? 'schedules-time-error' : undefined}
      onChange={(e) => {
        set(e.target.value);
        const [start, end] = isStart ? [e.target.value, schedEnd] : [schedStart, e.target.value];
        if (end > start) form.clearError(SCHEDULE_FIELDS.end)(null);
      }}
      onBlur={() => setTimeTouched(true)} />
  );

  return (
    <FormDialog
      title={title}
      onClose={closeScheduleModal}
      summaryId="schedules-form-summary"
      form={form}
      primaryLabel="Add period"
      busyLabel="Adding…"
      saving={schedSaving}
      onSubmit={submit}
    >
      <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

      <Field label="Teacher" id={SCHEDULE_FIELDS.teacher} help={teacherHelp} helpLive
        error={form.fieldError(SCHEDULE_FIELDS.teacher) || (eligibilityError ? 'Retry to load who can teach this subject.' : undefined)}
        validate={teacherChoosable ? (v => (v ? null : FORM_MESSAGES.scheduleTeacher)) : undefined}
        onValidate={form.clearError(SCHEDULE_FIELDS.teacher)}>
        <select value={schedTeacher} onChange={e => setSchedTeacher(e.target.value)} required>
          <option value="">
            {eligibilityLoading ? 'Loading eligible teachers…'
              : eligibilityError ? 'Teacher eligibility unavailable'
                : eligibleTeachers.length === 0 ? 'No teacher holds this subject at this grade'
                  : 'Choose a teacher…'}
          </option>
          {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
        </select>
      </Field>
      {eligibilityError && (
        <div className="fk-field">
          <button type="button" className="fk-btn" onClick={onRetryEligibility}>Retry eligibility</button>
        </div>
      )}

      <Field label="Day" id={SCHEDULE_FIELDS.day}>
        <select value={schedDay} onChange={e => setSchedDay(e.target.value)} required>
          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>

      <div className="fk-field">
        <label className="fk-label" htmlFor={SCHEDULE_FIELDS.start}>Start</label>
        {timeInput(SCHEDULE_FIELDS.start, schedStart, setSchedStart, true)}
      </div>
      <div className="fk-field">
        <label className="fk-label" htmlFor={SCHEDULE_FIELDS.end}>End</label>
        {timeInput(SCHEDULE_FIELDS.end, schedEnd, setSchedEnd, false)}
        <p className="fk-error" id="schedules-time-error" aria-live="polite">{timeError}</p>
      </div>

      <Field label="Room" id={SCHEDULE_FIELDS.room} optional help="For example, Room 201.">
        <input value={schedRoom} onChange={e => setSchedRoom(e.target.value)} autoComplete="off" />
      </Field>

      {/* Clash check from the last press. Nothing was saved. */}
      {scheduleCheckError && (
        <div id="schedules-conflict-error" ref={conflictRef} className="fk-summary fk-summary-title" role="alert" tabIndex={-1}>
          {scheduleCheckError}
        </div>
      )}
      {scheduleConflicts?.length > 0 && (
        <div id="schedules-conflict-error" ref={conflictRef} className="fk-summary" role="alert" tabIndex={-1}>
          <p className="fk-summary-title">Not saved. This period clashes with:</p>
          <ul className="fk-summary-list">
            {scheduleConflicts.map(message => <li key={message}>{message}</li>)}
          </ul>
        </div>
      )}
    </FormDialog>
  );
}

/** Mounts fresh each time it opens, so no state carries over. */
export default function ScheduleFormDialog(props) {
  const { scheduleModal } = useAdminContext();
  return scheduleModal ? <ScheduleForm {...props} /> : null;
}
