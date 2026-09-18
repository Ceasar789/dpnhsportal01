// ============================================
// FILE: src/pages/dashboards/registrar/shared/ui.jsx
// Card, Badge, Btn, SectionTitle, PageHeader, DonutChart, ThemeStyles
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React from 'react';
import { DashboardThemeStyles } from '../../../../styles/dashboardTheme';

export const Card = ({ children, className = '', style = {} }) => (
  <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', ...style }}>
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
    default: { backgroundColor: 'var(--accent)', color: '#ffffff' },
    outline: { backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' },
    gold:    { backgroundColor: 'var(--reg-gold)', color: 'var(--accent)' },
    danger:  { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 ${className}`}
      style={{ ...variants[variant], ...style, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {children}
    </button>
  );
};

// Matches the Admin dashboard's .chart-title treatment (title case, full-
// strength text color) rather than a muted uppercase label, so a card
// heading reads the same whichever dashboard it's on.
export const SectionTitle = ({ children }) => (
  <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>
    {children}
  </h2>
);

// `plain` skips the pastel bar for the two tabs (Dashboard, Overview) that
// already sit directly beneath the big "Welcome to EduScribe" banner — a
// second pastel box right under the first would just look doubled up.
export const PageHeader = ({ title, subtitle, plain = false }) => (
  plain ? (
    <div className="mb-6">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
    </div>
  ) : (
    <div className="mb-6 rounded-lg px-5 py-4" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--banner-text)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--banner-subtext)' }}>{subtitle}</p>
    </div>
  )
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
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize={19} fontWeight={700} fill="var(--text)">{total.toLocaleString()}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize={11} fill="var(--text-muted)">students</text>
    </svg>
  );
};

// Aliases every legacy --reg-* variable to the shared Admin-derived theme
// variables so existing tab files (not yet migrated) keep rendering
// correctly, while the sidebar/header now consume the shared vars directly.
export const ThemeStyles = () => (
  <>
    <DashboardThemeStyles />
    <style>{`
      :root, :root.light {
        --reg-bg: var(--bg);
        --reg-surface: var(--card-bg);
        --reg-surface-hover: var(--card2);
        --reg-border: var(--border);
        --reg-text: var(--text);
        --reg-text-secondary: var(--text);
        --reg-muted: var(--text-muted);
        --reg-muted-light: var(--text-dim);
        --reg-sidebar-bg: var(--sidebar-bg);
        --reg-sidebar-text: var(--text-muted);
        --reg-sidebar-active-bg: #eef0f5;
        --reg-sidebar-active-text: var(--accent);
        --reg-header-bg: var(--card-bg);
        --reg-input-bg: var(--bg);
        --reg-navy: var(--accent);
        --reg-gold: #FFC542;
        --reg-green: var(--green);
        --reg-amber: var(--yellow);
        --reg-red: var(--red);
        --reg-blue: #2563EB;
        --reg-purple: var(--purple);
      }
    `}</style>
  </>
);

