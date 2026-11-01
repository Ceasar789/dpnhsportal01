// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';
import AiPlanSaveAction from '../persistence/AiPlanSaveAction';
import { aiLessonPlanSaveFlagEnabled, loadAiSaveAvailability, saveAiLessonPlan } from '../persistence/aiLessonPlanSaveClient';

const mock = vi.hoisted(() => ({ writes: [], session: { access_token: 'synthetic-token' } }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'synthetic-teacher' } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mock.session } }) },
  from() { return { select() { return this; }, eq() { return this; }, order: async () => ({ data: [], error: null }),
    insert() { mock.writes.push('insert'); throw new Error('Unexpected lesson plan insert'); } }; },
  storage: { from() { return { upload: async () => ({ error: null }),
    getPublicUrl: () => ({ data: { publicUrl: 'https://synthetic.invalid/source.pdf' } }) }; } },
} }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: vi.fn() }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));

afterEach(() => {
  cleanup();
  mock.writes.length = 0;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const generate = () => {
  render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
  const file = new File(['%PDF-1.4 synthetic'], 'synthetic.pdf', { type: 'application/pdf' });
  fireEvent.change(document.querySelector('#lesson-pdf-upload'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
};

it('keeps Save Plan disabled for a newly generated AI draft without inserting a row', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '0');
  const fetchMock = vi.fn().mockResolvedValue({ ok: true,
    json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) });
  vi.stubGlobal('fetch', fetchMock);
  generate();

  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML)
    .toContain('Synthetic ILAW draft'));
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
  expect(screen.getByText(/Permanent AI Lesson Plan save is unavailable until the local trusted writer is enabled/)).toBeTruthy();
  expect(mock.writes).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('uses production availability wording without enabling Save Plan', async () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '0');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true,
    json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) }));
  generate();
  await screen.findByRole('textbox', { name: 'Lesson plan content' });
  expect(screen.getByText('Permanent AI Lesson Plan save is unavailable. Your generated draft remains editable on this page.')).toBeTruthy();
  expect(screen.queryByText(/local trusted writer/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
  expect(mock.writes).toEqual([]);
});

it('saves a generated HTML draft with one click and no assignment', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/ai/lesson-plan')) return { ok: true,
      json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ enabled: true }) };
    return { ok: true, json: async () => ({ ok: true, durable: true, record: {
      id: '22222222-2222-4222-8222-222222222222', title: 'synthetic',
      teacher_id: 'synthetic-teacher', subject_id: null,
      subject: null, grade_level: null, academic_year: null,
      objectives: '<p>Synthetic ILAW draft</p>', ai_generated: true, status: 'draft',
      file_url: null, file_name: null, file_path: null, updated_at: '2026-01-01T00:00:00Z',
    } }) };
  }));
  generate();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(false));
  expect(screen.queryByLabelText('Teaching assignment')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save Plan' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy());
  const save = calls.find(call => call.url.endsWith('/api/lesson-plans/ai-save') && call.options.method === 'POST');
  expect(JSON.parse(save.options.body)).toMatchObject({ title: 'synthetic',
    html: '<p>Synthetic ILAW draft</p>' });
  expect(save.options.body).not.toContain('assignment');
  expect(save.options.body).not.toContain('teacher_id');
  expect(save.options.body).not.toContain('file_url');
  expect(mock.writes).toEqual([]);
});

it('keeps the unsaved draft and exposes a safe error when Save fails', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url.endsWith('/api/ai/lesson-plan')) return { ok: true,
      json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ enabled: true }) };
    return { ok: false, json: async () => ({ error: 'The current academic year is unavailable.' }) };
  }));
  generate();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Save Plan' }));
  await waitFor(() => expect(screen.getByText(/current academic year is unavailable/)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Save Plan' })).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Synthetic ILAW draft');
  expect(mock.writes).toEqual([]);
});

it('does not need a teaching assignment to enable Save Plan', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url.endsWith('/api/ai/lesson-plan')) return { ok: true,
      json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ enabled: true }) };
    throw new Error('Unexpected Save request');
  }));
  generate();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(false));
  expect(screen.queryByLabelText('Teaching assignment')).toBeNull();
});

it('requires a title even when the local Save route is available', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })));
  const props = { apiBase: 'http://localhost:3001', content: '<p>Draft</p>', busy: false, onSave: vi.fn() };
  const { rerender } = render(<AiPlanSaveAction {...props} title="" />);
  await screen.findByText('Review your draft, then choose Save Plan to store it as a private draft.');
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
  rerender(<AiPlanSaveAction {...props} title="[G7] English" />);
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(false);
});

it('keeps Save Plan disabled when the local route is off even with the UI flag on', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url.endsWith('/api/ai/lesson-plan')) return { ok: true,
      json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) };
    if (options.method === 'GET') return { ok: false, status: 503,
      json: async () => ({ error: 'Permanent Save is unavailable.' }) };
    throw new Error('Unexpected Save request');
  }));
  generate();
  await waitFor(() => expect(screen.getByText(/Permanent AI Lesson Plan save is unavailable\. Your draft remains editable/)).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
});

it('keeps production Save Plan off by default and permits only its exact production flag', () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '0');
  expect(aiLessonPlanSaveFlagEnabled()).toBe(false);
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', 'true');
  expect(aiLessonPlanSaveFlagEnabled()).toBe(false);
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '1');
  expect(aiLessonPlanSaveFlagEnabled()).toBe(true);
});

it('keeps the production button disabled until the backend confirms availability', async () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '0');
  const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Unavailable' }) }));
  vi.stubGlobal('fetch', fetchMock);
  const props = { apiBase: '', content: '<p>Draft</p>', title: 'Synthetic', busy: false, onSave: vi.fn() };
  const { unmount } = render(<AiPlanSaveAction {...props} />);
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  unmount();
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '1');
  render(<AiPlanSaveAction {...props} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await screen.findByText('Permanent AI Lesson Plan save is unavailable. Your draft remains editable.');
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
});

it('describes explicit saving only after production availability is confirmed', async () => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '1');
  let confirmAvailability;
  const fetchMock = vi.fn(() => new Promise(resolve => { confirmAvailability = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  render(<AiPlanSaveAction apiBase="" content="<p>Draft</p>" title="Synthetic" busy={false} onSave={vi.fn()} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  expect(screen.getByText('Checking permanent Save availability...')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
  confirmAvailability({ ok: true, json: async () => ({ enabled: true }) });
  await screen.findByText('Review your draft, then choose Save Plan to store it as a private draft.');
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('treats a lost save response as uncertain without retrying', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('Synthetic network failure'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(saveAiLessonPlan('', { requestId: 'synthetic', title: 'Synthetic', html: '<p>Draft</p>' }))
    .rejects.toThrow(/Could not confirm whether the lesson plan was saved/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('POST');
});

it('reports a failed availability GET without suggesting a save occurred', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('Synthetic network failure'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(loadAiSaveAvailability('')).rejects.toThrow('Could not check Save Plan availability. Your draft remains open.');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});

it('keeps Save Plan unavailable after an availability network failure', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  const fetchMock = vi.fn().mockRejectedValue(new Error('Synthetic network failure'));
  vi.stubGlobal('fetch', fetchMock);
  render(<AiPlanSaveAction apiBase="" content="<p>Draft</p>" title="Synthetic" busy={false} onSave={vi.fn()} />);
  await screen.findByText('Permanent AI Lesson Plan save is unavailable. Your draft remains editable.');
  expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(true);
  expect(fetchMock.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
});

it('keeps the editable draft when a successful HTTP response lacks a save receipt', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith('/api/ai/lesson-plan')) return { ok: true,
      json: async () => ({ html: '<p>Synthetic ILAW draft</p>', truncated: false }) };
    if (options.method === 'GET') return { ok: true, json: async () => ({ enabled: true }) };
    return { ok: true, json: async () => ({ ok: true }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  generate();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Plan' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Save Plan' }));
  await screen.findByText(/The save could not be confirmed/);
  expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML)
    .toContain('Synthetic ILAW draft');
  expect(fetchMock.mock.calls.filter(([url, options]) => url.endsWith('/api/lesson-plans/ai-save')
    && options.method === 'POST')).toHaveLength(1);
});

it('does not dispatch a second Save Plan click while the first is pending', async () => {
  vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '1');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })));
  let finish;
  const onSave = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  render(<AiPlanSaveAction apiBase="" content="<p>Draft</p>" title="Synthetic" busy={false} onSave={onSave} />);
  const button = screen.getByRole('button', { name: 'Save Plan' });
  await waitFor(() => expect(button.disabled).toBe(false));
  fireEvent.click(button);
  fireEvent.click(button);
  expect(onSave).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(button.disabled).toBe(false));
});
