// ============================================
// FILE: src/components/clarity/student/StudentShellSwitch.jsx
// The single switch point for the Student dashboard. Flag on (the default;
// ?clarity=1 also turns it on): the Clarity shell. Flag off (?clarity=0 or
// remembered as '0'; no visible button): the classic layout, exactly as before. Both
// receive the same children (the shared <Routes> with the classic tabs).
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityStudentLayout from './ClarityStudentLayout';

const StudentShellSwitch = ({ classic: ClassicLayout, children }) => {
  const { enabled } = useClarityFlag();
  if (!enabled) return <ClassicLayout>{children}</ClassicLayout>;
  return <ClarityStudentLayout>{children}</ClarityStudentLayout>;
};

export default StudentShellSwitch;
