import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Btn, Input, Modal } from '../shared/ui';
import { isCancelError, requestDayTask } from './dayTaskClient';
import { ASSIGNMENT_DEFAULT, ASSIGNMENT_MAX, ASSIGNMENT_MIN, DAY_TASK_TYPE_LABELS, DAY_TASK_TYPES, defaultQuizSplit,
  ITEM_TYPE_LABELS, QUIZ_DEFAULT, QUIZ_ITEM_TYPES, QUIZ_MAX, QUIZ_MIN, toStoredTaskType, validateOptions } from './dayTaskOptions';

const TASK_DESCRIPTIONS = {
  activity: 'One classroom activity, text only.',
  quiz: `${QUIZ_MIN} to ${QUIZ_MAX} checked items.`,
  assignment: `${ASSIGNMENT_MIN} to ${ASSIGNMENT_MAX} essay tasks.`,
};
const STEP_HEADINGS = { day: 'Choose a day', task: 'Choose a task', generating: 'Generating', preview: 'Preview' };
const CARD_STYLE = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };
const SELECTED_CARD_STYLE = { ...CARD_STYLE, border: '2px solid var(--banner-accent, #1908DF)' };
const MUTED = { color: 'var(--text-muted)' };

// An empty field must fail validation, but Number('') would quietly read as 0.
const toCount = value => (value.trim() === '' ? NaN : Number(value));
const toInputs = counts => Object.fromEntries(QUIZ_ITEM_TYPES.map(type => [type, String(counts[type])]));
const pointsLabel = points => `${points} ${points === 1 ? 'pt' : 'pts'}`;

function EssayKey({ essay }) {
  return (
    <div className="mt-2 text-sm space-y-1" style={{ color: 'var(--text)' }}>
      <p className="whitespace-pre-wrap"><strong>Reference answer:</strong> {essay.referenceAnswer}</p>
      <p><strong>Word range:</strong> {essay.minWords}-{essay.maxWords} words</p>
      <p><strong>Rubric:</strong></p>
      <ul className="list-disc pl-5">
        {essay.rubric.map((part, index) => <li key={index}>{part.criterion} ({pointsLabel(part.points)})</li>)}
      </ul>
    </div>
  );
}

function QuestionPreview({ question, index, answer }) {
  return (
    <li className="rounded-lg p-3" style={CARD_STYLE}>
      <div className="flex flex-wrap items-center gap-2 mb-1 text-xs" style={MUTED}>
        <span>Item {index + 1}</span>
        <Badge bg="var(--banner-pill-bg, rgba(25,8,223,.08))" color="var(--banner-accent, #1908DF)">{ITEM_TYPE_LABELS[question.item_type]}</Badge>
        <span>{pointsLabel(question.points)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{question.question}</p>
      {question.item_type === 'multiple_choice' ? (
        <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--text)' }}>
          {question.options.map((option, optionIndex) => (
            <li key={optionIndex} className={option === answer ? 'font-semibold' : ''}>
              {option}{option === answer && ' (Correct answer)'}
            </li>
          ))}
        </ul>
      ) : question.item_type === 'essay' ? <EssayKey essay={question.essay} /> : (
        <p className="mt-2 text-sm" style={{ color: 'var(--text)' }}><strong>Answer:</strong> {answer}</p>
      )}
    </li>
  );
}

function TaskPreview({ result, seconds }) {
  const answers = new Map(result.answerKey.map(key => [key.localId, key.correct_answer]));
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>{result.title}</p>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{result.instructions}</p>
      {result.questions.length > 0 && (
        <ol className="space-y-2">
          {result.questions.map((question, index) => (
            <QuestionPreview key={question.localId} question={question} index={index} answer={answers.get(question.localId)} />
          ))}
        </ol>
      )}
      <p className="text-xs" style={MUTED}>Generated in {seconds} s</p>
    </div>
  );
}

export default function GenerateDayTaskModal({ plan, days, onClose, onUseDraft }) {
  const [step, setStep] = useState('day');
  const [day, setDay] = useState(null);
  const [taskType, setTaskType] = useState(null);
  const [quizCount, setQuizCount] = useState(String(QUIZ_DEFAULT));
  const [assignmentCount, setAssignmentCount] = useState(String(ASSIGNMENT_DEFAULT));
  const [customized, setCustomized] = useState(false);
  const [typeInputs, setTypeInputs] = useState(() => toInputs(defaultQuizSplit(QUIZ_DEFAULT)));
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const controllerRef = useRef(null);
  const startedAtRef = useRef(0);
  const headingRef = useRef(null);
  const fieldId = useId();

  const typeCounts = Object.fromEntries(QUIZ_ITEM_TYPES.map(type => [type, toCount(typeInputs[type])]));
  const quizTotal = Object.values(typeCounts).reduce((sum, count) => sum + (Number.isFinite(count) ? count : 0), 0);
  const options = taskType === 'quiz'
    ? (customized ? { typeCounts } : { itemCount: toCount(quizCount) })
    : taskType === 'assignment' ? { itemCount: toCount(assignmentCount) } : {};
  const validation = validateOptions({ taskType, ...options });
  const showValidation = taskType && !validation.ok;
  const validationId = `${fieldId}-validation`;

  // The control that was just clicked leaves the page on every step change.
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [step]);

  useEffect(() => {
    if (step !== 'generating') return undefined;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Never rejects: Btn logs a rejected handler, and nothing here may be logged.
  const generate = async () => {
    if (controllerRef.current || !validation.ok) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    setElapsed(0);
    setError('');
    setPreview(null);
    setStep('generating');
    try {
      const result = await requestDayTask({ lessonPlanId: plan.id, day, taskType, ...options,
        customized: taskType === 'quiz' && customized }, { signal: controller.signal });
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      setPreview({ result, seconds: Math.round((Date.now() - startedAt) / 1000) });
      setStep('preview');
    } catch (failure) {
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      if (!isCancelError(failure)) setError(failure?.message || 'The task could not be generated. Nothing was saved.');
      setStep('task');
    }
  };

  // Never rejects, and Btn ignores a second click until this promise settles.
  const applyDraft = async () => {
    setSaving(true);
    setError('');
    try {
      await onUseDraft(preview.result, { day, taskType, storedTaskType: toStoredTaskType(taskType) });
    } catch (failure) {
      setError(failure?.message || 'The draft could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStep('task');
  };

  const toggleCustomized = (checked) => {
    const count = toCount(quizCount);
    if (checked) setTypeInputs(toInputs(defaultQuizSplit(validateOptions({ taskType: 'quiz', itemCount: count }).ok ? count : QUIZ_DEFAULT)));
    setCustomized(checked);
  };

  const countField = (label, value, onChange, min, max) => (
    <div>
      <label htmlFor={`${fieldId}-count`} className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{label}</label>
      <Input id={`${fieldId}-count`} type="number" min={min} max={max} step={1} value={value} className="min-h-11"
        onChange={event => onChange(event.target.value)} aria-invalid={showValidation || undefined}
        aria-describedby={showValidation ? validationId : undefined} />
    </div>
  );

  return (
    <Modal title="Generate Day Task" onClose={onClose} size="max-w-2xl" closeDisabled={step === 'generating' || saving}
      description={`Generate one task for one day of ${plan.title}.`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none" style={{ color: 'var(--text)' }}>
            {STEP_HEADINGS[step]}
          </h3>
          {step !== 'day' && <Badge bg="var(--banner-pill-bg, rgba(25,8,223,.08))" color="var(--banner-accent, #1908DF)">{day}</Badge>}
        </div>
        <p className="text-sm truncate" style={MUTED}>{plan.title}</p>

        {step === 'day' && (
          <div className="space-y-2">
            {days.map(entry => (
              <button key={entry.day} type="button" className="w-full min-h-11 rounded-lg px-3 py-2 text-left" style={CARD_STYLE}
                onClick={() => { setDay(entry.day); setStep('task'); }}>
                <span className="block text-sm font-semibold">{entry.day}</span>
                {entry.objective && <span className="block text-xs truncate" style={MUTED}>{entry.objective}</span>}
              </button>
            ))}
          </div>
        )}

        {step === 'task' && (
          <div className="space-y-4">
            {error && (
              <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {error}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {DAY_TASK_TYPES.map(type => (
                <button key={type} type="button" aria-pressed={taskType === type} className="min-h-11 rounded-lg px-3 py-2 text-left"
                  style={taskType === type ? SELECTED_CARD_STYLE : CARD_STYLE} onClick={() => setTaskType(type)}>
                  <span className="block text-sm font-semibold">{DAY_TASK_TYPE_LABELS[type]}</span>
                  <span className="block text-xs" style={MUTED}>{TASK_DESCRIPTIONS[type]}</span>
                </button>
              ))}
            </div>

            {taskType === 'quiz' && (
              <div className="space-y-3">
                {!customized && countField(`Number of items (${QUIZ_MIN}-${QUIZ_MAX})`, quizCount, setQuizCount, QUIZ_MIN, QUIZ_MAX)}
                <label className="flex items-center gap-2 min-h-11 text-sm" style={{ color: 'var(--text)' }}>
                  <input type="checkbox" checked={customized} onChange={event => toggleCustomized(event.target.checked)} />
                  Customize by question type
                </label>
                {customized && (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {QUIZ_ITEM_TYPES.map(type => (
                        <div key={type}>
                          <label htmlFor={`${fieldId}-${type}`} className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{ITEM_TYPE_LABELS[type]}</label>
                          <Input id={`${fieldId}-${type}`} type="number" min={0} max={QUIZ_MAX} step={1} value={typeInputs[type]} className="min-h-11"
                            onChange={event => setTypeInputs(current => ({ ...current, [type]: event.target.value }))}
                            aria-invalid={showValidation || undefined} aria-describedby={showValidation ? validationId : undefined} />
                        </div>
                      ))}
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text)' }}>Total: {quizTotal}</p>
                  </div>
                )}
              </div>
            )}

            {taskType === 'assignment'
              && countField(`Number of items (${ASSIGNMENT_MIN}-${ASSIGNMENT_MAX})`, assignmentCount, setAssignmentCount, ASSIGNMENT_MIN, ASSIGNMENT_MAX)}

            {showValidation && <p id={validationId} className="text-sm" style={{ color: '#ef4444' }}>{validation.error}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="outline" className="min-h-11" onClick={() => { setError(''); setStep('day'); }}>Back</Btn>
              <Btn className="min-h-11" disabled={!validation.ok} onClick={() => { void generate(); }}>Generate</Btn>
            </div>
          </div>
        )}

        {step === 'generating' && (
          <div className="space-y-3">
            <p role="status" className="text-sm" style={{ color: 'var(--text)' }}>Generating {DAY_TASK_TYPE_LABELS[taskType]} for {day}.</p>
            <p role="timer" className="text-sm" style={MUTED}>{elapsed} s</p>
            <div className="flex justify-end"><Btn variant="outline" className="min-h-11" onClick={cancel}>Cancel</Btn></div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <TaskPreview result={preview.result} seconds={preview.seconds} />
            {error && (
              <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="outline" className="min-h-11" disabled={saving} onClick={() => { setError(''); setStep('task'); }}>Back</Btn>
              <Btn variant="pastel" className="min-h-11" disabled={saving} onClick={() => { void generate(); }}>Regenerate</Btn>
              {onUseDraft && (
                <Btn className="min-h-11" disabled={saving} onClick={applyDraft}>
                  {saving ? 'Saving…' : 'Use this draft'}
                </Btn>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
