import { useEffect, useId, useRef, useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { Badge, Btn } from '../shared/ui';
import DownloadMenu from '../shared/DownloadMenu';
import useFillHeight from '../shared/useFillHeight';
import '../shared/doc-scroll.css';
import { AI_GENERATED, worksheetSource } from '../tabs/worksheetSource';
import { planViewDate } from '../lessonPlans/planHistory';
import { savedWorksheetToDraft } from './savedWorksheetDraft';
import WorksheetDraftDocument from './WorksheetDraftDocument';

// An Activity is stored with task_type 'worksheet'.
const HEADINGS = { worksheet: 'ACTIVITY', quiz: 'QUIZ', assignment: 'ASSIGNMENT', exam: 'EXAM' };
const CARD = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };
const MUTED = { color: 'var(--text-muted)' };

// Unlike SavedWorksheetPreview, zero items is valid here: an Activity is a
// header and directions with no questions.
// U-PDF-T-FIX-A (design p18): a page in the Worksheets tab, not a dialog. Back to
// Worksheets, title, Saved, Powered by Gemini (AI rows), Last edited (only a real
// date), the Download menu (`downloads`, optional) and Edit questions when the
// tab offers it. "Student copy" and "Key to Correction" tabs replace the answer-key
// switch and show the same documents it showed; the paper keeps its own labelled,
// focusable scroll area.
export default function SavedDayTaskPreview({ worksheet, loadItems, onClose, onEditQuestions = null, downloads = [] }) {
  const [state, setState] = useState({ status: 'loading' });
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const paperRef = useRef(null);
  const headingRef = useRef(null);
  const tabRefs = useRef([]);
  const id = useId();
  useFillHeight(paperRef, { enabled: state.status === 'ready', min: 200, deps: [showAnswerKey] });

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => loadItems(worksheet.id)).then((data) => {
      if (!active) return;
      setState(Array.isArray(data?.items)
        ? { status: 'ready', draft: savedWorksheetToDraft({ worksheet, items: data.items, keys: data.keys }) }
        : { status: 'failed' });
    }).catch(() => { if (active) setState({ status: 'failed' }); });
    return () => { active = false; };
  }, [worksheet, loadItems]);

  const documentProps = { variant: 'day-task', heading: HEADINGS[worksheet.task_type], structuredDirections: worksheet.task_type === 'worksheet' };
  const hasKey = state.status === 'ready' && state.draft.questions.length > 0;
  const keyShown = hasKey && showAnswerKey;
  const edited = planViewDate(worksheet.updated_at);
  const tabs = [['student', 'Student copy', false], ['key', 'Key to Correction', true]];
  const onTabKey = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + 1) % 2;
    setShowAnswerKey(next === 1);
    tabRefs.current[next]?.focus();
  };

  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4">
    <button type="button" onClick={onClose} className="flex items-center gap-1 min-h-[44px] text-sm font-medium hover:underline"
      style={{ color: 'var(--banner-accent)' }}>← Back to Worksheets</button>
    <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
      <div className="min-w-0">
        <h1 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="text-2xl font-bold break-words" style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>
          {worksheet.title || 'Worksheet'}</h1>
        <p className="flex flex-wrap items-center gap-2 mt-1 text-xs" style={MUTED}>
          <Badge color="var(--badge-green-fg)" bg="var(--badge-green-bg)">Saved</Badge>
          {worksheetSource(worksheet) === AI_GENERATED && <Badge color="var(--banner-accent)" bg="var(--card2)">
            <Sparkles size={12} className="inline mr-1" aria-hidden="true" />Powered by Gemini</Badge>}
          {edited && <span>Last edited {edited}</span>}
        </p>
      </div>
      {(onEditQuestions || downloads.length > 0) && <div className="flex flex-wrap items-center gap-2">
        {onEditQuestions && <Btn variant="outline" className="min-h-11" onClick={onEditQuestions}>Edit questions</Btn>}
        {downloads.length > 0 && <DownloadMenu items={downloads} name={worksheet.title || 'worksheet'} />}
      </div>}
    </div>
    {state.status === 'loading' && <p role="status">Loading this task...</p>}
    {state.status === 'failed' && <p role="alert">This task could not be loaded. Close this preview and try again.</p>}
    {state.status === 'ready' && <div className="space-y-3 min-w-0">
      {hasKey && <div role="tablist" aria-label="Worksheet copies" className="flex flex-wrap gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {tabs.map(([key, label, locked], index) => {
          const selected = (index === 1) === keyShown;
          return <button key={key} type="button" role="tab" id={`${id}-tab-${key}`} aria-selected={selected} aria-controls={`${id}-panel`}
            tabIndex={selected ? 0 : -1} ref={node => { tabRefs.current[index] = node; }}
            onClick={() => setShowAnswerKey(index === 1)} onKeyDown={event => onTabKey(event, index)}
            className="flex items-center gap-1.5 min-h-11 px-3 text-sm font-semibold -mb-px"
            style={{ color: selected ? 'var(--banner-accent)' : 'var(--text-muted)', borderBottom: `2px solid ${selected ? 'var(--banner-accent)' : 'transparent'}` }}>
            {locked && <Lock size={14} aria-hidden="true" />}{label}</button>;
        })}
      </div>}
      <div id={`${id}-panel`} role={hasKey ? 'tabpanel' : undefined} aria-labelledby={hasKey ? `${id}-tab-${keyShown ? 'key' : 'student'}` : undefined}
        className="rounded-xl p-3 sm:p-4 min-w-0" style={CARD}>
        <div ref={paperRef} role="region" aria-label="Worksheet" tabIndex={0} className="t-doc-scroll space-y-4">
          <WorksheetDraftDocument draft={state.draft} audience="student" {...documentProps} />
          {state.draft.questions.length === 0 && worksheet.task_type !== 'worksheet'
            && <p role="status" className="text-sm" style={MUTED}>{onEditQuestions ? 'No questions yet. Use Edit questions to add some.' : 'No questions yet.'}</p>}
          {keyShown && <WorksheetDraftDocument draft={state.draft} audience="teacher" {...documentProps} />}
        </div>
      </div>
      {!keyShown && <p className="text-xs" style={MUTED}>This is the copy students see. The answers are not included.</p>}
    </div>}
  </section>;
}
