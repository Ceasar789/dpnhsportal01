// ============================================
// FILE: src/components/clarity/student/ScoresTabSwitch.jsx
// The /scores route's switch. Flag on (the default; ?clarity=1 also turns it
// on): the Clarity Scores tab. Flag off (?clarity=0 or "Classic view",
// remembered as '0'): the classic ScoresTab, untouched. Same data either way.
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityScoresTab from './ClarityScoresTab';

const ScoresTabSwitch = ({ classic: ClassicScoresTab }) => {
  const { enabled } = useClarityFlag();
  return enabled ? <ClarityScoresTab /> : <ClassicScoresTab />;
};

export default ScoresTabSwitch;
