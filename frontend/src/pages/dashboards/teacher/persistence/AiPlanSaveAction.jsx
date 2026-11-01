import { useEffect, useRef, useState } from 'react';
import { aiLessonPlanSaveFlagEnabled, loadAiSaveAvailability } from './aiLessonPlanSaveClient';
import { validateLessonPlanTitle } from '../lessonPlanTitle';
import { Btn } from '../shared/ui';

export default function AiPlanSaveAction({ apiBase, content, title, busy, onSave }) {
  const [status, setStatus] = useState(aiLessonPlanSaveFlagEnabled() ? 'checking' : 'unavailable');
  const requestId = useRef(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const enabled = aiLessonPlanSaveFlagEnabled();

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    loadAiSaveAvailability(apiBase).then(result => {
      if (!active) return;
      if (result.enabled !== true) throw new Error('Unavailable');
      setStatus('ready');
    }).catch(() => { if (active) setStatus('unavailable'); });
    return () => { active = false; };
  }, [apiBase, enabled]);

  useEffect(() => { requestId.current = null; }, [content, title]);
  const canSave = status === 'ready' && !validateLessonPlanTitle(title).error && !busy && !pending;

  return <>
    <Btn variant="default" className="min-h-[44px]" disabled={!canSave} busy={busy || pending}
      onClick={async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        requestId.current ??= globalThis.crypto.randomUUID();
        try { await onSave({ requestId: requestId.current }); }
        finally { pendingRef.current = false; setPending(false); }
      }}>Save Plan</Btn>
    <span role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>
      {status === 'ready' ? 'Review your draft, then choose Save Plan to store it as a private draft.'
        : status === 'checking' ? 'Checking permanent Save availability...'
            : 'Permanent AI Lesson Plan save is unavailable. Your draft remains editable.'}
    </span>
  </>;
}
