// ============================================
// FILE: src/styles/dashboardTheme.jsx
// Shared design system extracted from AdminDashboard (the reference design).
// Provides the CSS-variable theme + shell animations shared by every
// dashboard's header/sidebar, and the dark/light toggle hook that drives it.
// ============================================

import { useState, useEffect, useLayoutEffect } from 'react';

const THEME_STORAGE_KEY = 'smartedu-theme';

// Dark mode is the default (matches Admin's original behavior); toggling adds
// a `.dark` class to <html>, which src/styles/index.css keys off. Light is the
// bare :root so that pages outside a dashboard still have usable tokens.
export const useDashboardTheme = () => {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light') return false;
      if (stored === 'dark') return true;
    } catch { /* localStorage unavailable */ }
    return true;
  });

  // Layout effect, not effect: the class has to be on <html> before the
  // browser paints, or a dark-mode user sees a light frame on every load.
  // The cleanup matters as much — this hook only runs inside a dashboard, and
  // leaving .dark behind would theme the public pages on the way out.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    return () => document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch { /* localStorage unavailable */ }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(d => !d);

  return { darkMode, setDarkMode, toggleDarkMode };
};

// Shell-only styles: header/nav, sidebar, main layout, toast + spinner
// animations. The CSS variables these read live in src/styles/index.css, so
// that they exist on every page rather than only where this mounts.
export const DashboardThemeStyles = () => (
  <style>{`
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
