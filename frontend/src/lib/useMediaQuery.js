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

import { useCallback, useSyncExternalStore } from 'react';

const read = (query) => {
  try { return window.matchMedia(query).matches; } catch { return false; }
};

/**
 * Whether `query` matches, kept current.
 *
 * useSyncExternalStore rather than useState + useEffect. The effect
 * version had to re-read on mount as well as on change, because a resize
 * between the first render and the effect would otherwise be missed —
 * which is exactly what a test does when it sets the viewport right after
 * load. That catch-up setState cost every consumer a second render on
 * mount, and react-hooks/set-state-in-effect was right to flag it.
 *
 * Reading the snapshot on every render removes both problems: there is
 * nothing to catch up on, so there is no extra render, and the value
 * cannot tear under concurrent rendering.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback((notify) => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return () => {}; }
    mq.addEventListener('change', notify);
    return () => mq.removeEventListener('change', notify);
  }, [query]);

  // The third argument is the server snapshot: no window, nothing matches.
  return useSyncExternalStore(subscribe, () => read(query), () => false);
}

/** Below the drawer breakpoint — the same 1024 the shell uses. */
export const useIsNarrow = () => useMediaQuery('(max-width: 1023.98px)');
