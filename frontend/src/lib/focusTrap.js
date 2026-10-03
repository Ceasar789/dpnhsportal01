// ============================================
// FILE: src/lib/focusTrap.js
//
// The focus-trap mechanics, extracted from components/ui/Modal.jsx so the
// admin's navigation drawer can use the same ones rather than a second,
// subtly different copy.
//
// Two things make a trap correct, and both were learned building the
// dialog version:
//
//   * Wrapping must handle focus that has ALREADY escaped. Checking only
//     "is the active element the first/last item?" misses the case where
//     focus is outside the container entirely — which happens the moment
//     anything steals it — and Tab then walks away down the page behind
//     the overlay.
//   * offsetParent filtering matters. A container holds controls that are
//     display:none at the current width (the admin sidebar hides its
//     collapse button on mobile), and tabbing to an invisible control
//     looks to the user like focus vanished.
// ============================================

/** Everything that can hold focus, in document order. */
export const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The visible, focusable children of `container`, in document order. */
export function focusableWithin(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter((el) => el.offsetParent !== null);
}

/**
 * Handle one Tab keypress so focus cycles inside `container`.
 * Returns true if it moved focus, so the caller can decide what else the
 * key means.
 */
export function cycleTab(container, event) {
  if (event.key !== 'Tab' || !container) return false;
  const items = focusableWithin(container);
  if (items.length === 0) return false;

  const first = items[0];
  const last = items[items.length - 1];
  const here = document.activeElement;
  const escaped = !container.contains(here);

  if (event.shiftKey && (here === first || escaped)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (here === last || escaped)) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * Stop the page behind an overlay from scrolling, and put it back exactly
 * as it was. Returns the restore function.
 *
 * The scroll position is restored by hand: `position: fixed` on <body> is
 * what stops iOS scrolling the page behind a drawer, and it also throws
 * the page back to the top, which is worse than the problem.
 */
export function lockScroll() {
  const { body } = document;
  const y = window.scrollY;
  const previous = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
  };
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${y}px`;
  body.style.width = '100%';

  return () => {
    body.style.overflow = previous.overflow;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.width = previous.width;
    window.scrollTo(0, y);
  };
}

/**
 * Make everything outside `node` inert for as long as the overlay is up,
 * and put the page back the way it was. Returns the restore function.
 *
 * A focus trap only governs the keyboard. The rest of the page is still
 * there for a pointer and still there for a screen reader's own cursor,
 * which is how the app header stayed tappable underneath a bottom sheet at
 * 360px: the backdrop covers it visually, but the header sits in its own
 * stacking context and `elementFromPoint` returns the header, not the
 * scrim. `inert` is the one thing that removes a subtree from focus, from
 * hit-testing and from the accessibility tree at once.
 *
 * The overlay is rendered in place rather than through a portal, so the
 * subtree to keep live is the chain of ancestors up to <body>. Everything
 * hanging off that chain gets marked.
 */
export function inertOutside(node) {
  if (!node || !node.parentElement) return () => {};
  const marked = [];

  for (let el = node; el && el !== document.body; el = el.parentElement) {
    for (const sibling of el.parentElement?.children ?? []) {
      // Already inert for its own reasons — leave it, and leave it inert
      // on the way out too.
      if (sibling === el || sibling.inert) continue;
      sibling.inert = true;
      marked.push(sibling);
    }
  }

  return () => { for (const el of marked) el.inert = false; };
}
