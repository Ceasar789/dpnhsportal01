// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../../lib/backendApi', () => ({ backendRequest: mock.request }));

import { ThemeContext } from '../hooks';
import { ilawBrandAssets } from '../ilaw/ilawBrandAssets';
import SavedDayTaskPreview from '../worksheets/SavedDayTaskPreview';
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
const answerKeyBox = () => screen.getByRole('checkbox', { name: 'Show teacher answer key' });
const dialogClass = () => screen.getByRole('dialog').className;
// The template's own three logos are the only images allowed on the page.
const expectOnlyTemplateLogos = () => {
  expect([...document.querySelectorAll('img')].map(image => image.getAttribute('src')).sort())
    .toEqual(Object.values(ilawBrandAssets).sort());
  expect(document.querySelector('img[src="x"], [onerror]')).toBeNull();
};
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
    expect(screen.getByText('Describe cells.').closest('dl').className).toContain('activity-fields');
    expect(screen.getByText(/^Generated in \d+ s$/)).toBeTruthy();
  });

  it('a default quiz sends itemCount 10 and shows every item with its answer', async () => {
    mock.request.mockResolvedValue(response());
    open();
    chooseTask('Quiz');
    generate();
    await screen.findByText('Cells quiz');
    expect(body()).toEqual({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'quiz', itemCount: 10 });
    expect(screen.getByText('Nucleus')).toBeTruthy();
    expect(screen.getByText('True')).toBeTruthy();
    expect(screen.getByText('mitochondrion')).toBeTruthy();
    expect(screen.getByText('plant, animal')).toBeTruthy();
    expect(screen.getByText('2 points')).toBeTruthy();
    fireEvent.click(answerKeyBox());
    expect(screen.getByText('Wall')).toBeTruthy();
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
    expect(screen.getByText('30–60 words', { exact: false })).toBeTruthy();
    expect(screen.getByText('Accuracy: 3 points')).toBeTruthy();
    expect(screen.getByText('Clarity: 2 points')).toBeTruthy();
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

  it('waits for an async save: pending state, no second call, and no close', async () => {
    let finish;
    const onUseDraft = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    await toPreview({ onUseDraft });
    const button = screen.getByRole('button', { name: 'Use this draft' });
    act(() => { button.click(); button.click(); });
    expect(onUseDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Back' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Regenerate' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Close Generate Day Task' }).disabled).toBe(true);
    await act(async () => { finish(); });
    expect(screen.getByRole('button', { name: 'Use this draft' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Close Generate Day Task' }).disabled).toBe(false);
  });

  it('a failed save keeps the preview, shows the message, and allows another try', async () => {
    const log = vi.spyOn(console, 'error');
    const onUseDraft = vi.fn().mockRejectedValueOnce(new Error('The draft could not be saved. Check Worksheets before trying again.'));
    await toPreview({ onUseDraft });
    click('Use this draft');
    expect((await screen.findByRole('alert')).textContent).toBe('The draft could not be saved. Check Worksheets before trying again.');
    expect(screen.getByText('Cells quiz')).toBeTruthy();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
    onUseDraft.mockResolvedValueOnce();
    click('Use this draft');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(onUseDraft).toHaveBeenCalledTimes(2);
  });

  it('Back clears a save error so it does not follow the teacher', async () => {
    await toPreview({ onUseDraft: vi.fn().mockRejectedValue(new Error('Save failed.')) });
    click('Use this draft');
    await screen.findByRole('alert');
    click('Back');
    expect(screen.queryByRole('alert')).toBeNull();
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
    for (const value of [`A ${attack}`, `R ${attack}`, `C ${attack}`]) expect(document.body.textContent).toContain(value);
    expectOnlyTemplateLogos();
    fireEvent.click(answerKeyBox());
    expect(document.body.textContent).toContain(`O ${attack}`);
    expectOnlyTemplateLogos();
  });

  it('a quiz draft uses the template with Subject and Grade from the plan, and no repeated plan title', async () => {
    mock.request.mockResolvedValue(response({ title: 'English 7' }));
    open({ plan: { ...plan, title: 'English 7', subject: 'English', grade_level: 'Grade 7' } });
    chooseTask('Quiz');
    generate();
    const key = await screen.findByRole('article', { name: 'Teacher answer key' });
    expect(key.className).toContain('worksheet-draft-document--day-task');
    expect(key.textContent).toContain('Subject: English');
    expect(key.textContent).toContain('Grade: Grade 7');
    expect(screen.getAllByText('English 7')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText(/^Generated in \d+ s$/).className).toContain('text-xs');
  });

  it('the checkbox swaps one document for the other, and hides answers from the student copy', async () => {
    await toPreview();
    expect(answerKeyBox().checked).toBe(true);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const key = screen.getByRole('article', { name: 'Teacher answer key' });
    expect(key.querySelector('h3').textContent).toBe('TEACHER ANSWER KEY');
    expect(key.textContent).toContain('Answer: mitochondrion');
    fireEvent.click(answerKeyBox());
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const student = screen.getByRole('article', { name: 'Student-facing worksheet' });
    expect(student.querySelector('h3').textContent).toBe('QUIZ');
    expect(student.textContent).toContain('Student name:');
    for (const option of ['Nucleus', 'Wall', 'Vacuole', 'Ribosome']) expect(student.textContent).toContain(option);
    for (const hidden of ['Answer:', 'mitochondrion', 'plant, animal']) expect(student.textContent).not.toContain(hidden);
    fireEvent.click(answerKeyBox());
    expect(screen.getByRole('article', { name: 'Teacher answer key' })).toBeTruthy();
  });

  it('only the preview step is wide', async () => {
    let finish;
    mock.request.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    open();
    expect(dialogClass()).toContain('max-w-2xl');
    chooseTask('Quiz');
    expect(dialogClass()).toContain('max-w-2xl');
    generate();
    expect(dialogClass()).toContain('max-w-2xl');
    await act(async () => { finish(response()); });
    expect(dialogClass()).toContain('max-w-4xl');
    expect(dialogClass()).not.toContain('max-w-2xl');
    click('Back');
    expect(dialogClass()).toContain('max-w-2xl');
  });

  it('an Activity draft uses the template in the wider modal', async () => {
    mock.request.mockResolvedValue(activityResponse());
    open();
    chooseTask('Activity');
    generate();
    await screen.findByText(/^Generated in \d+ s$/);
    expect(screen.getByRole('article', { name: 'Student-facing worksheet' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText('Cells')).toBeNull();
    expect(dialogClass()).toContain('max-w-4xl');
  });

  describe('activity draft', () => {
    const INSTRUCTIONS = ['Objective: Describe cells.', 'Grouping: Pairs', 'Materials:', '- Paper', 'Procedure:', '1. Draw a cell.', '2. Label it.'].join('\n');
    const activityDraft = (extra = {}) => response({ taskType: 'activity', questions: [], answerKey: [], title: 'Cell map',
      instructions: INSTRUCTIONS, activity: { language: 'en', title: 'Cell map' }, ...extra });
    const fullPlan = { ...plan, title: 'English 7', subject: 'English', grade_level: 'Grade 7' };
    const toActivity = async ({ result = activityDraft(), ...props } = {}) => {
      mock.request.mockResolvedValue(result);
      open(props);
      chooseTask('Activity');
      generate();
      return screen.findByRole('article', { name: 'Student-facing worksheet' });
    };

    it('shows the school header, ACTIVITY heading, one title, Subject and Grade', async () => {
      const document = await toActivity({ plan: fullPlan, result: activityDraft({ title: 'English 7' }) });
      expect(document.className).toContain('worksheet-draft-document--day-task');
      expect(document.textContent).toContain('DELA PAZ NATIONAL HIGH SCHOOL');
      expect(document.querySelector('h3').textContent).toBe('ACTIVITY');
      expect(screen.getAllByText('English 7')).toHaveLength(1);
      expect(document.querySelector('.worksheet-draft-title').textContent).toBe('English 7');
      expect(document.textContent).toContain('Subject: English');
      expect(document.textContent).toContain('Grade: Grade 7');
      expect(document.textContent).not.toContain('Total points');
    });

    it('shows the activity text through the structured directions', async () => {
      const document = await toActivity();
      const label = within(document).getByText('Objective');
      expect(label.tagName).toBe('DT');
      expect(label.nextElementSibling.textContent).toBe('Describe cells.');
      expect([...document.querySelectorAll('ol.activity-list li')].map(node => node.textContent)).toEqual(['Draw a cell.', 'Label it.']);
      expect(document.querySelector('.worksheet-draft-directions')).toBeNull();
    });

    it('has no answer key, checkbox or review note', async () => {
      await toActivity();
      expect(screen.queryByRole('checkbox')).toBeNull();
      expect(screen.queryByRole('article', { name: 'Teacher answer key' })).toBeNull();
      expect(screen.queryByText(/for review only/)).toBeNull();
    });

    it('renders AI markup as plain text and creates no image', async () => {
      const attack = '<img src=x onerror=alert(1)>';
      const document = await toActivity({ result: activityDraft({ title: `T ${attack}`,
        instructions: `Objective: O ${attack}\n1. S ${attack}\nP ${attack}` }) });
      for (const value of [`T ${attack}`, `O ${attack}`, `S ${attack}`, `P ${attack}`]) expect(document.textContent).toContain(value);
      expectOnlyTemplateLogos();
    });

    it('the footer buttons and Generated line behave as before', async () => {
      const onUseDraft = vi.fn();
      await toActivity({ onUseDraft });
      expect(screen.getByText(/^Generated in \d+ s$/).className).toContain('text-xs');
      click('Use this draft');
      await waitFor(() => expect(onUseDraft).toHaveBeenCalledWith(activityDraft(), { day: 'Tuesday', taskType: 'activity', storedTaskType: 'worksheet' }));
      mock.request.mockResolvedValue(activityDraft({ title: 'Second map' }));
      click('Regenerate');
      await screen.findByText('Second map');
      click('Back');
      expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
    });

    it('Quiz and Assignment drafts keep the Directions paragraph, not the structured body', async () => {
      for (const [type, result] of [['Quiz', response()], ['Assignment', essayResponse()]]) {
        mock.request.mockResolvedValue(result);
        open();
        chooseTask(type);
        generate();
        const document = await screen.findByRole('article', { name: 'Teacher answer key' });
        expect(document.querySelector('.worksheet-draft-directions').textContent).toBe('Directions: Line one\nLine two');
        expect(document.querySelector('.activity-body')).toBeNull();
        cleanup();
      }
    });

    it('shows the same text as the saved Activity preview for the same input', async () => {
      const draft = (await toActivity({ plan: fullPlan })).textContent;
      cleanup();
      render(<ThemeContext.Provider value={{ dark: false }}>
        <SavedDayTaskPreview worksheet={{ id: 'w1', title: 'Cell map', subject: 'English', grade_level: 'Grade 7', task_type: 'worksheet', instructions: INSTRUCTIONS }}
          loadItems={async () => ({ items: [], keys: {} })} onClose={vi.fn()} />
      </ThemeContext.Provider>);
      const saved = (await screen.findByRole('article', { name: 'Student-facing worksheet' })).textContent;
      expect(draft).toBe(saved);
    });
  });

  describe('assignment draft', () => {
    const essays = (extra = {}) => response({ taskType: 'assignment', answerKey: [], questions: [
      essayResponse().questions[0],
      { localId: 'draft-2', question: 'Describe one cell part.', item_type: 'essay', options: [], points: 5,
        essay: { referenceAnswer: 'The nucleus stores DNA.', minWords: 40, maxWords: 80,
          rubric: [{ criterion: 'Detail', points: 3 }, { criterion: 'Grammar', points: 2 }] } },
    ], ...extra });
    const toAssignment = async ({ result = essays(), ...props } = {}) => {
      mock.request.mockResolvedValue(result);
      open(props);
      chooseTask('Assignment');
      generate();
      return screen.findByRole('article', { name: 'Teacher answer key' });
    };

    it('uses the template with Subject and Grade, no repeated plan title, in the wider modal', async () => {
      const key = await toAssignment({ result: essays({ title: 'English 7' }),
        plan: { ...plan, title: 'English 7', subject: 'English', grade_level: 'Grade 7' } });
      expect(key.className).toContain('worksheet-draft-document--day-task');
      expect(key.textContent).toContain('Subject: English');
      expect(key.textContent).toContain('Grade: Grade 7');
      expect(screen.getAllByText('English 7')).toHaveLength(1);
      expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
      expect(screen.getByText('Tuesday')).toBeTruthy();
      expect(screen.getByText(/^Generated in \d+ s$/).className).toContain('text-xs');
      expect(dialogClass()).toContain('max-w-4xl');
      click('Back');
      expect(dialogClass()).toContain('max-w-2xl');
    });

    it('the teacher copy shows the reference answer, word range and rubric for every essay', async () => {
      const key = await toAssignment();
      expect(answerKeyBox().checked).toBe(true);
      expect(key.querySelector('h3').textContent).toBe('TEACHER ANSWER KEY');
      const [first, second] = key.querySelectorAll('ol.worksheet-draft-questions > li');
      for (const value of ['Reference answer: To grow and repair.', 'Length: 30–60 words', 'Accuracy: 3 points', 'Clarity: 2 points'])
        expect(first.textContent).toContain(value);
      for (const value of ['Reference answer: The nucleus stores DNA.', 'Length: 40–80 words', 'Detail: 3 points', 'Grammar: 2 points'])
        expect(second.textContent).toContain(value);
    });

    it('the student copy shows the questions and points, and none of the key', async () => {
      await toAssignment();
      fireEvent.click(answerKeyBox());
      expect(screen.getAllByRole('article')).toHaveLength(1);
      const student = screen.getByRole('article', { name: 'Student-facing worksheet' });
      expect(student.querySelector('h3').textContent).toBe('ASSIGNMENT');
      for (const value of ['Explain why cells divide.', 'Describe one cell part.', '5 points', 'Total points: 10', 'Student name:'])
        expect(student.textContent).toContain(value);
      expect(student.querySelectorAll('.worksheet-draft-answer-space')).toHaveLength(2);
      for (const hidden of ['Answer:', 'Teacher-scored', 'Reference answer', 'To grow and repair.', 'The nucleus stores DNA.', 'Length:',
        '30–60', '40–80', 'Accuracy', 'Clarity', 'Detail', 'Grammar']) expect(student.textContent).not.toContain(hidden);
      fireEvent.click(answerKeyBox());
      expect(screen.getByRole('article', { name: 'Teacher answer key' })).toBeTruthy();
    });

    it('Back, Regenerate and Use this draft keep their behavior', async () => {
      const onUseDraft = vi.fn();
      await toAssignment({ onUseDraft });
      click('Use this draft');
      await waitFor(() => expect(onUseDraft).toHaveBeenCalledWith(essays(), { day: 'Tuesday', taskType: 'assignment', storedTaskType: 'assignment' }));
      mock.request.mockResolvedValue(essays({ title: 'Second assignment' }));
      click('Regenerate');
      await screen.findByText('Second assignment');
      expect(mock.request).toHaveBeenCalledTimes(2);
      expect(body(1)).toEqual(body(0));
      click('Back');
      expect(screen.getByLabelText(/Number of items/).value).toBe('3');
      expect(mock.request).toHaveBeenCalledTimes(2);
    });

    const REVIEW_NOTE = 'The reference answer, length and rubric below are for review only. They are not saved with the Assignment.';

    it('shows the review note directly above the teacher copy, and hides it with the box', async () => {
      const key = await toAssignment();
      const note = screen.getByText(REVIEW_NOTE);
      expect(note.nextElementSibling).toBe(key);
      expect(note.className).toContain('text-xs');
      fireEvent.click(answerKeyBox());
      expect(screen.queryByText(REVIEW_NOTE)).toBeNull();
      fireEvent.click(answerKeyBox());
      expect(screen.getByText(REVIEW_NOTE)).toBeTruthy();
    });

    it('shows no review note when no question has essay data', async () => {
      await toAssignment({ result: response({ taskType: 'assignment' }) });
      expect(screen.queryByText(REVIEW_NOTE)).toBeNull();
    });

    it('never shows the review note for a Quiz, even with essay data, or for an Activity', async () => {
      const quiz = response();
      mock.request.mockResolvedValue({ ...quiz, questions: [...quiz.questions, essayResponse().questions[0]] });
      open();
      chooseTask('Quiz');
      generate();
      await screen.findByRole('article', { name: 'Teacher answer key' });
      expect(screen.queryByText(REVIEW_NOTE)).toBeNull();
      fireEvent.click(answerKeyBox());
      expect(screen.queryByText(REVIEW_NOTE)).toBeNull();
      cleanup();
      mock.request.mockResolvedValue(activityResponse());
      open();
      chooseTask('Activity');
      generate();
      await screen.findByText(/^Generated in \d+ s$/);
      expect(screen.queryByText(REVIEW_NOTE)).toBeNull();
    });

    it('AI markup stays literal text in both copies, and creates no image', async () => {
      const attack = '<img src=x onerror=alert(1)>';
      await toAssignment({ result: response({ taskType: 'assignment', title: `T ${attack}`, instructions: `I ${attack}`, answerKey: [], questions: [
        { localId: 'draft-1', question: `Q ${attack}`, item_type: 'essay', options: [], points: 5,
          essay: { referenceAnswer: `R ${attack}`, minWords: 1, maxWords: 2, rubric: [{ criterion: `C ${attack}`, points: 5 }] } },
      ] }) });
      for (const value of [`T ${attack}`, `I ${attack}`, `Q ${attack}`, `R ${attack}`, `C ${attack}`]) expect(document.body.textContent).toContain(value);
      expectOnlyTemplateLogos();
      fireEvent.click(answerKeyBox());
      for (const value of [`T ${attack}`, `I ${attack}`, `Q ${attack}`]) expect(document.body.textContent).toContain(value);
      expectOnlyTemplateLogos();
    });
  });

  describe('when Regenerate does not produce a new draft', () => {
    const QUOTA = 'The AI provider reported a daily quota limit. Wait for the quota to reset before trying again.';
    const NETWORK = 'The server response could not be received.';
    const expectPreviousDraft = () => {
      expect(screen.getByText('Cells quiz')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
      expect(dialogClass()).toContain('max-w-4xl');
    };
    const failRegenerate = async (failure, message) => {
      mock.request.mockRejectedValue(failure);
      click('Regenerate');
      expect((await screen.findByRole('alert')).textContent).toBe(message);
    };

    it('a quota failure keeps the previous draft and shows the error in the preview step', async () => {
      await toPreview();
      await failRegenerate(new Error(QUOTA), QUOTA);
      expectPreviousDraft();
      expect(screen.getByRole('alert').className).toContain('rounded-lg');
      click('Back');
      expect(screen.getByLabelText(/Number of items/).value).toBe('11');
    });

    it('a network failure keeps the previous draft and shows the error', async () => {
      await toPreview();
      await failRegenerate(Object.assign(new Error(NETWORK), { kind: 'transport' }), NETWORK);
      expectPreviousDraft();
    });

    it('an unexpected response keeps the previous draft and shows the error', async () => {
      await toPreview();
      mock.request.mockResolvedValue(response({ status: 'RAW-RESPONSE-TEXT' }));
      click('Regenerate');
      expect((await screen.findByRole('alert')).textContent).toBe('The server returned an unexpected response. Nothing was saved.');
      expectPreviousDraft();
      expect(document.body.textContent).not.toContain('RAW-RESPONSE-TEXT');
    });

    it('Cancel keeps the previous draft with no error', async () => {
      await toPreview();
      abortableRequest();
      click('Regenerate');
      expect(screen.getByRole('status')).toBeTruthy();
      expect(dialogClass()).toContain('max-w-2xl');
      click('Cancel');
      await act(async () => {});
      expectPreviousDraft();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('an abort that did not come from Cancel keeps the previous draft with no error', async () => {
      await toPreview();
      mock.request.mockRejectedValue(Object.assign(new Error(NETWORK), { cause: new DOMException('Aborted', 'AbortError') }));
      click('Regenerate');
      await screen.findByText('Cells quiz');
      expectPreviousDraft();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('a response arriving after Cancel does not replace the previous draft', async () => {
      await toPreview();
      let resolve;
      mock.request.mockImplementation(() => new Promise((done) => { resolve = done; }));
      click('Regenerate');
      click('Cancel');
      await act(async () => { resolve(response({ title: 'Late quiz' })); });
      expectPreviousDraft();
      expect(screen.queryByText('Late quiz')).toBeNull();
    });

    it('a later success shows the new draft and clears the old error', async () => {
      await toPreview();
      await failRegenerate(new Error(QUOTA), QUOTA);
      mock.request.mockResolvedValue(response({ title: 'Second quiz' }));
      click('Regenerate');
      await screen.findByText('Second quiz');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cells quiz')).toBeNull();
    });

    it('the kept draft is still the one saved, unchanged', async () => {
      const onUseDraft = vi.fn();
      await toPreview({ onUseDraft });
      await failRegenerate(new Error(QUOTA), QUOTA);
      click('Use this draft');
      await waitFor(() => expect(onUseDraft).toHaveBeenCalledWith(response(), { day: 'Tuesday', taskType: 'quiz', storedTaskType: 'quiz' }));
    });

    it('a first Generate that fails still goes to the task step', async () => {
      mock.request.mockRejectedValue(new Error(QUOTA));
      open();
      chooseTask('Quiz');
      generate();
      expect((await screen.findByRole('alert')).textContent).toBe(QUOTA);
      expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
    });

    it('Generate after Back is a fresh start: failure and Cancel stay on the task step', async () => {
      await toPreview();
      click('Back');
      mock.request.mockRejectedValue(new Error(QUOTA));
      generate();
      expect((await screen.findByRole('alert')).textContent).toBe(QUOTA);
      expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
      expect(screen.queryByText('Cells quiz')).toBeNull();
      abortableRequest();
      generate();
      click('Cancel');
      await act(async () => {});
      expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
      expect(screen.queryByText('Cells quiz')).toBeNull();
    });
  });

  it('moves focus to the step heading so it is not lost', async () => {
    await toPreview();
    expect(document.activeElement.textContent).toBe('Preview');
  });
});
