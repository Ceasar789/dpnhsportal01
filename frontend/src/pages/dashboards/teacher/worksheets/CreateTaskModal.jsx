// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/CreateTaskModal.jsx
// The first step of a hand-written task: title, type, subject, directions and
// checking mode. Questions are added afterwards in the Questions editor.
//
// U5: on the form kit. Labels above the fields, "Optional" on the optional
// one, checks on blur and on Create, a summary that moves focus to the first
// problem, and a Create button that is never disabled: it says "Creating…"
// and ignores a second press. The rules are unchanged (createTaskForm.js),
// and manualTaskSave still refuses anything invalid on its own.
// ============================================

import { useEffect, useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import Field from '../../../../components/ui/form/Field';
import FormErrorSummary from '../../../../components/ui/form/FormErrorSummary';
import useDialogSafety from './useDialogSafety';
import './create-task.css';
import { HAND_IN_TYPES, MAX_DIRECTIONS, MAX_TITLE, checkingModeFor, pointsProblem } from './manualTaskSave';
import { CREATE_TASK_FIELDS as F, CREATE_TASK_MESSAGES, createTaskProblems, directionsProblem, titleProblem } from './createTaskForm';

const TYPES = [['activity', 'Activity'], ['quiz', 'Quiz'], ['assignment', 'Assignment'], ['exam', 'Exam']];
const MODES = [
  { value: 'auto', label: 'Auto-check', help: 'Answers are marked for you when you open Check submissions.' },
  { value: 'manual', label: 'Manual check', help: 'You mark every answer yourself.' },
];
const muted = { color: 'var(--text-muted)' };

const CreateTaskModal = ({ subjectPicker, subjectReady, subjectFieldId, saving, onSave, onClose }) => {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState('activity');
  const [directions, setDirections] = useState('');
  const [quizMode, setQuizMode] = useState('auto');
  const [handIn, setHandIn] = useState('none');
  const [points, setPoints] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const attachment = HAND_IN_TYPES.includes(taskType) && handIn === 'attachment';
  const checkingMode = attachment ? 'manual' : checkingModeFor(taskType, quizMode);
  const directionsRequired = taskType === 'activity' || attachment;
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty: Boolean(title.trim() || directions.trim() || points.trim()), pending: saving, onClose,
    discardMessage: 'Close without creating? What you typed will be lost.',
    leaveMessage: 'Discard this new worksheet and leave Worksheets?',
  });

  const form = { title, directions, points, taskType, attachment, subjectReady, subjectFieldId };
  // After a failed Create the list is re-checked on every change, so a fixed field clears at once.
  const problems = attempt ? createTaskProblems(form) : [];
  const problemFor = id => problems.find(p => p.fieldId === id)?.message;
  // As before, a too-long text and a bad points value show while typing.
  const live = {
    [F.title]: title.trim().length > MAX_TITLE ? CREATE_TASK_MESSAGES.titleLong : null,
    [F.points]: attachment && points.trim() ? pointsProblem(points) : null,
    [F.directions]: directions.length > MAX_DIRECTIONS ? CREATE_TASK_MESSAGES.directionsLong : null,
  };
  const fieldError = id => problemFor(id) || live[id] || undefined;
  const subjectProblem = problems.find(p => p.message === CREATE_TASK_MESSAGES.subject);
  // The subject and grade pickers belong to the Worksheets tab: mark the one the problem
  // points at as invalid and described by the message while it shows.
  const subjectTarget = subjectProblem?.fieldId;
  useEffect(() => {
    const el = subjectTarget && subjectTarget !== F.subjectArea ? document.getElementById(subjectTarget) : null;
    if (!el) return undefined;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', 'create-task-subject-error');
    return () => { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); };
  }, [subjectTarget]);

  // Btn ignores a second press while this promise is pending (and while busy).
  const submit = async () => {
    if (saving) return;
    if (createTaskProblems(form).length) { setAttempt(a => a + 1); return; }
    setError('');
    const result = await onSave({ title: title.trim(), taskType, directions, checkingMode,
      ...(attachment ? { handIn: 'attachment', points: points.trim() } : {}) });
    if (result && !result.ok) setError(result.message);
  };

  return <>{routeBlocker}<Modal title="Create Worksheet" onClose={requestClose} closeDisabled={saving} footer={
    <div className="fk-footer">
      <Btn variant="outline" className="fk-btn" onClick={requestClose} disabled={saving}>Cancel</Btn>
      <Btn variant="primary" className="fk-btn" onClick={submit} busy={saving}>{saving ? 'Creating…' : 'Create'}</Btn>
    </div>
  }>
    <div className="ctm-form flex flex-col">
      {busyNotice && <p role="status" className="text-sm mb-4">{busyNotice}</p>}
      <FormErrorSummary id="create-task-summary" errors={problems} attempt={attempt} focusTo="first-field" />
      <Field label="Title" id={F.title} error={fieldError(F.title)} validate={titleProblem}>
        <input value={title} maxLength={MAX_TITLE} disabled={saving} autoComplete="off"
          onChange={event => { setTitle(event.target.value); setError(''); }} />
      </Field>
      <Field label="Type" id={F.type}>
        <select value={taskType} disabled={saving} onChange={event => { setTaskType(event.target.value); setError(''); }}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <div id={F.subjectArea} tabIndex={-1} className="mb-4 min-w-0">
        {subjectPicker}
        {subjectProblem && <p className="fk-error" id="create-task-subject-error">{subjectProblem.message}</p>}
      </div>
      {HAND_IN_TYPES.includes(taskType) && (
        <Field label="How students hand in" id={F.handIn}
          help={attachment ? 'Each student turns in one file or one link, scored out of the points below. This cannot be changed once the task is distributed.'
            : taskType === 'activity' ? 'Students read the directions; nothing is turned in.' : 'Students answer questions you add after creating.'}>
          <select value={handIn} disabled={saving} onChange={event => { setHandIn(event.target.value); setError(''); }}>
            <option value="none">{taskType === 'activity' ? 'Nothing to hand in' : 'Answers to questions'}</option>
            <option value="attachment">A file or a link</option>
          </select>
        </Field>
      )}
      {attachment && (
        <Field label="Points" id={F.points} error={fieldError(F.points)}>
          <input value={points} inputMode="decimal" disabled={saving} maxLength={7} autoComplete="off"
            onChange={event => { setPoints(event.target.value); setError(''); }} />
        </Field>
      )}
      <Field label="Directions" id={F.directions} optional={!directionsRequired}
        help={`${taskType === 'activity' ? 'Required for an Activity. ' : attachment ? 'Required for a file or link task. ' : ''}${directions.length} / ${MAX_DIRECTIONS}`}
        error={fieldError(F.directions)} validate={value => directionsProblem(value, directionsRequired)}>
        <textarea value={directions} maxLength={MAX_DIRECTIONS} rows={4} disabled={saving}
          onChange={event => { setDirections(event.target.value); setError(''); }} />
      </Field>
      {taskType !== 'activity' && !attachment && <fieldset className="grid gap-2 mb-4">
        <legend className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Checking</legend>
        {MODES.map(mode => <label key={mode.value} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="radio" name="create-task-checking" value={mode.value} checked={checkingMode === mode.value}
            disabled={saving || taskType === 'assignment'} onChange={() => setQuizMode(mode.value)} className="mt-1" />
          <span><span className="font-medium">{mode.label}</span><span className="block text-xs" style={muted}>{mode.help}</span></span>
        </label>)}
        {taskType === 'assignment' && <p className="text-xs" style={muted}>Assignments are answered in writing and checked by you.</p>}
      </fieldset>}
      {taskType !== 'activity' && !attachment && <p className="text-xs" style={muted}>After creating, add the questions and their points.</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  </Modal></>;
};

export default CreateTaskModal;
