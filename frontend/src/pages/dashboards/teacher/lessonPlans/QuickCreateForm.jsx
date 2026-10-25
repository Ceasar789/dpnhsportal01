import { useState } from 'react';
import { buildQuickCreatePayload, eligibleQuickCreateSubjects, validateQuickCreateDraft } from './quickCreateModel';
import { ConfirmDialog } from '../shared/ui';
import './QuickCreateForm.css';

const STRATEGIES = ['Collaborative Learning', 'Inquiry-Based Learning', 'Differentiated Instruction',
  'Problem-Based Learning', 'Project-Based Learning', 'Direct Instruction', 'Discussion-Based Learning',
  'Demonstration', 'Experiential Learning'];
const BLOCKED_COPY = 'Lesson Plan creation is pending authorization verification.';
const emptyQuickCreateDraft = (ownerId, schoolYear) => ({ ownerId, schoolYear, title: '', subjectId: '', gradeLevel: '', durationMinutes: '', strategy: '', strategyChoice: '', customStrategy: '', objectives: '' });

// The caller must provide already-scoped teaching-load rows and a mock handler.
// This component contains no Supabase import or production persistence path.
export default function QuickCreateForm({ teacherId, schoolYear, assignmentRows, sourceTeacherId,
  sourceSchoolYear, loadState, onRetry, onMockCreate, onTemporaryCreate, draftValue, onDraftChange }) {
  const [storedDraft, setStoredDraft] = useState(() => emptyQuickCreateDraft(teacherId, schoolYear));
  const [errorState, setErrorState] = useState({ ownerId: teacherId, values: {} });
  const [messageState, setMessageState] = useState({ ownerId: teacherId, text: '' });
  const [busyState, setBusyState] = useState({ ownerId: teacherId, pending: false });
  const [confirmCancel, setConfirmCancel] = useState(false);
  const activeDraft = draftValue ?? storedDraft;
  const draft = activeDraft.ownerId === teacherId && activeDraft.schoolYear === schoolYear
    ? activeDraft : emptyQuickCreateDraft(teacherId, schoolYear);
  const previewMode = typeof onMockCreate === 'function';
  const temporaryMode = typeof onTemporaryCreate === 'function';
  const errors = errorState.ownerId === teacherId ? errorState.values : {};
  const saveMessage = messageState.ownerId === teacherId ? messageState.text : '';
  const busy = busyState.ownerId === teacherId && busyState.pending;
  const subjects = eligibleQuickCreateSubjects(assignmentRows);
  const sourceReady = loadState === 'ready' && teacherId && teacherId === sourceTeacherId &&
    schoolYear && schoolYear === sourceSchoolYear;
  const subjectId = subjects.length === 1 ? subjects[0].id : draft.subjectId;
  const subject = subjects.find(item => item.id === subjectId);
  const gradeLevel = subject?.grades.length === 1 ? subject.grades[0] : draft.gradeLevel;
  const selectedDraft = { ...draft, subjectId, gradeLevel };
  const context = { subjects, teacherId, sourceTeacherId, schoolYear, sourceSchoolYear };
  const strategyChoice = draft.strategyChoice ?? (STRATEGIES.includes(draft.strategy) ? draft.strategy : draft.strategy ? 'custom' : '');
  const customStrategy = draft.customStrategy ?? (strategyChoice === 'custom' ? draft.strategy : '');
  const canCreate = Boolean(sourceReady && subject && subject.grades.includes(gradeLevel) &&
    (previewMode || temporaryMode) && !busy &&
    (!temporaryMode || Object.keys(validateQuickCreateDraft(selectedDraft, context)).length === 0));

  const setDraft = next => {
    if (onDraftChange) onDraftChange(next);
    else setStoredDraft(next);
  };

  const update = patch => {
    setDraft({ ...draft, ...patch });
    setErrorState({ ownerId: teacherId, values: {} });
    setMessageState({ ownerId: teacherId, text: '' });
  };

  const submit = async event => {
    event.preventDefault();
    if (!previewMode && !temporaryMode) {
      setMessageState({ ownerId: teacherId, text: BLOCKED_COPY });
      return;
    }
    if (!canCreate) return;
    const nextErrors = validateQuickCreateDraft(selectedDraft, context);
    setErrorState({ ownerId: teacherId, values: nextErrors });
    if (Object.keys(nextErrors).length) return;
    const payload = buildQuickCreatePayload(selectedDraft, context);
    setBusyState({ ownerId: teacherId, pending: true });
    setMessageState({ ownerId: teacherId, text: '' });
    try {
      const result = await (temporaryMode ? onTemporaryCreate(payload) : onMockCreate(payload));
      if (result !== false && previewMode) setMessageState({ ownerId: teacherId, text: 'Mock create completed. No lesson plan was saved.' });
    } catch {
      // Keep every entered value after a failed mock operation.
      setMessageState({ ownerId: teacherId, text: temporaryMode
        ? 'Could not create the temporary draft. Your entries are still here.'
        : 'Mock create failed. Your entries are still here.' });
    } finally {
      setBusyState({ ownerId: teacherId, pending: false });
    }
  };

  const cancel = () => {
    if (Object.entries(draft).some(([key, value]) => !['ownerId', 'schoolYear'].includes(key) && String(value).trim()) &&
      !confirmCancel) { setConfirmCancel(true); return; }
    setConfirmCancel(false);
    setDraft(emptyQuickCreateDraft(teacherId, schoolYear));
    setErrorState({ ownerId: teacherId, values: {} });
    setMessageState({ ownerId: teacherId, text: '' });
  };

  return <section className="quick-create-preview" aria-label={previewMode ? 'Isolated Quick Create preview' : 'Quick Create lesson plan'}>
    {confirmCancel && <ConfirmDialog title="Discard Quick Create entries" confirmLabel="Discard entries"
      message="Discard this unsaved manual lesson plan form?"
      onCancel={() => setConfirmCancel(false)} onConfirm={cancel} />}
    <h2>{previewMode ? 'Create a plan manually — isolated preview' : 'Create a plan manually'}</h2>
    {previewMode ? <p>This form uses synthetic teaching-load rows. Mock create cannot write to the database.</p>
      : temporaryMode ? <p role="status" className="quick-create-notice">Create a temporary draft for review. Not saved to EduScribe; leaving Lesson Plans or refreshing loses it.</p>
      : <p role="status" className="quick-create-notice">{BLOCKED_COPY}</p>}
    <form onSubmit={submit} noValidate aria-busy={busy} aria-label="Quick Create form">
      <fieldset className="quick-create-group">
        <legend>Lesson Information</legend>
      <div className="quick-create-field">
        <label htmlFor="qc-title">Lesson Plan Title *</label>
        <input id="qc-title" value={draft.title} onChange={event => update({ title: event.target.value })}
          required disabled={busy} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'qc-title-error' : undefined} />
        {errors.title && <p id="qc-title-error" role="alert">{errors.title}</p>}
      </div>
      {loadState === 'loading' ? <p role="status">Loading assigned subjects…</p>
        : loadState === 'error' ? <div role="alert">Could not load teaching assignments.{' '}
          <button type="button" onClick={onRetry} disabled={busy || !onRetry}>Retry</button>
        </div>
          : !sourceReady ? <p role="alert">Teaching assignments are unavailable for this Teacher and school year.</p>
            : subjects.length === 0 ? <p role="status">No assigned subject for this school year. Ask your administrator to set your teaching load.</p>
              : null}
      <div className="quick-create-pair">
      <div className="quick-create-field">
        <label htmlFor="qc-subject">Assigned Subject *</label>
        <select id="qc-subject" value={sourceReady ? subjectId : ''} disabled={!sourceReady || busy || subjects.length === 0}
          onChange={event => update({ subjectId: event.target.value, gradeLevel: '' })}
          required aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? 'qc-subject-error' : undefined}>
          <option value="">Choose a subject</option>
          {sourceReady && subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {errors.subject && <p id="qc-subject-error" role="alert">{errors.subject}</p>}
      </div>
      <div className="quick-create-field">
        <label htmlFor="qc-grade">Assigned Grade Level *</label>
        <select id="qc-grade" value={sourceReady ? gradeLevel || '' : ''} disabled={!sourceReady || busy || !subject}
          onChange={event => update({ gradeLevel: event.target.value })}
          required aria-invalid={Boolean(errors.gradeLevel)} aria-describedby={errors.gradeLevel ? 'qc-grade-error' : undefined}>
          <option value="">Choose a grade</option>
          {sourceReady && subject?.grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
        </select>
        {errors.gradeLevel && <p id="qc-grade-error" role="alert">{errors.gradeLevel}</p>}
      </div>
      </div>
      </fieldset>
      <fieldset className="quick-create-group">
        <legend>Teaching Approach</legend>
      <div className="quick-create-field">
        <label htmlFor="qc-duration">Class Duration (minutes per session)</label>
        <input id="qc-duration" type="number" min="1" step="1" inputMode="numeric" placeholder="e.g. 60"
          value={draft.durationMinutes} onChange={event => update({ durationMinutes: event.target.value })}
          disabled={busy} aria-invalid={Boolean(errors.durationMinutes)}
          aria-describedby={errors.durationMinutes ? 'qc-duration-error' : 'qc-duration-help'} />
        <p id="qc-duration-help">Enter minutes for one class session; this is separate from Number of Sessions.</p>
        {errors.durationMinutes && <p id="qc-duration-error" role="alert">{errors.durationMinutes}</p>}
      </div>
      <div className="quick-create-field">
        <label htmlFor="qc-strategy">Teaching Strategy</label>
        <select id="qc-strategy" value={strategyChoice} disabled={busy} onChange={event => {
          const choice = event.target.value;
          update({ strategyChoice: choice, customStrategy, strategy: choice === 'custom' ? customStrategy : choice });
        }}>
          <option value="">Choose a strategy (optional)</option>
          {STRATEGIES.map(strategy => <option key={strategy} value={strategy}>{strategy}</option>)}
          <option value="custom">Other / Custom Strategy</option>
        </select>
      </div>
      {strategyChoice === 'custom' && <div className="quick-create-field">
        <label htmlFor="qc-custom-strategy">Custom Teaching Strategy</label>
        <input id="qc-custom-strategy" value={customStrategy} disabled={busy}
          onChange={event => update({ customStrategy: event.target.value, strategy: event.target.value })} />
      </div>}
      </fieldset>
      <fieldset className="quick-create-group">
        <legend id="qc-objectives-label">Learning Objectives</legend>
      <div className="quick-create-field">
        <p id="qc-objectives-help">Write one measurable objective per line.</p>
        <textarea id="qc-objectives" rows="4" value={draft.objectives}
          onChange={event => update({ objectives: event.target.value })} disabled={busy}
          aria-labelledby="qc-objectives-label" aria-describedby="qc-objectives-help" />
      </div>
      </fieldset>
      {saveMessage && saveMessage !== BLOCKED_COPY && <p role="status">{saveMessage}</p>}
      <div className="quick-create-actions">
        <button type="submit" disabled={!canCreate}>{temporaryMode ? 'Create Temporary Draft'
          : previewMode ? (busy ? 'Checking mock create…' : 'Preview mock create') : 'Create plan'}</button>
        <button type="button" onClick={cancel} disabled={busy || !Object.entries(draft).some(([key, value]) => !['ownerId', 'schoolYear'].includes(key) && String(value).trim())}>Cancel</button>
      </div>
    </form>
  </section>;
}
