// @vitest-environment jsdom
// R34 / R36 (4g): Generate instead, and Edit as manual (a copy). Harness from LessonPlansTab.manualSave.test.jsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';

const TEACHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

const text = (name, value) => fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
async function openNew() {
  render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Create Manual ILAW Lesson Plan' }));
}
const card = async title => (await screen.findByRole('heading', { name: title })).closest('li');

const AI_HTML = '<div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span><table><tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr><tr><td>Name the states</td><td>b</td><td>c</td><td>d</td><td>e</td></tr></table></div></div>';
const aiPlan = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', teacher_id: TEACHER, title: 'States of Matter', subject: 'Science',
  grade_level: 'Grade 7', ai_generated: true, status: 'draft', objectives: AI_HTML, created_at: '2026-06-01T00:00:00Z' };

describe('R36: Edit as manual', () => {
  it('opens a Manual ILAW copy filled from the AI plan and writes nothing', async () => {
    mock.plans = [aiPlan];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    const row = await card('States of Matter');
    fireEvent.click(within(row).getByRole('button', { name: /^Edit as manual/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Manual ILAW Editor' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('States of Matter');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('Name the states');
    expect(fetch).not.toHaveBeenCalled();
    expect(mock.plans).toEqual([aiPlan]);
  });
  it('is offered on AI plans only', async () => {
    mock.plans = [{ ...aiPlan, ai_generated: false, objectives: '<p>legacy</p>', title: 'Legacy plan' }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    const row = await card('Legacy plan');
    expect(within(row).queryByRole('button', { name: /^Edit as manual/ })).toBeNull();
  });
});

describe('R34: Generate instead', () => {
  it('returns to the AI generator without calling it, asking first when there are unsaved changes', async () => {
    await openNew();
    text('Name of Lesson', 'Typed but not saved');
    fireEvent.click(screen.getByRole('button', { name: 'Generate instead' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave document' }));
    const heading = await screen.findByRole('heading', { name: 'AI-Generated ILAW Lesson Plan' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(fetch).not.toHaveBeenCalled();
  });
});
