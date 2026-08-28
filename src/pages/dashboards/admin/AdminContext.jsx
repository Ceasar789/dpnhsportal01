// ============================================
// FILE: src/pages/dashboards/admin/AdminContext.jsx
// Provides the shared useAdminLogic() state/handlers to every admin tab.
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React, { createContext, useContext } from 'react';
import { useAdminLogic } from './useAdminLogic';

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

  return (
    <AdminContext.Provider value={adminLogic}>
      {children}
    </AdminContext.Provider>
  );
};
