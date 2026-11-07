// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../../lib/backendApi', () => ({ backendRequest: mock.request }));

import { ThemeContext } from '../hooks';
import GenerateDayTaskModal from './GenerateDayTaskModal';

const plan = { id: 'plan-1', title: 'Cells' };
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({ day, objective: `Describe ${day} cells` }));

const response = (extra = {}) => ({ status: 'generated-day-task', saved: false, taskType: 'quiz', day: 'Tuesday',
  sourceLessonPlan: plan, title: 'Cells quiz', instructions: 'Line one\nLine two', activity: null, providerCalls: 1,
  questions: [
    { localId: 'draft-1', question: 'Which controls the cell?', item_type: 'multiple_choice', options: ['Nucleus', 'Wall', 'Vacuole', 'Ribosome'], points: 1 },
    { localId: 'draft-2', question: 'Cells are alive.', item_type: 'true_false', options: [], points: 1 },
    { localId: 'draft-3', question: 'Name the powerhouse.', item_type: 'identification', options: [], points: 1 },
    { localId: 'draft-4', question: 'List two cell types.', item_type: 'enumeration', options: [], points: 2 },
  ],
  answerKey: [{ localId: 'draft-1', correct_answer: 'Nucleus' }, { localId: 'draft-2', correct_answer: 'True' },
    { localId: 'draft-3', correct_answer: 'mitochondrion' }, { localId: 'draft-4', correct_answer: 'plant, animal' }],
  ...extra });
const essayResponse = () => response({ taskType: 'assignment', answerKey: [], questions: [
  { localId: 'draft-1', question: 'Explain why cells divide.', item_type: 'essay', options: [], points: 5,
    essay: { referenceAnswer: 'To grow and repair.', minWords: 30, maxWords: 60,
      rubric: [{ criterion: 'Accuracy', points: 3 }, { criterion: 'Clarity', points: 2 }] } },
] });
const activityResponse = () => response({ taskType: 'activity', questions: [], answerKey: [], title: 'Cell map',
  instructions: 'Objective: Describe cells.', activity: { language: 'en', title: 'Cell map' } });

const click = name => fireEvent.click(screen.getByRole('button', { name }));
const open = (props = {}) => render(<ThemeContext.Provider value={{ dark: false }}>
  <GenerateDayTaskModal plan={plan} days={days} onClose={vi.fn()} {...props} />
</ThemeContext.Provider>);
const chooseTask = (type) => { click(/^Tuesday/); click(new RegExp(`^${type}`)); };
const generate = () => click('Generate');
const body = (index = 0) => JSON.parse(mock.request.mock.calls[index][1].body);
const setValue = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const abortableRequest = () => mock.request.mockImplementation((_path, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(Object.assign(new Error('The server response could not be received.'),
    { cause: new DOMException('Aborted', 'AbortError') })));
}));

beforeEach(() => { mock.request.mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('GenerateDayTaskModal flow', () => {
  it('shows the five days with objective snippets, then the task types, with no Exam', () => {
    open();
    for (const entry of days) {
      expect(screen.getByRole('button', { name: new RegExp(`^${entry.day}`) }).textContent).toContain(entry.objective);
    }
    click(/^Tuesday/);
    for (const type of [/^Activity/, /^Quiz/, /^Assignment/]) expect(screen.getByRole('button', { name: type })).toBeTruthy();
    expect(screen.queryByText(/exam/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /exam/i })).toBeNull();
  });

  it('days without an objective still render', () => {
    open({ days: [{ day: 'Monday' }] });
    expect(screen.getByRole('button', { name: 'Monday' })).toBeTruthy();
  });

  it('Generate is disabled until a task type is chosen', () => {
    open();
    click(/^Tuesday/);
    expect(screen.getByRole('button', { name: 'Generate' }).disabled).toBe(true);
    click(/^Activity/);
    expect(screen.getByRole('button', { name: 'Generate' }).disabled).toBe(false);
  });

  it('an activity sends no counts and previews its instructions', async () => {
    mock.request.mockResolvedValue(activityResponse());
    open();
    chooseTask('Activity');
    generate();
    await screen.findByText('Cell map');
    expect(mock.request.mock.calls[0][0]).toBe('/api/ai/day-tasks');
    expect(body()).toEqual({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'activity' });
    expect(screen.getByText('Objective: Describe cells.').className).toContain('whitespace-pre-wrap');
    expect(screen.getByText(/^Generated in \d+ s$/)).toBeTruthy();
  });

  it('a default quiz sends itemCount 10 and shows every item with its answer', async () => {
    mock.request.mockResolvedValue(response());
    open();
    chooseTask('Quiz');
    generate();
    await screen.findByText('Cells quiz');
    expect(body()).toEqual({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'quiz', itemCount: 10 });
    expect(screen.getByText('Nucleus (Correct answer)')).toBeTruthy();
    expect(screen.getByText('Wall')).toBeTruthy();
    expect(screen.getByText('True')).toBeTruthy();
    expect(screen.getByText('mitochondrion')).toBeTruthy();
    expect(screen.getByText('plant, animal')).toBeTruthy();
    for (const label of ['Multiple choice', 'True / False', 'Identification', 'Enumeration']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('2 pts')).toBeTruthy();
  });

  it('a chosen quiz count is sent as a number', async () => {
    mock.request.mockResolvedValue(response());
    open();
    chooseTask('Quiz');
    setValue(/Number of items/, '15');
    generate();
    await screen.findByText('Cells quiz');
    expect(body().itemCount).toBe(15);
  });

  it('customizing sends typeCounts without itemCount and shows a live total', async () => {
    mock.request.mockResolvedValue(response());
    open();
    chooseTask('Quiz');
    setValue(/Number of items/, '15');
    fireEvent.click(screen.getByLabelText('Customize by question type'));
    expect(screen.getByText('Total: 15')).toBeTruthy();
    expect(screen.getByLabelText('Multiple choice').value).toBe('8');
    setValue('Enumeration', '2');
    expect(screen.getByText('Total: 17')).toBeTruthy();
    generate();
    await screen.findByText('Cells quiz');
    expect(body()).toEqual({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'quiz',
      typeCounts: { multiple_choice: 8, true_false: 4, identification: 3, enumeration: 2 } });
  });

  it('Generate is disabled with inline validation for invalid values', () => {
    open();
    chooseTask('Quiz');
    const button = () => screen.getByRole('button', { name: 'Generate' });
    for (const value of ['9', '21', '10.5', '']) {
      setValue(/Number of items/, value);
      expect(button().disabled).toBe(true);
      expect(screen.getByText('A quiz needs 10 to 20 items.')).toBeTruthy();
      expect(screen.getByLabelText(/Number of items/).getAttribute('aria-invalid')).toBe('true');
    }
    setValue(/Number of items/, '20');
    expect(button().disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Customize by question type'));
    setValue('True / False', '');
    expect(button().disabled).toBe(true);
    setValue('True / False', '0');
    setValue('Multiple choice', '1');
    expect(screen.getByText('Total: 5')).toBeTruthy();
    expect(button().disabled).toBe(true);
    expect(screen.getByText('The total must be 10 to 20 items.')).toBeTruthy();
  });

  it('an assignment defaults to 3, enforces 1-5, and shows the essay key', async () => {
    mock.request.mockResolvedValue(essayResponse());
    open();
    chooseTask('Assignment');
    expect(screen.getByLabelText(/Number of items/).value).toBe('3');
    setValue(/Number of items/, '6');
    expect(screen.getByRole('button', { name: 'Generate' }).disabled).toBe(true);
    setValue(/Number of items/, '3');
    generate();
    await screen.findByText('To grow and repair.');
    expect(body()).toEqual({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'assignment', itemCount: 3 });
    expect(screen.getByText('30-60 words', { exact: false })).toBeTruthy();
    expect(screen.getByText('Accuracy (3 pts)')).toBeTruthy();
    expect(screen.getByText('Clarity (2 pts)')).toBeTruthy();
  });
});

describe('GenerateDayTaskModal generating', () => {
  it('prevents a double submit, disables close, and counts seconds', async () => {
    vi.useFakeTimers();
    abortableRequest();
    open();
    chooseTask('Activity');
    const button = screen.getByRole('button', { name: 'Generate' });
    // Batched so the second click lands before React removes the button.
    act(() => { button.click(); button.click(); });
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close Generate Day Task' }).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Activity for Tuesday');
    expect(screen.getByRole('timer').textContent).toBe('0 s');
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('timer').textContent).toBe('3 s');
  });

  it('Cancel aborts and returns to the options with no error', async () => {
    abortableRequest();
    open();
    chooseTask('Quiz');
    setValue(/Number of items/, '12');
    generate();
    const { signal } = mock.request.mock.calls[0][1];
    click('Cancel');
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy());
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText(/Number of items/).value).toBe('12');
    expect(screen.getByRole('button', { name: 'Close Generate Day Task' }).disabled).toBe(false);
  });

  it('an abort that did not come from Cancel still shows no error', async () => {
    mock.request.mockRejectedValue(Object.assign(new Error('The server response could not be received.'),
      { cause: new DOMException('Aborted', 'AbortError') }));
    open();
    chooseTask('Activity');
    generate();
    await screen.findByRole('button', { name: 'Generate' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a response arriving after Cancel is ignored', async () => {
    let resolve;
    mock.request.mockImplementation(() => new Promise((done) => { resolve = done; }));
    open();
    chooseTask('Quiz');
    generate();
    click('Cancel');
    await act(async () => { resolve(response()); });
    expect(screen.queryByText('Cells quiz')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
  });

  it('closing the dialog from outside aborts the request', () => {
    abortableRequest();
    const view = open();
    chooseTask('Activity');
    generate();
    const { signal } = mock.request.mock.calls[0][1];
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('shows a server error in an alert and keeps the options', async () => {
    mock.request.mockRejectedValue(new Error('This saved lesson plan is unavailable.'));
    open();
    chooseTask('Quiz');
    setValue(/Number of items/, '14');
    generate();
    expect((await screen.findByRole('alert')).textContent).toBe('This saved lesson plan is unavailable.');
    expect(screen.getByLabelText(/Number of items/).value).toBe('14');
    expect(screen.getByRole('button', { name: /^Quiz/ }).getAttribute('aria-pressed')).toBe('true');
    mock.request.mockResolvedValue(response());
    generate();
    await screen.findByText('Cells quiz');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(body(1).itemCount).toBe(14);
  });

  it('shows a session error as is', async () => {
    mock.request.mockRejectedValue(new Error('Your session is unavailable. Sign in again.'));
    open();
    chooseTask('Activity');
    generate();
    expect((await screen.findByRole('alert')).textContent).toBe('Your session is unavailable. Sign in again.');
  });

  it('an unexpected response is shown without its content', async () => {
    mock.request.mockResolvedValue(response({ status: 'RAW-RESPONSE-TEXT' }));
    open();
    chooseTask('Quiz');
    generate();
    expect((await screen.findByRole('alert')).textContent).toBe('The server returned an unexpected response. Nothing was saved.');
    expect(document.body.textContent).not.toContain('RAW-RESPONSE-TEXT');
  });
});

describe('GenerateDayTaskModal preview', () => {
  const toPreview = async (props) => {
    mock.request.mockResolvedValue(response());
    open(props);
    chooseTask('Quiz');
    setValue(/Number of items/, '11');
    generate();
    await screen.findByText('Cells quiz');
  };

  it('Regenerate calls again with the same options', async () => {
    await toPreview();
    mock.request.mockResolvedValue(response({ title: 'Second quiz' }));
    click('Regenerate');
    await screen.findByText('Second quiz');
    expect(mock.request).toHaveBeenCalledTimes(2);
    expect(body(1)).toEqual(body(0));
  });

  it('Back returns to the options without a new request', async () => {
    await toPreview();
    click('Back');
    expect(screen.getByLabelText(/Number of items/).value).toBe('11');
    expect(mock.request).toHaveBeenCalledTimes(1);
  });

  it('Use this draft passes the result and stored type', async () => {
    const onUseDraft = vi.fn();
    await toPreview({ onUseDraft });
    click('Use this draft');
    expect(onUseDraft).toHaveBeenCalledWith(response(), { day: 'Tuesday', taskType: 'quiz', storedTaskType: 'quiz' });
  });

  it('an activity draft is stored as a worksheet', async () => {
    const onUseDraft = vi.fn();
    mock.request.mockResolvedValue(activityResponse());
    open({ onUseDraft });
    chooseTask('Activity');
    generate();
    await screen.findByText('Cell map');
    click('Use this draft');
    expect(onUseDraft.mock.calls[0][1]).toEqual({ day: 'Tuesday', taskType: 'activity', storedTaskType: 'worksheet' });
  });

  it('hides Use this draft without a handler', async () => {
    await toPreview();
    expect(screen.queryByRole('button', { name: 'Use this draft' })).toBeNull();
  });

  it('renders AI markup as literal text everywhere', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    mock.request.mockResolvedValue(response({ title: `T ${attack}`, instructions: `I ${attack}`,
      questions: [
        { localId: 'draft-1', question: `Q ${attack}`, item_type: 'multiple_choice', options: [`O ${attack}`, 'B', 'C', 'D'], points: 1 },
        { localId: 'draft-2', question: 'Second', item_type: 'identification', options: [], points: 1 },
        { localId: 'draft-3', question: 'Third', item_type: 'essay', options: [], points: 5,
          essay: { referenceAnswer: `R ${attack}`, minWords: 1, maxWords: 2, rubric: [{ criterion: `C ${attack}`, points: 5 }] } },
      ],
      answerKey: [{ localId: 'draft-1', correct_answer: `O ${attack}` }, { localId: 'draft-2', correct_answer: `A ${attack}` }] }));
    open();
    chooseTask('Quiz');
    generate();
    await screen.findByText(`T ${attack}`);
    for (const value of [`I ${attack}`, `Q ${attack}`]) expect(screen.getByText(value)).toBeTruthy();
    for (const value of [`O ${attack}`, `A ${attack}`, `R ${attack}`, `C ${attack}`]) expect(document.body.textContent).toContain(value);
    expect(document.querySelector('img')).toBeNull();
  });

  it('moves focus to the step heading so it is not lost', async () => {
    await toPreview();
    expect(document.activeElement.textContent).toBe('Preview');
  });
});
