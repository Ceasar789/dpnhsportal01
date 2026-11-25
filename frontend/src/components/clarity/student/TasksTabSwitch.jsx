// ============================================
// FILE: src/components/clarity/student/TasksTabSwitch.jsx
// U-PDF-S: the Tasks route's switch. Clarity on (the default): the same Tasks
// tab drawn as design p9 (pdf rows). Clarity off (?clarity=0): the classic
// rows, unchanged. Same data, reads, filters and handlers either way.
// ============================================

import { useClarityFlag } from '../useClarityFlag';

const TasksTabSwitch = ({ classic: ClassicTasksTab }) => {
  const { enabled } = useClarityFlag();
  return <ClassicTasksTab pdf={enabled} />;
};

export default TasksTabSwitch;
