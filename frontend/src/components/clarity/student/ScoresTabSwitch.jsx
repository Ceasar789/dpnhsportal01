// ============================================
// FILE: src/components/clarity/student/ScoresTabSwitch.jsx
// The /scores route's switch. Flag off (the default): the classic ScoresTab,
// untouched. Flag on: the Clarity Scores tab. Same data either way.
// ============================================

import { useClarityFlag } from '../useClarityFlag';
import ClarityScoresTab from './ClarityScoresTab';

const ScoresTabSwitch = ({ classic: ClassicScoresTab }) => {
  const { enabled } = useClarityFlag();
  return enabled ? <ClarityScoresTab /> : <ClassicScoresTab />;
};

export default ScoresTabSwitch;
