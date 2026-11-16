// ============================================
// FILE: src/components/ui/ConfirmDialog.jsx
// U2 form kit: the in-app replacement for the browser's confirm() box
// (today's "Discard changes?" uses window.confirm, which cannot be styled,
// themed or worded). Render it while a question is pending; it unmounts
// when answered.
//
//   role="alertdialog", aria-modal, labelled by its title and described by
//   its message. Focus moves to the SAFE button (Cancel / "Keep editing")
//   on open, Tab and Shift+Tab stay inside, Escape cancels, the backdrop
//   does nothing (an alert dialog must be answered), and focus returns to
//   whatever had it before, when the dialog closes.
//   Everything outside the dialog is inert while it is up.
//   `destructive` (default true) shows the confirm action in the danger
//   style; pass false for a neutral question.
//   Buttons: cancel first in the markup, confirm last; on phones the
//   footer stacks with the confirm action on top (form-kit.css, D7).
//
// Use inside another dialog: render it inside that dialog's panel, so the
// outer dialog's own inert/focus handling still includes it. Escape is
// stopped here so it cancels this question only.
// ============================================

import { useEffect, useId, useRef } from 'react';
import { cycleTab, focusableWithin, inertOutside } from '../../lib/focusTrap';
import '../../styles/form-kit.css';

export default function ConfirmDialog({
  title = 'Discard your changes?',
  message = 'What you typed has not been saved.',
  confirmLabel = 'Discard changes',
  cancelLabel = 'Keep editing',
  destructive = true,
  onConfirm,
  onCancel,
}) {
  const back = useRef(null);
  const panel = useRef(null);
  const cancel = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const returnTo = document.activeElement;
    const restoreInert = inertOutside(back.current, { preserveLiveRegions: true });
    (cancel.current ?? panel.current)?.focus();
    return () => {
      restoreInert();
      if (returnTo && document.contains(returnTo) && typeof returnTo.focus === 'function') returnTo.focus();
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel?.();
      return;
    }
    if (event.key !== 'Tab') return;
    // cycleTab wraps at the ends and leaves a normal Tab alone. Only when
    // nothing inside can be measured (no layout yet) does focus stay put.
    if (focusableWithin(panel.current).length === 0) {
      event.preventDefault();
      panel.current?.focus();
      return;
    }
    cycleTab(panel.current, event);
  };

  return (
    <div ref={back} className="fk-confirm-back">
      <div
        ref={panel}
        className="fk-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 className="fk-confirm-title" id={titleId}>{title}</h2>
        {message && <p className="fk-confirm-text" id={messageId}>{message}</p>}
        <div className="fk-footer">
          <button ref={cancel} type="button" className="fk-btn" onClick={() => onCancel?.()}>{cancelLabel}</button>
          <button type="button" className={`fk-btn ${destructive ? 'fk-danger' : 'fk-primary'}`} onClick={() => onConfirm?.()}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
