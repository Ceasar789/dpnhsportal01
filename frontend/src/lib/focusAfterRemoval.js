// ============================================
// FILE: src/lib/focusAfterRemoval.js
//
// UX-025. Removing a row unmounts the button that holds focus, and nothing
// catches it: the keyboard user is dropped on the document body — in one
// case inside a modal that is still open, with no way back to its controls
// except tabbing in from the start of the page.
//
// The rule is next row, else previous row, else the container's heading.
//
// Timing is the whole difficulty. These removals are a network round trip
// followed by a refetch, so there is no frame at which the new list is
// reliably painted. A requestAnimationFrame fires too early and focus lands
// on a row that is about to be replaced. So this watches for the list to
// actually shrink, and gives up after a moment rather than hanging on to
// focus forever.
// ============================================

const GIVE_UP_AFTER_MS = 2000;
const CHECK_EVERY_MS = 50;

/**
 * Call BEFORE triggering the removal, with the button that triggered it.
 * Returns a function to call after — or just call the returned function
 * immediately after an awaited remove; it waits for the DOM itself.
 *
 * @param {HTMLElement} trigger        the button being removed along with its row
 * @param {string} containerSelector   the list/table the rows live in
 * @param {string} peerSelector        what the sibling triggers look like
 * @param {string} [headingSelector]   where focus lands when nothing is left
 */
export function focusAfterRemoval(trigger, containerSelector, peerSelector, headingSelector) {
  const container = trigger?.closest(containerSelector);
  if (!container) return () => {};

  const before = Array.from(container.querySelectorAll(peerSelector));
  const index = before.indexOf(trigger);
  if (index === -1) return () => {};
  const countBefore = before.length;

  return () => {
    const started = Date.now();

    const settle = () => {
      const now = Array.from(container.querySelectorAll(peerSelector));

      // Still the same list — the refetch has not landed. Wait, unless we
      // have waited long enough that something has gone wrong.
      if (now.length >= countBefore && Date.now() - started < GIVE_UP_AFTER_MS) {
        setTimeout(settle, CHECK_EVERY_MS);
        return;
      }

      // The row that took this one's place, or the one above it when the
      // removed row was last.
      const target = now[index] ?? now[index - 1];
      if (target) { target.focus(); return; }

      // Nothing left in the list.
      const heading = headingSelector
        ? (container.closest('[role=dialog]') ?? document).querySelector(headingSelector)
        : null;
      if (heading) {
        // A heading is not focusable by default; make it so for this one
        // move, without adding it to the tab order.
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    };

    settle();
  };
}
