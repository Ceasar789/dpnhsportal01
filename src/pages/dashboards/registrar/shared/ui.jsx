// ============================================
// FILE: src/pages/dashboards/registrar/shared/ui.jsx
// Card, Badge, Btn, SectionTitle, PageHeader, DonutChart, ThemeStyles
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React from 'react';

export const Card = ({ children, className = '', style = {} }) => (
  <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--reg-surface)', border: '1px solid var(--reg-border)', ...style }}>
    {children}
  </div>
);

export const Badge = ({ children, color, bg, style = {} }) => (
  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: bg, color, ...style }}>
    {children}
  </span>
);

export const Btn = ({ children, onClick, className = '', variant = 'default', style = {}, disabled }) => {
  const variants = {
    default: { backgroundColor: 'var(--reg-navy)', color: '#ffffff' },
    outline: { backgroundColor: 'transparent', color: 'var(--reg-muted)', border: '1px solid var(--reg-border)' },
    gold:    { backgroundColor: 'var(--reg-gold)', color: 'var(--reg-navy)' },
    danger:  { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 ${className}`}
      style={{ ...variants[variant], ...style, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </button>
  );
};

export const SectionTitle = ({ children }) => (
  <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--reg-muted)' }}>
    {children}
  </h2>
);

export const PageHeader = ({ title, subtitle }) => (
  <div className="mb-6">
    <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--reg-text)' }}>{title}</h1>
    <p className="text-sm" style={{ color: 'var(--reg-muted)' }}>{subtitle}</p>
  </div>
);

export const DonutChart = ({ slices, total }) => {
  const cx = 80, cy = 80, r = 58, sw = 22;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      {slices.map((s, i) => {
        const dash = (s.pct / 100) * circ;
        const gap = circ - dash;
        const rotate = (cumulative / 100) * 360 - 90;
        cumulative += s.pct;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${dash} ${gap}`}
            style={{ transform: `rotate(${rotate}deg)`, transformOrigin: `${cx}px ${cy}px` }} />
        );
      })}
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={19} fontWeight={700} fill="var(--reg-text)">{total.toLocaleString()}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize={11} fill="var(--reg-muted)">students</text>
    </svg>
  );
};

export const ThemeStyles = () => (
  <style>{`
    :root {
      --reg-bg: #f8fafc;
      --reg-surface: #ffffff;
      --reg-surface-hover: #f1f5f9;
      --reg-border: #e2e8f0;
      --reg-text: #1a2b4a;
      --reg-text-secondary: #334155;
      --reg-muted: #64748b;
      --reg-muted-light: #94a3b8;
      --reg-sidebar-bg: #ffffff;
      --reg-sidebar-text: #475569;
      --reg-sidebar-active-bg: #eef0f5;
      --reg-sidebar-active-text: #1908DF;
      --reg-header-bg: #ffffff;
      --reg-input-bg: #f8fafc;
      --reg-navy: #1908DF;
      --reg-gold: #FFC542;
      --reg-green: #16A34A;
      --reg-amber: #D97706;
      --reg-red: #DC2626;
      --reg-blue: #2563EB;
      --reg-purple: #7C3AED;
    }
    .dark {
      --reg-bg: #0f172a;
      --reg-surface: #1e293b;
      --reg-surface-hover: #0f172a;
      --reg-border: #334155;
      --reg-text: #f1f5f9;
      --reg-text-secondary: #cbd5e1;
      --reg-muted: #94a3b8;
      --reg-muted-light: #64748b;
      --reg-sidebar-bg: #1e293b;
      --reg-sidebar-text: #94a3b8;
      --reg-sidebar-active-bg: rgba(25,8,223,0.22);
      --reg-sidebar-active-text: #c7c2ff;
      --reg-header-bg: #1e293b;
      --reg-input-bg: #0f172a;
      --reg-navy: #1908DF;
    }
  `}</style>
);

