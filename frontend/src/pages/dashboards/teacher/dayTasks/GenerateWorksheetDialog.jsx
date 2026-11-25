import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, Sparkles } from 'lucide-react';
import { Badge, Btn, Input, Modal } from '../shared/ui';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { appErrorMessage } from '../../../../lib/appErrorMessage';
import { isCancelError, requestDayTask } from './dayTaskClient';
import { saveDayTaskDraft } from './dayTaskSave';
import { DocumentPreview } from './GenerateDayTaskModal';
import { ASSIGNMENT_DEFAULT, DAY_TASK_TYPE_LABELS, DAY_TASK_TYPES, defaultQuizSplit, ITEM_TYPE_LABELS, QUIZ_DEFAULT,
  QUIZ_ITEM_TYPES, QUIZ_MAX, QUIZ_MIN, validateOptions } from './dayTaskOptions';
import { draftPlans, generatablePlans, planDays, quizTotals } from './planChoice';

// U-PDF-T (design p15): build a worksheet from a SAVED lesson plan. Subject and
// grade come from the plan; the class is chosen later in Distribute. Activity,
// Quiz and Assignment are the existing day-task types (same request, preview
// and save as Generate Task): Activity and Assignment use their scripts as they
// are (Assignment with its default item count); a Quiz sends the per-type
// counts, and Total points is read-only (the server sets points per item).
const TYPE_HELP = {
  activity: 'One classroom activity, text only.',
  quiz: `${QUIZ_MIN} to ${QUIZ_MAX} checked items.`,
  assignment: `${ASSIGNMENT_DEFAULT} essay tasks, checked by you.`,
};
const DOCUMENT_HEADINGS = { activity: 'ACTIVITY', quiz: 'QUIZ', assignment: 'ASSIGNMENT' };
const PLAN_COLUMNS = 'id, teacher_id, title, subject, subject_id, grade_level, status, objectives, ai_generated, updated_at, created_at';
const MUTED = { color: 'var(--text-muted)' };
const CARD = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };
const PICKED = { ...CARD, border: '2px solid var(--banner-accent, #1908DF)', backgroundColor: 'var(--card2)' };
const toCount = value => (String(value).trim() === '' ? NaN : Number(value));
const shortDate = value => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
};

export default function GenerateWorksheetDialog({ teacherId, onClose, onSaved, onCreateManually, client = supabase }) {
  const [plansState, setPlansState] = useState({ status: 'loading', rows: [] });
  const [planId, setPlanId] = useState('');
  const [day, setDay] = useState('');
  const [taskType, setTaskType] = useState(null);
  const [typeInputs, setTypeInputs] = useState(() => Object.fromEntries(Object.entries(defaultQuizSplit(QUIZ_DEFAULT)).map(([k, v]) => [k, String(v)])));
  const [step, setStep] = useState('options');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const controllerRef = useRef(null);
  const startedRef = useRef(0);
  const fieldId = useId();

  // The first read starts in 'loading' (initial state); Retry sets it again before reading.
  const loadPlans = useCallback(async () => {
    try {
      const { data, error: readError } = await withRetry(() => client.from('lesson_plans').select(PLAN_COLUMNS)
        .eq('teacher_id', teacherId).order('updated_at', { ascending: false }), { label: 'Generate worksheet lesson plans' });
      if (readError) throw readError;
      setPlansState({ status: 'ready', rows: data || [] });
    } catch {
      setPlansState({ status: 'error', rows: [] });
    }
  }, [client, teacherId]);
  useEffect(() => { void Promise.resolve().then(loadPlans); }, [loadPlans]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (step !== 'generating') return undefined;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const saved = useMemo(() => generatablePlans(plansState.rows, teacherId), [plansState.rows, teacherId]);
  const drafts = useMemo(() => draftPlans(plansState.rows, teacherId), [plansState.rows, teacherId]);
  const plan = saved.find(row => row.id === planId) || null;
  const days = useMemo(() => (plan ? planDays(plan) : []), [plan]);
  const chosenDay = days.find(entry => entry.day === day) || null;

  const typeCounts = Object.fromEntries(QUIZ_ITEM_TYPES.map(type => [type, toCount(typeInputs[type])]));
  const totals = quizTotals(typeCounts);
  const options = taskType === 'quiz' ? { typeCounts } : taskType === 'assignment' ? { itemCount: ASSIGNMENT_DEFAULT } : {};
  const validation = taskType ? validateOptions({ taskType, ...options }) : { ok: false, error: '' };
  const ready = Boolean(plan && chosenDay && taskType && validation.ok);

  const choosePlan = id => { setPlanId(id); setDay(''); setError(''); };

  // Never rejects (Btn would log a rejected handler).
  const generate = async () => {
    if (!ready || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    startedRef.current = Date.now();
    setElapsed(0);
    setError('');
    setStep('generating');
    try {
      const result = await requestDayTask({ lessonPlanId: plan.id, day, taskType, ...options, customized: taskType === 'quiz' },
        { signal: controller.signal });
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      setPreview({ result, seconds: Math.round((Date.now() - startedRef.current) / 1000), plan, day, taskType });
      setStep('preview');
    } catch (failure) {
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      if (!isCancelError(failure)) setError(appErrorMessage(failure, 'The worksheet could not be generated. Nothing was saved.'));
      setStep('options');
    }
  };
  const cancelGeneration = () => { controllerRef.current?.abort(); controllerRef.current = null; setStep('options'); };

  const useDraft = async () => {
    setSaving(true);
    setError('');
    try {
      const source = preview.plan;
      await saveDayTaskDraft({ plan: { id: source.id, title: source.title, subject: source.subject, grade_level: source.grade_level,
        subject_id: source.subject_id }, result: preview.result, day: preview.day, taskType: preview.taskType, teacherId });
      onSaved();
    } catch (failure) {
      setError(appErrorMessage(failure, 'The draft could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const busy = step === 'generating' || saving;
  return (
    <Modal title="Generate worksheet" onClose={onClose} size="max-w-5xl" fullScreenOnPhone closeDisabled={busy}
      description="Build a worksheet from a saved lesson plan.">
      <p className="text-sm mb-4" style={MUTED}>Build a worksheet from a saved lesson plan.</p>
      {error && <p role="alert" className="rounded-lg px-3 py-2 mb-4 text-sm" style={{ color: 'var(--badge-red-fg)', backgroundColor: 'var(--badge-red-bg)', border: '1px solid var(--badge-red-border)' }}>{error}</p>}

      {step === 'generating' && <div className="space-y-3">
        <p role="status" className="text-sm" style={{ color: 'var(--text)' }}>Generating {DAY_TASK_TYPE_LABELS[taskType]} for {day}.</p>
        <p role="timer" className="text-sm" style={MUTED}>{elapsed} s</p>
        <div className="flex justify-end"><Btn variant="outline" className="min-h-11" onClick={cancelGeneration}>Cancel</Btn></div>
      </div>}

      {step === 'preview' && preview && <div className="space-y-4">
        <DocumentPreview result={preview.result} plan={preview.plan} seconds={preview.seconds} heading={DOCUMENT_HEADINGS[preview.taskType]} />
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="outline" className="min-h-11" disabled={saving} onClick={() => { setError(''); setStep('options'); }}>Back</Btn>
          <Btn variant="pastel" className="min-h-11" disabled={saving} onClick={() => { void generate(); }}>Regenerate</Btn>
          <Btn className="min-h-11" disabled={saving} onClick={useDraft}>{saving ? 'Saving…' : 'Use this draft'}</Btn>
        </div>
      </div>}

      {step === 'options' && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] items-start">
        <section aria-labelledby={`${fieldId}-options`} className="rounded-xl p-4 sm:p-5 grid gap-5 min-w-0" style={CARD}>
          <h3 id={`${fieldId}-options`} className="text-base font-semibold">Worksheet options</h3>

          {plansState.status === 'loading' && <p role="status" className="text-sm" style={MUTED}>Loading your lesson plans…</p>}
          {plansState.status === 'error' && <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-sm">Your lesson plans could not be loaded.</p>
            <Btn variant="outline" className="min-h-11" onClick={() => { setPlansState({ status: 'loading', rows: [] }); void loadPlans(); }}>Retry</Btn>
          </div>}
          {plansState.status === 'ready' && saved.length === 0 && <p className="text-sm" style={MUTED}>
            No saved lesson plans yet. Save a lesson plan in Lesson Plans, then generate a worksheet from it.</p>}

          {plansState.status === 'ready' && saved.length > 0 && <>
            <div>
              <label htmlFor={`${fieldId}-plan`} className="block text-sm font-medium mb-1">Lesson plan</label>
              <select id={`${fieldId}-plan`} value={planId} onChange={event => choosePlan(event.target.value)}
                className="w-full min-h-11 px-3 rounded-lg text-base" style={{ ...CARD, backgroundColor: 'var(--card-bg)' }}>
                <option value="">Choose a saved lesson plan</option>
                {saved.map(row => <option key={row.id} value={row.id}>
                  {[row.title || 'Untitled lesson plan', row.subject, row.grade_level].filter(Boolean).join(' · ')}</option>)}
              </select>
              <p className="text-xs mt-1" style={MUTED}>Subject and grade come from the lesson plan. You choose the class when you distribute.</p>
            </div>

            {plan && <fieldset className="grid gap-2 min-w-0">
              <legend className="text-sm font-medium mb-1">Day</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {days.map(entry => <label key={entry.day} className="flex items-start gap-3 min-h-11 rounded-lg px-3 py-2 cursor-pointer min-w-0"
                  style={day === entry.day ? PICKED : CARD}>
                  <input type="radio" name={`${fieldId}-day`} value={entry.day} checked={day === entry.day} onChange={() => setDay(entry.day)} className="mt-1" />
                  <span className="min-w-0"><span className="block text-sm font-semibold">{entry.day}</span>
                    {entry.topic && <span className="block text-xs break-words" style={MUTED}>{entry.topic}</span>}</span>
                </label>)}
              </div>
            </fieldset>}

            <fieldset className="grid gap-2 min-w-0">
              <legend className="text-sm font-medium mb-1">Type of assessment</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {DAY_TASK_TYPES.map(type => <label key={type} className="flex items-start gap-3 min-h-11 rounded-lg px-3 py-2 cursor-pointer min-w-0"
                  style={taskType === type ? PICKED : CARD}>
                  <input type="radio" name={`${fieldId}-type`} value={type} checked={taskType === type} onChange={() => setTaskType(type)} className="mt-1" />
                  <span className="min-w-0"><span className="block text-sm font-semibold">{DAY_TASK_TYPE_LABELS[type]}</span>
                    <span className="block text-xs" style={MUTED}>{TYPE_HELP[type]}</span></span>
                </label>)}
              </div>
            </fieldset>

            {taskType === 'quiz' && <fieldset className="grid gap-3 min-w-0" aria-describedby={!validation.ok ? `${fieldId}-quiz-error` : undefined}>
              <legend className="text-sm font-medium mb-1">Question types</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {QUIZ_ITEM_TYPES.map(type => <div key={type}>
                  <label htmlFor={`${fieldId}-${type}`} className="block text-sm mb-1">{ITEM_TYPE_LABELS[type]}</label>
                  <Input id={`${fieldId}-${type}`} type="number" inputMode="numeric" min={0} max={QUIZ_MAX} step={1} className="min-h-11 text-base"
                    value={typeInputs[type]} aria-invalid={!validation.ok || undefined}
                    onChange={event => setTypeInputs(current => ({ ...current, [type]: event.target.value }))} />
                </div>)}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-sm mb-1">Total items</p>
                  <output className="block min-h-11 px-3 py-2 rounded-lg text-base" style={{ ...CARD, backgroundColor: 'var(--card2)' }}>{totals.items}</output></div>
                <div><p className="text-sm mb-1">Total points</p>
                  <output className="block min-h-11 px-3 py-2 rounded-lg text-base" style={{ ...CARD, backgroundColor: 'var(--card2)' }}>{totals.points}</output></div>
              </div>
              <p className="text-xs" style={MUTED}>Points per item are set for you: 1 for multiple choice, true / false and identification, 2 for enumeration.</p>
              {!validation.ok && <p id={`${fieldId}-quiz-error`} role="alert" className="text-sm" style={{ color: 'var(--badge-red-fg)' }}>{validation.error}</p>}
            </fieldset>}

            <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--card2)', color: 'var(--text-muted)' }}>
              <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />The worksheet follows the DepEd layout your saved worksheets use.</p>
          </>}

          <div className="flex flex-wrap items-center gap-2">
            <Btn className="min-h-11" disabled={!ready} onClick={() => { void generate(); }}><Sparkles size={16} aria-hidden="true" />Generate worksheet</Btn>
            <Btn variant="outline" className="min-h-11" onClick={onCreateManually}>Create manually instead</Btn>
            <Badge color="var(--banner-accent)" bg="var(--card2)"><Sparkles size={12} className="inline mr-1" aria-hidden="true" />Powered by Gemini</Badge>
          </div>
        </section>

        <aside className="grid gap-4 min-w-0" aria-label="About the lesson plan">
          <section aria-labelledby={`${fieldId}-source`} className="rounded-xl p-4 grid gap-2 min-w-0" style={CARD}>
            <h3 id={`${fieldId}-source`} className="text-base font-semibold">Source lesson plan</h3>
            <p className="text-xs" style={MUTED}>Worksheets are based on a saved plan.</p>
            {plan ? <div className="rounded-lg p-3 grid gap-1 min-w-0" style={{ backgroundColor: 'var(--card2)' }}>
              <p className="text-sm font-semibold break-words">{plan.title || 'Untitled lesson plan'}</p>
              {[plan.subject, plan.grade_level].filter(Boolean).length > 0 && <p className="text-xs break-words" style={MUTED}>{[plan.subject, plan.grade_level].filter(Boolean).join(' · ')}</p>}
              <p className="flex flex-wrap items-center gap-2 text-xs" style={MUTED}>
                <Badge color="var(--badge-green-fg, #15803d)" bg="var(--badge-green-bg, rgba(22,163,74,0.12))">Saved</Badge>
                {shortDate(plan.updated_at) && <span>Last edited {shortDate(plan.updated_at)}</span>}
              </p>
              {chosenDay && <p className="text-xs break-words"><strong>{chosenDay.day}</strong>{chosenDay.topic ? ` · ${chosenDay.topic}` : ''}</p>}
            </div> : <p className="text-sm" style={MUTED}>Choose a lesson plan to see it here.</p>}
          </section>
          <section aria-labelledby={`${fieldId}-drafts`} className="rounded-xl p-4 grid gap-2 min-w-0" style={CARD}>
            <h3 id={`${fieldId}-drafts`} className="text-base font-semibold">If the plan is a draft</h3>
            <p className="text-sm" style={MUTED}>Draft lesson plans are not listed. Save the plan in Lesson Plans first, then generate its worksheet here.</p>
            {plansState.status === 'ready' && drafts.length > 0 && <p className="text-xs" style={MUTED}>
              {drafts.length === 1 ? '1 draft lesson plan is waiting to be saved.' : `${drafts.length} draft lesson plans are waiting to be saved.`}</p>}
          </section>
        </aside>
      </div>}
    </Modal>
  );
}
