// ============================================
// FILE: src/components/clarity/ClarityTopBar.jsx
// SHELL: the top bar of the Admin, Teacher and Student Clarity shells (one
// component, configured per role).
//   Phones: the brand mark on the left; the theme toggle and the bell on the
//           right. No hamburger: the bottom tab bar is the navigation.
//   Tablets: the menu button (drawer) and the page name, as before.
//   Desktop: the sidebar is visible; the menu button and the page name are
//           hidden by the existing CSS.
// ============================================

import { Menu, Moon, Sun } from 'lucide-react';
import { PhoneBrand } from './phone/PhoneNav';

export default function ClarityTopBar({
  headerRef, phone, menuButtonRef, menuLabel, menuOpen, menuControls, onOpenMenu,
  pageTitle, bell, dark, onToggleDark,
}) {
  const themeLabel = dark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  return (
    <header ref={headerRef} className="x-top">
      {!phone && (
        <button ref={menuButtonRef} type="button" className="x-iconbtn x-menubtn" onClick={onOpenMenu}
          aria-label={menuLabel} aria-expanded={menuOpen} aria-controls={menuControls}>
          <Menu size={20} aria-hidden="true" />
        </button>
      )}
      {!phone && pageTitle && <span className="x-top-title" title={pageTitle} aria-hidden="true">{pageTitle}</span>}
      {phone && <PhoneBrand />}
      <span className="x-sp" />
      {/* The shared bell keeps its real unread count; .x-bell restyles its
          button as a plain icon (scoped CSS, NotificationBell unchanged). */}
      {bell}
      <button type="button" className="x-iconbtn" onClick={onToggleDark} aria-label={themeLabel} title={themeLabel}>
        {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </button>
    </header>
  );
}
