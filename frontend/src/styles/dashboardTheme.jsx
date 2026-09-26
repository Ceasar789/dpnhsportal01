// ============================================
// FILE: src/styles/dashboardTheme.jsx
// Shared design system extracted from AdminDashboard (the reference design).
// Provides the CSS-variable theme + shell animations shared by every
// dashboard's header/sidebar, and the dark/light toggle hook that drives it.
// ============================================

import { useState, useEffect } from 'react';

const THEME_STORAGE_KEY = 'smartedu-theme';

// Dark mode is the default (matches Admin's original behavior); toggling adds
// a `.light` class to <html> which the CSS variables below key off of.
export const useDashboardTheme = () => {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light') return false;
      if (stored === 'dark') return true;
    } catch { /* localStorage unavailable */ }
    return true;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch { /* localStorage unavailable */ }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(d => !d);

  return { darkMode, setDarkMode, toggleDarkMode };
};

// Shell-only styles: CSS variables, header/nav, sidebar, main layout,
// toast + spinner animations. Tab-content styles (tables, modals, stat
// grids, etc.) stay local to each dashboard for now.
export const DashboardThemeStyles = () => (
  <style>{`
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
      --banner-bg: linear-gradient(135deg, #1c2340 0%, #212a4a 55%, #1a2140 100%);
      --banner-text: #f1f5f9;
      --banner-subtext: #a8b3d9;
      --banner-accent: #8b93ff;
      --banner-border: rgba(255,255,255,0.10);
      --banner-pill-bg: rgba(255,255,255,0.10);
      --banner-pill-border: rgba(255,255,255,0.18);
      --heading-accent: #8b93ff;
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
      --banner-bg: linear-gradient(135deg, #D7DEFA 0%, #C9D3F6 55%, #DCEBFF 100%);
      --banner-text: #1a2b4a;
      --banner-subtext: #4d5b8a;
      --banner-accent: #1908DF;
      --banner-border: rgba(25,8,223,0.14);
      --banner-pill-bg: rgba(255,255,255,.75);
      --banner-pill-border: rgba(25,8,223,.16);
      --heading-accent: #6366a3;
    }

    body { font-family: 'Public Sans', sans-serif; }

    .dashboard-shell .sidebar {
      transition: width .3s ease, transform .3s ease;
    }
    .dashboard-shell .sidebar-item,
    .dashboard-shell .sidebar-icon {
      transition: all .3s ease;
    }
    .dashboard-shell .icon-action {
      transition: transform .15s, background-color .15s, color .15s;
    }
    .dashboard-shell .edit-action:hover { transform: scale(1.08); }
    .dashboard-shell .archive-action:hover { transform: scale(1.08) rotate(-8deg); }
    .dashboard-shell .clickable-stat {
      transition: transform .15s, border-color .15s, box-shadow .15s;
    }
    .dashboard-shell .clickable-stat:hover {
      transform: translateY(-3px);
      border-color: var(--accent);
      box-shadow: 0 8px 20px rgba(0,0,0,.18);
    }

    .dashboard-shell .toast {
      position: fixed; bottom: 24px; right: 24px; padding: 12px 20px;
      border-radius: 8px; font-size: 13px; font-weight: 600; z-index: 2000;
      animation: dashboardSlideUp .3s ease;
    }
    .dashboard-shell .toast.success { background: var(--green); color: #fff; }
    .dashboard-shell .toast.error   { background: var(--red); color: #fff; }
    @keyframes dashboardSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }

    .dashboard-shell .spin {
      width: 20px; height: 20px; border: 2px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%;
      animation: dashboardSpin .7s linear infinite; display: inline-block;
    }
    @keyframes dashboardSpin { to { transform: rotate(360deg); } }
  `}</style>
);
