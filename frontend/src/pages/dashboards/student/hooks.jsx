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
export const Card = ({ children, className = '', style = {} }) => {
  const { dark } = useTheme();
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        backgroundColor: dark ? '#1e293b' : '#ffffff',
        border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
        ...style
      }}
    >
      {children}
    </div>
  );
};


export const Badge = ({ children, color, bg }) => (
  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
    style={{ backgroundColor: bg, color }}>
    {children}
  </span>
);


export const StatCard = ({ label, value, sub, subColor, icon: Icon, color = '#1908DF' }) => {
  const { dark } = useTheme();
  const cardBg = dark ? '#1e293b' : '#ffffff';
  return (
    <div className="rounded-xl overflow-hidden flex flex-col h-[184px]"
      style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
      <div className="h-1/2 flex-shrink-0 flex items-center justify-center"
        style={{ background: `linear-gradient(180deg, ${color} 0%, ${color} 55%, ${cardBg} 100%)` }}>
        {Icon && <Icon size={38} color="#ffffff" strokeWidth={2.1} />}
      </div>
      <div className="flex-1 flex flex-col justify-center px-4 py-2" style={{ backgroundColor: cardBg }}>
        <p className="text-2xl font-bold leading-tight" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{value}</p>
        <p className="text-xs font-bold mt-1" style={{ color: dark ? '#e2e8f0' : '#1a2b4a' }}>{label}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: subColor || (dark ? '#64748b' : '#94a3b8') }}>{sub}</p>}
      </div>
    </div>
  );
};

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
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
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

// ============================================
// STUDENT OVERVIEW TAB — Supabase + Real-time
// ORIGINAL DESIGN PRESERVED — data now from Supabase
// ============================================

