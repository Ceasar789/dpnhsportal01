// ============================================
// FILE: src/pages/dashboards/admin/AdminContext.jsx
// Provides the shared useAdminLogic() state/handlers to every admin tab.
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React, { createContext, useContext } from 'react';
import { useAdminLogic } from './useAdminLogic';
import { useAcademicLogic } from './useAcademicLogic';

export const AdminContext = createContext(null);

export const useAdminContext = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdminContext must be used within an <AdminProvider>');
  }
  return ctx;
};

export const AdminProvider = ({ userData, children }) => {
  const adminLogic = useAdminLogic(userData);
  // Reuses the toast already owned by useAdminLogic so both halves of the
  // dashboard surface messages the same way.
  const academicLogic = useAcademicLogic(adminLogic.showToast);

  return (
    <AdminContext.Provider value={{ ...adminLogic, ...academicLogic }}>
      {children}
    </AdminContext.Provider>
  );
};
