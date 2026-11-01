import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import './WeeklyGenerationProgress.css';

const MESSAGES = [
  'Please keep this page open while we work.',
  'Creating questions based on your lesson plan.',
  'Large worksheets can take several minutes.',
  'The service may pause briefly to stay within usage limits.',
  'Almost there. Thank you for your patience.',
];
const LONG_WAIT = 'This is taking longer than usual. Please keep this page open.';
const messageAt = seconds => seconds >= 180 ? LONG_WAIT : MESSAGES[Math.floor(seconds / 9) % MESSAGES.length];

export default function WeeklyGenerationProgress({ plannedCalls, completed = false, onComplete }) {
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
    if (completed || capped) return;
    const interval = window.setInterval(() => setElapsed(seconds => Math.min(seconds + 1, 600)), 1000);
    return () => window.clearInterval(interval);
  }, [completed, capped]);

  useEffect(() => {
    if (!completed || !onComplete) return;
    const timeout = window.setTimeout(onComplete, 400);
    return () => window.clearTimeout(timeout);
  }, [completed, onComplete]);

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
