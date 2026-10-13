// ============================================
// FILE: src/styles/dashboardTheme.jsx
// Shared design system extracted from AdminDashboard (the reference design).
// Provides the CSS-variable theme + shell animations shared by every
// dashboard's header/sidebar, and the dark/light toggle hook that drives it.
// ============================================

import { useState, useEffect, useLayoutEffect, useCallback } from 'react';

const THEME_STORAGE_KEY = 'smartedu-theme';

// The stored value is a PREFERENCE, not a resolved appearance: 'dark',
// 'light' or 'auto'. Only 'dark' and 'light' were ever written before, and
// both are still valid, so an existing browser carries straight over.
const PREFS = ['dark', 'light', 'auto'];

const prefersDark = () => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // No matchMedia (old browser, jsdom without a stub) — fall back to the
    // project's default rather than throwing during render.
    return true;
  }
};

// Dark mode is the default; the resolved value adds a `.dark` class to
// <html>, which src/styles/index.css keys off. Light is the bare :root so
// that pages outside a dashboard still have usable tokens.
//
// One hook instance per dashboard, shared through that dashboard's context.
// That is what makes the admin's header button and its Settings dropdown
// the same control: they read and write one state, so they cannot disagree.
export const useDashboardTheme = () => {
  const [themePref, setThemePrefState] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (PREFS.includes(stored)) return stored;
    } catch { /* localStorage unavailable */ }
    return 'dark';
  });

  // Tracked separately so that 'auto' follows the OS while the page is open,
  // not only at load. Someone whose machine switches at sunset should see
  // the portal switch with it.
  const [systemDark, setSystemDark] = useState(prefersDark);
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return undefined; }
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const darkMode = themePref === 'auto' ? systemDark : themePref === 'dark';

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
      localStorage.setItem(THEME_STORAGE_KEY, themePref);
    } catch { /* localStorage unavailable */ }
  }, [themePref]);

  const setThemePref = useCallback((next) => {
    if (PREFS.includes(next)) setThemePrefState(next);
  }, []);

  // Kept for the four call sites that predate 'auto' and think in booleans.
  // Both forms still work — setDarkMode(true) and setDarkMode(d => !d) — and
  // either one commits to an explicit preference, which is the right reading
  // of "I pressed the dark-mode button": it is a choice, not a request to
  // follow the system.
  const setDarkMode = useCallback((next) => {
    setThemePrefState((prev) => {
      const wasDark = prev === 'auto' ? prefersDark() : prev === 'dark';
      const wantDark = typeof next === 'function' ? next(wasDark) : !!next;
      return wantDark ? 'dark' : 'light';
    });
  }, []);

  const toggleDarkMode = useCallback(() => setDarkMode((d) => !d), [setDarkMode]);

  return { darkMode, setDarkMode, toggleDarkMode, themePref, setThemePref };
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
    /* Named properties, not the all keyword. These two animated their own
       padding and border width, which is why a sidebar entry was never
       "stable" for Playwright and needed force: true for three phases.
       Nothing here needs layout to animate. */
    .dashboard-shell .sidebar-item,
    .dashboard-shell .sidebar-icon {
      transition: background-color .15s ease, color .15s ease, border-color .15s ease;
    }
    .dashboard-shell .icon-action {
      transition: transform .15s, background-color .15s, color .15s;
    }
    .dashboard-shell .edit-action:hover { transform: scale(1.08); }
    .dashboard-shell .archive-action:hover { transform: scale(1.08) rotate(-8deg); }
    .dashboard-shell .clickable-stat {
      transition: transform .15s, border-color .15s, box-shadow .15s;
    }
    /* D3: the 3px lift and the dark drop shadow were decoration on a
       control whose only job is to navigate. The border colour already says
       it is interactive, and it does not move the page under the pointer. */
    .dashboard-shell .clickable-stat:hover {
      border-color: var(--accent);
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
