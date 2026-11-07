// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';
import { openLessonPlanPrint } from '../ilaw/printLessonPlan';

vi.mock('../ilaw/printLessonPlan', () => ({ openLessonPlanPrint: vi.fn(async () => {}) }));

const mock = vi.hoisted(() => ({ tables: [], writes: [], plans: [], saved: null, teacherId: 'synthetic-teacher', updateMode: 'success', updateFilters: {}, generatorMode: 'success', generatorCalls: 0 }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: mock.teacherId } }) }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
    from(table) {
      mock.tables.push(table);
      if (table === 'teacher_subjects') return {
        select() { return this; },
        eq() { return this; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return {
        select() { return this; },
        eq() { return this; },
        order: async () => ({ data: mock.plans, error: null }),
        insert() { mock.writes.push('insert'); throw new Error('Unexpected write'); },
        update(payload) {
          mock.writes.push('update');
          mock.saved = payload;
          const filters = {};
          return {
            eq(column, value) { filters[column] = value; mock.updateFilters = { ...filters }; return this; },
            async select() {
              if (mock.updateMode === 'failure') return { data: null, error: { message: 'Synthetic update rejected' } };
              if (mock.updateMode === 'zero') return { data: [], error: null };
              const row = mock.plans.find(plan => plan.id === filters.id
                && (plan.teacher_id ?? mock.teacherId) === filters.teacher_id
                && (!filters.updated_at || plan.updated_at === filters.updated_at));
              if (!row) return { data: [], error: null };
              const updated = { ...row, ...payload, teacher_id: row.teacher_id ?? mock.teacherId };
              mock.plans = mock.plans.map(plan => plan.id === row.id ? updated : plan);
              return { data: [updated], error: null };
            },
          };
        },
        delete() { mock.writes.push('delete'); throw new Error('Unexpected write'); },
      };
    },
    storage: { from() { mock.writes.push('storage'); throw new Error('Unexpected storage operation'); } },
  },
}));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: vi.fn() }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));
vi.mock('../shared/TeacherFilePicker', () => ({ default: () => null }));

beforeEach(() => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
});

afterEach(() => {
  cleanup();
  mock.tables.length = 0;
  mock.writes.length = 0;
  mock.plans = [];
  mock.saved = null;
  mock.teacherId = 'synthetic-teacher';
  mock.updateMode = 'success';
  mock.updateFilters = {};
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('lesson plan PDF print workflow', () => {
  it('opens one-click blank Manual ILAW without changing saved plans or writing', async () => {
    mock.plans = [{ id: 'legacy-plan', title: 'Legacy science plan', subject: 'Science',
      objectives: '<p>Original legacy content</p>', status: 'draft', created_at: '2026-01-01T00:00:00Z' }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Create Manual ILAW Lesson Plan' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Quick Create lesson plan' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Legacy science plan' })).toBeTruthy();
    const readsBeforeOpen = mock.tables.length;
    fireEvent.click(screen.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }));
    expect(screen.getByText('Local QA only · Not saved to EduScribe · Use synthetic content')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Name of Lesson' }).value).toBe('');
    expect(screen.getByRole('button', { name: 'Save Incomplete Draft (local)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Lesson Plan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create mock snapshot|Post|Distribute|Check required fields/i })).toBeNull();
    expect(mock.tables).toHaveLength(readsBeforeOpen);
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }), { target: { value: 'Monday objective' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }), { target: { value: 'Tuesday objective' } });
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('Monday objective');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }).value).toBe('Tuesday objective');
    fireEvent.click(screen.getByRole('button', { name: '← Back to Lesson Plans' }));
    expect(screen.getByRole('dialog', { name: 'Confirm lesson plan action' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('Monday objective');
    fireEvent.click(screen.getByRole('button', { name: '← Back to Lesson Plans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume temporary draft' }));
    expect(screen.getByRole('textbox', { name: 'Learning Objectives, Monday' }).value).toBe('Monday objective');
    expect(mock.writes).toEqual([]);
  });

  it('passes the current editor content and editable PDF filename without saving', async () => {
    mock.plans = [{
      id: 'synthetic-plan', title: 'Fractions', subject: 'Mathematics',
      objectives: '<p>Safe original lesson content</p>', ai_generated: true,
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];

    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Fractions/i }));
    const filename = screen.getByRole('textbox', { name: 'Suggested PDF filename' });
    expect(filename.value).toBe('Fractions');
    fireEvent.change(filename, { target: { value: 'My Fractions.doc' } });
    const editor = screen.getByRole('textbox', { name: 'Lesson plan content' });
    editor.innerHTML = '<p>Edited lesson content</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => expect(openLessonPlanPrint).toHaveBeenCalledOnce());
    expect(openLessonPlanPrint).toHaveBeenCalledWith({
      html: '<p>Edited lesson content</p>',
      filename: 'My Fractions.pdf',
      aiGenerated: true,
    });
    expect(screen.getByRole('heading', { name: 'Fractions', level: 1 })).toBeTruthy();
    expect(mock.tables).toContain('lesson_plans');
    expect(mock.tables).not.toContain('teacher_subjects'); // the unsaved development sample needs no assignment read
    expect(mock.tables.every(table => table === 'lesson_plans')).toBe(true);
    expect(mock.writes).toEqual([]);
  });

  it('restores a filename after remount without changing the plan or making a write', async () => {
    mock.plans = [{
      id: 'synthetic-plan', title: 'Fractions', subject: 'Mathematics',
      objectives: '<p>Original lesson</p>', ai_generated: true,
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    const first = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Fractions/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Suggested PDF filename' }), {
      target: { value: 'ILAW_English_Grade7_Week1' },
    });
    first.unmount();

    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Fractions/i }));
    expect(screen.getByRole('textbox', { name: 'Suggested PDF filename' }).value).toBe('ILAW_English_Grade7_Week1');
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(openLessonPlanPrint).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'ILAW_English_Grade7_Week1.pdf', html: '<p>Original lesson</p>',
    })));
    expect(mock.writes).toEqual([]);
  });

  it('uses the default for another Teacher with the same saved plan ID', async () => {
    mock.plans = [{
      id: 'shared-plan-id', title: 'Fractions', subject: 'Mathematics',
      objectives: '<p>Original lesson</p>', ai_generated: false,
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    const first = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Fractions/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Suggested PDF filename' }), {
      target: { value: 'Teacher_A_Name' },
    });
    first.unmount();
    mock.teacherId = 'another-teacher';

    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Fractions/i }));
    expect(screen.getByRole('textbox', { name: 'Suggested PDF filename' }).value).toBe('Fractions');
    expect(mock.writes).toEqual([]);
  });

  it('renames one saved plan in one verified UPDATE and follows its title for PDF export', async () => {
    mock.plans = [
      { id: 'plan-one', teacher_id: mock.teacherId, title: '[G7] Filipino', objectives: '<p>Original HTML</p>',
        file_name: '[G7] Filipino.pdf', file_path: 'synthetic/source.pdf', file_url: 'https://example.invalid/source.pdf',
        updated_at: '2026-01-01T00:00:00Z', status: 'draft', created_at: '2026-01-01T00:00:00Z' },
      { id: 'plan-two', teacher_id: mock.teacherId, title: 'Other plan', objectives: '<p>Other HTML</p>',
        updated_at: '2026-01-01T00:00:00Z', status: 'draft', created_at: '2026-01-01T00:00:00Z' },
    ];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*\[G7\] Filipino/i }));
    expect(screen.getByRole('textbox', { name: 'Lesson Plan Title' }).value).toBe('[G7] Filipino');
    fireEvent.change(screen.getByRole('textbox', { name: 'Suggested PDF filename' }), { target: { value: 'Old custom' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title' }), { target: { value: '  Filipino 7 Lesson Plan  ' } });
    expect(mock.writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Filipino 7 Lesson Plan', level: 1 })).toBeTruthy());
    expect(mock.updateFilters).toEqual({ id: 'plan-one', teacher_id: mock.teacherId, updated_at: '2026-01-01T00:00:00Z' });
    expect(mock.saved.title).toBe('Filipino 7 Lesson Plan');
    expect(mock.saved.objectives).toBe('<p>Original HTML</p>');
    expect(mock.saved).not.toHaveProperty('file_name');
    expect(mock.saved).not.toHaveProperty('file_path');
    expect(mock.writes).toEqual(['update']);
    expect(mock.plans[0].file_path).toBe('synthetic/source.pdf');
    expect(mock.plans[1].title).toBe('Other plan');
    expect(screen.getByRole('textbox', { name: 'Suggested PDF filename' }).value).toBe('Filipino 7 Lesson Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(openLessonPlanPrint).toHaveBeenCalledWith(expect.objectContaining({ filename: 'Filipino 7 Lesson Plan.pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByRole('heading', { name: 'Filipino 7 Lesson Plan', level: 3 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /View and edit.*Filipino 7 Lesson Plan/i }));
    expect(screen.getByRole('textbox', { name: 'Lesson Plan Title' }).value).toBe('Filipino 7 Lesson Plan');
    expect(screen.getByRole('textbox', { name: 'Suggested PDF filename' }).value).toBe('Filipino 7 Lesson Plan');
  });

  it.each(['  ', 'A'.repeat(256)])('rejects invalid title draft %s before any update', async invalid => {
    mock.plans = [{ id: 'plan-one', title: 'Original', objectives: '<p>Lesson</p>', status: 'draft' }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Original/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title' }), { target: { value: invalid } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson Plan Title' }).getAttribute('aria-invalid')).toBe('true'));
    expect(mock.writes).toEqual([]);
  });

  it.each(['failure', 'zero'])('keeps the title and HTML drafts after a %s update', async mode => {
    mock.plans = [{ id: 'plan-one', title: 'Original', objectives: '<p>Original HTML</p>', status: 'draft' }];
    mock.updateMode = mode;
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Original/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title' }), { target: { value: 'New title' } });
    const editor = screen.getByRole('textbox', { name: 'Lesson plan content' });
    editor.innerHTML = '<p>Unsaved HTML</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('textbox', { name: 'Lesson Plan Title' }).value).toBe('New title');
    expect(editor.innerHTML).toBe('<p>Unsaved HTML</p>');
    expect(screen.getByRole('heading', { name: 'Original', level: 1 })).toBeTruthy();
    expect(mock.plans[0].title).toBe('Original');
  });

  it('frames the existing AI letterhead without duplicating or saving branding', async () => {
    mock.plans = [{
      id: 'synthetic-plan', title: 'Fractions', subject: 'Mathematics', ai_generated: true,
      objectives: '<div class="ilaw-lesson-plan"><div class="ilaw-letterhead"><p>Republic of the Philippines</p><p class="ilaw-school-name">Dela Paz National High School</p></div><h2 class="ilaw-title">Fractions</h2><p>Original AI activity</p></div>',
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    const { container } = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Fractions/i }));

    const editor = screen.getByRole('textbox', { name: 'Lesson plan content' });
    expect(container.querySelectorAll('.ilaw-letterhead')).toHaveLength(1);
    expect(container.textContent.match(/Dela Paz National High School/g)).toHaveLength(1);
    expect(editor.innerHTML).toContain('Original AI activity');
    expect(editor.style.getPropertyValue('--ilaw-deped-logo')).toContain('deped-logo.png');
    expect(editor.style.getPropertyValue('--ilaw-school-seal')).toContain('school-seal.png');
    expect(editor.style.getPropertyValue('--ilaw-eduscribe-logo')).toContain('eduscribe-logo.png');

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mock.writes).toEqual(['update']));
    expect(mock.saved.objectives).toContain('Original AI activity');
    expect(mock.saved.objectives).not.toContain('eduscribe-logo');
    expect(mock.saved.objectives).not.toContain('<img');
  });

  it('keeps truncated AI content editable and adds one complete header only when none exists', async () => {
    mock.plans = [{
      id: 'synthetic-plan', title: 'Partial plan', subject: 'Mathematics', ai_generated: true,
      objectives: '<div class="ilaw-lesson-plan"><h2>Partial output</h2><p>Monday objective',
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    const { container } = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Partial plan/i }));

    const editor = screen.getByRole('textbox', { name: 'Lesson plan content' });
    expect(editor.innerHTML).toContain('Monday objective');
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(container.querySelectorAll('.ilaw-template-letterhead')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'EduScribe logo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(openLessonPlanPrint).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('Monday objective'), aiGenerated: true,
    }));
    expect(mock.writes).toEqual([]);
  });

  it('does not repeat an unclassified legacy school name in an AI draft', async () => {
    mock.plans = [{
      id: 'unclassified-plan', title: 'Old AI plan', subject: 'Science', ai_generated: true,
      objectives: '<p>Dela Paz National High School</p><p>Original activity</p>',
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    const { container } = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Old AI plan/i }));
    expect(container.textContent.match(/Dela Paz National High School/g)).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'EduScribe logo' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Original activity');
    expect(mock.writes).toEqual([]);
  });

  it('keeps the uncontrolled editor mounted when its letterhead is edited away', async () => {
    mock.plans = [{
      id: 'synthetic-plan', title: 'Editable header', subject: 'Science', ai_generated: true,
      objectives: '<div class="ilaw-letterhead"><p>Dela Paz National High School</p></div><p>Keep this draft</p>',
      status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Editable header/i }));
    const editor = screen.getByRole('textbox', { name: 'Lesson plan content' });
    editor.querySelector('.ilaw-letterhead').remove();
    fireEvent.input(editor);
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' })).toBe(editor);
    expect(editor.innerHTML).toContain('Keep this draft');
    expect(mock.writes).toEqual([]);
  });

  it('leaves a legacy non-AI plan readable without adding branding', async () => {
    mock.plans = [{
      id: 'legacy-plan', title: 'Legacy', subject: 'Mathematics', ai_generated: false,
      objectives: '<p>Legacy lesson notes</p>', status: 'draft', created_at: '2026-01-01T00:00:00Z',
    }];
    const { container } = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /View and edit.*Legacy/i }));
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Legacy lesson notes');
    expect(container.querySelector('.ilaw-template-letterhead')).toBeNull();
    expect(mock.writes).toEqual([]);
  });
});
