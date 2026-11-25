import { RefreshCw } from 'lucide-react';
import { Badge, Btn } from '../shared/ui';
import { outOfSyncByPlan } from './planSync';
import { planHistory, planViewDate } from './planHistory';

// U-PDF-T-FIX-A (design p16): the cards beside the lesson plan document.
// Only real data: "Linked worksheet" shows only when a worksheet was made from
// this plan (newest first), "History" only from stored timestamps.
// A day task stores an Activity as task_type 'worksheet'.
const TYPE_LABELS = { worksheet: 'Activity', quiz: 'Quiz', assignment: 'Assignment', exam: 'Exam', project: 'Project' };
const CARD = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };
const MUTED = { color: 'var(--text-muted)' };

export default function PlanViewAside({ plan, worksheets = [], details = null, canSync = false, syncDisabled = false, onSync }) {
  const sheet = worksheets[0] || null;
  // Every row here was made from this plan (the read filters on it).
  const outOfSync = Boolean(sheet && plan && (outOfSyncByPlan([plan], [{ ...sheet, source_lesson_plan_id: plan.id }]).get(plan.id) || 0) > 0);
  const facts = sheet ? [Number(sheet.items) > 0 && `${sheet.items} items`, TYPE_LABELS[sheet.task_type]].filter(Boolean) : [];
  const history = planHistory(plan, worksheets);
  return (
    <aside className="grid gap-4 min-w-0 content-start" aria-label="About this lesson plan">
      {sheet && <section aria-labelledby="plan-view-linked" className="rounded-xl p-4 grid gap-3 min-w-0" style={CARD}>
        <h2 id="plan-view-linked" className="text-base font-semibold">Linked worksheet</h2>
        <div className="rounded-lg p-3 grid gap-1 min-w-0" style={{ backgroundColor: 'var(--card2)' }}>
          <p className="text-sm font-semibold break-words">{sheet.title || 'Untitled worksheet'}</p>
          {facts.length > 0 && <p className="text-xs" style={MUTED}>{facts.join(' · ')}</p>}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs">
          {outOfSync && <Badge color="var(--badge-yellow-fg)" bg="var(--badge-yellow-bg)">Out of sync</Badge>}
          <Badge color="var(--badge-green-fg)" bg="var(--badge-green-bg)">Saved</Badge>
        </p>
        {planViewDate(sheet.created_at) && <p className="text-xs" style={MUTED}>Made {planViewDate(sheet.created_at)}</p>}
        {worksheets.length > 1 && <p className="text-xs" style={MUTED}>{worksheets.length} worksheets were made from this plan. This is the newest.</p>}
        {outOfSync && canSync && <Btn className="min-h-11 w-full" disabled={syncDisabled} onClick={onSync}>
          <RefreshCw size={15} aria-hidden="true" />Sync with updated plan<span className="sr-only"> (make a new draft from {plan?.title || 'this lesson plan'})</span>
        </Btn>}
      </section>}
      {details && <section aria-labelledby="plan-view-details" className="rounded-xl p-4 grid gap-4 min-w-0" style={CARD}>
        <h2 id="plan-view-details" className="text-base font-semibold">Details</h2>
        {details}
      </section>}
      {history.length > 0 && <section aria-labelledby="plan-view-history" className="rounded-xl p-4 grid gap-1 min-w-0" style={CARD}>
        <h2 id="plan-view-history" className="text-base font-semibold">History</h2>
        <ol className="grid min-w-0">
          {history.map((event, index) => <li key={event.key} className="py-2 min-w-0" style={index ? { borderTop: '1px solid var(--border)' } : undefined}>
            <p className="text-sm font-medium break-words">{event.label}{event.detail ? <span className="font-normal" style={MUTED}> · {event.detail}</span> : null}</p>
            <p className="text-xs" style={MUTED}><time dateTime={event.at}>{planViewDate(event.at)}</time></p>
          </li>)}
        </ol>
      </section>}
    </aside>
  );
}
