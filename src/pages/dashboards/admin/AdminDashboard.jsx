// ============================================
// FILE: src/pages/dashboards/admin/AdminDashboard.jsx
// SHELL: auth guard -> AdminProvider -> sidebar/nav + page-switch
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Sun, Moon, Search, LogOut, AlertTriangle, LayoutDashboard, Users, Newspaper, Calendar, FileText, Settings, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { AdminProvider, useAdminContext } from './AdminContext';
import { initials, avatarColor, roleBadge, roleLabel } from './shared/helpers';
import OverviewTab from './tabs/OverviewTab';
import UsersTab from './tabs/UsersTab';
import NewsTab from './tabs/NewsTab';
import CalendarTab from './tabs/CalendarTab';
import MemosTab from './tabs/MemosTab';
import SettingsTab from './tabs/SettingsTab';

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
        justifyContent: 'center', background: '#1a1d23', flexDirection: 'column', gap: 16
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #2e3340',
          borderTopColor: '#3b82f6', borderRadius: '50%',
          animation: 'spin .7s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: '#8b92a5', fontSize: 14 }}>Loading session…</span>
      </div>
    );
  }

  if (!userData || userData.role !== 'main_admin') {
    navigate('/faculty-login', { replace: true });
    return null;
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
  const { darkMode, page, setDarkMode, setPage, toast, logoErr, setLogoErr,
    activeSettingsSub, scrollToSection, settings, deleteConfirm, setDeleteConfirm } = useAdminContext();

  return (
    <div className="dashboard-shell">
      <style>{`
        /* ── DARK MODE (default) ── */
        :root {
          --bg: #1a1d23;
          --sidebar-bg: #1e2128;
          --card-bg: #23272f;
          --card2: #2a2f3a;
          --border: #2e3340;
          --text: #e8eaf0;
          --text-muted: #8b92a5;
          --text-dim: #5a6070;
          --accent: #4b3bf5;
          --accent-hover: #6357f7;
          --green: #22c55e;
          --yellow: #f59e0b;
          --red: #ef4444;
          --purple: #a78bfa;
          --teal: #2dd4bf;
          --nav-bg: #ffffff;
          --nav-border: #e2e8f0;
          --nav-text: #1a2b4a;
          --nav-text-muted: #4a5568;
          --nav-link-active-color: #1a2b4a;
          --nav-link-hover-bg: #f1f5f9;
          --nav-shadow: 0 1px 3px rgba(0,0,0,0.08);
          --toggle-bg: #e2e8f0;
          --toggle-icon: #4a5568;
        }
        :root.light {
          --bg: #f4f6fb;
          --sidebar-bg: #f8fafc;
          --card-bg: #ffffff;
          --card2: #f1f5f9;
          --border: #e2e8f0;
          --text: #1a2b4a;
          --text-muted: #4a5568;
          --text-dim: #94a3b8;
          --accent: #1908DF;
          --accent-hover: #12069f;
          --green: #16a34a;
          --yellow: #d97706;
          --red: #dc2626;
          --purple: #7c3aed;
          --teal: #0d9488;
          --nav-bg: #ffffff;
          --nav-border: #e2e8f0;
          --nav-text: #1a2b4a;
          --nav-text-muted: #4a5568;
          --nav-link-active-color: #1a2b4a;
          --nav-link-hover-bg: #f1f5f9;
          --nav-shadow: 0 1px 3px rgba(0,0,0,0.08);
          --toggle-bg: #1a2b4a;
          --toggle-icon: #ffffff;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Public Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; font-size: 14px; }

        nav {
          background: linear-gradient(100deg, #12069f 0%, #1908DF 55%, #3a2bf0 100%);
          height: 76px;
          display: flex;
          align-items: center;
          padding: 0 28px;
          gap: 0;
          border-bottom: none;
          box-shadow: 0 2px 10px rgba(8,20,45,.2);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          flex-shrink: 0;
          margin-right: 32px;
        }
        .nav-menu-btn { display: none; }
        .nav-logo img {
          width: 56px; height: 56px;
          border-radius: 50%;
          object-fit: contain;
          flex-shrink: 0;
        }
        .nav-logo-icon {
          width: 56px; height: 56px;
          background: #ffffff;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 900;
          color: #1908DF; flex-shrink: 0;
        }
        .nav-logo-text { display: flex; flex-direction: column; line-height: 1.2; }
        .nav-logo-text span:first-child { font-weight: 800; font-size: 20px; color: #F1CA0B; }
        .nav-logo-text span:last-child { font-size: 11px; color: rgba(255,255,255,.7); font-weight: 500; }

        .nav-links { display: flex; gap: 2px; flex: 1; }
        .nav-link {
          padding: 6px 14px;
          cursor: pointer;
          color: rgba(255,255,255,.72);
          font-size: 13px; font-weight: 600;
          letter-spacing: 0.03em;
          transition: all .15s;
          border: none; background: none;
          border-radius: 6px;
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
          background: #FFC542;
          border-radius: 2px;
        }

        .nav-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .nav-search-btn {
          width: 36px; height: 36px; border-radius: 50%;
          border: none; background: rgba(255,255,255,.12); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #ffffff; transition: background .15s;
        }
        .nav-search-btn:hover { background: rgba(255,255,255,.22); }
        .nav-search { width: 260px; display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #ffffff; color: #64748b; }
        .nav-search input { width: 100%; border: none; outline: none; background: transparent; color: #334155; font: inherit; padding: 0; }
        .nav-toggle-btn {
          width: 36px; height: 36px; border-radius: 50%;
          border: none; background: rgba(255,255,255,.12); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #ffffff; transition: all .2s;
        }
        .nav-toggle-btn:hover { background: rgba(255,255,255,.22); }
        .nav-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          background: #FFC542;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #12069f;
          cursor: pointer; border: 2px solid rgba(255,255,255,.5);
          flex-shrink: 0;
        }
        .nav-logout-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,.3);
          background: transparent; cursor: pointer;
          color: rgba(255,255,255,.85); font-size: 13px; font-weight: 600;
          transition: all .15s;
        }
        .nav-logout-btn:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

        .layout { display: flex; flex: 1; min-height: calc(100vh - 48px); }
        .sidebar { width: 256px; background: var(--sidebar-bg); border-right: 1px solid var(--border); padding: 0 12px 16px; flex-shrink: 0; transition: width .3s ease; position: relative; }
        .sidebar.collapsed { width: 80px; }
        .sidebar-user { padding: 20px 8px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .sidebar.collapsed .sidebar-user { justify-content: center; }
        .sidebar-item { padding: 10px 12px; border-radius: 12px; cursor: pointer; color: var(--text-muted); font-size: 13px; font-weight: 600; transition: all .15s; display: flex; align-items: center; gap: 10px; border-left: 3px solid transparent; }
        .sidebar.collapsed .sidebar-item { justify-content: center; padding-left: 8px; padding-right: 8px; }
        .sidebar-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sidebar-item:not(.active) .sidebar-icon { border: 1px solid var(--border); }
        .sidebar-item.active .sidebar-icon { background: var(--card-bg); box-shadow: 0 2px 6px rgba(25,8,223,.18); }
        .sidebar-item:hover { color: var(--text); background: rgba(128,128,128,0.08); }
        .sidebar-item.active { color: var(--text); background: rgba(25,8,223,0.08); border-left-color: var(--accent); }
        .sidebar-section { padding: 16px 12px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-dim); }
        .sidebar-sub { padding: 7px 20px 7px 28px; cursor: pointer; color: var(--text-dim); font-size: 12px; transition: all .15s; }
        .sidebar-sub:hover { color: var(--text-muted); }
        .sidebar-sub.active { color: var(--accent); }
        .sidebar-collapse { position: absolute; right: -12px; top: 28px; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border); background: var(--sidebar-bg); color: var(--text-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
        .sidebar-logout { margin-top: auto; padding: 12px 8px 0; border-top: 1px solid var(--border); }
        .main { flex: 1; padding: 24px 32px; overflow-y: auto; }

        .page-title { font-size: 22px; font-weight: 700; color: var(--text); }
        .page-sub { color: var(--text-muted); font-size: 13px; margin-top: 3px; margin-bottom: 20px; }
        .btn { padding: 8px 16px; border-radius: 7px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; transition: all .15s; display: inline-flex; align-items: center; gap: 6px; }
        .btn-primary { background: var(--accent); color: #fff; }
        .btn-primary:hover { background: var(--accent-hover); }
        .btn-ghost { background: transparent; color: var(--accent); border: 1px solid var(--border); }
        .btn-danger { background: transparent; color: var(--red); border: none; cursor: pointer; }
        .btn-sm { padding: 4px 10px; font-size: 12px; }
        input, select, textarea { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); border-radius: 7px; padding: 8px 12px; font-size: 13px; outline: none; }
        input:focus, select:focus, textarea:focus { border-color: var(--accent); }
        select { appearance: none; cursor: pointer; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; }
        .avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; color: #fff; }
        .badge { padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; border: 1px solid; white-space: nowrap; }
        .badge-blue    { color: #60a5fa; border-color: #1d4ed8; background: rgba(59,130,246,0.1); }
        .badge-green   { color: #4ade80; border-color: #15803d; background: rgba(34,197,94,0.1); }
        .badge-teal    { color: #5eead4; border-color: #0f766e; background: rgba(45,212,191,0.1); }
        .badge-yellow  { color: #fbbf24; border-color: #b45309; background: rgba(245,158,11,0.1); }
        .badge-red     { color: #f87171; border-color: #b91c1c; background: rgba(239,68,68,0.1); }
        .badge-purple  { color: #c4b5fd; border-color: #6d28d9; background: rgba(167,139,250,0.1); }
        .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
        .dot-green { background: var(--green); }
        .dot-red { background: var(--red); }
        .dot-gray  { background: #4b5563; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        td { padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 13px; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.02); }
        .toolbar { display: flex; gap: 10px; margin-bottom: 18px; align-items: center; flex-wrap: wrap; }
        .toolbar input { flex: 1; min-width: 160px; max-width: 280px; }
        .table-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }

        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
        .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; height: 184px; }
        .stat-icon-block { height: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .stat-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 10px 18px; }
        .stat-label { font-size: 12px; font-weight: 700; color: var(--text); margin-top: 2px; }
        .stat-value { font-size: 24px; font-weight: 700; }
        .stat-change { font-size: 12px; margin-top: 2px; display: flex; align-items: center; gap: 4px; }
        .stat-change.up   { color: var(--green); }
        .stat-change.down { color: var(--red); }
        .overview-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
        .chart-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
        .chart-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
        .chart-sub   { font-size: 12px; color: var(--text-muted); margin-bottom: 16px; }
        .bars { display: flex; align-items: flex-end; gap: 8px; height: 120px; }
        .bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
        .bar { background: var(--accent); border-radius: 4px 4px 0 0; width: 100%; transition: opacity .15s; }
        .bar:hover { opacity: .8; }
        .bar-label { font-size: 11px; color: var(--text-dim); }
        .recent-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
        .recent-item:last-child { border-bottom: none; }
        .recent-dot  { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .recent-info { flex: 1; }
        .recent-title { font-size: 13px; color: var(--text); }
        .recent-time  { font-size: 11px; color: var(--text-dim); }
        .role-bar { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        .role-row { display: flex; align-items: center; gap: 10px; }
        .role-track { flex: 1; height: 10px; background: var(--border); border-radius: 10px; overflow: hidden; }
        .role-fill  { height: 100%; border-radius: 10px; }
        .role-label { font-size: 12px; color: var(--text-muted); width: 110px; flex-shrink: 0; }

        .pagination { display: flex; align-items: center; gap: 6px; padding: 14px 16px; border-top: 1px solid var(--border); font-size: 13px; color: var(--text-muted); }
        .page-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border); background: var(--card-bg); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; }
        .page-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
        .assign-bar { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-top: 14px; display: flex; align-items: center; justify-content: space-between; }
        .assign-label { font-size: 13px; font-weight: 600; }
        .assign-hint { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

        .news-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .news-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
        .news-card-top { height: 4px; }
        .news-card-top.pub  { background: var(--accent); }
        .news-card-top.draft { background: var(--yellow); }
        .news-card-top.arch  { background: var(--text-dim); }
        .news-card-body { padding: 14px 16px; }
        .news-meta   { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
        .news-title  { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
        .news-author { font-size: 12px; color: var(--text-muted); }
        .news-actions { padding: 10px 16px; border-top: 1px solid var(--border); display: flex; gap: 14px; align-items: center; }
        .news-action { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text-muted); }
        .news-action:hover { color: var(--text); }
        .news-action.red   { color: var(--red); }
        .news-action.green { color: var(--green); }
        .news-action.blue  { color: var(--accent); }
        .news-footer { font-size: 12px; color: var(--text-muted); margin-top: 16px; }

        .cal-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .cal-title   { font-size: 16px; font-weight: 600; }
        .cal-nav { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 4px 8px; border-radius: 5px; }
        .cal-nav:hover { background: rgba(255,255,255,0.06); color: var(--text); }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
        .cal-head { background: var(--card-bg); padding: 10px; text-align: center; font-size: 12px; font-weight: 600; color: var(--text-muted); }
        .cal-cell { background: var(--card-bg); min-height: 80px; padding: 8px; position: relative; }
        .cal-cell:hover { background: var(--card2); }
        .cal-day { font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
        .cal-cell.today .cal-day { background: var(--accent); color: #fff; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .cal-cell.other-month .cal-day { color: var(--text-dim); }
        .cal-event { font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
        .cal-event:hover { opacity: 0.8; }
        .ev-blue   { background: rgba(59,130,246,0.3);  color: #93c5fd; }
        .ev-yellow { background: rgba(245,158,11,0.3);  color: #fcd34d; }
        .ev-green  { background: rgba(34,197,94,0.3);   color: #86efac; }
        .ev-purple { background: rgba(167,139,250,0.3); color: #c4b5fd; }
        .ev-teal   { background: rgba(45,212,191,0.3);  color: #5eead4; }
        .cal-sidebar { width: 200px; flex-shrink: 0; }
        .upcoming-item { padding: 10px 0; border-left: 3px solid; padding-left: 10px; margin-bottom: 10px; }
        .legend { display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .legend-dot  { width: 12px; height: 12px; border-radius: 2px; }

        .memo-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; }
        .memo-list-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background .1s; }
        .memo-list-item:hover { background: rgba(255,255,255,0.03); }
        .memo-list-item.active { background: rgba(59,130,246,0.08); border-left: 3px solid var(--accent); }
        .memo-title-item { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
        .memo-meta    { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .memo-snippet { font-size: 12px; color: var(--text-dim); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .memo-preview { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
        .memo-field       { display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px; }
        .memo-field-label { color: var(--text-muted); width: 50px; flex-shrink: 0; }
        .memo-field-val   { color: var(--text); font-weight: 500; }
        .memo-actions     { display: flex; gap: 10px; margin-top: 16px; }
        .memo-stats-bar   { padding: 14px 16px; border-top: 1px solid var(--border); display: flex; gap: 16px; }
        .memo-stat-val    { font-size: 24px; font-weight: 700; }
        .memo-stat-label  { font-size: 12px; color: var(--text-muted); }

        .settings-section { margin-bottom: 24px; }
        .settings-section-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        .settings-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
        .settings-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .settings-row:last-child { border-bottom: none; }
        .settings-label { font-size: 13px; font-weight: 600; }
        .settings-hint  { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .settings-hint a { color: var(--accent); text-decoration: none; }
        .settings-input-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .settings-input-row:last-child { border-bottom: none; }
        .settings-input-label { font-size: 13px; color: var(--text-muted); width: 120px; flex-shrink: 0; }
        .settings-save { display: flex; justify-content: flex-end; margin-top: 16px; }

        .toggle { width: 44px; height: 24px; border-radius: 12px; position: relative; cursor: pointer; transition: background .2s; flex-shrink: 0; }
        .toggle.on  { background: var(--accent); }
        .toggle.off { background: var(--text-dim); }
        .toggle-knob { width: 18px; height: 18px; border-radius: 50%; background: #fff; position: absolute; top: 3px; transition: left .2s; }
        .toggle.on  .toggle-knob { left: 23px; }
        .toggle.off .toggle-knob { left: 3px; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; z-index: 1000; }
        .modal-overlay.open { display: flex; }
        .modal { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 440px; max-height: 90vh; overflow-y: auto; }
        .modal-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
        .form-row   { margin-bottom: 14px; }
        .form-label { font-size: 12px; color: var(--text-muted); margin-bottom: 5px; display: block; }
        .form-input { width: 100%; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

        .toast { position: fixed; bottom: 24px; right: 24px; padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; z-index: 2000; animation: slideUp .3s ease; }
        .toast.success { background: var(--green); color: #fff; }
        .toast.error   { background: var(--red); color: #fff; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .spin { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading-row { text-align: center; padding: 40px; color: var(--text-muted); }

        @media(max-width:900px) {
          .nav-menu-btn { display: flex; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255,255,255,.12); color: #fff; align-items: center; justify-content: center; cursor: pointer; }
          .nav-search { display: none; }
          .layout { min-height: calc(100vh - 76px); }
          .sidebar { position: fixed; top: 76px; bottom: 0; left: 0; z-index: 50; transform: translateX(-100%); width: 256px; }
          .sidebar.mobile-open { transform: translateX(0); }
          .sidebar.collapsed { width: 256px; }
          .sidebar.collapsed .sidebar-user { justify-content: flex-start; }
          .sidebar.collapsed .sidebar-item { justify-content: flex-start; padding-left: 12px; padding-right: 12px; }
          .sidebar-mobile-overlay { display: block; position: fixed; inset: 76px 0 0; background: rgba(0,0,0,.4); z-index: 40; }
          .main { padding: 20px 16px; }
          .stat-grid { grid-template-columns: 1fr 1fr; }
          .overview-grid { grid-template-columns: 1fr; }
          .news-grid { grid-template-columns: 1fr; }
          .memo-layout { grid-template-columns: 1fr; }
          .cal-sidebar { width: auto; }
          .assign-bar { flex-direction: column; align-items: flex-start; gap: 12px; }
          .news-actions { flex-wrap: wrap; }
          .modal { width: min(440px, calc(100vw - 32px)); }
        }
        @media(max-width:600px) {
          nav { padding: 0 16px; }
          .nav-logo { margin-right: 0; }
          .nav-logo-text span:first-child { font-size: 18px; }
          .sidebar { width: 256px; }
          .stat-grid { grid-template-columns: 1fr; }
          .cal-toolbar > * { max-width: 100%; }
          .cal-grid { min-width: 0; }
          .cal-cell { min-height: 64px; padding: 5px; }
          .cal-head { padding: 7px 2px; font-size: 10px; }
          .cal-event { padding: 2px 3px; font-size: 10px; }
          .modal { padding: 18px; }
        }
      `}</style>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <nav>
        <button className="nav-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="nav-logo">
          {!logoErr
            ? <img src="/capstonelogo.png" alt="logo" onError={() => setLogoErr(true)} />
            : <div className="nav-logo-icon">DP</div>}
          <div className="nav-logo-text">
            <span>EDUSCRIBE</span>
            <span>Admin Portal</span>
          </div>
        </div>
        <div className="nav-actions">
          <div className="nav-search">
            <Search size={15} />
            <input placeholder="Search..." aria-label="Search dashboard" />
          </div>
          <button className="nav-toggle-btn" title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} onClick={() => setDarkMode(d => !d)}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </nav>

      <div className="layout">
        {sidebarOpen && <div className="sidebar-mobile-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${sidebarOpen ? 'mobile-open' : ''}`}>
          <button className="sidebar-collapse" onClick={() => setSidebarCollapsed(c => !c)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
          <div className="sidebar-user" style={{ flexWrap: 'wrap' }}>
            <button
              onClick={() => setProfileOpen(open => !open)}
              aria-expanded={profileOpen}
              aria-label="Toggle profile menu"
              style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left' }}
            >
            <div className="nav-avatar" style={{ background: avatarColor(userData?.name || '') }}>{initials(userData?.name)}</div>
            {!sidebarCollapsed && <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{userData?.name || 'Admin'}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Administrator</div></div>}
            {!sidebarCollapsed && <ChevronRight size={15} style={{ marginLeft: 'auto', color: 'var(--text-muted)', transform: profileOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />}
            </button>
            {profileOpen && !sidebarCollapsed && (
              <button
                onClick={() => navigate('/change-password')}
                style={{ width: '100%', marginTop: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, color: 'var(--text-muted)', background: 'var(--card2)', textAlign: 'left', fontSize: 13, fontWeight: 600 }}
              >
                <Settings size={15} />
                <span>Profile Settings</span>
              </button>
            )}
          </div>
          {[
            ['overview',  'Overview', LayoutDashboard],
            ['users',     'User Management', Users],
            ['news',      'News Management', Newspaper],
            ['calendar',  'Calendar', Calendar],
            ['memos',     'Memos', FileText],
            ['settings',  'System Settings', Settings],
          ].map(([k, v, Icon]) => (
            <div key={k} className={`sidebar-item ${page === k ? 'active' : ''}`} onClick={() => { setPage(k); setSidebarOpen(false); }}>
              <span className="sidebar-icon"><Icon size={16} /></span>
              {!sidebarCollapsed && <span>{v}</span>}
            </div>
          ))}

          {page === 'settings' && !sidebarCollapsed && (
            <div>
              <div className="sidebar-section">Sections</div>
              {[
                ['sec-general',       'General'],
                ['sec-security',      'Security'],
                ['sec-notifications', 'Notifications'],
                ['sec-integrations',  'Integrations'],
                ['sec-backup',        'Backup & Logs'],
                ['sec-appearance',    'Appearance'],
              ].map(([id, label]) => (
                <div key={id} className={`sidebar-sub ${activeSettingsSub === id ? 'active' : ''}`} onClick={() => { scrollToSection(id); setSidebarOpen(false); }}>{label}</div>
              ))}
            </div>
          )}

          <div style={{ marginTop:20, padding:'12px 20px', fontSize:12, color:'var(--text-dim)', display:'flex', alignItems:'center', gap:6 }}>
            <span className="dot dot-green"></span> All systems online
          </div>
          <div className="sidebar-logout">
            <button className="nav-logout-btn" style={{ width:'100%', justifyContent:'flex-start', color:'#dc2626', borderColor:'#f3b9ba', background:'#fdf1f1' }} onClick={() => { logout(); navigate('/login'); }}>
              <LogOut size={15} />
              Logout
            </button>
          </div>
        </div>

        <div className="main">

          {page === 'overview' && <OverviewTab />}
          {page === 'users' && <UsersTab />}
          {page === 'news' && <NewsTab />}
          {page === 'calendar' && <CalendarTab />}
          {page === 'memos' && <MemosTab />}
          {page === 'settings' && <SettingsTab />}

        </div>
      </div>

      {/* MODALS */}

      {/* DELETE CONFIRM MODAL */}
      <div className={`modal-overlay ${deleteConfirm ? 'open' : ''}`} onClick={() => setDeleteConfirm(null)}>
        <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AlertTriangle size={26} color="var(--red)" />
            </div>
          </div>
          <div className="modal-title" style={{ textAlign: 'center', marginBottom: 8 }}>Delete User?</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.6 }}>
            You are about to permanently delete
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {deleteConfirm?.label}
          </p>
          {deleteConfirm?.role && (
            <span className={`badge ${roleBadge(deleteConfirm.role)}`} style={{ marginBottom: 12, display: 'inline-block' }}>
              {roleLabel(deleteConfirm.role)}
            </span>
          )}
          <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 10, marginBottom: 20 }}>
            ⚠ This action cannot be undone. The account will be removed immediately.
          </p>
          <div className="modal-actions" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={async () => {
                const fn = deleteConfirm?.onConfirm;
                setDeleteConfirm(null);
                if (fn) await fn();
              }}
            >
              Yes, Delete
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};


export default AdminDashboard;
