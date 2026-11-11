// ============================================
// FILE: src/components/clarity/ui/ClarityModal.jsx
// A Clarity dialog (.x-back / .x-modal). Renders in place as a fixed
// overlay, like the classic Modal. It is a real dialog: role="dialog",
// aria-modal, labelled by its title (and described by `description`), focus
// moves in and is trapped, Escape closes unless closing is disabled, the
// rest of the page is inert, scrolling behind is locked, and focus returns
// to where it was. The footer is pinned; the body scrolls (dvh in the CSS).
// ============================================

import { useEffect, useId, useRef } from 'react';
import { cycleTab, focusableWithin, inertOutside, lockScroll } from '../../../lib/focusTrap';

const ClarityModal = ({ title, description, onClose, closeDisabled = false, dismissible = false, footer, children }) => {
  const backRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const returnTo = document.activeElement;
    const unlock = lockScroll();
    const restoreInert = inertOutside(backRef.current, { preserveLiveRegions: true });
    (focusableWithin(panelRef.current)[0] ?? panelRef.current)?.focus();
    return () => {
      restoreInert();
      unlock();
      if (returnTo && document.contains(returnTo) && typeof returnTo.focus === 'function') returnTo.focus();
    };
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!closeDisabled) onClose?.();
      return;
    }
    if (event.key === 'Tab') {
      if (!cycleTab(panelRef.current, event)) {
        // Nothing focusable is measurable (or one item): keep focus inside.
        event.preventDefault();
        panelRef.current?.focus();
      }
    }
  };

  return (
    <div ref={backRef} className="x-back" onMouseDown={(event) => {
      if (dismissible && !closeDisabled && event.target === backRef.current) onClose?.();
    }}>
      <div ref={panelRef} className="x-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="x-mh">
          <h2 id={titleId} className="x-mt">{title}</h2>
        </div>
        <div className="x-mb">
          {description && <p id={descriptionId} className="x-cs">{description}</p>}
          {children}
        </div>
        {footer && <div className="x-mf">{footer}</div>}
      </div>
    </div>
  );
};

export default ClarityModal;
