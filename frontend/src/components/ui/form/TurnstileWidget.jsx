// ============================================
// FILE: src/components/ui/form/TurnstileWidget.jsx
// P2: the optional security check (Cloudflare Turnstile). Renders nothing
// at all when VITE_TURNSTILE_SITE_KEY is not set.
//
// onToken(token)  '' whenever there is no usable token (expired, error, reset)
// resetSignal     bump it after every submit: a token works only once
// The widget is "compact" when the space is narrower than 300px (phones at
// 320px inside the auth card), so it never widens the page.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { CAPTCHA_MESSAGES, loadTurnstile, turnstileSiteKey } from '../../../lib/turnstile';

export default function TurnstileWidget({ onToken, resetSignal = 0, action }) {
  const siteKey = turnstileSiteKey();
  const box = useRef(null);
  const widget = useRef(null);
  const report = useRef(onToken);
  const [failed, setFailed] = useState(false);
  useEffect(() => { report.current = onToken; });

  useEffect(() => {
    if (!siteKey) return undefined;
    let gone = false;
    loadTurnstile().then((turnstile) => {
      if (gone || !box.current) return;
      const clear = () => report.current?.('');
      widget.current = turnstile.render(box.current, {
        sitekey: siteKey,
        action,
        theme: 'auto',
        size: box.current.clientWidth < 300 ? 'compact' : 'flexible',
        callback: (token) => report.current?.(token),
        'expired-callback': clear,
        'timeout-callback': clear,
        'error-callback': clear,
      });
    }).catch(() => { if (!gone) setFailed(true); });
    return () => {
      gone = true;
      if (widget.current != null) {
        try { window.turnstile?.remove(widget.current); } catch { /* already gone */ }
        widget.current = null;
      }
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (!resetSignal) return;
    report.current?.('');
    if (widget.current != null) {
      try { window.turnstile?.reset(widget.current); } catch { /* re-rendered */ }
    }
  }, [resetSignal]);

  if (!siteKey) return null;
  return (
    <div className="mb-4 w-full min-w-0" data-turnstile="">
      <div ref={box} className="w-full min-w-0 min-h-[65px]" />
      {failed && (
        <p role="alert" className="text-sm mt-2 break-words" style={{ color: '#b91c1c' }}>{CAPTCHA_MESSAGES.unavailable}</p>
      )}
    </div>
  );
}
