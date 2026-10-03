// ============================================
// FILE: src/lib/useMediaQuery.js
//
// Layout is a container query's job (Rule R6) — a table does not care how
// wide the window is, it cares how wide its own card is. BEHAVIOUR is a
// different question: whether tapping a row opens a sheet is about the
// device, not the container, and there is no JS equivalent of a container
// query to ask.
//
// So the two-line row layout is CSS, and this decides only whether a row
// is a button.
// ============================================

import { useEffect, useState } from 'react';

const read = (query) => {
  try { return window.matchMedia(query).matches; } catch { return false; }
};

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => read(query));

  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    // Re-read on mount as well as on change: a resize between the initial
    // render and this effect would otherwise be missed, which is exactly
    // what happens when a test sets the viewport right after load.
    setMatches(mq.matches);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Below the drawer breakpoint — the same 1024 the shell uses. */
export const useIsNarrow = () => useMediaQuery('(max-width: 1023.98px)');
