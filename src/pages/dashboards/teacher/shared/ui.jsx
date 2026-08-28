// ============================================
// FILE: src/pages/dashboards/teacher/shared/ui.jsx
// Card, Input, Table, TR, TD, Modal, StatCard, Badge, Btn
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React from 'react';
import { Loader2, X } from 'lucide-react';
import { useTheme } from '../hooks';

export const Card = ({ children, className = '', style = {} }) => {
  const { dark } = useTheme();
  return (
    <div className={`rounded-xl ${className}`}
      style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, ...style }}>
      {children}
    </div>
  );
};

export const Input = ({ className = '', ...props }) => {
  const { dark } = useTheme();
  return (
    <input className={`w-full h-10 px-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
      {...props}
    />
  );
};

export const Table = ({ headers, children }) => {
  const { dark } = useTheme();
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
            {headers.map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold tracking-wider uppercase"
                style={{ color: dark ? '#64748b' : '#94a3b8' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
          {children}
        </tbody>
      </table>
    </div>
  );
};

export const TR = ({ children }) => {
  const { dark } = useTheme();
  return (
    <tr className="transition-colors" style={{ borderBottom: `1px solid ${dark ? '#334155' : '#f1f5f9'}` }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = dark ? '#0f172a' : '#f8fafc'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
      {children}
    </tr>
  );
};

export const TD = ({ children, className = '' }) => {
  const { dark } = useTheme();
  return (
    <td className={`px-5 py-3.5 text-sm ${className}`} style={{ color: dark ? '#cbd5e1' : '#475569' }}>
      {children}
    </td>
  );
};

export const Modal = ({ title, onClose, children }) => {
  const { dark } = useTheme();
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="rounded-xl w-full max-w-md shadow-2xl"
        style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
          <h2 className="text-lg font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

export const StatCard = ({ label, value, sub, subColor, icon: Icon, loading, color = '#1908DF' }) => {
  const { dark } = useTheme();
  const cardBg = dark ? '#1e293b' : '#ffffff';
  return (
    <div className="rounded-xl overflow-hidden flex flex-col h-[184px]"
      style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
      <div className="h-1/2 flex-shrink-0 flex items-center justify-center relative"
        style={{ background: `linear-gradient(180deg, ${color} 0%, ${color} 55%, ${cardBg} 100%)` }}>
        {loading ? (
          <Loader2 size={26} className="animate-spin text-white" />
        ) : (
          Icon && <Icon size={38} color="#ffffff" strokeWidth={2.1} />
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center px-4 py-2" style={{ backgroundColor: cardBg }}>
        <p className="text-2xl font-bold leading-tight" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{loading ? '—' : value}</p>
        <p className="text-xs font-bold mt-1" style={{ color: dark ? '#e2e8f0' : '#1a2b4a' }}>{label}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: subColor || (dark ? '#64748b' : '#94a3b8') }}>{sub}</p>}
      </div>
    </div>
  );
};

export const Badge = ({ children, color, bg }) => (
  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: bg, color }}>
    {children}
  </span>
);

export const Btn = ({ children, onClick, className = '', variant = 'default', disabled }) => {
  const variants = {
    default: { backgroundColor: '#1908DF', color: '#ffffff' },
    outline: { backgroundColor: 'transparent', color: '#64748b', border: '1px solid #e2e8f0' },
    primary: { backgroundColor: '#2563eb', color: '#ffffff' },
    danger: { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 ${className}`}
      style={{ ...variants[variant], opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
};

