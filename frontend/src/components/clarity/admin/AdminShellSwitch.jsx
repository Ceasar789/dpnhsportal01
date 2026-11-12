// ============================================
// FILE: src/components/clarity/admin/AdminShellSwitch.jsx
// The Admin dashboard's one switch point, inside <AdminProvider>. Flag on
// (the default; ?clarity=1 also turns it on): the Clarity Admin shell. Flag
// off (?clarity=0 in the URL, remembered as '0'; no visible button): the classic
// AdminDashboardShell element, untouched. The Clarity shell is loaded on demand so its code (and the copy of
// the classic style text) is not in the main bundle.
// ============================================

import { lazy, Suspense } from 'react';
import { useClarityFlag } from '../useClarityFlag';

const ClarityAdminLayout = lazy(() => import('./ClarityAdminLayout'));

const AdminShellSwitch = ({ classic: ClassicShell, ...props }) => {
  const { enabled } = useClarityFlag();
  if (!enabled) return <ClassicShell {...props} />;
  return (
    <Suspense fallback={null}>
      <ClarityAdminLayout {...props} />
    </Suspense>
  );
};

export default AdminShellSwitch;
