// ============================================
// FILE: src/components/clarity/student/OverviewTabSwitch.jsx
// The Overview route's switch. Flag on (the default; ?clarity=1 also turns it
// on): the Clarity Overview (final design). Flag off (?clarity=0 or "Classic
// view", remembered as '0'): the classic OverviewTab, untouched. Same data either way.
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';

const OverviewTabSwitch = ({ classic: ClassicOverviewTab }) => {
  const { enabled } = useClarityFlag();
  return enabled ? <ClarityStudentOverviewTab /> : <ClassicOverviewTab />;
};

export default OverviewTabSwitch;
