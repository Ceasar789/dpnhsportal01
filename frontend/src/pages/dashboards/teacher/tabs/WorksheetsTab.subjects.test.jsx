// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  loadItems: state.loadItems,
}) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: '' }) }));
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: ({ draft, manualEligibility, onDraftChange, onLocalSave, onDurableSave }) => <section aria-label="Mock full-page editor">
  <p>{draft.sourceType}</p><p>{draft.title || 'Blank title'}</p><p>{draft.questions.length} questions</p>
  <p>{manualEligibility?.loading ? 'Loading' : manualEligibility?.error ? 'Error' : `${manualEligibility?.subjects.length} eligible subjects`}</p>
  <button onClick={() => onDraftChange?.({ ...draft, title: 'Edited local day' })}>Mock edit day</button>
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
  state.loadItems = vi.fn(async () => ({ items: [], keys: {} }));
});
afterEach(cleanup);

describe('Saved day task preview', () => {
  const dayTask = { id: 'day-task', title: 'Cells - Tuesday Activity', subject: 'Science', grade_level: 'Grade 7',
    source_lesson_plan_id: 'plan-1', instructions: 'Objective: Describe cells.', items: 0 };
  const openPreview = async (row, label = 'Preview') => {
    worksheetRows.value = [row];
    render(<Harness />);
    await screen.findByText(row.title);
    fireEvent.click(screen.getByRole('button', { name: label }));
  };

  it('opens the worksheet template for a saved day task with no file', async () => {
    await openPreview(dayTask);
    expect(await screen.findByRole('article', { name: 'Student-facing worksheet' })).toBeTruthy();
    expect(state.loadItems).toHaveBeenCalledWith('day-task');
    expect(screen.queryByText('File Information')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close Preview: Cells - Tuesday Activity' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the old preview for a worksheet with a file, even if it has a lesson plan', async () => {
    await openPreview({ ...dayTask, file_url: 'https://synthetic.invalid/a.pdf' }, 'View');
    expect(screen.getByText('File Information')).toBeTruthy();
    expect(state.loadItems).not.toHaveBeenCalled();
    expect(screen.queryByRole('article', { name: 'Student-facing worksheet' })).toBeNull();
  });

  it('keeps the old preview for a worksheet with no lesson plan', async () => {
    await openPreview({ ...dayTask, source_lesson_plan_id: null });
    expect(screen.getByText('File Information')).toBeTruthy();
    expect(screen.getByText('No file attached')).toBeTruthy();
    expect(state.loadItems).not.toHaveBeenCalled();
  });

  it.each([[0], [null], ['']])('labels items %j with instructions as a text-only activity', async (items) => {
    worksheetRows.value = [{ ...dayTask, items }];
    render(<Harness />);
    expect(await screen.findByText('Science · — pages · Activity · text only')).toBeTruthy();
  });

  it('leaves every other card line unchanged', async () => {
    worksheetRows.value = [
      { ...dayTask, id: 'a', title: 'Quiz with items', items: 10 },
      { ...dayTask, id: 'b', title: 'Empty no instructions', items: 0, instructions: null, subject: 'Math' },
      { ...dayTask, id: 'c', title: 'Blank instructions', items: null, instructions: '   ', subject: 'English' },
      { id: 'd', title: 'Legacy', subject: 'Art', pages: '3', items: 5 },
    ];
    render(<Harness />);
    expect(await screen.findByText('Science · — pages · 10 items')).toBeTruthy();
    expect(screen.getByText('Math · — pages · — items')).toBeTruthy();
    expect(screen.getByText('English · — pages · — items')).toBeTruthy();
    expect(screen.getByText('Art · 3 pages · 5 items')).toBeTruthy();
    expect(screen.queryByText(/text only/)).toBeNull();
  });
});

describe('Worksheet manual authoring entry', () => {
  it('labels saved rows by origin and removes AI edit and individual delete actions', async () => {
    worksheetRows.value = [
      { id: 'ai-row', title: 'AI worksheet', origin: 'ai_generated', subject: 'English', items: 2 },
      { id: 'manual-row', title: 'Manual worksheet', subject: 'English', items: 2 },
    ];
    render(<Harness />);
    await waitFor(() => expect(screen.getByText('AI worksheet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'More actions for AI worksheet' }));
    const aiMenu = screen.getByRole('menu', { name: 'Actions for AI worksheet' });
    expect(within(aiMenu).queryByRole('menuitem', { name: /^Questions/ })).toBeNull();
    expect(within(aiMenu).queryByRole('menuitem', { name: /^Delete/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Mock full-page editor' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Manual worksheet' }));
    const manualMenu = screen.getByRole('menu', { name: 'Actions for Manual worksheet' });
    expect(within(manualMenu).getByRole('menuitem', { name: /^Questions/ })).toBeTruthy();
    expect(within(manualMenu).getByRole('menuitem', { name: /^Delete/ })).toBeTruthy();
  });

  it('keeps a failed weekly draft visible with safe markup guidance and retry', () => {
    const weeklyCollections = [{ kind: 'weekly-worksheet-collection', collectionId: 'week-1',
      title: 'Synthetic week', sourceLessonPlan: { title: 'Synthetic plan' },
      worksheets: [{ draftId: 'day-1', day: 'Monday', title: 'Monday', questions: [{}] }] }];
    const onRetryWeeklySave = vi.fn();
    render(<Harness weeklyCollections={weeklyCollections} onRetryWeeklySave={onRetryWeeklySave}
      weeklySaveStates={{ 'week-1': { status: 'failed', code: 'unsafe_markup',
        message: 'Remove < symbols or HTML tags from the worksheet text, for example write x < y with spaces.' } }} />);
    const card = screen.getByRole('region', { name: 'Weekly Worksheet Collection' });
    expect(within(card).getByRole('alert').textContent).toContain('Remove < symbols');
    expect(card.textContent).not.toContain('Saved permanently');
    expect(card.textContent).not.toContain('secret question');
    fireEvent.click(within(card).getByRole('button', { name: 'Retry Save' }));
    expect(onRetryWeeklySave).toHaveBeenCalledWith(weeklyCollections[0], true);
  });

  it.each(['idempotency_conflict', 'invalid_state'])('blocks retry in the UI for %s', code => {
    const weeklyCollections = [{ collectionId: 'week-1', title: 'Synthetic week',
      sourceLessonPlan: { title: 'Synthetic plan' }, worksheets: [] }];
    render(<Harness weeklyCollections={weeklyCollections}
      weeklySaveStates={{ 'week-1': { status: 'blocked', code, message: 'Review collection.' } }} />);
    const card = screen.getByRole('region', { name: 'Weekly Worksheet Collection' });
    expect(within(card).getByRole('alert').textContent).toContain('This collection needs review.');
    expect(within(card).queryByRole('button', { name: 'Retry Save' })).toBeNull();
  });
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

  it('opens distribution without writing from the tab', async () => {
    worksheetRows.value = [{ id: 'saved-1', title: 'Existing worksheet', subject: 'English', pages: 2, items: 5 }];
    render(<Harness />);
    await waitFor(() => expect(screen.getByText('Existing worksheet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Existing worksheet' }));
    fireEvent.click(screen.getByText('Distribute', { exact: true }));
    expect(screen.queryByText(/Distribution is unavailable until trusted authorization/)).toBeNull();
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
    expect(jobClient.listJobs).toHaveBeenCalledTimes(1);
    expect(jobClient.listCollections).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open weekly collection' }));
    await waitFor(() => expect(screen.getAllByRole('region', { name: /Worksheet$/ })).toHaveLength(5));
    fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
    expect(screen.getByRole('region', { name: 'Mock full-page editor' }).textContent).toContain('Monday cells');
    fireEvent.click(screen.getByRole('button', { name: 'Mock private save' }));
    await waitFor(() => expect(jobClient.updateDaily).toHaveBeenCalledWith('collection-1', 'day-0',
      expect.objectContaining({ id: 'day-0' }), 1));
    expect(writes).toEqual([]);
  });

  it('keeps a completed local draft editable without calling the new draft client as a legacy client', async () => {
    const jobClient = { enabled: true, submit: vi.fn(), status: vi.fn(), cancel: vi.fn(), result: vi.fn() };
    const onWeeklyCollectionChange = vi.fn();
    const onRetryWeeklySave = vi.fn();
    const weeklyCollections = [{ collectionId: 'synthetic-job', title: 'Synthetic weekly draft',
      sourceLessonPlan: { title: 'Synthetic plan' }, worksheets: [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
      ].map(day => ({ draftId: `draft-${day}`, day, title: `${day} draft`, saved: false,
        questions: [{ localId: `question-${day}`, question: `Synthetic ${day} question` }] })) }];
    const intervalSpy = vi.spyOn(window, 'setInterval');
    try {
      render(<Harness jobClient={jobClient} weeklyCollections={weeklyCollections}
        onWeeklyCollectionChange={onWeeklyCollectionChange} onRetryWeeklySave={onRetryWeeklySave} />);
      const collection = screen.getByRole('region', { name: 'Weekly Worksheet Collection' });
      expect(within(collection).getByText('Synthetic weekly draft')).toBeTruthy();
      fireEvent.click(within(collection).getByRole('button', { name: 'Open weekly collection' }));
      expect(within(collection).getAllByRole('region', { name: / Worksheet$/ })).toHaveLength(5);
      fireEvent.click(within(collection).getByRole('button', { name: 'Edit/Preview Monday' }));
      expect(screen.getByRole('region', { name: 'Mock full-page editor' }).textContent).toContain('Monday draft');
      fireEvent.click(screen.getByRole('button', { name: 'Mock edit day' }));
      expect(onWeeklyCollectionChange).toHaveBeenCalledWith('synthetic-job', expect.any(Function));
      expect(intervalSpy.mock.calls.some(([, delay]) => delay === 5000)).toBe(false);
      expect(screen.queryByText('Could not load private generation jobs. Check the backend.')).toBeNull();
      expect(screen.queryByRole('region', { name: 'Weekly generation jobs' })).toBeNull();
      expect(jobClient.submit).not.toHaveBeenCalled();
      expect(jobClient.status).not.toHaveBeenCalled();
      expect(jobClient.cancel).not.toHaveBeenCalled();
      expect(jobClient.result).not.toHaveBeenCalled();
      expect(onRetryWeeklySave).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    } finally {
      intervalSpy.mockRestore();
    }
  });
});
