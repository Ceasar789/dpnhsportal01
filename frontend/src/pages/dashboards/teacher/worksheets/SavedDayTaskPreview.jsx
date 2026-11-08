import { useEffect, useState } from 'react';
import { Modal } from '../shared/ui';
import { savedWorksheetToDraft } from './savedWorksheetDraft';
import WorksheetDraftDocument from './WorksheetDraftDocument';

// An Activity is stored with task_type 'worksheet'.
const HEADINGS = { worksheet: 'ACTIVITY', quiz: 'QUIZ', assignment: 'ASSIGNMENT', exam: 'EXAM' };

// Unlike SavedWorksheetPreview, zero items is valid here: an Activity is a
// header and directions with no questions.
export default function SavedDayTaskPreview({ worksheet, loadItems, onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => loadItems(worksheet.id)).then((data) => {
      if (!active) return;
      setState(Array.isArray(data?.items)
        ? { status: 'ready', draft: savedWorksheetToDraft({ worksheet, items: data.items, keys: data.keys }) }
        : { status: 'failed' });
    }).catch(() => { if (active) setState({ status: 'failed' }); });
    return () => { active = false; };
  }, [worksheet, loadItems]);

  const documentProps = { variant: 'day-task', heading: HEADINGS[worksheet.task_type], structuredDirections: worksheet.task_type === 'worksheet' };

  return <Modal title={`Preview: ${worksheet.title}`} onClose={onClose} size="max-w-4xl" dismissible>
    {state.status === 'loading' && <p role="status">Loading this task...</p>}
    {state.status === 'failed' && <p role="alert">This task could not be loaded. Close this preview and try again.</p>}
    {state.status === 'ready' && <div className="space-y-4">
      <WorksheetDraftDocument draft={state.draft} audience="student" {...documentProps} />
      {state.draft.questions.length === 0 && worksheet.task_type !== 'worksheet'
        && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>No questions yet. Open Questions to add some.</p>}
      {state.draft.questions.length > 0 && <label className="flex items-center gap-2 min-h-11 text-sm" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />
        Show teacher answer key
      </label>}
      {showAnswerKey && <WorksheetDraftDocument draft={state.draft} audience="teacher" {...documentProps} />}
    </div>}
  </Modal>;
}
