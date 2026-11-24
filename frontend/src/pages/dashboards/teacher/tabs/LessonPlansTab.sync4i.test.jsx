// @vitest-environment jsdom
// R43 (4i): a plan edited after its worksheet was made shows Sync, which opens Generate Task (a new draft).
// Harness from LessonPlansTab.manualSave.test.jsx, with a worksheets read added.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';

const TEACHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAN = '99999999-9999-4999-8999-999999999999';
const YEAR = '2026-2027';

const mock = vi.hoisted(() => ({ tables: [], plans: [], calls: [], next: [], sheets: [] }));

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
      if (table === 'worksheets') return { select() { return this; }, eq() { return this; },
        not: async () => ({ data: mock.sheets, error: null }), update() { throw new Error('Sync must never update a worksheet'); } };
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
  mock.sheets = [];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const card = async title => (await screen.findByRole('heading', { name: title })).closest('li');

const aiPlan = { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', teacher_id: TEACHER, title: 'States of Matter', subject: 'Science',
  grade_level: 'Grade 7', ai_generated: true, status: 'draft', objectives: '<p>Plan</p>',
  created_at: '2026-11-01T08:00:00', updated_at: '2026-11-20T08:00:00' };

describe('R43: out of sync', () => {
  it('a worksheet made before the last edit shows the note; Sync opens Generate Task and edits nothing', async () => {
    mock.plans = [aiPlan];
    mock.sheets = [{ id: 'w-old', created_at: '2026-11-10T08:00:00', source_lesson_plan_id: aiPlan.id }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    const row = await card('States of Matter');
    const note = await within(row).findByRole('note');
    expect(note.textContent).toContain('This plan changed after a worksheet was made from it.');
    expect(note.textContent).toContain('The existing worksheets stay as they are.');
    fireEvent.click(within(note).getByRole('button', { name: /^Sync worksheet/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('a worksheet made after the last edit shows no note', async () => {
    mock.plans = [aiPlan];
    mock.sheets = [{ id: 'w-new', created_at: '2026-11-21T08:00:00', source_lesson_plan_id: aiPlan.id }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    const row = await card('States of Matter');
    await new Promise(r => setTimeout(r, 20));
    expect(within(row).queryByRole('note')).toBeNull();
  });
});
