import QuickCreateForm from './QuickCreateForm';
import useQuickCreateAssignments from './useQuickCreateAssignments';

export default function QuickCreateAssignmentPanel({ teacherId, schoolYear, draftValue, onDraftChange, onTemporaryCreate }) {
  const assignments = useQuickCreateAssignments(teacherId, schoolYear);
  return <QuickCreateForm
    teacherId={teacherId}
    schoolYear={schoolYear}
    assignmentRows={assignments.assignmentRows}
    sourceTeacherId={assignments.sourceTeacherId}
    sourceSchoolYear={assignments.sourceSchoolYear}
    loadState={assignments.loadState}
    onRetry={assignments.retry}
    draftValue={draftValue}
    onDraftChange={onDraftChange}
    onTemporaryCreate={onTemporaryCreate}
  />;
}
