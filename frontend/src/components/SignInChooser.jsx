// ============================================
// FILE: src/components/SignInChooser.jsx
// L1: one "Sign In" button that opens a small chooser - Student or Faculty -
// each a real link to its existing login page. A non-modal disclosure (the
// page stays usable, so there is no focus trap): aria-expanded and
// aria-controls on the button, focus moves to Student on open, arrows and
// Home/End move between the two, Enter or Space opens the focused one, Escape
// closes and returns focus to the button, a click or tap outside or tabbing
// away closes it.
//
// Q1: the panel is rendered into <body>, fixed, above the public header
// (z-index 50). Inside the page it could end up under the header, whose Login
// button then took the tap (/login), or outside the hero's clip, or under the
// footer while the About reveal was running. It opens below the button, or
// above when there is more room there, never under the header and never off
// screen, and scrolls inside itself when neither side has room. A mousedown in
// the panel is cancelled so no browser (Safari does not focus links on click)
// blurs the chooser - and closes it - before the click lands.
// ============================================

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

const SIGN_IN_OPTIONS = [
  { label: 'Student', to: '/student-login' },
  { label: 'Faculty', hint: 'Teacher or Admin', to: '/faculty-login' },
];

// The open panel's height (heading + two 48px options + padding), with a
// margin, used until the panel has been measured.
const PANEL_ROOM = 190;
const GAP = 8;         // between the button and the panel
const GUTTER = 16;     // from the left and right edges of the viewport
const MIN_WIDTH = 256; // 16rem at the default text size
const PANEL_Z = 60;    // above the fixed public header (z-50)

// The bottom of the fixed public header, or 0 when there is none.
const headerBottom = () => document.querySelector('nav.fixed')?.getBoundingClientRect().bottom ?? 0;

// Fixed-position box for the panel, in viewport pixels.
const placePanel = (button, panel) => {
  const box = button.getBoundingClientRect();
  const viewWidth = document.documentElement.clientWidth || window.innerWidth;
  const top0 = Math.max(headerBottom(), 0) + GAP;
  const bottom0 = window.innerHeight - GAP;
  const height = panel?.scrollHeight || PANEL_ROOM;
  const below = bottom0 - (box.bottom + GAP);
  const above = (box.top - GAP) - top0;
  const up = below < height && above > below;
  const width = Math.min(Math.max(box.width, MIN_WIDTH), viewWidth - 2 * GUTTER);
  const left = Math.max(GUTTER, Math.min(box.left, viewWidth - GUTTER - width));
  const top = up ? Math.max(top0, box.top - GAP - height) : Math.max(top0, box.bottom + GAP);
  const maxHeight = Math.max(0, up ? box.top - GAP - top : bottom0 - top);
  return { up, style: { top: `${top}px`, left: `${left}px`, width: `${width}px`, maxHeight: `${maxHeight}px` } };
};

const GOLD_BUTTON = 'font-work font-bold text-sm tracking-widest px-8 py-4 rounded hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

const SignInChooser = ({ width = '250px', onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, style: {} });
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const linkRefs = useRef([]);
  const panelId = useId();
  const headingId = useId();

  const inside = node => Boolean(node && (wrapRef.current?.contains(node) || panelRef.current?.contains(node)));

  const setOpenState = (next, { returnFocus = false } = {}) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next && returnFocus) buttonRef.current?.focus();
  };

  const toggle = () => setOpenState(!open);

  // Place it before it is painted, once it can be measured.
  useLayoutEffect(() => {
    if (open) setPlacement(placePanel(buttonRef.current, panelRef.current));
  }, [open]);

  // Focus Student once the panel is showing.
  useEffect(() => {
    if (open) linkRefs.current[0]?.focus();
  }, [open]);

  // A click or tap anywhere else closes it (focus stays where the visitor put
  // it). Scrolling or resizing moves it with the button; once the button has
  // left the visible page, it closes.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => { setOpen(false); onOpenChange?.(false); };
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) close();
    };
    const onMove = () => {
      const box = buttonRef.current?.getBoundingClientRect();
      if (!box || box.bottom <= headerBottom() || box.top >= window.innerHeight) close();
      else setPlacement(placePanel(buttonRef.current, panelRef.current));
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, onOpenChange]);

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpenState(false, { returnFocus: true }); return; }
    const links = linkRefs.current.filter(Boolean);
    const at = links.indexOf(document.activeElement);
    // A link opens on Enter by itself; Space is the button-like key people also try.
    if (at !== -1 && (e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); links[at].click(); return; }
    // The panel lives at the end of <body>: Tab continues from the Sign In
    // button (to whatever follows it), Shift+Tab lands on the button.
    if (at !== -1 && e.key === 'Tab') {
      if (e.shiftKey) e.preventDefault();
      setOpenState(false, { returnFocus: true });
      return;
    }
    const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: links.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    links[(go + links.length) % links.length]?.focus();
  };

  // Tabbing out of the chooser closes it.
  const onBlur = (e) => {
    if (open && !inside(e.relatedTarget)) setOpenState(false);
  };

  return (
    <div ref={wrapRef} className="relative" style={{ width }} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={GOLD_BUTTON}
        style={{ backgroundColor: '#FEB300', color: '#6A4800', width: '100%', height: '58px', boxShadow: '0 20px 25px rgba(126,87,0,0.2)' }}
      >
        Sign In
      </button>

      {createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-labelledby={headingId}
          hidden={!open}
          onMouseDown={(e) => e.preventDefault()}
          className="signin-panel rounded-lg bg-white p-2 text-left shadow-xl"
          style={{ position: 'fixed', zIndex: PANEL_Z, overflowY: 'auto', ...placement.style }}
          data-placement={placement.up ? 'up' : 'down'}
        >
          <p id={headingId} className="px-3 pb-1 pt-2 font-work text-xs font-bold tracking-widest" style={{ color: '#7E5700' }}>
            SIGN IN AS
          </p>
          {SIGN_IN_OPTIONS.map((option, i) => (
            <Link
              key={option.to}
              ref={(el) => { linkRefs.current[i] = el; }}
              to={option.to}
              onClick={() => setOpenState(false)}
              className="flex min-h-12 flex-col justify-center rounded-md px-3 py-2 hover:bg-[#EEF2F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0062cc]"
            >
              <span className="font-work text-base font-bold" style={{ color: '#001D4E' }}>{option.label}</span>
              {option.hint && <span className="font-public text-sm" style={{ color: '#505050' }}>{option.hint}</span>}
            </Link>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default SignInChooser;
