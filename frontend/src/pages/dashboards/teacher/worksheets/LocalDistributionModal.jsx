import { useRef, useState } from 'react';
import { Modal, Btn } from '../shared/ui';
import { currentSchoolYear } from '../../../../lib/academicRules';
import { localDistributionOptions, simulateLocalDistribution } from './localDistributionModel';

// Loaded only by the isolated profile-e2e development build. No Supabase
// client, real roster read, notification, or assignment writer is reachable.
export default function LocalDistributionModal({ draft, fixture, teacherId, previous, onConfirm, onClose }) {
  const [sectionId, setSectionId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const confirming = useRef(false);
  const year = currentSchoolYear();
  const options = localDistributionOptions(draft, fixture, teacherId, year);
  const selected = options.find(option => option.sectionId === sectionId);
  const duplicate = previous.some(row => row.worksheetId === draft.draftId && row.sectionId === sectionId);
  const totalPoints = draft.questions.reduce((sum, item) => sum + Number(item.points), 0);

  const confirm = () => {
    if (confirming.current) return;
    confirming.current = true;
    try {
      const current = localDistributionOptions(draft, fixture, teacherId, currentSchoolYear())
        .find(option => option.sectionId === sectionId);
      const result = simulateLocalDistribution(draft, current, dueDate, previous);
      onConfirm(result);
    } catch (cause) {
      setError(cause.message || 'The local simulation could not be completed.');
      setReviewing(false);
      confirming.current = false;
    }
  };

  return <Modal title="Simulate Worksheet Distribution" description="Development-only simulation using synthetic assignments and recipients. No students will receive this worksheet."
    onClose={onClose} escapeCloses size="max-w-xl">
    <div className="grid gap-4 text-sm" style={{ color: 'var(--text)' }}>
      <p role="status" className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card2)' }}>
        Local QA only. This worksheet is saved in memory and will be lost on refresh. No students will be notified.
      </p>
      <div aria-label="Worksheet details" className="grid gap-1 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
        <strong className="break-words">{draft.title}</strong>
        <span>Subject: {options[0]?.subjectName || draft.subjectName || 'Unknown'} · Grade: {draft.gradeLevel || 'Unknown'}</span>
        <span>Source: {draft.sourceType === 'manual' ? 'Manual ILAW' : 'AI Lesson Plan'} · {draft.questions.length} questions · {totalPoints} points</span>
        <span>Status: Saved Locally</span>
      </div>
      {options.length === 0 ? <p role="alert" style={{ color: 'var(--red)' }}>
        No compatible synthetic current-year teaching-load, schedule, and section could be verified. Simulation is unavailable.
      </p> : <>
        <label className="grid gap-1" htmlFor="local-distribution-section">
          <span className="font-semibold">Authorized synthetic class</span>
          <select id="local-distribution-section" value={sectionId} disabled={reviewing}
            onChange={event => { setSectionId(event.target.value); setError(''); }}
            className="min-h-11 w-full rounded-lg border px-3" style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <option value="">Choose a class</option>
            {options.map(option => <option key={option.sectionId} value={option.sectionId}>{option.sectionName}</option>)}
          </select>
        </label>
        {selected && <div className="grid gap-1 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
          <span>Academic year: {selected.schoolYear}</span>
          <span>Subject: {selected.subjectName} · Grade: {selected.gradeLevel}</span>
          <span>Section: {selected.sectionName}</span>
          <span>Eligible synthetic recipients: {selected.recipientIds.length}</span>
          <span>Excluded or invalid records: {selected.excludedCount}</span>
          {selected.recipientIds.length === 0 && <span role="alert">No eligible recipients in this synthetic class.</span>}
          {duplicate && <span role="status">Distribution was already simulated locally for this section.</span>}
        </div>}
        <label className="grid gap-1" htmlFor="local-distribution-due-date">
          <span className="font-semibold">Due date (optional, local only)</span>
          <input id="local-distribution-due-date" type="date" value={dueDate} disabled={reviewing}
            onChange={event => { setDueDate(event.target.value); setError(''); }}
            className="min-h-11 rounded-lg border px-3" style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }} />
        </label>
      </>}
      {reviewing && selected && <div aria-label="Final distribution review" className="grid gap-1 rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card2)' }}>
        <strong>Final local simulation review</strong>
        <span>{draft.title} · {selected.subjectName} · {selected.gradeLevel}</span>
        <span>{selected.schoolYear} · {selected.sectionName} · {selected.recipientIds.length} eligible recipients</span>
        <span>Due: {dueDate || 'No due date'}</span>
        <span>No real assignment, submission, score, or notification will be created.</span>
      </div>}
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn variant="outline" onClick={reviewing ? () => setReviewing(false) : onClose}>{reviewing ? 'Back' : 'Cancel'}</Btn>
        {reviewing ? <Btn onClick={confirm} disabled={!selected || duplicate || !selected.recipientIds.length}>Simulate Distribution</Btn>
          : <Btn onClick={() => {
            setError('');
            try { simulateLocalDistribution(draft, selected, dueDate, previous); setReviewing(true); }
            catch (cause) { setError(cause.message); }
          }} disabled={!selected || duplicate || !selected.recipientIds.length}>Review simulation</Btn>}
      </div>
    </div>
  </Modal>;
}
