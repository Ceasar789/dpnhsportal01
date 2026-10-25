import { useMemo, useState } from 'react';
import FullManualIlawEditor from '../src/pages/dashboards/teacher/ilaw/FullManualIlawEditor';
import { createTemporaryManualIlawDraft } from '../src/pages/dashboards/teacher/ilaw/fullManualIlawModel';
import { parseManualIlawV2 } from '../src/pages/dashboards/teacher/ilaw/manualIlawV2';
import { createMockManualPlanService } from './mockManualPlanService';

const teacher = { id: 'synthetic-mps-teacher', role: 'teacher', active: true };
const assignment = { subjectId: 'synthetic-mps-subject', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' };
const makeDraft = () => ({ ...createTemporaryManualIlawDraft(teacher.id, { name: 'Synthetic Teacher' }), assignment });
const otherRows = [
  { id: 'synthetic-ai', title: 'Synthetic AI lesson', ai_generated: true, type: 'AI-Generated' },
  { id: 'synthetic-legacy', title: 'Synthetic legacy lesson', ai_generated: false, type: 'Other saved plan' },
];

export default function MockManualPersistence() {
  const service = useMemo(() => createMockManualPlanService({ storage: window.sessionStorage, teacher, assignments: [assignment] }), []);
  const [draft, setDraft] = useState(makeDraft);
  const [baselineDraft, setBaselineDraft] = useState(null);
  const [planId, setPlanId] = useState(null);
  const [revision, setRevision] = useState(undefined);
  const [rows, setRows] = useState(() => service.listManualPlans());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);

  const hasUnsavedEdits = () => {
    const baseline = baselineDraft ?? makeDraft();
    return JSON.stringify({ document: draft.document, sourceDetails: draft.sourceDetails }) !==
      JSON.stringify({ document: baseline.document, sourceDetails: baseline.sourceDetails });
  };
  const refreshList = () => { setRows(service.listManualPlans()); setUnknown(false); };
  const save = async intent => {
    if (pending || unknown) return;
    setPending(true); setError(''); setMessage('');
    try {
      const row = await service.saveManualPlan({
        teacherId: teacher.id, planId, assignment, document: draft.document,
        sourceDetails: draft.sourceDetails, intent, expectedRevision: revision,
      });
      setPlanId(row.id); setRevision(row.revision);
      setBaselineDraft({ document: structuredClone(draft.document), sourceDetails: { ...draft.sourceDetails } });
      setRows(service.listManualPlans());
      setMessage(`${intent === 'draft' ? 'Draft' : 'Saved plan'} confirmed in this synthetic browser fixture only. ID: ${row.id}.`);
    } catch (cause) {
      setError(cause.message);
      if (cause.message.includes('outcome is unknown')) setUnknown(true);
    } finally { setPending(false); }
  };
  const reopen = async id => {
    if (pending) return;
    if (hasUnsavedEdits() && !window.confirm('Discard the current unsaved mock edits and reopen this plan?')) return;
    setPending(true); setError(''); setMessage('');
    try {
      const { row, payload } = await service.loadManualPlan(id);
      setDraft({ ...makeDraft(), document: payload.document, sourceDetails: payload.sourceDetails });
      setBaselineDraft({ document: structuredClone(payload.document), sourceDetails: { ...payload.sourceDetails } });
      setPlanId(row.id); setRevision(row.revision);
      setMessage(`${payload.workflowState === 'draft' ? 'Draft' : 'Saved plan'} reopened in the Full Manual ILAW editor.`);
    } catch (cause) { setError(cause.message); }
    finally { setPending(false); }
  };
  const startNew = () => {
    if (hasUnsavedEdits() && !window.confirm('Discard the current unsaved mock edits?')) return;
    setDraft(makeDraft()); setBaselineDraft(null); setPlanId(null); setRevision(undefined); setError(''); setMessage('');
  };

  return <section className="mps-mock" aria-label="Mock Manual ILAW persistence">
    <p role="status"><strong>Isolated mock only.</strong> Draft and Save below write synthetic browser-session data, never EduScribe or Supabase. The real Teacher Dashboard Save remains blocked.</p>
    <div className="mps-mock-list">
      <h2>Saved Lesson Plans — synthetic fixture</h2>
      <button type="button" onClick={startNew} disabled={pending}>New mock Manual ILAW</button>
      <button type="button" onClick={refreshList} disabled={pending}>Refresh mock list after uncertain result</button>
      <ul>
        {rows.map(row => {
          const payload = parseManualIlawV2(row.objectives, { teacherId: teacher.id, planId: row.id });
          return <li key={row.id}><strong>{row.title || 'Untitled Manual ILAW'}</strong> · Manual ILAW · {payload.workflowState === 'draft' ? 'Draft' : 'Saved'} · {row.id}
            <button type="button" onClick={() => reopen(row.id)} disabled={pending}>Reopen {row.title || row.id}</button></li>;
        })}
        {otherRows.map(row => <li key={row.id}>{row.title} · {row.type}</li>)}
      </ul>
    </div>
    <FullManualIlawEditor mode="active" manualDraft={draft} onManualDraftChange={setDraft} baselineDraft={baselineDraft ?? makeDraft()} />
    <div className="mps-mock-actions" role="group" aria-label="Mock private persistence actions">
      <button type="button" className="mps-mock-draft" onClick={() => save('draft')} disabled={pending || unknown}>Draft</button>
      <button type="button" className="mps-mock-save" onClick={() => save('saved')} disabled={pending || unknown}>Save</button>
      {pending && <span role="status">Mock writer working…</span>}
    </div>
    <div className="mps-mock-actions" role="group" aria-label="Mock failure controls">
      <button type="button" onClick={() => service.failNext('server')}>Reject next mock save</button>
      <button type="button" onClick={() => service.failNext('ambiguous')}>Lose next mock response</button>
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
