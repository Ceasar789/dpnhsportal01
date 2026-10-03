// ============================================
// FILE: src/pages/dashboards/admin/AdminDashboard.jsx
// SHELL: auth guard -> AdminProvider -> sidebar/nav + page-switch
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Sun, Moon, LogOut, AlertTriangle, LayoutDashboard, Users, Newspaper, Calendar, FileText, Settings, ChevronLeft, ChevronRight, Menu, BookMarked, GraduationCap, Columns, CalendarClock } from 'lucide-react';
import { AdminProvider, useAdminContext } from './AdminContext';
import PageTransition from '../../../components/PageTransition';
import NotificationBell from '../../../components/NotificationBell';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { initials, avatarColor, roleBadge, roleLabel } from './shared/helpers';
import Avatar from '../../../components/Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import OverviewTab from './tabs/OverviewTab';
import UsersTab from './tabs/UsersTab';
import SubjectsTab from './tabs/SubjectsTab';
import TeachingLoadTab from './tabs/TeachingLoadTab';
import SectionsTab from './tabs/SectionsTab';
import SchedulesTab from './tabs/SchedulesTab';
import NewsTab from './tabs/NewsTab';
import CalendarTab from './tabs/CalendarTab';
import MemosTab from './tabs/MemosTab';
import SettingsTab from './tabs/SettingsTab';
import ProfileTab from '../../profile/ProfileTab';
import FlippingLogo from '../../../components/FlippingLogo';

// ============================================
// MAIN ADMIN DASHBOARD — auth guard, then mounts AdminProvider
// ============================================
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { userData, logout, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--gate-bg)', flexDirection: 'column', gap: 'var(--space-16)'
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid var(--gate-border)',
          borderTopColor: 'var(--gate-action)', borderRadius: '50%',
          animation: 'spin var(--motion-spin) linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: 'var(--gate-muted)', fontSize: 'var(--font-size-14)' }}>Loading session…</span>
      </div>
    );
  }

  // Navigating during render is a side effect React does not guarantee will
  // run, which is why a denied user used to land on a blank page. Show the
  // reason instead — including the role actually read from the profiles row,
  // so a misconfigured account is diagnosable without digging through the DB.
  if (!userData || userData.role !== 'main_admin') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--gate-bg)', flexDirection: 'column',
        gap: 'var(--space-12)', padding: 'var(--space-24)', textAlign: 'center'
      }}>
        <h1 style={{ color: 'var(--gate-text)', fontSize: 'var(--font-size-20)', fontWeight: 700 }}>
          Administrator access required
        </h1>
        <p style={{ color: 'var(--gate-muted)', fontSize: 'var(--font-size-14)', maxWidth: 420 }}>
          This account is not registered as an administrator, so the admin
          dashboard cannot be opened.
        </p>
        <div style={{
          background: 'var(--gate-panel)', border: '1px solid var(--gate-border)', borderRadius: 'var(--radius-md)',
          padding: 'var(--space-12) var(--space-16)', color: 'var(--gate-muted)', fontSize: 'var(--font-size-13)', textAlign: 'left'
        }}>
          <div>Signed in as: <strong style={{ color: 'var(--gate-text)' }}>{userData?.email || '— not signed in —'}</strong></div>
          <div>Detected role: <strong style={{ color: 'var(--gate-text)' }}>{userData?.role || '— none —'}</strong></div>
        </div>
        <Link
          to="/faculty-login"
          replace
          style={{
            marginTop: 'var(--space-8)', padding: 'var(--space-12) var(--space-24)', borderRadius: 'var(--radius-md)', border: 'none',
            background: 'var(--gate-action)', color: 'var(--on-accent)', fontSize: 'var(--font-size-14)', fontWeight: 600, cursor: 'pointer',
            // A <button> centres its own text and an <a> does not; these two
            // keep the control looking exactly as it did.
            display: 'inline-block', textAlign: 'center', textDecoration: 'none'
          }}
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <AdminProvider userData={userData}>
      <AdminDashboardShell navigate={navigate} logout={logout} userData={userData} />
    </AdminProvider>
  );
};

// ============================================
// SHELL: style block, toast, nav, sidebar, page-switch
// ============================================
const AdminDashboardShell = ({ navigate, logout, userData }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { darkMode, page, setDarkMode, setPage, toast,
    activeSettingsSub, scrollToSection, settings, deleteConfirm, setDeleteConfirm,
    settingsDirty } = useAdminContext();

  // UX-028 — leaving System Settings with the save bar up throws the work
  // away, and a sidebar click is one keystroke. Same prompt the dialogs
  // use, for the same reason: an untouched page never sees it.
  const leaveSettings = (go) => {
    if (page === 'settings' && settingsDirty
      && !window.confirm('You have unsaved settings. Discard them?')) return;
    go();
  };
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);

  return (
    <div className="dashboard-shell">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Public Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; font-size: var(--font-size-14); }

        nav {
          background: #003b7a;
          height: 76px;
          display: flex;
          align-items: center;
          padding: 0 var(--space-32);
          gap: 0;
          border-bottom: none;
          box-shadow: 0 2px 10px var(--overlay-nav);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .nav-logo {
          display: flex;
          align-items: center;
          gap: var(--space-12);
          text-decoration: none;
          flex-shrink: 0;
          margin-right: var(--space-32);
        }
        .nav-menu-btn { display: none; }
        .nav-logo > img {
          width: 64px; height: 64px;
          border-radius: 50%;
          object-fit: contain;
          flex-shrink: 0;
        }
        .nav-logo-icon {
          width: 64px; height: 64px;
          background: #ffffff;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: var(--font-size-13); font-weight: 900;
          color: #1908DF; flex-shrink: 0;
        }
        .nav-logo-text { display: flex; flex-direction: column; line-height: 1.2; font-family: 'Work Sans', sans-serif; }
        .nav-logo-text span:first-child { font-weight: 700; font-size: 28px; letter-spacing: -0.02em; color: var(--brand-gold); }
        .nav-logo-text span:first-child i { color: var(--brand-cyan); font-style: normal; }
        .nav-logo-text span:last-child { font-size: var(--font-size-14); color: rgba(255,255,255,.85); font-weight: 500; }

        .nav-links { display: flex; gap: var(--space-2); flex: 1; }
        .nav-link {
          padding: var(--space-8) var(--space-16);
          cursor: pointer;
          color: rgba(255,255,255,.72);
          font-size: var(--font-size-13); font-weight: 600;
          letter-spacing: 0.03em;
          transition: all var(--motion-base);
          border: none; background: none;
          border-radius: var(--radius-sm);
          position: relative;
        }
        .nav-link:hover { color: #ffffff; background: rgba(255,255,255,.12); }
        .nav-link.active { color: #ffffff; }
        .nav-link.active::after {
          content: '';
          position: absolute;
          bottom: -6px; left: 50%;
          transform: translateX(-50%);
          width: 20px; height: 2px;
          background: var(--brand-gold-bright);
          border-radius: var(--radius-xs);
        }

        .nav-actions { display: flex; align-items: center; gap: var(--space-8); margin-left: auto; }
        .nav-search-btn {
          width: 40px; height: 40px; border-radius: 50%;
          border: none; background: rgba(255,255,255,.12); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #ffffff; transition: background var(--motion-base);
        }
        .nav-search-btn:hover { background: rgba(255,255,255,.22); }
        .nav-toggle-btn {
          width: 40px; height: 40px; border-radius: 50%;
          border: none; background: rgba(255,255,255,.12); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #ffffff; transition: all var(--motion-base);
        }
        .nav-toggle-btn:hover { background: rgba(255,255,255,.22); }
        .nav-avatar {
          width: 40px; height: 40px; border-radius: 50%;
          background: var(--brand-gold-bright);
          display: flex; align-items: center; justify-content: center;
          font-size: var(--font-size-12); font-weight: 700; color: #12069f;
          cursor: pointer; border: 2px solid rgba(255,255,255,.5);
          flex-shrink: 0;
        }
        .nav-logout-btn {
          display: flex; align-items: center; gap: var(--space-8);
          padding: var(--space-8) var(--space-16); border-radius: var(--radius-md);
          border: 1px solid rgba(255,255,255,.3);
          background: transparent; cursor: pointer;
          color: rgba(255,255,255,.85); font-size: var(--font-size-13); font-weight: 600;
          transition: all var(--motion-base);
        }
        .nav-logout-btn:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

        .layout { display: flex; flex: 1; min-height: calc(100vh - 76px); }
        .sidebar { width: 256px; background: var(--sidebar-bg); border-right: 1px solid var(--border); padding: 0 var(--space-12) var(--space-16); flex-shrink: 0; display: flex; flex-direction: column; transition: width var(--motion-base) ease, transform var(--motion-base) ease; position: relative; }
        .sidebar.collapsed { width: 80px; }
        .sidebar-user { min-height: 76px; padding: var(--space-24) var(--space-8); border-bottom: 1px solid var(--border); display: flex !important; align-items: center; gap: var(--space-12); margin-bottom: 0; visibility: visible; }
        .admin-profile-row { min-height: 76px; width: 100%; display: flex !important; align-items: center; visibility: visible; }
        .sidebar.collapsed .sidebar-user { justify-content: center; }
        .sidebar-item { padding: var(--space-12) var(--space-12); margin-bottom: var(--space-4); border-radius: var(--radius-lg); cursor: pointer; color: var(--text-muted); font-size: var(--font-size-13); font-weight: 600; transition: all var(--motion-base) ease; display: flex; align-items: center; gap: var(--space-12); border-left: 3px solid transparent; }
        .sidebar-user + .sidebar-item { margin-top: var(--space-16); }
        .sidebar.collapsed .sidebar-item { justify-content: center; padding-left: var(--space-8); padding-right: var(--space-8); }
        .sidebar-icon { width: 32px; height: 32px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all var(--motion-base) ease; }
        .sidebar-item:not(.active) .sidebar-icon { border: 1px solid var(--border); }
        .sidebar-item.active .sidebar-icon { background: #ffffff; box-shadow: 0 2px 6px var(--overlay-accent-glow); }
        .sidebar-item:hover { color: var(--text); background: rgba(128,128,128,0.08); }
        .sidebar-item.active { color: var(--accent); background: #eef0f5; border-left-color: transparent; }
        .sidebar-section { padding: var(--space-16) var(--space-12) var(--space-8); font-size: var(--font-size-12); text-transform: uppercase; letter-spacing: .08em; color: var(--text-dim); }
        .sidebar-sub { padding: var(--space-8) var(--space-24) var(--space-8) var(--space-32); cursor: pointer; color: var(--text-dim); font-size: var(--font-size-12); transition: all var(--motion-base); }
        .sidebar-sub:hover { color: var(--text-muted); }
        .sidebar-sub.active { color: var(--accent); }
        .sidebar-collapse { position: absolute; right: -14px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border); background: var(--sidebar-bg); color: var(--text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; box-shadow: 0 2px 6px var(--overlay-sm); }
        .sidebar-logout { margin-top: auto; padding: var(--space-12) var(--space-8) 0; border-top: 1px solid var(--border); }
        .main { flex: 1; padding: var(--space-24) var(--space-32); overflow-y: auto; }

        .page-title { font-size: var(--font-size-24); font-weight: 700; color: var(--text); }
        .page-sub { color: var(--text-muted); font-size: var(--font-size-13); margin-top: var(--space-4); margin-bottom: var(--space-24); }
        /* The seal is the SCHOOL; the logo in the header is the product.
           They mean different things, so both earn a place - but the seal
           is a mark beside the name it belongs to, not a picture. */
        .page-sub.with-seal { display: flex; align-items: center; gap: var(--space-8); }
        .page-seal { width: 20px; height: 20px; border-radius: 50%; object-fit: contain; flex-shrink: 0; }
        /* Each fact in the subtitle wraps as a unit. Without this the year
           itself broke across lines at 360 - "2026-" on one, "2027" on the
           next - because the hyphen is a legal break point. */
        .page-sub-seg { white-space: nowrap; }
        .page-header-bar { border-radius: var(--radius-lg); padding: var(--space-16) var(--space-16); margin-bottom: var(--space-24); background: var(--banner-bg); border: 1px solid var(--banner-border); }
        .page-header-bar .page-title { color: var(--banner-text); }
        .page-header-bar .page-sub { color: var(--banner-subtext); margin-bottom: 0; }
        .btn { padding: var(--space-8) var(--space-16); border-radius: var(--radius-md); border: none; cursor: pointer; font-size: var(--font-size-13); font-weight: 600; transition: all var(--motion-base); display: inline-flex; align-items: center; gap: var(--space-8); }
        .btn-primary { background: var(--accent); color: var(--on-accent); }
        .btn-primary:hover { background: var(--accent-hover); }
        .btn-ghost { background: transparent; color: var(--accent); border: 1px solid var(--border); }
        .btn-danger { background: transparent; color: var(--red); border: none; cursor: pointer; }
        .icon-action { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: var(--radius-md); background: transparent; cursor: pointer; transition: transform var(--motion-base), background-color var(--motion-base), color var(--motion-base); }
        .edit-action { color: var(--accent); }
        .edit-action:hover { background: rgba(99,102,241,.12); transform: scale(1.08); }
        .archive-action { color: var(--red); }
        .archive-action:hover { background: rgba(239,68,68,.12); transform: scale(1.08) rotate(-8deg); }
        .archive-toggle { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-muted); background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-md); cursor: pointer; }
        .archive-toggle:hover, .archive-toggle.active { color: var(--accent); border-color: var(--accent); background: rgba(99,102,241,.12); }
        .archive-status-badge { display: inline-flex; align-items: center; gap: var(--space-4); white-space: nowrap; line-height: 1; }
        .archive-news-action { display: inline-flex; align-items: center; gap: var(--space-4); }
        .btn-sm { padding: var(--space-4) var(--space-12); font-size: var(--font-size-12); }
        input, select, textarea { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); border-radius: var(--radius-md); padding: var(--space-8) var(--space-12); font-size: var(--font-size-13); outline: none; }
        input:focus, select:focus, textarea:focus { border-color: var(--accent); }
        select { appearance: none; cursor: pointer; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); }
        .avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: var(--font-size-12); font-weight: 700; flex-shrink: 0; color: var(--on-accent); }
        .badge { padding: var(--space-2) var(--space-12); border-radius: var(--radius-full); font-size: var(--font-size-12); font-weight: 600; border: 1px solid; white-space: nowrap; }
        .badge-blue    { color: var(--badge-blue-fg); border-color: var(--badge-blue-border); background: var(--badge-blue-bg); }
        .badge-green   { color: var(--badge-green-fg); border-color: var(--badge-green-border); background: var(--badge-green-bg); }
        .badge-teal    { color: var(--badge-teal-fg); border-color: var(--badge-teal-border); background: var(--badge-teal-bg); }
        .badge-yellow  { color: var(--badge-yellow-fg); border-color: var(--badge-yellow-border); background: var(--badge-yellow-bg); }
        .chip { display: inline-flex; align-items: center; gap: var(--space-8); padding: var(--space-2) var(--space-12); margin: var(--space-2) var(--space-4) var(--space-2) 0; border-radius: var(--radius-full); font-size: var(--font-size-12); font-weight: 600; white-space: nowrap; color: var(--badge-blue-fg); border: 1px solid var(--badge-blue-border); background: var(--badge-blue-bg); }
        .chip-x { background: none; border: none; cursor: pointer; color: inherit; display: flex; padding: var(--space-8); margin: -8px; opacity: .7; }
        .chip-x:hover { opacity: 1; }
        .badge-red     { color: var(--badge-red-fg); border-color: var(--badge-red-border); background: var(--badge-red-bg); }
        .badge-purple  { color: var(--badge-purple-fg); border-color: var(--badge-purple-border); background: var(--badge-purple-bg); }
        /* For "not available" — the one state that must not read as healthy. */
        .badge-grey    { color: var(--text-muted); border-color: var(--border); background: transparent; }
        .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
        .dot-green { background: var(--green); }
        .dot-red { background: var(--red); }
        .dot-gray  { background: #4b5563; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: var(--space-12) var(--space-16); font-size: var(--font-size-12); font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        td { padding: var(--space-12) var(--space-16); border-bottom: 1px solid var(--border); font-size: var(--font-size-13); }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        .toolbar { display: flex; gap: var(--space-12); margin-bottom: var(--space-16); align-items: center; flex-wrap: wrap; }
        .toolbar input { flex: 1; min-width: 160px; max-width: 280px; }
        /* overflow-x: auto, not hidden. Hidden clipped every table wider
           than the screen, and a clipped table is not a cosmetic problem:
           at 360 the Actions column sat entirely outside the card, so Edit
           and Delete could not be reached by touch at all. Programmatic
           scrolling still worked, which is why the e2e suite never noticed.
           Phase 6 replaces this with the R1/R2 two-line rows; until then a
           scrollbar is the difference between awkward and impossible. */
        .table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow-x: auto; overflow-y: hidden; }

        /* Teaching Load — bulk assignment form and the grade-grouped list.
           Everything here is built from the same vars as the rest of the
           dashboard, so it follows the light/dark theme without branching. */
        .bulk-grid { display: grid; grid-template-columns: minmax(280px, 1.3fr) minmax(240px, 1fr); gap: var(--space-24); }
        @media (max-width: 860px) { .bulk-grid { grid-template-columns: 1fr; } }
        .bulk-label { font-size: var(--font-size-12); font-weight: 600; color: var(--text-muted); margin-bottom: var(--space-8); display: flex; align-items: center; }
        .bulk-submit { display: flex; align-items: center; gap: var(--space-12); margin-top: var(--space-16); flex-wrap: wrap; }
        .bulk-hint { font-size: var(--font-size-12); color: var(--text-muted); flex: 1; min-width: 180px; line-height: 1.45; }
        .picker-search { display: flex; align-items: center; gap: var(--space-8); padding: 0 var(--space-12); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card-bg); color: var(--text-muted); margin-bottom: var(--space-8); }
        .picker-search:focus-within { border-color: var(--accent); }
        .picker-search input { border: none; background: transparent; padding: var(--space-8) 0; flex: 1; min-width: 0; }
        .picker-search input:focus { border: none; }
        /* Capped and scrollable: 48 teachers would otherwise push the Add
           button and the whole list far below the fold. */
        .picker-panel { max-height: 230px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card-bg); }
        .picker-row { display: flex; align-items: center; gap: var(--space-12); padding: var(--space-8) var(--space-12); cursor: pointer; border-bottom: 1px solid var(--border); font-size: var(--font-size-13); color: var(--text); }
        .picker-row:last-child { border-bottom: none; }
        .picker-row:hover { background: rgba(255,255,255,0.03); }
        .picker-row input[type="checkbox"] { width: 15px; height: 15px; padding: 0; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
        .picker-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .picker-dept { font-size: var(--font-size-12); color: var(--text-muted); white-space: nowrap; }
        .picker-empty { padding: var(--space-16) var(--space-12); text-align: center; font-size: var(--font-size-12); color: var(--text-muted); }
        .grade-tabs { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-16); border-bottom: 1px solid var(--border); padding-bottom: 0; }
        .grade-tab { display: inline-flex; align-items: center; gap: var(--space-8); padding: var(--space-8) var(--space-16); border: 1px solid transparent; border-bottom: none; border-radius: var(--radius-md) var(--radius-md) 0 0; background: transparent; color: var(--text-muted); font-size: var(--font-size-13); font-weight: 600; cursor: pointer; margin-bottom: -1px; transition: all var(--motion-base); }
        .grade-tab:hover { color: var(--text); background: rgba(255,255,255,.03); }
        .grade-tab.active { color: var(--accent); background: var(--card-bg); border-color: var(--border); border-bottom: 1px solid var(--card-bg); }
        .grade-tab-count { font-size: var(--font-size-12); font-weight: 700; min-width: 20px; text-align: center; padding: 1px var(--space-8); border-radius: var(--radius-full); color: #60a5fa; background: rgba(59,130,246,0.12); }
        .grade-tab-count.empty { color: var(--text-muted); background: rgba(148,163,184,0.12); }

        /* Shown only after someone presses the button. A form that is red
           before it has been touched reads as broken rather than incomplete.
           The button stays ENABLED while incomplete on purpose — a disabled
           button cannot tell you what is missing, which is the whole
           complaint this answers. */
        .is-invalid, .form-input.is-invalid, .picker-panel.is-invalid { border-color: var(--red); }
        .field-error { font-size: var(--font-size-12); color: var(--red); margin-top: var(--space-8); line-height: 1.4; }
        /* UX-062: which fields are required, said in the label rather than
           discovered by submitting and reading a toast. */
        .form-req { color: var(--red); margin-left: var(--space-2); }
        .form-legend { font-size: var(--font-size-12); color: var(--text-muted); margin-bottom: var(--space-16); }
        /* UX-058: a disabled field says why it is disabled. */
        .form-hint { font-size: var(--font-size-12); color: var(--text-muted); margin-top: var(--space-8); line-height: 1.4; }
        /* UX-075: the password field and its reveal share a row. */
        .form-with-action { display: flex; gap: var(--space-8); align-items: center; }
        .form-with-action .form-input { flex: 1; }

        .section-picker { display: flex; gap: var(--space-8); flex-wrap: wrap; margin-bottom: var(--space-16); }
        .section-chip { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-8) var(--space-16); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--card-bg); cursor: pointer; transition: all var(--motion-base); }
        .section-chip:hover { border-color: var(--accent); }
        .section-chip.active { border-color: var(--accent); background: rgba(99,102,241,.12); }
        .section-chip-name { font-size: var(--font-size-13); font-weight: 600; color: var(--text); }
        .section-chip-count { font-size: var(--font-size-12); color: var(--text-muted); }
        .sched-line { display: flex; align-items: center; gap: var(--space-12); padding: var(--space-4) 0; font-size: var(--font-size-13); }
        .sched-teacher { font-weight: 600; color: var(--text); white-space: nowrap; }
        .sched-when { color: var(--text-muted); font-size: var(--font-size-12); flex: 1; }

        .picker-row.selected { background: rgba(99,102,241,.14); }
        .picker-row.disabled { cursor: default; opacity: .5; }
        .picker-row.disabled:hover { background: transparent; }
        .picker-row input[type="radio"] { width: 15px; height: 15px; padding: 0; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
        .picker-actions { display: flex; gap: var(--space-8); margin-top: var(--space-8); }
        .picker-actions .btn:disabled { opacity: .45; cursor: default; }
        .picker-tag { font-size: var(--font-size-12); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); border: 1px solid var(--border); border-radius: var(--radius-full); padding: 1px var(--space-8); white-space: nowrap; }
        .picker-toggle { display: flex; align-items: center; gap: var(--space-8); margin-top: var(--space-12); font-size: var(--font-size-12); color: var(--text-muted); cursor: pointer; }
        .picker-toggle input[type="checkbox"] { width: 14px; height: 14px; padding: 0; accent-color: var(--accent); cursor: pointer; }
        .picker-warning { margin-top: var(--space-8); font-size: var(--font-size-12); line-height: 1.45; color: #fbbf24; border: 1px solid #b45309; background: rgba(245,158,11,0.1); border-radius: var(--radius-md); padding: var(--space-8) var(--space-12); }
        .grade-picker { display: flex; flex-wrap: wrap; gap: var(--space-8); align-items: center; }
        .grade-toggle { padding: var(--space-8) var(--space-12); border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--card-bg); color: var(--text-muted); font-size: var(--font-size-12); font-weight: 600; cursor: pointer; transition: all var(--motion-base); }
        .grade-toggle:hover { border-color: var(--accent); color: var(--text); }
        .grade-toggle.active { border-color: var(--accent); color: var(--on-accent); background: var(--accent); }
        /* The draft: entries staged but not yet written. Dashed border and
           an accent tint so it never reads as saved data at a glance. */
        .draft-card { padding: var(--space-16); margin-bottom: var(--space-24); border-style: dashed; border-color: var(--accent); background: rgba(99,102,241,.05); }
        .draft-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-12); flex-wrap: wrap; margin-bottom: var(--space-16); }
        .draft-title { font-size: var(--font-size-14); font-weight: 700; color: var(--text); }
        .draft-sub { font-size: var(--font-size-12); color: var(--text-muted); margin-top: var(--space-2); }
        .draft-group + .draft-group { margin-top: var(--space-16); }
        .draft-grade { font-size: var(--font-size-12); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--space-8); }
        .draft-line { display: flex; align-items: center; gap: var(--space-12); padding: var(--space-8) 0; font-size: var(--font-size-13); color: var(--text); border-bottom: 1px solid var(--border); }
        .draft-line:last-child { border-bottom: none; }
        .draft-teacher { font-weight: 600; white-space: nowrap; }
        .draft-dots { flex: 1; min-width: 20px; border-bottom: 1px dotted var(--border); }
        .draft-subject { color: var(--text-muted); white-space: nowrap; }

        .group-row td { background: var(--banner-bg); padding: var(--space-8) var(--space-16); }
        tr.group-row:hover td { background: var(--banner-bg); }
        .group-title { font-size: var(--font-size-12); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--banner-text); }
        .group-count { font-size: var(--font-size-12); color: var(--text-muted); margin-left: var(--space-12); }
        .row-sub { font-size: var(--font-size-12); color: var(--text-muted); margin-top: var(--space-2); }

        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-16); margin-bottom: var(--space-24); }
        /* D1-D3. This card used to be half coloured gradient: a 92px block
           holding a 34px white glyph, over a 92px body. The colour carried no
           information — it was one hue per card, fixed in the source — and the
           gradient faded into the card background, which is the "AI look" the
           brief names. What is left is the same surface as every other card,
           sized by its content. */
        .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-16); text-align: left; }
        /* No zero-padding here. This is a button reset, and zeroing padding
           silently beat .stat-card's own padding — same specificity, later in
           the file — which is why the card content sat flush against its
           border. A reset should remove what a <button> brings, not what the
           component sets. */
        .clickable-stat { width: 100%; color: inherit; text-align: left; cursor: pointer; font: inherit; transition: border-color var(--motion-base); }
        /* D3: no lift, no drop shadow. The accent border is the whole
           affordance. (The shared rule in dashboardTheme.jsx dropped these
           first; this one still declared them, so they were still applying.) */
        .clickable-stat:hover { border-color: var(--accent); }
        .clickable-stat:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        /* The icon is now a label-sized mark beside the label, in the muted
           text colour, rather than a tile. It identifies the card; it is not
           the card. */
        .stat-head { display: flex; align-items: center; gap: var(--space-8); color: var(--text-muted); }
        .stat-label { font-size: var(--font-size-13); font-weight: 600; color: var(--text-muted); }
        .stat-value { font-size: var(--font-size-24); font-weight: 700; color: var(--text); line-height: 1.1; }
        /* D5: one metric reads first. Total Users is the one the other three
           are a breakdown of, so it is the one that gets the display size. */
        .stat-card.primary .stat-value { font-size: var(--font-size-32); }
        /* "Live from Portal" is a provenance note, not a rise. It was green,
           which claimed a direction no number here has. */
        .stat-change { font-size: var(--font-size-12); color: var(--text-dim); }
        .overview-grid { display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-16); }
        .chart-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-24); }
        .chart-title { font-size: var(--font-size-14); font-weight: 600; margin-bottom: var(--space-4); }
        .chart-sub   { font-size: var(--font-size-12); color: var(--text-muted); margin-bottom: var(--space-16); }
        .bars { display: flex; align-items: flex-end; gap: var(--space-8); height: 120px; }
        .bar-wrap { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); flex: 1; }
        .bar { background: var(--accent); border-radius: var(--radius-xs) var(--radius-xs) 0 0; width: 100%; transition: opacity var(--motion-base); }
        .bar:hover { opacity: .8; }
        .bar-label { font-size: var(--font-size-12); color: var(--text-dim); }
        .recent-item { display: flex; align-items: center; gap: var(--space-12); padding: var(--space-12) 0; border-bottom: 1px solid var(--border); }
        .recent-item:last-child { border-bottom: none; }
        .recent-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .recent-info { flex: 1; }
        .recent-title { font-size: var(--font-size-13); color: var(--text); }
        .recent-time  { font-size: var(--font-size-12); color: var(--text-dim); }
        .role-bar { display: flex; flex-direction: column; gap: var(--space-12); margin-top: var(--space-12); }
        .role-row { display: flex; align-items: center; gap: var(--space-12); }
        .role-track { flex: 1; height: 10px; background: var(--border); border-radius: var(--radius-lg); overflow-x: auto; overflow-y: hidden; }
        .role-fill  { height: 100%; border-radius: var(--radius-lg); }
        .role-label { font-size: var(--font-size-12); color: var(--text-muted); width: 110px; flex-shrink: 0; }
        .role-overview { display: flex; align-items: center; gap: var(--space-16); margin: var(--space-12) 0 var(--space-16); }
        .role-pie { width: 118px; height: 118px; border-radius: 50%; flex-shrink: 0; position: relative; }
        .role-pie::after { content: ''; position: absolute; inset: 25px; border-radius: 50%; background: var(--card-bg); }
        .role-legend { display: flex; flex-direction: column; gap: var(--space-8); min-width: 0; flex: 1; }
        .role-legend-item { display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: var(--space-8); font-size: var(--font-size-12); color: var(--text-muted); }
        .role-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .role-legend-item strong { color: var(--text); font-size: var(--font-size-12); }

        .pagination { display: flex; align-items: center; gap: var(--space-8); padding: var(--space-16) var(--space-16); border-top: 1px solid var(--border); font-size: var(--font-size-13); color: var(--text-muted); }
        .page-btn { width: 28px; height: 28px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--card-bg); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: var(--font-size-13); }
        .page-btn.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
        .assign-bar { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-16) var(--space-16); margin-top: var(--space-16); display: flex; align-items: center; justify-content: space-between; }
        .assign-label { font-size: var(--font-size-13); font-weight: 600; }
        .assign-hint { font-size: var(--font-size-12); color: var(--text-muted); margin-top: var(--space-2); }

        .news-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-16); }
        .news-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow-x: auto; overflow-y: hidden; }
        .news-card-top { height: 4px; }
        .news-card-top.pub  { background: var(--accent); }
        .news-card-top.draft { background: var(--yellow); }
        .news-card-top.arch  { background: var(--text-dim); }
        .news-card-body { padding: var(--space-16) var(--space-16); }
        .news-meta   { display: flex; gap: var(--space-8); margin-bottom: var(--space-8); flex-wrap: wrap; }
        .news-title  { font-size: var(--font-size-16); font-weight: 600; margin-bottom: var(--space-8); }
        .news-author { font-size: var(--font-size-12); color: var(--text-muted); }
        .news-actions { padding: var(--space-12) var(--space-16); border-top: 1px solid var(--border); display: flex; gap: var(--space-16); align-items: center; }
        .news-action { background: none; border: none; cursor: pointer; font-size: var(--font-size-12); color: var(--text-muted); }
        .news-action:hover { color: var(--text); }
        .news-action.red   { color: var(--red); }
        .news-action.green { color: var(--green); }
        .news-action.blue  { color: var(--accent); }
        .news-footer { font-size: var(--font-size-12); color: var(--text-muted); margin-top: var(--space-16); }

        .cal-toolbar { display: flex; align-items: center; gap: var(--space-12); margin-bottom: var(--space-16); flex-wrap: wrap; }
        .cal-title   { font-size: var(--font-size-16); font-weight: 600; }
        .cal-nav { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: var(--font-size-16); padding: var(--space-4) var(--space-8); border-radius: var(--radius-sm); }
        .cal-nav:hover { background: rgba(255,255,255,0.06); color: var(--text); }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #dbe3ef; border: 1px solid #dbe3ef; border-radius: var(--radius-lg); overflow-x: auto; overflow-y: hidden; }
        .cal-head { background: #f8fafc; padding: var(--space-12); text-align: center; font-size: var(--font-size-12); font-weight: 600; color: #64748b; }
        .cal-cell { background: var(--card-bg); min-height: 80px; padding: var(--space-8); position: relative; }
        .cal-cell.weekend { background: rgba(254,226,226,.55); }
        .cal-cell.holiday { background: rgba(254,226,226,.8); }
        .cal-cell:hover { background: #f1f5f9; }
        .cal-day { font-size: var(--font-size-13); color: #475569; margin-bottom: var(--space-4); }
        .cal-cell.today .cal-day { background: #2563eb; color: var(--on-accent); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .cal-cell.other-month .cal-day { color: #94a3b8; }
        .cal-event { font-size: var(--font-size-12); font-weight: 600; padding: var(--space-4) var(--space-8); border-radius: var(--radius-xs); margin-bottom: var(--space-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .cal-event:hover { opacity: 0.8; }
        .ev-blue   { background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd; }
        .ev-yellow { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .ev-green  { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .ev-red    { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .ev-purple { background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; }
        .ev-teal   { background: #ccfbf1; color: #0f766e; border: 1px solid #5eead4; }
        :root:not(.light) .cal-grid { background: #303642; border-color: #303642; }
        :root:not(.light) .cal-head { background: #252a33; color: #aeb8c9; }
        :root:not(.light) .cal-cell { background: #20252d; }
        :root:not(.light) .cal-cell:hover { background: #292f39; }
        :root:not(.light) .cal-cell.weekend { background: #2b2931; }
        :root:not(.light) .cal-cell.holiday { background: #32282d; }
        :root:not(.light) .cal-day { color: #b6c0d0; }
        :root:not(.light) .cal-cell.other-month .cal-day { color: #687386; }
        :root:not(.light) .ev-blue { background: #263b56; color: #bfdbfe; border-color: #41658f; }
        :root:not(.light) .ev-yellow { background: #413721; color: #fde68a; border-color: #806b31; }
        :root:not(.light) .ev-green { background: #203b2d; color: #bbf7d0; border-color: #3c7655; }
        :root:not(.light) .ev-red { background: #422a30; color: #fecaca; border-color: #874852; }
        :root:not(.light) .ev-purple { background: #352d4d; color: #ddd6fe; border-color: #665497; }
        :root:not(.light) .ev-teal { background: #1e3c3b; color: #b9f5ec; border-color: #3d7772; }
        .cal-sidebar { width: 200px; flex-shrink: 0; }
        .upcoming-item { padding: var(--space-12) 0; border-left: 3px solid; padding-left: var(--space-12); margin-bottom: var(--space-12); }
        .legend { display: flex; gap: var(--space-16); margin-top: var(--space-12); flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: var(--space-8); font-size: var(--font-size-12); color: var(--text-muted); }
        .legend-dot  { width: 12px; height: 12px; border-radius: var(--radius-xs); }

        .memo-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: var(--space-16); }
        .memo-list-item { padding: var(--space-12) var(--space-16); cursor: pointer; border-bottom: 1px solid var(--border); transition: background var(--motion-fast); }
        .memo-list-item:hover { background: rgba(255,255,255,0.03); }
        .memo-list-item.active { background: rgba(59,130,246,0.08); border-left: 3px solid var(--accent); }
        .memo-title-item { font-size: var(--font-size-13); font-weight: 600; margin-bottom: var(--space-4); }
        .memo-meta    { font-size: var(--font-size-12); color: var(--text-muted); display: flex; align-items: center; gap: var(--space-8); flex-wrap: wrap; }
        .memo-snippet { font-size: var(--font-size-12); color: var(--text-dim); margin-top: var(--space-4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .memo-preview { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-24); }
        .memo-field       { display: flex; gap: var(--space-8); margin-bottom: var(--space-8); font-size: var(--font-size-13); }
        .memo-field-label { color: var(--text-muted); width: 50px; flex-shrink: 0; }
        .memo-field-val   { color: var(--text); font-weight: 500; }
        .memo-actions     { display: flex; gap: var(--space-12); margin-top: var(--space-16); }
        .memo-stats-bar   { padding: var(--space-16) var(--space-16); border-top: 1px solid var(--border); display: flex; gap: var(--space-16); }
        .memo-stat-val    { font-size: var(--font-size-24); font-weight: 700; }
        .memo-stat-label  { font-size: var(--font-size-12); color: var(--text-muted); }

        .settings-section { margin-bottom: var(--space-24); }
        .settings-section-title { font-size: var(--font-size-16); font-weight: 700; margin-bottom: var(--space-16); padding-bottom: var(--space-8); border-bottom: 1px solid var(--border); }
        .settings-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-16); }
        .settings-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-12) 0; border-bottom: 1px solid var(--border); }
        .settings-row:last-child { border-bottom: none; }
        .settings-label { font-size: var(--font-size-13); font-weight: 600; }
        .settings-hint  { font-size: var(--font-size-12); color: var(--text-muted); margin-top: var(--space-2); }
        .settings-history { border-top: 1px solid var(--border); margin-top: var(--space-12); padding-top: var(--space-16); }
        .settings-history-empty { color: var(--text-dim); font-size: var(--font-size-12); margin-top: var(--space-12); }
        .settings-history-item { color: var(--text-muted); font-size: var(--font-size-12); padding: var(--space-8) 0; border-bottom: 1px solid var(--border); }
        .settings-hint a { color: var(--accent); text-decoration: none; }
        .settings-input-row { display: flex; align-items: center; gap: var(--space-12); padding: var(--space-12) 0; border-bottom: 1px solid var(--border); }
        .settings-input-row:last-child { border-bottom: none; }
        .settings-input-label { font-size: var(--font-size-13); color: var(--text-muted); width: 120px; flex-shrink: 0; }
        .settings-save { display: flex; justify-content: flex-end; margin-top: var(--space-16); }
        /* UX-028: one bar for the page, not a button inside one card. It
           sticks to the bottom so it is reachable from any card without
           scrolling back to General. */
        .settings-savebar { position: sticky; bottom: 0; display: flex; align-items: center; gap: var(--space-12); padding: var(--space-12) var(--space-16); margin-top: var(--space-24); background: var(--card-bg); border: 1px solid var(--accent); border-radius: var(--radius-lg); box-shadow: 0 -6px 18px var(--overlay-lg); z-index: 5; }
        .settings-savebar-count { font-size: var(--font-size-13); font-weight: 700; }
        .settings-savebar-actions { margin-left: auto; display: flex; gap: var(--space-8); }
        /* A setting the system does not act on is a sentence, not a control. */
        .settings-readonly { font-size: var(--font-size-13); color: var(--text-muted); max-width: 42ch; text-align: right; }
        .settings-note { font-size: var(--font-size-13); color: var(--text-muted); line-height: 1.5; }

        .toggle { width: 44px; height: 24px; border-radius: var(--radius-lg); position: relative; cursor: pointer; transition: background var(--motion-base); flex-shrink: 0; }
        .toggle.on  { background: var(--accent); }
        .toggle.off { background: var(--text-dim); }
        .toggle-knob { width: 18px; height: 18px; border-radius: 50%; background: #fff; position: absolute; top: 3px; transition: left var(--motion-base); }
        .toggle.on  .toggle-knob { left: 23px; }
        .toggle.off .toggle-knob { left: 3px; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; z-index: 1000; }
        .modal-overlay.open { display: flex; }
        .modal { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-24); width: 440px; max-height: 90vh; overflow-y: auto; }
        .modal-title { font-size: var(--font-size-16); font-weight: 700; margin-bottom: var(--space-16); }
        .form-row   { margin-bottom: var(--space-16); }
        .form-label { font-size: var(--font-size-12); color: var(--text-muted); margin-bottom: var(--space-4); display: block; }
        .form-input { width: 100%; }
        .modal-actions { display: flex; justify-content: flex-end; gap: var(--space-12); margin-top: var(--space-24); }

        .toast { position: fixed; bottom: 24px; right: 24px; padding: var(--space-12) var(--space-24); border-radius: var(--radius-md); font-size: var(--font-size-13); font-weight: 600; z-index: 2000; animation: slideUp var(--motion-base) ease; }
        .toast.success { background: var(--green); color: var(--on-accent); }
        .toast.error   { background: var(--red); color: var(--on-accent); }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .spin { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin var(--motion-spin) linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-row { text-align: center; padding: var(--space-48); color: var(--text-muted); }

        @media(max-width:900px) {
          /* The subtitle already wraps at this width; a mark in front of
             wrapped text reads as clutter rather than identity. */
          .page-seal { display: none; }
          .nav-menu-btn { display: flex; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255,255,255,.12); color: #fff; align-items: center; justify-content: center; cursor: pointer; }
          .layout { min-height: calc(100vh - 76px); }
          .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 50; transform: translateX(-100%); width: 256px; }
          .sidebar.mobile-open { transform: translateX(0); }
          .sidebar.collapsed { width: 256px; }
          .sidebar.collapsed .sidebar-user { justify-content: flex-start; }
          .sidebar.collapsed .sidebar-item { justify-content: flex-start; padding-left: var(--space-12); padding-right: var(--space-12); }
          .sidebar-mobile-overlay { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 40; }
          .main { padding: var(--space-24) var(--space-16); }
          .stat-grid { grid-template-columns: 1fr 1fr; }
          .overview-grid { grid-template-columns: 1fr; }
          .news-grid { grid-template-columns: 1fr; }
          .memo-layout { grid-template-columns: 1fr; }
          .cal-sidebar { width: auto; }
          .assign-bar { flex-direction: column; align-items: flex-start; gap: var(--space-12); }
          .news-actions { flex-wrap: wrap; }
          .modal { width: min(440px, calc(100vw - 32px)); }
        }
        @media(max-width:600px) {
          nav { padding: 0 var(--space-16); }
          .nav-logo { margin-right: 0; }
          .nav-logo-text span:first-child { font-size: 18px; }
          .sidebar { width: 256px; }
          .stat-grid { grid-template-columns: 1fr; }
          .role-overview { gap: var(--space-12); }
          .role-pie { width: 104px; height: 104px; }
          .role-pie::after { inset: 22px; }
          .cal-toolbar > * { max-width: 100%; }
          .cal-grid { min-width: 0; }
          .cal-cell { min-height: 64px; padding: var(--space-4); }
          .cal-head { padding: var(--space-8) var(--space-2); font-size: var(--font-size-12); }
          .cal-event { padding: var(--space-2) var(--space-4); font-size: var(--font-size-12); }
          .modal { padding: var(--space-16); }
        }
      `}</style>

      {/* UX-099: mounted always, so the live region exists before the text
            arrives. A region created at the same moment as its content is
            frequently not announced. assertive for an error, polite for a
            success — the urgency differs and so should the interruption. */}
        <div
          className={toast ? `toast ${toast.type}` : undefined}
          role={toast?.type === 'error' ? 'alert' : 'status'}
          aria-live={toast?.type === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
          style={toast ? undefined : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
        >
          {toast?.msg ?? ''}
        </div>

      <nav>
        <button className="nav-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="nav-logo">
          <FlippingLogo size={64} />
          <div className="nav-logo-text">
            <span><b>Edu</b><i>Scribe</i></span>
            <span>Admin Portal</span>
          </div>
        </div>
        <div className="nav-actions">
          <NotificationBell />
          <button className="nav-toggle-btn" aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} onClick={() => setDarkMode(d => !d)}>
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      <div className="layout">
        {sidebarOpen && <div className="sidebar-mobile-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'mobile-open' : ''}`}>
          <button className="sidebar-collapse" onClick={() => setSidebarCollapsed(c => !c)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
          <div className="sidebar-user admin-profile-row" style={{ flexWrap: 'wrap', display: 'flex', visibility: 'visible' }}>
            <button
              onClick={() => setProfileOpen(open => !open)}
              aria-expanded={profileOpen}
              aria-label="Toggle profile menu"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', flex: 1, minWidth: 0, textAlign: 'left' }}
            >
            <Avatar className="nav-avatar" src={photoUrl} name={userData?.name || 'Admin User'} size={36} style={{ display: 'flex', visibility: 'visible' }} />
            {!sidebarCollapsed && <div style={{ minWidth: 0 }}><div style={{ fontSize: 'var(--font-size-13)', fontWeight: 700, color: 'var(--text)' }}>{userData?.name || 'Admin User'}</div><div style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-muted)' }}>Administrator</div></div>}
            {!sidebarCollapsed && <ChevronRight size={15} style={{ marginLeft: 'auto', color: 'var(--text-muted)', transform: profileOpen ? 'rotate(90deg)' : 'none', transition: 'transform var(--motion-base)' }} />}
            </button>
            {profileOpen && !sidebarCollapsed && (
              <button
                onClick={() => leaveSettings(() => { setPage('profile'); setProfileOpen(false); })}
                style={{ width: '100%', marginTop: 'var(--space-12)', padding: 'var(--space-8) var(--space-12)', display: 'flex', alignItems: 'center', gap: 'var(--space-8)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', background: 'var(--card2)', textAlign: 'left', fontSize: 'var(--font-size-13)', fontWeight: 600 }}
              >
                <Settings size={15} />
                <span>Profile Settings</span>
              </button>
            )}
          </div>
          {[
            ['overview',  'Overview', LayoutDashboard],
            ['users',     'User Management', Users],
            ['subjects',  'Subjects', BookMarked],
            ['teaching-load', 'Teaching Load', GraduationCap],
            ['sections', 'Sections', Columns],
            ['schedules', 'Schedules', CalendarClock],
            ['news',      'News Management', Newspaper],
            ['calendar',  'Calendar', Calendar],
            ['memos',     'Memos', FileText],
            ['settings',  'System Settings', Settings],
          ].map(([k, v, Icon]) => (
            <button
              key={k}
              type="button"
              className={`ux-unbutton sidebar-item ${page === k ? 'active' : ''}`}
              // Condition 2 — the current page, announced as such.
              aria-current={page === k ? 'page' : undefined}
              // UX-097: collapsed, the label is not rendered and the glyph
              // carries the destination on its own.
              aria-label={sidebarCollapsed ? v : undefined}
              title={sidebarCollapsed ? v : undefined}
              onClick={() => leaveSettings(() => { setPage(k); setSidebarOpen(false); })}
            >
              <span className="sidebar-icon"><Icon size={16} aria-hidden="true" /></span>
              {!sidebarCollapsed && <span>{v}</span>}
            </button>
          ))}

          {page === 'settings' && !sidebarCollapsed && (
            <div>
              <div className="sidebar-section">Sections</div>
              {[
                ['sec-general',       'General'],
                ['sec-security',      'Security'],
                ['sec-notifications', 'Notifications'],
                ['sec-backup',        'Backup & Logs'],
                ['sec-appearance',    'Appearance'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`ux-unbutton sidebar-sub ${activeSettingsSub === id ? 'active' : ''}`}
                  aria-current={activeSettingsSub === id ? 'true' : undefined}
                  onClick={() => { scrollToSection(id); setSidebarOpen(false); }}
                >{label}</button>
              ))}
            </div>
          )}

          <div className="sidebar-logout">
            <button className="nav-logout-btn" aria-label="Logout" style={{ width:'100%', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', color:'#dc2626', borderColor:'#f3b9ba', background:'#fdf1f1' }} onClick={() => { logout(); navigate('/login'); }}>
              <LogOut size={15} />
              {!sidebarCollapsed && 'Logout'}
            </button>
          </div>
        </div>

        <div className="main">
          <PageTransition transitionKey={page}>
            {page === 'overview' && <OverviewTab />}
            {page === 'users' && <UsersTab />}
            {page === 'subjects' && <SubjectsTab />}
            {page === 'teaching-load' && <TeachingLoadTab />}
            {page === 'sections' && <SectionsTab />}
            {page === 'schedules' && <SchedulesTab />}
            {page === 'news' && <NewsTab />}
            {page === 'calendar' && <CalendarTab />}
            {page === 'memos' && <MemosTab />}
            {page === 'settings' && <SettingsTab />}
            {page === 'profile' && <ProfileTab />}
          </PageTransition>
        </div>
      </div>

      {/* MODALS */}

      {/* DELETE CONFIRM MODAL */}
      {/* Condition 3: initial focus lands on Cancel, not on the
          destructive button. <Modal> focuses the first focusable element,
          and Cancel is first in the footer, so this holds by construction —
          and e2e/admin-modal.spec.js asserts it rather than trusting it. */}
      <Modal
        open={Boolean(deleteConfirm)}
        title={deleteConfirm?.title || 'Archive User?'}
        onClose={() => setDeleteConfirm(null)}
        footer={(requestClose) => (
          <>
            <button className="btn btn-ghost" onClick={requestClose}>Cancel</button>
            <Button
              variant="danger-solid"
              onClick={async () => {
                const fn = deleteConfirm?.onConfirm;
                setDeleteConfirm(null);
                if (fn) await fn();
              }}
            >
              {deleteConfirm?.confirmLabel || 'Yes, Archive'}
            </Button>
          </>
        )}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 'var(--space-12)', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={26} color="var(--red)" />
            </div>
          </div>
          <p style={{ fontSize: 'var(--font-size-13)', color: 'var(--text-muted)', marginBottom: 'var(--space-8)', lineHeight: 1.6 }}>
            {deleteConfirm?.message || 'This user will be moved to the archive and removed from the active user list:'}
          </p>
          <p style={{ fontSize: 'var(--font-size-14)', fontWeight: 700, color: 'var(--text)', marginBottom: 'var(--space-4)' }}>
            {deleteConfirm?.label}
          </p>
          {deleteConfirm?.role && (
            <span className={`badge ${roleBadge(deleteConfirm.role)}`} style={{ marginBottom: 'var(--space-12)', display: 'inline-block' }}>
              {roleLabel(deleteConfirm.role)}
            </span>
          )}
          {deleteConfirm?.warning !== null && (
            <p style={{ fontSize: 'var(--font-size-12)', color: 'var(--red)', marginTop: 'var(--space-12)', marginBottom: 'var(--space-24)' }}>
              {deleteConfirm?.warning || 'The account will not be permanently deleted.'}
            </p>
          )}
        </div>
      </Modal>

    </div>
  );
};


export default AdminDashboard;
