import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import './WeeklyGenerationProgress.css';

const MESSAGES = [
  'Please keep this page open while we work.',
  'Creating questions based on your lesson plan.',
  'Large worksheets can take several minutes.',
  'The service may pause briefly to stay within usage limits.',
  'Still working on your weekly worksheets. Thank you for waiting.',
];
const LONG_WAIT = 'This is taking longer than usual. Please keep this page open.';
const messageAt = seconds => seconds >= 180 ? LONG_WAIT : MESSAGES[Math.floor(seconds / 9) % MESSAGES.length];
const FAILURE_LABELS = { provider: 'provider error', validation: 'invalid worksheet output',
  timeout: 'time limit', capacity: 'provider capacity', source_changed: 'saved lesson plan changed' };

export default function WeeklyGenerationProgress({ plannedCalls, completed = false, onComplete, job = null }) {
  const [elapsed, setElapsed] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  const capped = elapsed >= 600;

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (job || completed || capped) return;
    const interval = window.setInterval(() => setElapsed(seconds => Math.min(seconds + 1, 600)), 1000);
    return () => window.clearInterval(interval);
  }, [job, completed, capped]);

  useEffect(() => {
    if (!completed || !onComplete) return;
    const timeout = window.setTimeout(onComplete, 400);
    return () => window.clearTimeout(timeout);
  }, [completed, onComplete]);

  if (job) {
    const active = ['QUEUED', 'RUNNING'].includes(job.status);
    const message = job.status === 'QUEUED'
      ? job.completedBatches === job.plannedCalls
        ? 'All question batches are validated. Waiting to assemble the five drafts.'
        : 'Waiting for the next worker action. You can return to this job later.'
      : job.status === 'RUNNING' ? 'A question batch is being processed.'
        : job.status === 'COMPLETED' ? 'The job completed. Confirming its five unsaved drafts.'
          : job.status === 'CANCELED' ? 'Cancellation is confirmed. No draft was opened.'
            : job.status === 'INTERRUPTED_UNKNOWN_OUTCOME'
              ? 'A provider request had an unknown outcome. No draft was opened.'
              : `Generation failed${FAILURE_LABELS[job.failureCategory]
                ? `: ${FAILURE_LABELS[job.failureCategory]}` : ''}. No draft was opened.`;
    const counts = `${job.status.toLowerCase()}: ${job.completedBatches} of ${job.plannedCalls} batches validated; ${job.attemptedCalls} provider requests attempted. Progress is confirmed by the server.`;
    return <div className="rounded-lg border p-4 grid gap-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card2)' }}>
      <div className="flex items-start gap-3">
        <Loader2 size={20} className={`${active ? 'animate-spin ' : ''}motion-reduce:animate-none flex-shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{job.status === 'QUEUED' ? 'Weekly worksheets are queued'
            : job.status === 'RUNNING' ? 'AI is generating your weekly worksheets'
              : job.status === 'COMPLETED' ? 'Weekly job completed' : 'Weekly worksheet generation ended'}</p>
          <div className="weekly-generation-secondary text-sm mt-1" aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
            <span className="weekly-generation-measure">Waiting for the next worker action. You can return to this job later.</span>
            <span data-testid="weekly-generation-current" className="weekly-generation-current reduced break-words">{message}</span>
          </div>
        </div>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {message} {job.completedBatches} of {job.plannedCalls} validated; {job.attemptedCalls} requests attempted.
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Validated question batches</span><span>{job.completedBatches} of {job.plannedCalls}</span>
      </div>
      <div role="progressbar" aria-label="Validated question batches" aria-valuemin="0"
        aria-valuemax={job.plannedCalls} aria-valuenow={job.completedBatches}
        className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
        <div data-testid="weekly-generation-fill"
          className={`weekly-generation-fill${reducedMotion ? ' reduced' : ''}${active ? '' : ' stopped'}`}
          style={{ width: `${job.completedBatches / job.plannedCalls * 100}%`, backgroundColor: 'var(--accent)' }} />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{counts}</p>
    </div>;
  }

  const messageIndex = elapsed >= 180 ? 20 : Math.floor(elapsed / 9);
  const currentMessage = messageAt(elapsed);
  const previousMessage = messageIndex ? messageAt(Math.min((messageIndex - 1) * 9, 179)) : '';
  const announcedMessage = messageAt(Math.floor(elapsed / 30) * 30);
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');
  const estimate = completed ? 100 : 95 * (1 - Math.exp(-elapsed / (plannedCalls * 12)));

  return <div className="rounded-lg border p-4 grid gap-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card2)' }}>
    <div className="flex items-start gap-3">
      <Loader2 size={20} className="animate-spin motion-reduce:animate-none flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{completed ? 'Weekly worksheets are ready' : 'AI is generating your weekly worksheets'}</p>
        <div className="weekly-generation-secondary text-sm mt-1" aria-hidden="true" style={{ color: 'var(--text-muted)' }}>
          <span className="weekly-generation-measure">{LONG_WAIT}</span>
          {!reducedMotion && previousMessage && <span key={`old-${messageIndex}`} data-testid="weekly-generation-old"
            className="weekly-generation-old">{previousMessage}</span>}
          <span key={`current-${messageIndex}`} data-testid="weekly-generation-current"
            className={reducedMotion ? 'weekly-generation-current reduced' : 'weekly-generation-current'}>{currentMessage}</span>
        </div>
      </div>
    </div>
    <div role="status" aria-live="polite" className="sr-only">
      {completed ? 'Weekly worksheets are ready.' : `AI is generating your weekly worksheets. ${announcedMessage}`}
    </div>
    <div className="flex flex-wrap justify-between gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <span>Estimated progress</span><span>Elapsed: {minutes}:{seconds}</span>
    </div>
    <div role="progressbar" aria-label="Estimated progress" aria-valuemin="0" aria-valuemax="100"
      className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
      <div data-testid="weekly-generation-fill"
        className={`weekly-generation-fill${reducedMotion ? ' reduced' : ''}${completed ? ' completed' : ''}${capped ? ' stopped' : ''}`}
        style={{ width: `${estimate}%`, backgroundColor: 'var(--accent)' }} />
    </div>
    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
      Five daily worksheets · {plannedCalls} planned question sets
    </p>
  </div>;
}
