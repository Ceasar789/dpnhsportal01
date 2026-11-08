// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/CreateTaskModal.jsx
// The first step of a hand-written task: title, type, subject, directions and
// checking mode. Questions are added afterwards in the Questions editor.
// ============================================

import { useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import useDialogSafety from './useDialogSafety';
import { MAX_DIRECTIONS, MAX_TITLE, checkingModeFor } from './manualTaskSave';

const TYPES = [['activity', 'Activity'], ['quiz', 'Quiz'], ['assignment', 'Assignment']];
const MODES = [
  { value: 'auto', label: 'Auto-check', help: 'Answers are marked for you when you open Check submissions.' },
  { value: 'manual', label: 'Manual check', help: 'You mark every answer yourself.' },
];
const field = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };
const muted = { color: 'var(--text-muted)' };

const CreateTaskModal = ({ subjectPicker, subjectReady, saving, onSave, onClose }) => {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState('activity');
  const [directions, setDirections] = useState('');
  const [quizMode, setQuizMode] = useState('auto');
  const [error, setError] = useState('');
  const checkingMode = checkingModeFor(taskType, quizMode);
  const titleTooLong = title.trim().length > MAX_TITLE;
  const directionsTooLong = directions.length > MAX_DIRECTIONS;
  const directionsMissing = taskType === 'activity' && !directions.trim();
  const canSave = Boolean(subjectReady) && !saving && Boolean(title.trim()) && !titleTooLong
    && !directionsTooLong && !directionsMissing;
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty: Boolean(title.trim() || directions.trim()), pending: saving, onClose,
    discardMessage: 'Close without creating? What you typed will be lost.',
    leaveMessage: 'Discard this new worksheet and leave Worksheets?',
  });

  const submit = async () => {
    if (!canSave) return;
    setError('');
    const result = await onSave({ title: title.trim(), taskType, directions, checkingMode });
    if (result && !result.ok) setError(result.message);
  };

  return <>{routeBlocker}<Modal title="Create Worksheet" onClose={requestClose} closeDisabled={saving}>
    <div className="flex flex-col gap-4">
      {busyNotice && <p role="status" className="text-sm">{busyNotice}</p>}
      <div>
        <label htmlFor="create-task-title" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Title</label>
        <input id="create-task-title" value={title} maxLength={MAX_TITLE} disabled={saving} aria-invalid={titleTooLong}
          onChange={event => { setTitle(event.target.value); setError(''); }}
          className="w-full min-h-10 px-3 rounded-lg text-sm" style={field} />
        {titleTooLong && <p role="alert" className="text-xs mt-1" style={{ color: 'var(--red)' }}>Keep the title within {MAX_TITLE} characters.</p>}
      </div>
      <div>
        <label htmlFor="create-task-type" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Type</label>
        <select id="create-task-type" value={taskType} disabled={saving}
          onChange={event => { setTaskType(event.target.value); setError(''); }}
          className="w-full min-h-10 px-3 rounded-lg text-sm" style={field}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {subjectPicker}
      <div>
        <label htmlFor="create-task-directions" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Directions</label>
        <textarea id="create-task-directions" value={directions} maxLength={MAX_DIRECTIONS} rows={4} disabled={saving}
          aria-invalid={directionsTooLong} aria-describedby="create-task-directions-help"
          onChange={event => { setDirections(event.target.value); setError(''); }}
          className="w-full px-3 py-2 rounded-lg text-sm" style={field} />
        <p id="create-task-directions-help" className="text-xs mt-1" style={muted}>
          {taskType === 'activity' ? 'Required for an Activity.' : 'Optional.'} {directions.length} / {MAX_DIRECTIONS}
        </p>
        {directionsTooLong && <p role="alert" className="text-xs mt-1" style={{ color: 'var(--red)' }}>Keep the directions within {MAX_DIRECTIONS} characters.</p>}
      </div>
      {taskType !== 'activity' && <fieldset className="grid gap-2">
        <legend className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Checking</legend>
        {MODES.map(mode => <label key={mode.value} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="radio" name="create-task-checking" value={mode.value} checked={checkingMode === mode.value}
            disabled={saving || taskType === 'assignment'} onChange={() => setQuizMode(mode.value)} className="mt-1" />
          <span><span className="font-medium">{mode.label}</span><span className="block text-xs" style={muted}>{mode.help}</span></span>
        </label>)}
        {taskType === 'assignment' && <p className="text-xs" style={muted}>Assignments are answered in writing and checked by you.</p>}
      </fieldset>}
      {taskType !== 'activity' && <p className="text-xs" style={muted}>After creating, add the questions and their points.</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="flex justify-end gap-2">
        <Btn variant="outline" onClick={requestClose} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" onClick={submit} disabled={!canSave} busy={saving}>{saving ? 'Creating…' : 'Create'}</Btn>
      </div>
    </div>
  </Modal></>;
};

export default CreateTaskModal;
