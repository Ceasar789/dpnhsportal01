// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import WorksheetsTab from './WorksheetsTab';

const { state, writes, userData, worksheetRows } = vi.hoisted(() => ({
  state: { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false },
  writes: [], userData: { uid: 'teacher-1' }, worksheetRows: { value: [] },
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      insert: () => { writes.push(`INSERT ${table}`); throw new Error('Unexpected worksheet write'); },
      update: () => { writes.push(`UPDATE ${table}`); throw new Error('Unexpected worksheet write'); },
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? worksheetRows.value : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  ...state, assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false,
  postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
}) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: '' }) }));
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: ({ draft, manualEligibility, onLocalSave, onDurableSave }) => <section aria-label="Mock full-page editor">
  <p>{draft.sourceType}</p><p>{draft.title || 'Blank title'}</p><p>{draft.questions.length} questions</p>
  <p>{manualEligibility?.loading ? 'Loading' : manualEligibility?.error ? 'Error' : `${manualEligibility?.subjects.length} eligible subjects`}</p>
  <button onClick={() => onDurableSave ? onDurableSave(draft) : onLocalSave({ ...draft, saved: true, status: 'local-saved' })}>
    {onDurableSave ? 'Mock private save' : 'Mock local save'}</button>
</section> }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

function Harness(props) {
  const [manualDrafts, setManualDrafts] = useState([]);
  return <WorksheetsTab {...props} manualDrafts={manualDrafts}
    onCreateManualDraft={draft => setManualDrafts(current => [...current, draft])}
    onManualDraftChange={draft => setManualDrafts(current => current.map(item => item.draftId === draft.draftId ? draft : item))}
    onDiscardManualDraft={draftId => setManualDrafts(current => current.filter(item => item.draftId !== draftId))} />;
}
beforeEach(() => {
  state.mySubjects = [];
  state.subjectLoading = false;
  state.subjectError = false;
  state.schoolYear = '2030-2031';
  worksheetRows.value = [];
  writes.length = 0;
});
afterEach(cleanup);

describe('Worksheet manual authoring entry', () => {
  it('opens a blank local editor without creating a metadata row', () => {
    state.mySubjects = [{ id: 'math', name: 'Mathematics', grades: ['Grade 7'] }];
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    expect(screen.getByRole('region', { name: 'Mock full-page editor' }).textContent).toContain('manual-authored');
    expect(screen.getByText('Blank title')).toBeTruthy();
    expect(screen.getByText('0 questions')).toBeTruthy();
    expect(screen.getByText('1 eligible subjects')).toBeTruthy();
    expect(writes).toEqual([]);
  });
  it.each([
    ['zero assignments', [], false, false, '0 eligible subjects'],
    ['failed read', [], false, true, 'Error'],
    ['loading', [], true, false, 'Loading'],
  ])('passes %s to the editor without a fallback or write', (_label, subjects, loading, error, message) => {
    Object.assign(state, { mySubjects: subjects, subjectLoading: loading, subjectError: error });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(writes).toEqual([]);
  });
  it('keeps existing saved records and gives the manual draft one local card', async () => {
    worksheetRows.value = [{ id: 'saved-1', title: 'Existing worksheet', subject: 'English', pages: 2, items: 5 }];
    render(<Harness />);
    await waitFor(() => expect(screen.getByText('Existing worksheet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock local save' }));
    expect(screen.getAllByRole('region', { name: 'Manual Worksheet draft entry' })).toHaveLength(1);
    expect(screen.getByText('Existing worksheet')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('blocks legacy distribution before opening a roster or writing', async () => {
    worksheetRows.value = [{ id: 'saved-1', title: 'Existing worksheet', subject: 'English', pages: 2, items: 5 }];
    render(<Harness />);
    await waitFor(() => expect(screen.getByText('Existing worksheet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing worksheet' }));
    fireEvent.click(screen.getByText('Distribute', { exact: true }));
    expect(screen.getByText(/Distribution is unavailable until trusted authorization/)).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('lists an owned durable job and opens five independent saved days through the gated client', async () => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const worksheets = weekdays.map((day, index) => ({ id: `day-${index}`, day,
      title: `${day} cells`, status: 'Draft', revision: 1, collectionId: 'collection-1',
      sourceLessonPlan: { id: 'plan-1', title: 'Cells' }, checkingMode: 'manual',
      instructions: 'Answer all questions.', sections: [{ id: `group-${index}`, title: 'Questions', directions: '' }],
      questions: [{ localId: `question-${index}`, sectionId: `group-${index}`, question: 'Name a cell part',
        item_type: 'true_false', options: [], points: 1 }],
      answerKey: [{ localId: `question-${index}`, correct_answer: 'True' }] }));
    const jobClient = { enabled: true,
      listJobs: vi.fn(async () => [{ id: 'job-1', status: 'COMPLETED', saved: true,
        completedValidatedBatches: 10, plannedProviderCalls: 10, attemptedProviderCalls: 10 }]),
      listCollections: vi.fn(async () => [{ id: 'collection-1', revision: 1, status: 'Draft', durable: true }]),
      openCollection: vi.fn(async () => ({ id: 'collection-1', worksheets })),
      updateDaily: vi.fn(async (_id, _dayId, worksheet) => ({ durable: true, worksheet: { ...worksheet, revision: 2 } })),
    };
    render(<Harness jobClient={jobClient} />);
    expect(await screen.findAllByText('Saved private collection')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open weekly collection' }));
    await waitFor(() => expect(screen.getAllByRole('region', { name: /Worksheet$/ })).toHaveLength(5));
    fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
    expect(screen.getByRole('region', { name: 'Mock full-page editor' }).textContent).toContain('Monday cells');
    fireEvent.click(screen.getByRole('button', { name: 'Mock private save' }));
    await waitFor(() => expect(jobClient.updateDaily).toHaveBeenCalledWith('collection-1', 'day-0',
      expect.objectContaining({ id: 'day-0' }), 1));
    expect(writes).toEqual([]);
  });
});
