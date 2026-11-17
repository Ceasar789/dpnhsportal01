// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

// U5: Create Worksheet is never disabled. Pressing it on an incomplete form
// lists the problems and moves focus to the control the teacher has to use;
// for the subject that is the grade picker when the subject picker is hidden.
const openCreate = () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
  return screen.getByRole('dialog', { name: 'Create Worksheet' });
};
const fill = dialog => {
  fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Fractions drill' } });
  fireEvent.change(within(dialog).getByLabelText('Directions'), { target: { value: 'Answer every item.' } });
};
const press = async dialog => { await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Create' })); }); };
const SUBJECT = 'Choose the subject and grade from your teaching load.';

describe('U5 Create Worksheet: where the subject problem points', () => {
  it('one subject (picker hidden) with two grades: the problem points to the grade picker', async () => {
    state.mySubjects = [{ id: 'math', name: 'Mathematics', grades: ['Grade 7', 'Grade 8'] }];
    const dialog = openCreate();
    expect(within(dialog).queryByLabelText('Teaching-load subject')).toBeNull();
    fill(dialog);
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create.disabled).toBe(false);
    await press(dialog);
    const link = within(dialog).getByRole('link', { name: SUBJECT });
    expect(link.getAttribute('href')).toBe('#create-task-grade');
    const grade = within(dialog).getByLabelText('Assigned grade level');
    expect(document.activeElement).toBe(grade);
    expect(grade.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(grade.getAttribute('aria-describedby')).textContent).toBe(SUBJECT);
    expect(writes).toEqual([]);
  });

  it('two subjects, none chosen: the problem points to the subject picker; choosing both clears it', async () => {
    state.mySubjects = [
      { id: 'math', name: 'Mathematics', grades: ['Grade 7'] },
      { id: 'sci', name: 'Science', grades: ['Grade 7', 'Grade 8'] },
    ];
    const dialog = openCreate();
    fill(dialog);
    await press(dialog);
    expect(within(dialog).getByRole('link', { name: SUBJECT }).getAttribute('href')).toBe('#create-task-subject');
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Teaching-load subject'));
    fireEvent.change(within(dialog).getByLabelText('Teaching-load subject'), { target: { value: 'sci' } });
    expect(within(dialog).getByRole('link', { name: SUBJECT }).getAttribute('href')).toBe('#create-task-grade');
    fireEvent.change(within(dialog).getByLabelText('Assigned grade level'), { target: { value: 'Grade 8' } });
    expect(within(dialog).queryByRole('link', { name: SUBJECT })).toBeNull();
    expect(within(dialog).getByLabelText('Assigned grade level').getAttribute('aria-invalid')).toBeNull();
    expect(within(dialog).getByLabelText('Teaching-load subject').getAttribute('aria-invalid')).toBeNull();
    expect(writes).toEqual([]);
  });

  it.each([
    ['still loading', { subjectLoading: true }],
    ['a failed read', { subjectError: true }],
    ['no teaching load', {}],
  ])('%s: the problem points to the teaching-load area, which exists and takes focus', async (_name, over) => {
    Object.assign(state, over);
    const dialog = openCreate();
    fill(dialog);
    await press(dialog);
    expect(within(dialog).getByRole('link', { name: SUBJECT }).getAttribute('href')).toBe('#create-task-subject-area');
    expect(document.activeElement).toBe(dialog.querySelector('#create-task-subject-area'));
    expect(writes).toEqual([]);
  });

  it('a missing title is listed first and focused first', async () => {
    state.mySubjects = [{ id: 'math', name: 'Mathematics', grades: ['Grade 7'] }];
    const dialog = openCreate();
    await press(dialog);
    const items = within(dialog.querySelector('.fk-summary')).getAllByRole('link').map(a => a.textContent);
    expect(items).toEqual(['Enter a title.', 'Add the directions students will read.']);
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Title'));
    expect(within(dialog).getByLabelText('Title').getAttribute('aria-invalid')).toBe('true');
  });
});
