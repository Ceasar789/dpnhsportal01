// ============================================
// FILE: src/components/clarity/student/OverviewTabSwitch.jsx
// The Overview route's switch. Flag off (the default): the classic
// OverviewTab, untouched. Flag on: the Clarity Overview (final design). Same data either way.
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';

const OverviewTabSwitch = ({ classic: ClassicOverviewTab }) => {
  const { enabled } = useClarityFlag();
  return enabled ? <ClarityStudentOverviewTab /> : <ClassicOverviewTab />;
};

export default OverviewTabSwitch;
