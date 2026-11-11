// ============================================
// FILE: src/components/clarity/admin/useAdminShellBehavior.js
// TEMPORARY duplicate of the behaviour in AdminDashboardShell. After the
// defense AdminDashboard.jsx will import this hook (Option A), owner-approved.
//
// A word-for-word copy of AdminDashboardShell's state, effects and handlers
// (pages/dashboards/admin/AdminDashboard.jsx:111-216), plus the two
// confirmation handlers written inline in its JSX (the delete/archive
// onCancel/onConfirm at :1442-1466 and the sign-out onCancel/onConfirm at :1473-1478).
// Used ONLY by the Clarity Admin shell; the classic shell keeps its own copy.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { useProfileUnsavedChanges } from '../../../context/ProfileUnsavedChangesContext';
import { useTeachingLoadUnsavedChanges } from '../../../context/TeachingLoadUnsavedChangesContext';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import { cycleTab, focusableWithin, lockScroll } from '../../../lib/focusTrap';

export function useAdminShellBehavior({ navigate, logout, userData }) {
  const { requestProfileNavigation } = useProfileUnsavedChanges();
  const { requestTeachingLoadNavigation } = useTeachingLoadUnsavedChanges();
  // Collapsed/expanded is a DESKTOP preference and is remembered. Below
  // the drawer breakpoint it means nothing — the sidebar is off-canvas and
  // 256px wide either way — so the stored value is only ever applied at
  // >=1024px and the drawer always opens expanded.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('smartedu-admin-sidebar') === 'collapsed'; }
    catch { return false; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('smartedu-admin-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
    } catch { /* localStorage unavailable */ }
  }, [sidebarCollapsed]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const deleteConfirmRunningRef = useRef(false);
  const pendingDeleteFocusRef = useRef(null);
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false);

  // The drawer is an overlay over the page, so it owes the same contract a
  // dialog does: it takes focus, keeps it, gives it back, and the page
  // behind it does not scroll. Without the trap, Tab walks straight out of
  // an open drawer and down a page the user cannot see.
  useEffect(() => {
    if (!sidebarOpen) return undefined;

    const unlock = lockScroll();
    const opener = menuButtonRef.current;

    // Into the drawer, not merely near it.
    const first = focusableWithin(sidebarRef.current)[0];
    (first ?? sidebarRef.current)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setSidebarOpen(false); return; }
      cycleTab(sidebarRef.current, e);
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      unlock();
      // Back to the control that opened it — but only if it is still on
      // screen. Above the breakpoint the menu button is display:none, and
      // focusing a hidden element drops focus to the body.
      if (opener && document.contains(opener) && opener.offsetParent !== null) opener.focus();
    };
  }, [sidebarOpen]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { darkMode, page, setDarkMode, setPage, toast,
    activeSettingsSub, scrollToSection, deleteConfirm, setDeleteConfirm,
    settingsDirty } = useAdminContext();

  // A successful delete can unmount the invoking control before Modal gets
  // its normal chance to restore focus. The schedule flow supplies a stable
  // related destination; run it only after the confirmation has unmounted.
  useEffect(() => {
    if (deleteConfirm || !pendingDeleteFocusRef.current) return undefined;
    const restore = pendingDeleteFocusRef.current;
    pendingDeleteFocusRef.current = null;
    const run = () => restore();
    if (typeof window.requestAnimationFrame === 'function') {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(run, 0);
    return () => window.clearTimeout(timer);
  }, [deleteConfirm]);

  // UX-028 — leaving System Settings with the save bar up throws the work
  // away, and a sidebar click is one keystroke. Same prompt the dialogs
  // use, for the same reason: an untouched page never sees it.
  const requestPageChange = (go, destination = '') => {
    if (page === 'settings' && settingsDirty
      && !window.confirm('You have unsaved settings. Discard them?')) return;
    requestTeachingLoadNavigation(() => requestProfileNavigation(go), destination);
  };
  const requestSidebarNavigation = (go, destination) => {
    if (!sidebarOpen) {
      requestPageChange(go, destination);
      return;
    }
    // Let the drawer release its focus trap before the Teaching Load dialog
    // opens. Its cleanup restores focus to the menu button, which then becomes
    // the dialog's stable return target if the admin chooses to stay.
    setSidebarOpen(false);
    window.setTimeout(() => requestPageChange(go, destination), 0);
  };
  const openSettingsSection = (id) => {
    if (!sidebarOpen) {
      scrollToSection(id);
      return;
    }

    // The mobile drawer locks the document at its current scroll position.
    // Close it first, then scroll after React has run the unlock cleanup;
    // otherwise that cleanup restores the old position and cancels this jump.
    setSidebarOpen(false);
    requestAnimationFrame(() => scrollToSection(id));
  };
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);

  // DELETE CONFIRM — the classic <ConfirmationDialog> onCancel and onConfirm.
  const cancelDeleteConfirm = () => { if (!deleteConfirmBusy) setDeleteConfirm(null); };
  const confirmDelete = async () => {
    const fn = deleteConfirm?.onConfirm;
    if (!fn) {
      setDeleteConfirm(null);
      return;
    }
    if (deleteConfirmRunningRef.current) return;
    deleteConfirmRunningRef.current = true;
    setDeleteConfirmBusy(true);
    try {
      const completed = await fn();
      const shouldClose = deleteConfirm?.requireConfirmedResult
        ? completed === true
        : completed !== false;
      if (shouldClose) {
        pendingDeleteFocusRef.current = deleteConfirm?.focusAfterConfirm || null;
        setDeleteConfirm(null);
      }
    } finally {
      deleteConfirmRunningRef.current = false;
      setDeleteConfirmBusy(false);
    }
  };

  // SIGN OUT — the classic sign-out <ConfirmationDialog> onCancel and onConfirm.
  const cancelLogout = () => setLogoutConfirmOpen(false);
  const confirmLogout = () => {
    setLogoutConfirmOpen(false);
    logout();
    navigate('/login');
  };

  return {
    sidebarCollapsed, setSidebarCollapsed, sidebarOpen, setSidebarOpen, sidebarRef, menuButtonRef,
    deleteConfirmBusy, profileOpen, setProfileOpen, logoutConfirmOpen, setLogoutConfirmOpen,
    darkMode, page, setDarkMode, setPage, toast, activeSettingsSub, deleteConfirm,
    requestPageChange, requestSidebarNavigation, openSettingsSection, photoUrl,
    cancelDeleteConfirm, confirmDelete, cancelLogout, confirmLogout,
  };
}
