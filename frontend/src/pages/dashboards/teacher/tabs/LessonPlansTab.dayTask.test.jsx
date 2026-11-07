// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

const mock = vi.hoisted(() => ({ plans: [], teacherId: 'synthetic-teacher', request: vi.fn(), save: vi.fn(),
  showToast: vi.fn(), modalProps: null, extractFailure: null, writes: [] }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: mock.teacherId } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
  from(table) {
    const chain = { select() { return chain; }, eq() { return chain; },
      order: async () => ({ data: table === 'lesson_plans' ? mock.plans : [], error: null }),
      then: resolve => Promise.resolve({ data: [], error: null }).then(resolve),
      insert() { mock.writes.push(table); throw new Error('Unexpected database write'); } };
    return chain;
  },
} }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: mock.showToast }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));
vi.mock('../../../../lib/backendApi', () => ({ API_BASE: '', backendRequest: mock.request }));
vi.mock('../dayTasks/dayTaskSave', () => ({ saveDayTaskDraft: mock.save }));
vi.mock('../lessonPlans/weeklyWorksheetSource', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, extractWeeklyWorksheetSource: (html) => {
    if (mock.extractFailure) throw mock.extractFailure;
    return actual.extractWeeklyWorksheetSource(html);
  } };
});
// The real modal, with its props recorded so the guards can be driven directly.
vi.mock('../dayTasks/GenerateDayTaskModal', async (importOriginal) => {
  const { default: RealModal } = await importOriginal();
  return { default: (props) => { mock.modalProps = props; return createElement(RealModal, props); } };
});

import LessonPlansTab from './LessonPlansTab';
import { createBlankIlawDocument, WEEKDAYS, WEEKLY_FIELDS } from '../ilaw/ilawTemplateModel';
import { serializeManualIlawV2 } from '../ilaw/manualIlawV2';

const planId = 'c137877f-b729-4e7e-b258-c6cbb18cced1';
const field = (section, label, prefix) => `<div class="${section}"><div class="ilaw-field"><span class="ilaw-label">${label}</span><table><tr>${
  WEEKDAYS.map(day => `<th>${day}</th>`).join('')}</tr><tr>${WEEKDAYS.map(day => `<td>${prefix} ${day} cells</td>`).join('')}</tr></table></div></div>`;
const aiPlan = (extra = {}) => ({ id: planId, teacher_id: mock.teacherId, status: 'draft', title: 'Plant cells',
  subject: 'Science', grade_level: 'Grade 7', subject_id: 'subject-1', academic_year: '2026-2027', ai_generated: true,
  created_at: '2026-01-01T00:00:00Z', objectives: field('ilaw-I', 'Learning Objectives', 'Describe')
    + field('ilaw-L', 'Flow', 'Observe') + field('ilaw-A', 'Formative Assessment', 'Explain'), ...extra });
const manualPlan = (extra = {}) => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7, A' });
  document.info.nameOfLesson = 'Manual cells';
  for (const [name] of WEEKLY_FIELDS) for (const day of WEEKDAYS) document.weekly[name][day] = `${name} ${day}`;
  const id = extra.id || planId;
  const teacherId = extra.teacher_id || mock.teacherId;
  return { id, teacher_id: teacherId, status: 'draft', title: 'Manual cells', subject: 'Science', grade_level: 'Grade 7',
    subject_id: null, academic_year: '2026-2027', ai_generated: false, created_at: '2026-01-01T00:00:00Z',
    objectives: serializeManualIlawV2({ kind: 'eduscribe.manual-ilaw', version: 2, teacherId, planId: id, title: 'Manual cells',
      workflowState: 'saved', document, assignment: { subjectId: 'synthetic-subject', subjectName: 'Science', gradeLevel: 'Grade 7',
        schoolYear: '2026-2027' }, sourceDetails: { classDuration: '45 minutes', teachingStrategy: 'Inquiry',
        learningObjectives: 'Understand cells' } }), ...extra };
};
const activity = () => ({ status: 'generated-day-task', saved: false, taskType: 'activity', day: 'Tuesday',
  sourceLessonPlan: { id: planId, title: 'Plant cells' }, title: 'Cell map', instructions: 'Objective: Describe cells.',
  questions: [], answerKey: [], activity: { language: 'en', title: 'Cell map' }, providerCalls: 1 });

const taskButton = title => screen.queryByRole('button', { name: `Generate Task for ${title}`, hidden: true });
const show = async (rows, props = {}) => {
  mock.plans = rows;
  render(<MemoryRouter><LessonPlansTab onGeneratedDraft={vi.fn()} {...props} /></MemoryRouter>);
  await screen.findByRole('heading', { name: rows[0].title });
};
const openModal = async (plan = aiPlan()) => {
  await show([plan]);
  fireEvent.click(taskButton(plan.title));
  return screen.findByRole('dialog', { name: 'Generate Day Task' });
};
const toPreview = async () => {
  mock.request.mockResolvedValue(activity());
  const dialog = await openModal();
  fireEvent.click(within(dialog).getByRole('button', { name: /^Tuesday/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: /^Activity/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));
  await within(dialog).findByText('Cell map');
  return dialog;
};
const useDraftButton = dialog => within(dialog).getByRole('button', { name: 'Use this draft' });

beforeEach(() => {
  mock.request.mockReset();
  mock.save.mockReset();
  mock.save.mockResolvedValue({ worksheetId: 'worksheet-1', itemCount: 0 });
});

afterEach(() => {
  cleanup();
  mock.plans = [];
  mock.teacherId = 'synthetic-teacher';
  mock.modalProps = null;
  mock.extractFailure = null;
  mock.writes.length = 0;
  mock.showToast.mockClear();
});

describe('Generate Task button', () => {
  it('appears for owned saved AI and Manual plans', async () => {
    await show([aiPlan(), manualPlan({ id: 'd137877f-b729-4e7e-b258-c6cbb18cced2' })]);
    expect(taskButton('Plant cells').textContent).toBe('Generate Task');
    expect(taskButton('Manual cells')).toBeTruthy();
  });

  it('appears for a published plan', async () => {
    await show([aiPlan({ status: 'published' })]);
    expect(taskButton('Plant cells')).toBeTruthy();
  });

  it('is hidden for a local mock plan', async () => {
    await show([manualPlan({ localMock: true })]);
    expect(taskButton('Manual cells')).toBeNull();
  });

  it('is hidden for another teacher, and no modal can open', async () => {
    await show([aiPlan({ teacher_id: 'another-teacher' })]);
    expect(taskButton('Plant cells')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mock.modalProps).toBeNull();
  });

  it('is hidden for an archived plan', async () => {
    await show([aiPlan({ status: 'archived' })]);
    expect(taskButton('Plant cells')).toBeNull();
  });

  it('is hidden for a plan that is neither AI nor Manual', async () => {
    await show([aiPlan({ ai_generated: false, objectives: '<p>Legacy</p>' })]);
    expect(taskButton('Plant cells')).toBeNull();
  });

  it('replaces the weekly controls, including when the job client is enabled', async () => {
    await show([aiPlan()], { jobClient: { enabled: true } });
    expect(screen.queryByRole('combobox', { name: 'Questions per day' })).toBeNull();
    expect(screen.queryByText('Questions per day')).toBeNull();
    expect(screen.queryByText('Generate Weekly Worksheets')).toBeNull();
    expect(screen.queryByRole('button', { name: /Generate Worksheet from/ })).toBeNull();
  });

  it('keeps the Resume weekly job button for a stored job', async () => {
    sessionStorage.setItem('eduscribe-weekly-draft-job-v1', JSON.stringify({ teacherId: mock.teacherId, planId,
      jobId: '823ebbd4-1bfe-459c-97e6-0200e738a5cb', requestId: '0f1e2d3c-4b5a-4678-9abc-def012345678', questionCount: 30 }));
    await show([aiPlan()], { jobClient: { enabled: true, status: vi.fn() } });
    expect(screen.getByRole('button', { name: 'Resume weekly job' })).toBeTruthy();
    sessionStorage.removeItem('eduscribe-weekly-draft-job-v1');
  });

  it('is disabled while the modal is open', async () => {
    await openModal();
    expect(taskButton('Plant cells').disabled).toBe(true);
  });
});

describe('Generate Day Task modal wiring', () => {
  it('opens with five weekdays and objective snippets, passing only id, title, subject and grade_level, never lesson content', async () => {
    const dialog = await openModal();
    for (const day of WEEKDAYS) {
      expect(within(dialog).getByRole('button', { name: new RegExp(`^${day}`) }).textContent).toContain(`Describe ${day} cells`);
    }
    expect(mock.modalProps.plan).toEqual({ id: planId, title: 'Plant cells', subject: 'Science', grade_level: 'Grade 7' });
    expect(mock.modalProps.days.map(entry => entry.day)).toEqual(WEEKDAYS);
  });

  it('still offers five weekdays when a Manual plan has no extractable snippets', async () => {
    const dialog = await openModal(manualPlan());
    for (const day of WEEKDAYS) expect(within(dialog).getByRole('button', { name: day })).toBeTruthy();
  });

  it('still opens when extraction throws', async () => {
    await show([manualPlan()]);
    mock.extractFailure = new Error('Synthetic extraction failure');
    fireEvent.click(taskButton('Manual cells'));
    const dialog = await screen.findByRole('dialog', { name: 'Generate Day Task' });
    expect(mock.modalProps.days).toEqual(WEEKDAYS.map(day => ({ day, objective: undefined })));
    expect(within(dialog).getAllByRole('button', { name: /day$/ })).toHaveLength(5);
  });

  it('closes from the dialog and re-enables the button', async () => {
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close Generate Day Task' }));
    expect(screen.queryByRole('dialog', { name: 'Generate Day Task' })).toBeNull();
    expect(taskButton('Plant cells').disabled).toBe(false);
  });
});

describe('saving a day task', () => {
  it('saves once with the loaded plan fields and the signed-in teacher', async () => {
    const dialog = await toPreview();
    fireEvent.click(useDraftButton(dialog));
    await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(1));
    expect(mock.save).toHaveBeenCalledWith({
      plan: { id: planId, title: 'Plant cells', subject: 'Science', grade_level: 'Grade 7', subject_id: 'subject-1' },
      result: activity(), day: 'Tuesday', taskType: 'activity', teacherId: 'synthetic-teacher',
    });
    expect(mock.writes).toEqual([]);
  });

  it('a double-trigger of onUseDraft saves once', async () => {
    let finish;
    mock.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await toPreview();
    const { onUseDraft } = mock.modalProps;
    const meta = { day: 'Tuesday', taskType: 'activity', storedTaskType: 'worksheet' };
    let first;
    let second;
    await act(async () => { first = onUseDraft(activity(), meta); second = onUseDraft(activity(), meta); });
    expect(mock.save).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ worksheetId: 'worksheet-1', itemCount: 0 }); await first; await second; });
    expect(mock.showToast).toHaveBeenCalledTimes(1);
  });

  it('cannot be closed while a save is running', async () => {
    let finish;
    mock.save.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const dialog = await toPreview();
    fireEvent.click(useDraftButton(dialog));
    await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(1));
    act(() => mock.modalProps.onClose());
    expect(screen.getByRole('dialog', { name: 'Generate Day Task' })).toBeTruthy();
    expect(taskButton('Plant cells').disabled).toBe(true);
    await act(async () => { finish({ worksheetId: 'worksheet-1', itemCount: 0 }); });
  });

  it('success closes the modal and shows the notice', async () => {
    const dialog = await toPreview();
    fireEvent.click(useDraftButton(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Generate Day Task' })).toBeNull());
    expect(mock.showToast).toHaveBeenCalledWith('Saved as a Draft in Worksheets', 'success');
    expect(taskButton('Plant cells').disabled).toBe(false);
  });

  it('failure keeps the modal and draft open and shows the safe message', async () => {
    mock.save.mockRejectedValue(new Error('The draft could not be saved. Check Worksheets before trying again.'));
    const dialog = await toPreview();
    fireEvent.click(useDraftButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent)
      .toBe('The draft could not be saved. Check Worksheets before trying again.');
    expect(within(dialog).getByText('Cell map')).toBeTruthy();
    expect(mock.showToast).not.toHaveBeenCalled();
  });

  it('a partial save keeps its message and is not retried automatically', async () => {
    mock.save.mockRejectedValue(Object.assign(
      new Error('Partially saved — please delete the draft in Worksheets and try again'), { worksheetId: 'worksheet-1' }));
    const dialog = await toPreview();
    fireEvent.click(useDraftButton(dialog));
    expect((await within(dialog).findByRole('alert')).textContent)
      .toBe('Partially saved — please delete the draft in Worksheets and try again');
    await act(async () => {});
    expect(mock.save).toHaveBeenCalledTimes(1);
    expect(dialog.textContent).not.toContain('worksheet-1');
  });

  it('after a failure the guard is released so the teacher can try again', async () => {
    mock.save.mockRejectedValueOnce(new Error('Failed once.'));
    const dialog = await toPreview();
    fireEvent.click(useDraftButton(dialog));
    await within(dialog).findByRole('alert');
    fireEvent.click(useDraftButton(dialog));
    await waitFor(() => expect(mock.showToast).toHaveBeenCalledWith('Saved as a Draft in Worksheets', 'success'));
    expect(mock.save).toHaveBeenCalledTimes(2);
  });
});
