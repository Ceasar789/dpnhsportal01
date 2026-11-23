// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';

const TEACHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCI = '11111111-1111-4111-8111-111111111111';
const PLAN = '99999999-9999-4999-8999-999999999999';
const YEAR = '2026-2027';
const UNAVAILABLE = 'Permanent saving is unavailable. Your work has not been saved to EduScribe.';

const mock = vi.hoisted(() => ({ tables: [], plans: [], calls: [], next: [] }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }) }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
    from(table) {
      mock.tables.push(table);
      if (table === 'school_settings') return { select() { return this; }, eq() { return this; },
        single: async () => ({ data: { school_year: '2026-2027' }, error: null }) };
      if (table === 'teacher_subjects') return { select() { return this; }, eq() { return this; },
        then(resolve) { return Promise.resolve({ data: [
          { subject_id: '11111111-1111-4111-8111-111111111111', grade_level: 'Grade 7', subjects: { id: '11111111-1111-4111-8111-111111111111', name: 'Science' } },
          { subject_id: '11111111-1111-4111-8111-111111111111', grade_level: 'Grade 11', subjects: { id: '11111111-1111-4111-8111-111111111111', name: 'Science' } },
        ], error: null }).then(resolve); } };
      return { select() { return this; }, eq() { return this; }, order: async () => ({ data: mock.plans, error: null }),
        insert() { throw new Error('Unexpected direct insert'); }, update() { throw new Error('Unexpected direct update'); } };
    },
    storage: { from() { throw new Error('Unexpected storage operation'); } },
  },
}));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: vi.fn() }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));
vi.mock('../shared/TeacherFilePicker', () => ({ default: () => null }));

// Behaves like eduscribe_manual_write_v1 for the signed-in teacher.
function fakeServer(operation, command) {
  const state = ['CreateIncompleteDraft', 'UpdateIncompleteDraft'].includes(operation) ? 'draft' : 'saved';
  const id = command.id ?? PLAN;
  const revision = (command.expectedRevision ?? 0) + 1;
  const envelope = { kind: 'eduscribe.manual-ilaw', version: 2, teacherId: TEACHER, planId: id, title: command.document.title,
    assignment: { ...command.document.assignment, subjectName: 'Science' }, workflowState: state,
    document: command.document.document, sourceDetails: command.document.sourceDetails };
  const row = { id, teacher_id: TEACHER, title: command.document.title, subject: 'Science', grade_level: 'Grade 7',
    academic_year: YEAR, ai_generated: false, status: 'draft', authoring_revision: revision,
    objectives: JSON.stringify(envelope), created_at: '2026-06-01T00:00:00Z' };
  mock.plans = [row, ...mock.plans.filter(plan => plan.id !== id)];
  return { ok: true, durable: true, record: { id, ownerId: TEACHER, type: 'manual', revision, teacher_id: TEACHER, objectives: row.objectives } };
}
const manualCalls = () => mock.calls.map(call => call.operation);

beforeEach(() => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const match = String(url).match(/\/api\/lesson-plans\/manual\/([A-Za-z]+)$/);
    if (!match) throw new Error(`Unexpected request ${url}`);
    const command = JSON.parse(init.body);
    mock.calls.push({ operation: match[1], command, authorization: init.headers.Authorization });
    const planned = mock.next.shift();
    if (planned === 'network') throw new TypeError('Failed to fetch');
    const body = planned ?? fakeServer(match[1], command);
    return { status: body.ok ? 200 : 409, json: async () => body };
  }));
});
afterEach(() => {
  cleanup();
  mock.tables.length = 0;
  mock.plans = [];
  mock.calls.length = 0;
  mock.next.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const live = () => vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED', '1');
const text = (name, value) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
async function openNew() {
  render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Create Manual ILAW Lesson Plan' }));
}
async function chooseLoad() {
  const select = await screen.findByRole('combobox', { name: 'Subject and grade' });
  await waitFor(() => expect(select.disabled).toBe(false));
  expect(within(select).queryByText(/Grade 11/)).toBeNull();
  fireEvent.change(select, { target: { value: `${SCI}|Grade 7` } });
}
function fillComplete() {
  text('Name of Lesson', 'Matter');
  text('Teaching Date', 'Week 1');
  text('Learning Objectives, Monday', 'Describe matter');
  text('Flow, Monday', 'Group lab');
  text('Formative Assessment, Monday', 'Exit ticket');
}
const card = async title => (await screen.findByRole('heading', { name: title })).closest('li');

describe('flags off: behaviour is exactly as before P4b', () => {
  it('production build shows the unavailable text, no save buttons, and sends nothing', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED', '1'); // the dev flag never opens production
    await openNew();
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
    expect(screen.getByText('Local QA only · Not saved to EduScribe · Use synthetic content')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save lesson plan|Save as draft|Save Lesson Plan|Save Incomplete Draft/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Subject and grade' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Discard temporary draft' })).toBeTruthy();
    expect(mock.tables).not.toContain('school_settings');
    expect(mock.tables).not.toContain('teacher_subjects');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('development without the flag keeps the local QA mock buttons only', async () => {
    await openNew();
    expect(screen.getByRole('button', { name: 'Save Incomplete Draft (local)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Lesson Plan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save as draft' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Subject and grade' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('P4b live Manual ILAW save', () => {
  it('a first complete save creates a Draft, then saves it; the card says Saved, never Draft', async () => {
    live();
    await openNew();
    expect(screen.queryByText(/Local QA only/)).toBeNull();
    await chooseLoad();
    expect(screen.getByRole('textbox', { name: 'Learning Area/s' }).value).toBe('Science');
    fillComplete();
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    const saved = await card('Matter');
    expect(manualCalls()).toEqual(['CreateIncompleteDraft', 'SaveCompleteLessonPlan']);
    const [create, save] = mock.calls;
    expect(create.authorization).toBe('Bearer synthetic-token');
    expect(create.command).toMatchObject({ id: null, expectedRevision: null });
    expect(save.command).toMatchObject({ id: PLAN, expectedRevision: 1 });
    expect(save.command.document).toEqual(create.command.document);
    expect(save.command.document.assignment).toEqual({ subjectId: SCI, gradeLevel: 'Grade 7', schoolYear: YEAR });
    expect(JSON.stringify(save.command)).not.toContain(TEACHER);
    expect(create.command.requestId).not.toBe(save.command.requestId);
    expect(within(saved).getByText('Saved')).toBeTruthy();
    expect(within(saved).queryByText('Draft')).toBeNull();
  });

  it('an incomplete Save sends nothing and focuses the first problem', async () => {
    live();
    await openNew();
    await screen.findByRole('combobox', { name: 'Subject and grade' });
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('manual-assignment'));
    expect(screen.getAllByText('Choose a subject and grade from your teaching load.').length).toBeGreaterThan(0);
    await chooseLoad();
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-ilaw-field')).toBe('nameOfLesson'));
    text('Learning Area/s', 'Mathematics');
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect((await screen.findAllByText('Learning Area/s must be Science, the chosen subject.')).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Draft -> reopen -> Save -> reopen: Saved stays Saved and cannot go back to Draft', async () => {
    live();
    await openNew();
    await chooseLoad();
    text('Name of Lesson', 'Matter');
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    let item = await card('Matter');
    expect(manualCalls()).toEqual(['CreateIncompleteDraft']);
    expect(within(item).getByText('Draft')).toBeTruthy();

    fireEvent.click(within(item).getByRole('button', { name: /View and edit/ }));
    expect(screen.getByText('Status: Draft')).toBeTruthy();
    expect(screen.getByText(/Subject and grade: Science · Grade 7 · S\.Y\. 2026-2027/)).toBeTruthy();
    fillComplete();
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    item = await card('Matter');
    expect(manualCalls()).toEqual(['CreateIncompleteDraft', 'SaveCompleteLessonPlan']);
    expect(mock.calls[1].command).toMatchObject({ id: PLAN, expectedRevision: 1 });
    expect(within(item).getByText('Saved')).toBeTruthy();

    fireEvent.click(within(item).getByRole('button', { name: /View and edit/ }));
    expect(screen.getByText('Status: Saved')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save as draft' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeTruthy();
    text('Flow, Tuesday', 'Second activity');
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    item = await card('Matter');
    expect(manualCalls()).toEqual(['CreateIncompleteDraft', 'SaveCompleteLessonPlan', 'UpdateSavedLessonPlan']);
    expect(mock.calls[2].command).toMatchObject({ id: PLAN, expectedRevision: 2 });
    expect(within(item).getByText('Saved')).toBeTruthy();
    expect(within(item).queryByText('Draft')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'draft' } });
    expect(await screen.findByText('No plans match your search or filters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'saved' } });
    expect(await card('Matter')).toBeTruthy();
  });

  it('a conflict keeps the editor open with the content and shows a written message', async () => {
    live();
    await openNew();
    await chooseLoad();
    fillComplete();
    mock.next.push({ ok: false, code: 'revision_conflict', durable: false, error: 'raw server text' });
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    expect(await screen.findByText('This plan was changed somewhere else. Reopen it before saving again.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('Matter');
    expect(screen.queryByText('raw server text')).toBeNull();
  });

  it('an unknown outcome is retried with the same request id', async () => {
    live();
    await openNew();
    await chooseLoad();
    text('Name of Lesson', 'Matter');
    mock.next.push('network');
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText("We couldn't confirm the save. Your work is still open. Try again.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await card('Matter');
    expect(manualCalls()).toEqual(['CreateIncompleteDraft', 'CreateIncompleteDraft']);
    expect(mock.calls[1].command.requestId).toBe(mock.calls[0].command.requestId);
  });

  it('unknown server codes and raw text are never shown', async () => {
    live();
    await openNew();
    await chooseLoad();
    text('Name of Lesson', 'Matter');
    mock.next.push({ ok: false, code: 'duplicate key value violates unique constraint "secret_idx"', durable: false });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText("The lesson plan couldn't be saved. Your work is still open.")).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret_idx');
  });

  it('AI plans keep their card and are filed under Saved, not Draft', async () => {
    live();
    mock.plans = [{ id: 'ai-plan', teacher_id: TEACHER, title: 'AI week plan', subject: 'Science', ai_generated: true,
      status: 'draft', objectives: '<p>AI</p>', created_at: '2026-06-01T00:00:00Z' }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    const item = await card('AI week plan');
    expect(within(item).queryByText('Draft')).toBeNull();
    expect(within(item).queryByText('Saved')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'draft' } });
    expect(await screen.findByText('No plans match your search or filters.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'saved' } });
    expect(await card('AI week plan')).toBeTruthy();
  });
});
