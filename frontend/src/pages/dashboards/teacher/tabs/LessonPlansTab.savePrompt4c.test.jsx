// @vitest-environment jsdom
// R40 / R42 (4c): after a successful save, offer to generate a worksheet from the plan.
// Harness copied from LessonPlansTab.manualSave.test.jsx (P4b).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';

const TEACHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCI = '11111111-1111-4111-8111-111111111111';
const PLAN = '99999999-9999-4999-8999-999999999999';
const YEAR = '2026-2027';

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

describe('R40: post-save prompt', () => {
  it('Save lesson plan shows the prompt; Not now dismisses it', async () => {
    live();
    await openNew();
    await chooseLoad();
    fillComplete();
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    await card('Matter');
    const prompt = await screen.findByRole('region', { name: 'Next step' });
    expect(prompt.textContent).toContain('Lesson plan saved. Continue and generate a worksheet from it?');
    fireEvent.click(within(prompt).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull();
  });

  it('Generate worksheet opens Generate Task for that plan', async () => {
    live();
    await openNew();
    await chooseLoad();
    fillComplete();
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson plan' }));
    await card('Matter');
    const prompt = await screen.findByRole('region', { name: 'Next step' });
    fireEvent.click(within(prompt).getByRole('button', { name: /^Generate worksheet/ }));
    expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull();
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('R42: Save as draft never offers a worksheet', async () => {
    live();
    await openNew();
    await chooseLoad();
    text('Name of Lesson', 'Matter');
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await card('Matter');
    expect(screen.queryByRole('region', { name: 'Next step' })).toBeNull();
  });
});
