// ============================================
// FILE: src/pages/dashboards/student/hooks.jsx
// ThemeContext + useToast (+ small shared UI atoms: Card, Badge, StatCard
// used by every tab — kept here since no separate shared/ui.jsx was
// specified for the student dashboard)
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { createContext, useContext, useState, useCallback, useSyncExternalStore } from 'react';

// ============================================
// THEME CONTEXT
// ============================================
export const ThemeContext = createContext({ dark: false, toggleDark: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ============================================
// SHARED COMPONENTS (Theme-aware)
// ============================================
// Neutral card, the same surface the teacher dashboard uses (theme variables,
// so light and dark mode both follow the dashboard theme).
export const Card = ({ children, className = '', style = {} }) => (
  <div
    className={`rounded-xl ${className}`}
    style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', ...style }}
  >
    {children}
  </div>
);


export const Badge = ({ children, color, bg }) => (
  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
    style={{ backgroundColor: bg, color }}>
    {children}
  </span>
);


// Same structure and look as the teacher Overview's MetricCard: a small line
// icon and the title in the muted text color, a big number, a muted caption.
export const StatCard = ({ label, value, sub, icon: Icon }) => (
  <div className="w-full min-w-0 rounded-xl p-5"
    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
    <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
      {Icon && <Icon size={18} aria-hidden="true" />}{label}
    </p>
    <p className="mt-4 text-3xl font-bold leading-none" style={{ color: 'var(--text)' }}>{value}</p>
    {sub && <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
  </div>
);

// ============================================
// TOAST HELPER (new but minimal)
// ============================================

// ============================================
// TOAST HELPER
// ============================================
// The live regions are always in the page, so a screen reader announces a
// message when it appears: errors as an alert, everything else as a status.
const ToastRegions = ({ toast }) => {
  const message = toast && (
    <div className={`fixed bottom-4 right-4 max-md:left-4 max-md:bottom-auto max-md:top-[calc(env(safe-area-inset-top,0px)+12px)] max-md:pointer-events-none px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
      toast.type === 'error' ? 'bg-red-500' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-green-500'
    }`}>{toast.msg}</div>
  );
  return <>
    <div role="status" aria-live="polite">{toast?.type !== 'error' && message}</div>
    <div role="alert" aria-live="assertive">{toast?.type === 'error' && message}</div>
  </>;
};

const createToastStore = () => {
  let value = null;
  const listeners = new Set();
  return {
    get: () => value,
    set: (next) => { value = next; listeners.forEach(listener => listener()); },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
};

export const useToast = () => {
  const [store] = useState(createToastStore);
  const showToast = useCallback((msg, type = 'success') => {
    store.set({ msg, type });
    setTimeout(() => store.set(null), 3000);
  }, [store]);
  // One component for the life of the tab: its live regions are never
  // remounted, which would make a screen reader skip the message.
  const [Toast] = useState(() => function Toast() {
    return <ToastRegions toast={useSyncExternalStore(store.subscribe, store.get, store.get)} />;
  });
  return { showToast, Toast };
};

