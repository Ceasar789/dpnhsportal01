import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeContext } from '../src/pages/dashboards/teacher/hooks';
import QuestionBuilderModal from '../src/pages/dashboards/teacher/worksheets/QuestionBuilderModal';
import { createGeneratedDraft } from '../src/pages/dashboards/teacher/worksheets/generatedDraftModel';
import { Modal } from '../src/pages/dashboards/teacher/shared/ui';
import { prepareAiAssessmentWorksheetContext, prepareWorksheetContext } from '../src/pages/dashboards/teacher/lessonPlans/worksheetContext';
import { createBlankIlawDocument } from '../src/pages/dashboards/teacher/ilaw/ilawTemplateModel';
import { serializeManualIlawV2 } from '../src/pages/dashboards/teacher/ilaw/manualIlawV2';
import { generateWorksheetDraft } from '../../backend/src/lib/worksheetGenerator';
import '../src/styles/index.css';

const teacherId = 'synthetic-teacher-1';
const schoolYear = '2026-2027';
const assignments = [{ subject_id: 'synthetic-science', grade_level: 'Grade 7', subjects: { id: 'synthetic-science', name: 'Science' } }];
const manualDocument = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
manualDocument.info.nameOfLesson = 'Plant cells';
manualDocument.weekly.learningObjectives.Monday = 'Identify plant cell structures.';
manualDocument.weekly.flow.Monday = 'Observe a synthetic cell model.';
manualDocument.weekly.formativeAssessment.Monday = 'Label a cell diagram.';

const plans = [
  { id: 'synthetic-ai-plan', teacher_id: teacherId, ai_generated: true,
    title: 'Plant cells', subject_id: 'synthetic-science', grade_level: 'Grade 7',
    objectives: '<h2>Objectives</h2><p>Identify plant cell structures and their functions.</p><div class="ilaw-A"><h2>Assessment</h2><p>Label and compare plant cell diagrams.</p></div>' },
  { id: 'synthetic-manual-plan', teacher_id: teacherId, ai_generated: false,
    title: 'Plant cells', subject_id: 'synthetic-science', grade_level: 'Grade 7',
    objectives: serializeManualIlawV2({
      kind: 'eduscribe.manual-ilaw', version: 2, teacherId, planId: 'synthetic-manual-plan',
      title: 'Plant cells', workflowState: 'saved', document: manualDocument,
      assignment: { subjectId: 'synthetic-science', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear },
      sourceDetails: { classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'Identify plant cell structures.' },
    }) },
  { id: 'synthetic-legacy-plan', teacher_id: teacherId, ai_generated: true,
    title: 'Legacy plan without assignment metadata', subject_id: null, grade_level: null,
    objectives: '<p>Identify plant cell structures.</p>' },
];

const generatedResponse = JSON.stringify({
  title: 'Plant cells worksheet', questions: [
    { question: 'Which structure controls cell activities?', item_type: 'multiple_choice', points: 2,
      options: ['Nucleus', 'Cell wall', 'Vacuole'], correct_answer: 'Nucleus' },
    { question: 'Plant cells have a cell wall.', item_type: 'true_false', points: 1,
      options: [], correct_answer: 'True' },
  ],
});

export function PreviewApp() {
  const [dark, setDark] = useState(false);
  const [currentTeacher, setCurrentTeacher] = useState(teacherId);
  const [view, setView] = useState('plans');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [malformedNext, setMalformedNext] = useState(false);
  const [lastPlanId, setLastPlanId] = useState(null);
  const [progress, setProgress] = useState(null);
  const generation = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => () => { generation.current += 1; }, []);
  const onDraftChange = useCallback(next => setDraft(next), []);

  const create = async plan => {
    if (busyRef.current) return;
    busyRef.current = true;
    const requestId = ++generation.current;
    setBusy(true); setError(''); setLastPlanId(plan.id); setProgress({ plan, status: 'pending' });
    try {
      const prepare = plan.ai_generated ? prepareAiAssessmentWorksheetContext : prepareWorksheetContext;
      const eligible = prepare({
        plan, teacherId: currentTeacher, schoolYear, sourceTeacherId: currentTeacher,
        sourceSchoolYear: schoolYear, assignmentRows: currentTeacher === teacherId ? assignments : [],
      });
      if (eligible.status !== 'ready') throw new Error(eligible.reason);
      const result = await generateWorksheetDraft({ teacherId: currentTeacher, lessonPlanId: plan.id }, {
        // Synthetic test resolver only. The production route must perform its
        // own authenticated database authorization before calling this service.
        resolveAuthorizedContext: async () => ({
          ...eligible.context, teacherId: currentTeacher, activeTeacher: true,
          saved: true, assignmentVerified: true, schoolYear, currentSchoolYear: schoolYear,
        }),
        generateText: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (failNext) { setFailNext(false); throw new Error('Synthetic AI generation failed. Retry is safe; nothing was saved.'); }
          if (malformedNext) { setMalformedNext(false); return '{invalid worksheet JSON'; }
          return generatedResponse;
        },
      });
      if (requestId !== generation.current) return;
      const sample = { ...result, sourceLessonPlan: {
        ...result.sourceLessonPlan,
        contentExcerpt: eligible.context.source.kind === 'ai-html-text'
          ? eligible.context.source.lessonText.slice(0, 240)
          : eligible.context.source.learningObjectives.slice(0, 240),
      } };
      setProgress({ plan, status: 'ready', draft: createGeneratedDraft(sample, eligible.context.source.kind === 'manual-ilaw-v2' ? 'manual' : 'ai') });
    } catch (caught) {
      if (requestId === generation.current) { setError(caught.message); setProgress({ plan, status: 'error', message: caught.message }); }
    } finally {
      if (requestId === generation.current) { setBusy(false); busyRef.current = false; }
    }
  };

  const cancelProgress = () => {
    generation.current += 1; busyRef.current = false; setBusy(false); setProgress(null); setError('');
  };
  const openReadyDraft = () => {
    if (progress?.status !== 'ready') return;
    setDraft(progress.draft); setProgress(null); setView('worksheets');
  };

  const switchTeacher = () => {
    generation.current += 1; busyRef.current = false; setBusy(false);
    setCurrentTeacher(value => value === teacherId ? 'synthetic-teacher-2' : teacherId);
    setDraft(null); setView('plans'); setError(''); setLastPlanId(null); setProgress(null);
  };
  useEffect(() => {
    window.addEventListener('lpw2b:switch-teacher', switchTeacher);
    return () => window.removeEventListener('lpw2b:switch-teacher', switchTeacher);
  });
  const discard = () => { setDraft(null); setView('plans'); setError(''); };
  const shell = { background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', padding: '24px 16px' };
  const card = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
  const button = { border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', minHeight: 44 };

  return <ThemeContext.Provider value={{ dark, toggleDark: () => setDark(value => !value) }}>
    <main style={shell}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>EduScribe · Isolated Worksheet Draft QA</strong>
          <button style={button} onClick={() => setDark(value => !value)}>Theme: {dark ? 'Dark' : 'Light'}</button>
          <button style={button} onClick={switchTeacher}>Teacher: {currentTeacher}</button>
        </header>
        <nav aria-label="Synthetic Teacher tabs" style={{ display: 'flex', gap: 8 }}>
          <button style={button} aria-current={view === 'plans' ? 'page' : undefined} onClick={() => setView('plans')}>Saved Lesson Plans</button>
          <button style={button} aria-current={view === 'worksheets' ? 'page' : undefined} onClick={() => setView('worksheets')}>Worksheets</button>
        </nav>
        {view === 'plans' ? <section style={card} aria-label="Synthetic saved Lesson Plans">
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Saved Lesson Plans</h1>
          <p>Fictional records only. Manual ILAW is a synthetic saved-plan fixture.</p>
          <label style={{ display: 'block', marginTop: 12 }}><input type="checkbox" checked={failNext} onChange={event => setFailNext(event.target.checked)} /> Fail next generation</label>
          <label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={malformedNext} onChange={event => setMalformedNext(event.target.checked)} /> Return malformed generation</label>
          {error && !progress && <div role="alert" style={{ marginTop: 12, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {plans.map(plan => <article key={plan.id} style={card}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{plan.title}</h2>
              <p>{plan.ai_generated ? 'AI saved-plan fixture' : 'Manual ILAW V2 saved-plan fixture'} · {plan.subject_id && plan.grade_level ? 'Science · Grade 7' : 'Subject and grade require confirmation'}</p>
              <button style={button} disabled={busy} onClick={() => create(plan)} aria-label={`Generate Worksheet from ${plan.title}`}>
                {busy && lastPlanId === plan.id ? 'Generating…' : 'Generate Worksheet'}
              </button>
            </article>)}
          </div>
        </section> : <section style={card}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Worksheets</h1>
          <p>{draft ? 'Generated draft in memory. No Worksheet record exists.' : 'No generated draft is open.'}</p>
        </section>}
      </div>
    </main>
    {draft && view === 'worksheets' && <QuestionBuilderModal key={draft.draftId} worksheet={draft}
      draft={draft} onDraftChange={onDraftChange} onClose={discard} onDiscardDraft={discard} />}
    {progress && <Modal title="Sample worksheet generation" onClose={cancelProgress} escapeCloses>
      <div style={{ display: 'grid', gap: 12, color: 'var(--text)' }}>
        <strong>{progress.plan.title}</strong>
        {progress.status === 'pending' && <p role="status">Preparing sample worksheet…</p>}
        {progress.status === 'ready' && <p role="status">Sample worksheet ready. Open the unsaved draft in Worksheets.</p>}
        {progress.status === 'error' && <p role="alert">{progress.message} Nothing was saved. Retry or cancel this sample.</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={button} onClick={cancelProgress}>Cancel</button>
          {progress.status === 'error' && <button style={button} onClick={() => create(progress.plan)}>Retry</button>}
          {progress.status === 'ready' && <button style={button} onClick={openReadyDraft}>Open worksheet draft</button>}
        </div>
      </div>
    </Modal>}
  </ThemeContext.Provider>;
}

createRoot(document.getElementById('root')).render(<PreviewApp />);
