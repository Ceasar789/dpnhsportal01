// ============================================
// FILE: src/components/SignInChooser.jsx
// L1: one "Sign In" button that opens a small chooser - Student or Faculty -
// each a real link to its existing login page. A non-modal disclosure (the
// page stays usable, so there is no focus trap): aria-expanded and
// aria-controls on the button, focus moves to Student on open, arrows and
// Home/End move between the two, Escape closes and returns focus to the
// button, a click or tap outside or tabbing away closes it. The panel opens
// upward when there is not room for it below (the hero clips its overflow).
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const SIGN_IN_OPTIONS = [
  { label: 'Student', to: '/student-login' },
  { label: 'Faculty', hint: 'Teacher or Admin', to: '/faculty-login' },
];

// The open panel's height (heading + two 48px options + padding), with a margin.
const PANEL_ROOM = 190;

// The room the panel has below and above the button: inside the viewport,
// inside the nearest ancestor that clips its overflow, and below the fixed
// public header (which would otherwise cover a panel opened upward).
const roomAround = (el) => {
  const box = el.getBoundingClientRect();
  let bottom = window.innerHeight;
  let top = document.querySelector('nav.fixed')?.getBoundingClientRect().bottom ?? 0;
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY, overflow } = window.getComputedStyle(node);
    if ([overflowY, overflow].some(v => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll')) {
      const clip = node.getBoundingClientRect();
      bottom = Math.min(bottom, clip.bottom);
      top = Math.max(top, clip.top);
    }
  }
  return { below: bottom - box.bottom, above: box.top - top };
};

const GOLD_BUTTON = 'font-work font-bold text-sm tracking-widest px-8 py-4 rounded hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

const SignInChooser = ({ width = '250px', onOpenChange }) => {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const linkRefs = useRef([]);
  const panelId = useId();
  const headingId = useId();

  const setOpenState = (next, { returnFocus = false } = {}) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next && returnFocus) buttonRef.current?.focus();
  };

  const toggle = () => {
    if (open) { setOpenState(false); return; }
    const { below, above } = roomAround(buttonRef.current);
    setUpward(below < PANEL_ROOM && above > below);
    setOpenState(true);
  };

  // Focus Student once the panel is showing.
  useEffect(() => {
    if (open) linkRefs.current[0]?.focus();
  }, [open]);

  // A click or tap anywhere else closes it (focus stays where the visitor put it).
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) { setOpen(false); onOpenChange?.(false); }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open, onOpenChange]);

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpenState(false, { returnFocus: true }); return; }
    const links = linkRefs.current.filter(Boolean);
    const at = links.indexOf(document.activeElement);
    const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: links.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    links[(go + links.length) % links.length]?.focus();
  };

  // Tabbing out of the chooser closes it.
  const onBlur = (e) => {
    if (open && !wrapRef.current?.contains(e.relatedTarget)) setOpenState(false);
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

      <div
        id={panelId}
        role="group"
        aria-labelledby={headingId}
        hidden={!open}
        className={`signin-panel absolute left-0 z-30 w-full min-w-[16rem] rounded-lg bg-white p-2 text-left shadow-xl ${upward ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        data-placement={upward ? 'up' : 'down'}
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
      </div>
    </div>
  );
};

export default SignInChooser;
