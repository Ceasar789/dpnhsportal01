// ============================================
// FILE: src/components/clarity/useHtmlClass.js
// Puts a class on <html> while the calling component is mounted and takes it
// off when it unmounts, the same way useDashboardTheme manages .dark
// (styles/dashboardTheme.jsx). Only the Clarity shells call it, and only
// when the Clarity flag is on, so public and login pages never keep it.
// ============================================

import { useLayoutEffect } from 'react';

export function useHtmlClass(className) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add(className);
    return () => root.classList.remove(className);
  }, [className]);
}
