// ============================================
// FILE: src/pages/dashboards/teacher/hooks.jsx
// ThemeContext + useToast
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { createContext, useContext, useState, useCallback } from 'react';

// ============================================
// THEME CONTEXT
// ============================================
export const ThemeContext = createContext({ dark: false, toggleDark: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ============================================
// TOAST HELPER
// ============================================
export const useToast = () => {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, showToast };
};

