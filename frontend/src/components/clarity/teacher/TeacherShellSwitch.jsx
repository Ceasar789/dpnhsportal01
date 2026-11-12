// ============================================
// FILE: src/components/clarity/teacher/TeacherShellSwitch.jsx
// The single switch point for the Teacher dashboard (the same pattern as
// StudentShellSwitch). Flag on (the default; ?clarity=1 also turns it on): the
// Clarity shell. Flag off (?clarity=0 or "Classic view", remembered as '0'):
// the classic layout, exactly as before. Both receive the same children (the
// shared <Routes> with the classic tabs).
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityTeacherLayout from './ClarityTeacherLayout';

const TeacherShellSwitch = ({ classic: ClassicLayout, children }) => {
  const { enabled, turnOff } = useClarityFlag();
  if (!enabled) return <ClassicLayout>{children}</ClassicLayout>;
  return <ClarityTeacherLayout onClassicView={turnOff}>{children}</ClarityTeacherLayout>;
};

export default TeacherShellSwitch;
