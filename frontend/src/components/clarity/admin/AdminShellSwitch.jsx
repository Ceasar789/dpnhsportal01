// ============================================
// FILE: src/components/clarity/admin/AdminShellSwitch.jsx
// The Admin dashboard's one switch point, inside <AdminProvider>. Flag off
// (the default): the classic AdminDashboardShell element, untouched. Flag
// on: the Clarity Admin shell, loaded on demand so its code (and the copy of
// the classic style text) is not in the main bundle.
// ============================================

import { lazy, Suspense } from 'react';
import { useClarityFlag } from '../useClarityFlag';

const ClarityAdminLayout = lazy(() => import('./ClarityAdminLayout'));

const AdminShellSwitch = ({ classic: ClassicShell, ...props }) => {
  const { enabled, turnOff } = useClarityFlag();
  if (!enabled) return <ClassicShell {...props} />;
  return (
    <Suspense fallback={null}>
      <ClarityAdminLayout {...props} onClassicView={turnOff} />
    </Suspense>
  );
};

export default AdminShellSwitch;
