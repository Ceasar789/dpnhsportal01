// ============================================
// FILE: src/components/clarity/phone/PhoneNav.jsx
// SHELL: the phone navigation shared by the Admin, Teacher and Student
// Clarity shells. One set of components, configured per role:
//   PhoneBottomNav - the bottom tab bar (4 destinations + Menu), the only
//                    primary navigation on phones (no hamburger there).
//   PhoneMenuSheet - the Menu bottom sheet: every other page of the role,
//                    grouped like the desktop sidebar, then the profile
//                    card (opens Profile) and Sign out. A real dialog: focus trap,
//                    counted scroll lock, Esc and backdrop close, focus back
//                    to the Menu tab, closes when a page is chosen or the
//                    page changes.
//   PhoneBrand     - the brand mark and wordmark for the phone top bar.
// An item is { key, label, icon, current, badge, badgeText, href, onSelect }:
// with href it is a link (the click is handled in the app), else a button.
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import { LogOut, Menu, UserRound, X } from 'lucide-react';
import { cycleTab, focusableWithin, inertOutside, lockScroll } from '../../../lib/focusTrap';
import '../../../styles/phone-shell.css';

// Phones in portrait and in landscape (the same breakpoints as the G10 rules).
export const PHONE_QUERY = '(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';

// Text entry raises the on-screen keyboard; the bar steps aside meanwhile so
// it never covers the field or the button under it. A select opens a picker,
// not the keyboard, so it never hides the bar (U-S1).
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="range"]), textarea, [contenteditable="true"]';

// U-S1: the keyboard is really on screen when the visual viewport is clearly
// shorter than the layout viewport (pinch zoom keeps height * scale equal).
// Without visualViewport (old browsers, tests) focus alone decides, as before.
const KEYBOARD_GAP = 120;
const keyboardOpen = (win = window) => {
  const vv = win.visualViewport;
  if (!vv) return true;
  return vv.height * (vv.scale || 1) < win.innerHeight - KEYBOARD_GAP;
};

const Badge = ({ item }) => (item.badge > 0 ? (
  <span className="x-pnav-badge">{item.badge}<span className="x-sr"> {item.badgeText || ''}</span></span>
) : null);

// A link or a button with the same look; the click always goes through
// onSelect, so the shell's guards (unsaved changes) run first.
const Target = ({ item, className, onPick, children }) => {
  const props = {
    className,
    'aria-current': item.current ? 'page' : undefined,
    onClick: (event) => { if (item.href) event.preventDefault(); onPick(item); },
  };
  return item.href
    ? <a href={item.href} {...props}>{children}</a>
    : <button type="button" {...props}>{children}</button>;
};

export function PhoneBrand() {
  return (
    <span className="x-pbrand">
      <img src="/EduScribeLogoIcon.png" alt="" width="28" height="28" />
      <span>EduScribe</span>
    </span>
  );
}

export function PhoneBottomNav({ items, menuOpen, menuCurrent, onMenu, menuButtonRef, sheetId, label = 'Main' }) {
  const barRef = useRef(null);
  const [typing, setTyping] = useState(false);
  // U-S1: hidden only while a text field has focus AND the keyboard is open.
  // Re-checked on every focus change, keyboard resize and rotation, so a
  // keyboard closed with "back", a field removed with its dialog or a turn of
  // the phone can never leave the bar stuck hidden.
  useEffect(() => {
    let timer = null;
    const check = (el = document.activeElement) => {
      const field = Boolean(el?.matches?.(TYPING)) && document.contains(el) && !barRef.current?.contains(el);
      setTyping(field && keyboardOpen());
    };
    const onFocusIn = (event) => check(event.target);
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => check(), 0); };
    const vv = window.visualViewport;
    // Focus leaving: decide now from where it goes (nowhere = shown), then
    // re-check once the browser has settled.
    const onFocusOut = (event) => { check(event.relatedTarget); later(); };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', later);
    window.addEventListener('orientationchange', later);
    window.addEventListener('resize', later);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', later);
      window.removeEventListener('orientationchange', later);
      window.removeEventListener('resize', later);
    };
  }, []);
  return (
    <div ref={barRef} className={`x-pnav${typing ? ' typing' : ''}`} role="navigation" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Target key={item.key} item={item} className={`x-pnav-i${item.current ? ' on' : ''}`} onPick={i => i.onSelect()}>
            <Icon size={24} aria-hidden="true" />
            <span className="x-pnav-l">{item.label}</span>
            <Badge item={item} />
          </Target>
        );
      })}
      <button ref={menuButtonRef} type="button" className={`x-pnav-i${menuCurrent ? ' on' : ''}`}
        aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={sheetId} onClick={onMenu}>
        <Menu size={24} aria-hidden="true" />
        <span className="x-pnav-l">Menu</span>
        {menuCurrent && <span className="x-sr"> (the current page is in the menu)</span>}
      </button>
    </div>
  );
}

// groups: [{ heading, items }]; profile: an item; onSignOut: runs after the
// sheet has closed; profile also takes sub (second line) and avatar (a node).
// closeKey: the current page, so a page change closes it.
export function PhoneMenuSheet({ id, open, onClose, groups, profile, onSignOut, returnFocusRef, closeKey }) {
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const back = returnFocusRef?.current;
    const unlock = lockScroll();
    const restoreInert = inertOutside(wrapRef.current, { preserveLiveRegions: true });
    const first = focusableWithin(panelRef.current)[0];
    (first ?? panelRef.current)?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key === 'Tab') cycleTab(panelRef.current, event);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreInert();
      unlock();
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [open, returnFocusRef]);

  // A page change (from anywhere) closes the sheet.
  const lastKey = useRef(closeKey);
  useEffect(() => {
    if (lastKey.current === closeKey) return;
    lastKey.current = closeKey;
    if (open) onCloseRef.current();
  }, [closeKey, open]);

  if (!open) return null;
  const pick = (item) => { onClose(); item.onSelect(); };
  const row = (item) => {
    const Icon = item.icon;
    return (
      <Target key={item.key} item={item} className={`x-psheet-row${item.current ? ' on' : ''}`} onPick={pick}>
        <Icon size={20} aria-hidden="true" />
        <span className="x-psheet-l">{item.label}</span>
        <Badge item={item} />
      </Target>
    );
  };
  return (
    <div ref={wrapRef} className="x-psheet-wrap">
      <div className="x-psheet-back" onClick={onClose} aria-hidden="true" />
      <div id={id} ref={panelRef} className="x-psheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="x-psheet-head">
          <h2 id={titleId}>Menu</h2>
          <button type="button" className="x-iconbtn" aria-label="Close menu" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {groups.map(group => (
          <div key={group.heading || 'top'} className="x-psheet-grp" role="group" aria-label={group.heading || undefined}>
            {group.heading && <p className="x-psheet-h" aria-hidden="true">{group.heading}</p>}
            {group.items.map(row)}
          </div>
        ))}
        <div className="x-psheet-grp x-psheet-foot">
          {/* U-S6: the profile card (photo, name, line) is the way to the
              profile page; there is no separate "Profile & password" row. */}
          <Target item={profile} className={`x-psheet-row x-psheet-me${profile.current ? ' on' : ''}`} onPick={pick}>
            <span className="x-psheet-ava" aria-hidden="true">{profile.avatar || <UserRound size={20} />}</span>
            <span className="x-psheet-l">
              <b className="x-psheet-name">{profile.label}</b>
              {profile.sub && <span className="x-psheet-sub">{profile.sub}</span>}
              <span className="x-sr"> (Profile settings)</span>
            </span>
          </Target>
          <button type="button" className="x-psheet-row" onClick={() => { onClose(); window.setTimeout(onSignOut, 0); }}>
            <LogOut size={20} aria-hidden="true" />
            <span className="x-psheet-l">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
