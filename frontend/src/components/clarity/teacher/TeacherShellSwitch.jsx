// ============================================
// FILE: src/components/clarity/teacher/TeacherShellSwitch.jsx
// The single switch point for the Teacher dashboard (the same pattern as
// StudentShellSwitch). Flag off (the default): the classic layout, exactly as
// before. Flag on: the Clarity shell. Both receive the same children (the
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
