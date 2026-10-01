// ============================================
// FILE: src/components/ui/Modal.jsx
//
// One dialog, replacing eight hand-rolled overlays across the admin tabs.
// The audit filed UX-098 against every one of them and UX-026 against seven:
// none took focus, none trapped it, none returned it, none closed on Escape,
// and every close path threw away whatever had been typed without asking.
//
// What this adds over the markup it replaces:
//
//   * role="dialog", aria-modal, and a title the dialog is labelled by
//   * focus moves to the first field on open, and back to the control that
//     opened it on close — captured at open time, because by close time the
//     invoking button may itself have been unmounted
//   * Tab and Shift+Tab cycle inside; nothing behind the overlay is reachable
//   * Escape, the backdrop and Cancel all run the SAME close path, so the
//     dirty check cannot be sidestepped by picking a different exit
//
// What it deliberately does NOT change: the look. `.modal-overlay` and
// `.modal` are the admin's own classes and stay exactly as they were, so
// migrating a tab to this component is a behaviour change a reviewer can
// read, not a visual diff they have to eyeball. The restyle is Phase 5.
// ============================================

import { useCallback, useEffect, useId, useRef } from 'react';

// Everything that can hold focus inside the dialog, in document order.
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// Nothing in the admin stacks dialogs today — all four delete confirmations
// are triggered from a table row, never from inside another modal, and the
// two SectionsTab overlays are opened from the same row's actions, so the
// table is behind an overlay either way.
//
// This exists so that stops being load-bearing. If a second dialog ever
// mounts over a first, only the top of the stack answers Escape and Tab;
// without it both would, and Escape would close them in the wrong order.
const stack = [];

/**
 * @param {boolean}  open
 * @param {string}   title      names the dialog for assistive technology
 * @param {function} onClose    the real close — called once the dirty check passes
 * @param {function} [isDirty]  () => boolean; when true, every close path confirms first
 * @param {function} [footer]   (requestClose) => ReactNode, so Cancel shares the guard
 */
export default function Modal({ open, title, onClose, isDirty, footer, children }) {
  const card = useRef(null);
  const returnTo = useRef(null);
  const titleId = useId();

  // The guard every exit runs through. An untouched form closes immediately,
  // so the prompt costs nothing in the common case.
  const requestClose = useCallback(() => {
    if (isDirty?.() && !window.confirm('Discard changes?')) return;
    onClose();
  }, [isDirty, onClose]);

  // Remember the invoking control while it still exists, and move focus in.
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const first = card.current?.querySelector(FOCUSABLE);
    (first ?? card.current)?.focus();
    return () => {
      const target = returnTo.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [open]);

  // Escape closes, and Tab cycles rather than walking out of the dialog.
  useEffect(() => {
    if (!open) return;
    const me = {};
    stack.push(me);
    const onKeyDown = (e) => {
      // Only the topmost dialog answers the keyboard.
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
      if (e.key !== 'Tab') return;

      const items = Array.from(card.current?.querySelectorAll(FOCUSABLE) ?? [])
        .filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const here = document.activeElement;

      // Shift+Tab off the front wraps to the back, and the reverse. The
      // `!card.contains(here)` case catches focus that has already escaped.
      if (e.shiftKey && (here === first || !card.current.contains(here))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (here === last || !card.current.contains(here))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const at = stack.indexOf(me);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay open"
      // Only a click that starts AND ends on the backdrop counts: dragging a
      // text selection out of a field and releasing here would otherwise
      // discard the form.
      onMouseDown={(e) => { if (e.target === e.currentTarget) e.currentTarget.dataset.fromBackdrop = '1'; }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.currentTarget.dataset.fromBackdrop !== '1') return;
        delete e.currentTarget.dataset.fromBackdrop;
        requestClose();
      }}
    >
      <div
        ref={card}
        className="modal ux-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div id={titleId} className="modal-title ux-modal-title">{title}</div>
        <div className="ux-modal-body">{children}</div>
        {footer && <div className="modal-actions ux-modal-footer">{footer(requestClose)}</div>}
      </div>
    </div>
  );
}
