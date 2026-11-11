// ============================================
// FILE: src/components/clarity/student/OverviewTabSwitch.jsx
// The Overview route's switch. Flag off (the default): the classic
// OverviewTab, untouched. Flag on: the Clarity Overview. Same data either way.
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityOverviewTab from './ClarityOverviewTab';

const OverviewTabSwitch = ({ classic: ClassicOverviewTab }) => {
  const { enabled } = useClarityFlag();
  return enabled ? <ClarityOverviewTab /> : <ClassicOverviewTab />;
};

export default OverviewTabSwitch;
