// ============================================
// FILE: src/lib/useDelayedFlag.js
//
// A loading flag that only becomes true once the wait has actually been
// long enough to notice.
//
// Rule from Phase 3a: show the skeleton only if the request takes longer
// than ~300ms. Without that, a cached or fast response paints a skeleton
// for two frames and then replaces it — a flicker that reads as a glitch
// and makes a fast screen feel slower than a plain blank one.
//
// The flag drops to false the instant loading ends, with no minimum display
// time. A skeleton held open for "at least 400ms so it doesn't flash" is
// the same flicker with extra waiting.
// ============================================

import { useEffect, useState } from 'react';

export function useDelayedFlag(active, delayMs = 300) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) { setShown(false); return undefined; }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);

  return shown;
}
