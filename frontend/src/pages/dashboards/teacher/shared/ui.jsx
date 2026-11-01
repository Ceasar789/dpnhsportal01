// ============================================
// FILE: src/pages/dashboards/teacher/shared/ui.jsx
// Card, Input, Table, TR, TD, Modal, StatCard, Badge, Btn
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useTheme } from '../hooks';
import { cycleTab, focusableWithin, inertOutside } from '../../../../lib/focusTrap';

const modalStack = [];

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

// `size` is a Tailwind max-w-* class. Defaults to the original max-w-md so
// every existing caller (short-content dialogs) keeps its current width.
// The panel itself caps at 85vh and scrolls its body — a wrapper this is
// `fixed inset-0 ... items-center` cannot otherwise scroll the page under
// it, so content taller than the viewport used to clip on both ends with no
// way to reach a footer button.
export const Modal = ({ title, onClose, children, size = 'max-w-md', dismissible = false, escapeCloses = false, description, closeDisabled = false }) => {
  const { dark } = useTheme();
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const returnToRef = useRef(typeof document === 'undefined' ? null : document.activeElement);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => inertOutside(overlayRef.current, { preserveLiveRegions: true }), []);

  useEffect(() => {
    const opener = returnToRef.current;
    const controls = focusableWithin(panelRef.current);
    const field = controls.find((element) => element.matches('input, select, textarea'));
    (field ?? controls[0] ?? panelRef.current)?.focus();
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const entry = {};
    modalStack.push(entry);
    const onKeyDown = (event) => {
      if (modalStack[modalStack.length - 1] !== entry) return;
      if (event.key === 'Escape') {
        if (dismissible || escapeCloses) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        return;
      }
      cycleTab(panelRef.current, event);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = modalStack.indexOf(entry);
      if (index !== -1) modalStack.splice(index, 1);
    };
  }, [dismissible, escapeCloses, onClose]);

  return (
    <div ref={overlayRef} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) event.currentTarget.dataset.fromBackdrop = '1'; }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget && event.currentTarget.dataset.fromBackdrop === '1') onClose();
        delete event.currentTarget.dataset.fromBackdrop;
      }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined} tabIndex={-1}
        className={`rounded-xl w-full ${size} shadow-2xl flex flex-col max-h-[85vh]`}
        style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
          <h2 id={titleId} className="text-lg font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{title}</h2>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label={`Close ${title}`}
            className="min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {description && <p id={descriptionId} className="sr-only">{description}</p>}
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ title, message, confirmLabel = 'Discard changes', onCancel, onConfirm }) => (
  <Modal title={title} description={message} onClose={onCancel} escapeCloses>
    <p className="text-sm mb-5" style={{ color: 'var(--text)' }}>{message}</p>
    <div className="flex flex-wrap justify-end gap-2">
      <Btn variant="outline" className="min-h-11" onClick={onCancel}>Cancel</Btn>
      <Btn variant="danger" className="min-h-11" onClick={onConfirm}>{confirmLabel}</Btn>
    </div>
  </Modal>
);

export const Toast = ({ toast, shadow = false }) => {
  const message = toast && (
    <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${shadow ? 'shadow-lg ' : ''}${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`} style={{ zIndex: 60 }}>
      {toast.msg}
    </div>
  );
  const regions = <>
    <div role="status" aria-live="polite" data-modal-live-region="true">{toast?.type !== 'error' && message}</div>
    <div role="alert" aria-live="assertive" data-modal-live-region="true">{toast?.type === 'error' && message}</div>
  </>;
  return typeof document === 'undefined' ? regions : createPortal(regions, document.body);
};

export const StatCard = ({ label, value, sub, subColor, icon: Icon, loading, color = '#1908DF', onClick }) => {
  const { dark } = useTheme();
  const cardBg = dark ? '#1e293b' : '#ffffff';
  const clickable = typeof onClick === 'function';

  const inner = (
    <>
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
    </>
  );

  const baseStyle = { border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` };

  // Matches the hover treatment Admin uses for its clickable stat cards.
  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl overflow-hidden flex flex-col h-[184px] w-full text-left p-0 clickable-stat"
        style={baseStyle}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden flex flex-col h-[184px]" style={baseStyle}>
      {inner}
    </div>
  );
};

export const Badge = ({ children, color, bg }) => (
  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: bg, color }}>
    {children}
  </span>
);

export const Btn = ({ children, onClick, className = '', variant = 'default', disabled, busy = false }) => {
  const inFlightRef = useRef(false);
  const handleClick = (event) => {
    if (busy || inFlightRef.current) return;
    const result = onClick?.(event);
    if (result && typeof result.then === 'function') {
      inFlightRef.current = true;
      Promise.resolve(result).then(
        () => { inFlightRef.current = false; },
        (error) => {
          inFlightRef.current = false;
          console.error('Teacher action failed:', error);
        },
      );
    }
  };
  const variants = {
    default: { backgroundColor: '#1908DF', color: '#ffffff' },
    outline: { backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' },
    primary: { backgroundColor: '#2563eb', color: '#ffffff' },
    danger: { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' },
    // Soft, header-matching tint — same family as the welcome banner, so it
    // reads as "branded" without being a loud solid block. Dark/light aware
    // via the shared banner CSS vars.
    pastel: {
      backgroundColor: 'var(--banner-pill-bg, rgba(25,8,223,.08))',
      color: 'var(--banner-accent, #1908DF)',
      border: '1px solid var(--banner-pill-border, rgba(25,8,223,.15))',
    },
  };
  return (
    <button type="button" onClick={handleClick} disabled={disabled} aria-busy={busy || undefined} aria-disabled={busy || undefined}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 ${className}`}
      style={{ ...variants[variant], opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
};

