import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, Printer } from 'lucide-react';

// U-PDF-T: one "Download" button with a short menu of exports (design p16, p18).
// Each item runs an export that already exists; this only groups them.
// Keyboard: Enter/Space or ArrowDown opens it, arrows move, Escape closes and
// returns focus, Tab leaves. `items`: [{ key, label, hint, icon: 'print' | 'file', run, disabled }].
export default function DownloadMenu({ items, label = 'Download', busy = false, align = 'right', name }) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = event => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const focusItem = index => menuRef.current?.querySelectorAll('[role="menuitem"]')[index]?.focus();
  const close = (restore = false) => { setOpen(false); if (restore) triggerRef.current?.focus(); };
  const show = () => {
    const rect = triggerRef.current.getBoundingClientRect();
    setAbove(window.innerHeight - rect.bottom < items.length * 56 + 16 && rect.top > items.length * 56 + 16);
    setOpen(true);
  };

  return (
    <div className="relative shrink-0">
      <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} disabled={busy}
        aria-label={name ? `${label} ${name}` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
            requestAnimationFrame(() => focusItem(event.key === 'ArrowDown' ? 0 : items.length - 1));
          }
        }}
        className="min-h-11 px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        style={{ color: 'var(--text)', border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
        <Download size={15} aria-hidden="true" />{label}<ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && <div ref={menuRef} role="menu" aria-label={name ? `${label} ${name}` : label}
        onKeyDown={event => {
          const list = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
          const index = list.indexOf(document.activeElement);
          if (event.key === 'Escape') { event.preventDefault(); close(true); }
          else if (event.key === 'Tab') close();
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
            list[next]?.focus();
          }
        }}
        className={`absolute z-40 min-w-56 max-w-[calc(100vw-2rem)] rounded-lg p-1 shadow-lg ${align === 'left' ? 'left-0' : 'right-0'} ${above ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        {items.map(item => {
          const Icon = item.icon === 'print' ? Printer : FileText;
          return <button key={item.key} type="button" role="menuitem" disabled={busy || Boolean(item.disabled)}
            onClick={() => { close(true); item.run(); }}
            className="w-full min-h-11 text-left px-3 py-2 rounded-md text-sm flex items-start gap-2 disabled:opacity-50"
            style={{ color: 'var(--text)' }}>
            <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0"><span className="block font-semibold">{item.label}</span>
              {item.hint && <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{item.hint}</span>}</span>
          </button>;
        })}
      </div>}
    </div>
  );
}
