// ============================================
// FILE: src/pages/about/useReveal.js
// Reveal-on-scroll as progressive enhancement. Nothing is hidden by default:
// the hook adds `reveal-on` to the page root only when IntersectionObserver
// exists and reduced motion is off, and the CSS hides [data-reveal] items
// only under that class. Each item gets `is-in` once it scrolls into view
// (once; it is then unobserved). Without JS, without an observer, or with
// reduced motion, everything simply stays visible.
// ============================================

import { useEffect } from 'react';

export const canReveal = (win = globalThis.window) => {
  if (!win || typeof win.IntersectionObserver !== 'function') return false;
  try { return !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
};

export default function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !canReveal()) return undefined;
    const items = [...root.querySelectorAll('[data-reveal]')];
    const observer = new window.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        entry.target.dispatchEvent(new CustomEvent('reveal'));
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    items.forEach(item => observer.observe(item));
    root.classList.add('reveal-on');
    return () => {
      observer.disconnect();
      root.classList.remove('reveal-on');
    };
  }, [rootRef]);
}
