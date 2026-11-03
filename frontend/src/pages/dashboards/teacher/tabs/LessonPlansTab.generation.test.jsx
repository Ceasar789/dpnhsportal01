// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';
import { createBlankIlawDocument, WEEKDAYS, WEEKLY_FIELDS } from '../ilaw/ilawTemplateModel';
import { serializeManualIlawV2 } from '../ilaw/manualIlawV2';

const mock = vi.hoisted(() => ({ uploads: [], urlRequests: [], writes: [], plans: [], uploadGate: null, uploadError: null, teacherId: 'synthetic-teacher', showToast: vi.fn(), session: { access_token: 'synthetic-token' } }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: mock.teacherId } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mock.session } }) },
  from(table) {
    if (table === 'teacher_subjects') return { select() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
    return { select() { return this; }, eq() { return this; }, order: async () => ({ data: table === 'lesson_plans' ? mock.plans : [], error: null }),
      insert() { mock.writes.push('insert'); throw new Error('Unexpected database write'); } };
  },
  storage: { from(bucket) {
    if (bucket !== 'lesson-pdfs') throw new Error('Unexpected bucket');
    return { upload: async (path) => { mock.uploads.push(path); await mock.uploadGate; return { error: mock.uploadError }; },
      getPublicUrl: path => { mock.urlRequests.push(path); return { data: { publicUrl: `https://synthetic.invalid/${path}` } }; } };
  } },
} }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: mock.showToast }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));

const choosePdf = () => {
  const file = new File(['%PDF-1.4 synthetic'], 'synthetic.pdf', { type: 'application/pdf' });
  fireEvent.change(document.querySelector('#lesson-pdf-upload'), { target: { files: [file] } });
  return file;
};

beforeEach(() => vi.stubEnv('VITE_AI_LESSON_PLAN_SAVE_ENABLED', '0'));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mock.uploads.length = 0;
  mock.urlRequests.length = 0;
  mock.writes.length = 0;
  mock.plans.length = 0;
  mock.uploadGate = null;
  mock.uploadError = null;
  mock.teacherId = 'synthetic-teacher';
  mock.session = { access_token: 'synthetic-token' };
  mock.showToast.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.removeItem('eduscribe-weekly-draft-job-v1');
});

const savedPlanId = 'c137877f-b729-4e7e-b258-c6cbb18cced1';
const jobId = '823ebbd4-1bfe-459c-97e6-0200e738a5cb';
const jobSummary = (status = 'QUEUED', completedBatches = 0) => ({ id: jobId, status,
  plannedCalls: 15, attemptedCalls: completedBatches, completedBatches, failureCategory: null });
const savedPlan = (manual = false) => {
  const row = { id: savedPlanId, teacher_id: mock.teacherId, status: 'draft',
    title: manual ? 'Cells' : 'Synthetic AI ILAW', subject: 'Science', grade_level: 'Grade 7',
    subject_id: null, academic_year: '2026-2027', ai_generated: !manual,
    objectives: '<h1>Monday to Friday ILAW</h1>' };
  if (manual) {
    const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7, A' });
    document.info.nameOfLesson = 'Cells';
    for (const [field] of WEEKLY_FIELDS) for (const day of WEEKDAYS)
      document.weekly[field][day] = `${field} ${day}`;
    row.objectives = serializeManualIlawV2({ kind: 'eduscribe.manual-ilaw', version: 2,
      teacherId: row.teacher_id, planId: row.id, title: row.title, workflowState: 'saved', document,
      assignment: { subjectId: 'synthetic-subject', subjectName: 'Science', gradeLevel: 'Grade 7',
        schoolYear: '2026-2027' },
      sourceDetails: { classDuration: '45 minutes', teachingStrategy: 'Inquiry',
        learningObjectives: 'Understand cells' } });
  }
  return row;
};
const jobClient = (overrides = {}) => ({ enabled: true,
  submit: vi.fn(async () => jobSummary()), status: vi.fn(async () => jobSummary()),
  cancel: vi.fn(async () => ({ id: jobId, status: 'CANCELED' })),
  result: vi.fn(async () => ({ kind: 'weekly-worksheet-collection', saved: false })),
  ...overrides });
const renderSavedJob = async (client, onCompletedWeeklyJobDraft = vi.fn(), manual = false) => {
  mock.plans.splice(0, mock.plans.length, savedPlan(manual));
  const view = render(<MemoryRouter><LessonPlansTab jobClient={client}
    onCompletedWeeklyJobDraft={onCompletedWeeklyJobDraft} onGeneratedDraft={vi.fn()} /></MemoryRouter>);
  const name = `Generate Worksheet from ${mock.plans[0].title}`;
  await screen.findByRole('button', { name });
  return { view, name, onCompletedWeeklyJobDraft };
};
const flushJob = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe('AI lesson plan generation with synthetic services', () => {
  it('cancels a pending upload and ignores its late result', async () => {
    let finishUpload;
    let finishRetryUpload;
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>New draft</p>', truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Uploading the source PDF...');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate lesson plan' }).disabled).toBe(false);
    mock.uploadGate = new Promise(resolve => { finishRetryUpload = resolve; });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(mock.uploads).toHaveLength(2));
    await act(async () => { finishUpload(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('textbox', { name: 'Lesson plan content' })).toBeNull();
    expect(screen.queryAllByRole('alert').every(alert => !alert.textContent.trim())).toBe(true);
    expect(screen.getByText('Uploading the source PDF...')).toBeTruthy();
    await act(async () => { finishRetryUpload(); });
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('New draft');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('cancels an AI request, aborts fetch, and clears the waiting and request timers', async () => {
    let requestSignal;
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      requestSignal = options.signal;
      return new Promise(() => {});
    }));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    for (let step = 0; step < 8 && !requestSignal; step += 1) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    expect(screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' })).toBeTruthy();
    expect(mock.uploads).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(requestSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryAllByRole('alert').every(alert => !alert.textContent.trim())).toBe(true);
    expect(mock.uploads).toHaveLength(0);
  });

  it.each([
    ['success', { ok: true, json: async () => ({ html: '<p>Late draft</p>', truncated: false }) }],
    ['failure', { ok: false, status: 502, json: async () => ({ error: 'Late provider error.' }) }],
  ])('ignores a late AI %s response after Cancel', async (_kind, response) => {
    let finishGeneration;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finishGeneration = resolve; })));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByRole('progressbar', { name: 'Generating ILAW lesson plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => { finishGeneration(response); });
    expect(screen.queryByRole('textbox', { name: 'Lesson plan content' })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate lesson plan' }).disabled).toBe(false);
    expect(screen.queryAllByRole('alert').every(alert => !alert.textContent.trim())).toBe(true);
    expect(mock.showToast).not.toHaveBeenCalled();
    expect(mock.uploads).toHaveLength(0);
  });

  it('lets a new attempt succeed while a canceled attempt finishes late', async () => {
    const pending = [];
    const fetchMock = vi.fn(() => new Promise(resolve => { pending.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByRole('progressbar', { name: 'Generating ILAW lesson plan' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => { pending[0]({ ok: true, json: async () => ({ html: '<p>Old draft</p>', truncated: false }) }); });
    expect(screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' })).toBeTruthy();
    expect(mock.uploads).toHaveLength(0);
    expect(screen.queryByRole('textbox', { name: 'Lesson plan content' })).toBeNull();
    await act(async () => { pending[1]({ ok: true, json: async () => ({ html: '<p>New draft</p>', truncated: false }) }); });
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('New draft');
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).not.toContain('Old draft');
    expect(mock.showToast).toHaveBeenCalledTimes(1);
  });

  it('rotates honest messages during a pending AI request and shows a long wait without a percentage', async () => {
    let finishGeneration;
    const fetchMock = vi.fn(() => new Promise(resolve => { finishGeneration = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    for (let step = 0; step < 8 && !finishGeneration; step += 1) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    const message = () => screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' }).previousElementSibling.textContent;
    expect(message()).toContain('Generating an editable ILAW lesson plan from your PDF.');
    act(() => vi.advanceTimersByTime(9000));
    expect(message()).toContain('Waiting for the lesson plan response. Please keep this page open.');
    for (let step = 0; step < 4; step += 1) act(() => vi.advanceTimersByTime(9000));
    expect(message()).toContain('Generating an editable ILAW lesson plan from your PDF.');
    for (let step = 0; step < 2; step += 1) act(() => vi.advanceTimersByTime(9000));
    expect(message()).toContain('This is taking longer than usual. The request is still pending.');
    expect(screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' }).hasAttribute('aria-valuenow')).toBe(false);
    expect(screen.queryByText(/%|minutes remaining/i)).toBeNull();
    expect(vi.getTimerCount()).toBe(1); // Only the existing request timeout remains.
    expect(mock.uploads).toHaveLength(0);
    await act(async () => { finishGeneration({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) }); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the wait timer after failure and starts messages from the beginning on explicit retry', async () => {
    const pending = [];
    const fetchMock = vi.fn(() => new Promise(resolve => { pending.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    for (let step = 0; step < 8 && fetchMock.mock.calls.length < 1; step += 1) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    const message = () => screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' }).previousElementSibling.textContent;
    act(() => vi.advanceTimersByTime(9000));
    expect(message()).toContain('Waiting for the lesson plan response.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { pending[0]({ ok: false, status: 502, json: async () => ({ error: 'Synthetic provider unavailable.' }) }); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' })); });
    for (let step = 0; step < 8 && fetchMock.mock.calls.length < 2; step += 1) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(message()).toContain('Generating an editable ILAW lesson plan from your PDF.');
    expect(mock.uploads).toHaveLength(0);
    await act(async () => { pending[1]({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) }); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(mock.uploads).toHaveLength(1);
  });

  it('clears the rotating message timer when the tab unmounts during a pending request', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    for (let step = 0; step < 8 && fetchMock.mock.calls.length < 1; step += 1) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    expect(vi.getTimerCount()).toBe(2);
    view.unmount();
    expect(vi.getTimerCount()).toBe(1); // The pre-existing request timeout remains until its own cleanup.
  });

  it('generates first, then uploads the source PDF before opening the draft', async () => {
    let finishUpload;
    let finishGeneration;
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finishGeneration = resolve; })));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Generating an editable ILAW lesson plan from your PDF.');
    expect(mock.uploads).toHaveLength(0);
    expect(screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' }).hasAttribute('aria-valuenow')).toBe(false);
    finishGeneration({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) });
    await screen.findByText('Uploading the source PDF...');
    expect(mock.uploads).toHaveLength(1);
    expect(screen.getByRole('progressbar', { name: 'Preparing PDF for lesson plan' }).hasAttribute('aria-valuenow')).toBe(false);
    expect(mock.urlRequests).toHaveLength(0);
    finishUpload();
    await screen.findByRole('textbox', { name: 'Lesson plan content' });
    expect(mock.urlRequests).toEqual(mock.uploads);
    expect(screen.getByText('synthetic.pdf')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('keeps a generated draft after upload failure and retries only the upload', async () => {
    mock.uploadError = new Error('Synthetic storage refusal');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>Retained draft</p><script>bad()</script>', truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText(/source PDF was not uploaded/);
    expect(screen.queryByRole('textbox', { name: 'Lesson plan content' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry source PDF upload' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open editable draft' })).toBeTruthy();
    expect(mock.uploads).toHaveLength(1);
    expect(mock.urlRequests).toHaveLength(0);
    mock.session = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry source PDF upload' }));
    await screen.findByText('Your session has expired. Sign in again and retry.');
    expect(mock.uploads).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    mock.session = { access_token: 'synthetic-token' };
    mock.uploadError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry source PDF upload' }));
    const editor = await screen.findByRole('textbox', { name: 'Lesson plan content' });
    expect(editor.innerHTML).toContain('Retained draft');
    expect(editor.innerHTML).not.toContain('<script>');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.uploads).toHaveLength(2);
    expect(mock.urlRequests).toEqual([mock.uploads[1]]);
    expect(screen.queryByText(/source PDF was not uploaded/)).toBeNull();
  });

  it('opens a retained draft with a persistent warning when the teacher skips the failed upload', async () => {
    mock.uploadError = new Error('Synthetic storage refusal');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>Editable without source</p>', truncated: false }) }));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText(/source PDF was not uploaded/);
    fireEvent.click(screen.getByRole('button', { name: 'Open editable draft' }));
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Editable without source');
    expect(screen.getByText(/source PDF was not uploaded/).closest('[role="alert"]')).toBeTruthy();
    expect(mock.urlRequests).toHaveLength(0);
  });

  it('does not upload when the AI request times out', async () => {
    const fetchMock = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    for (let step = 0; step < 8 && fetchMock.mock.calls.length < 1; step += 1) {
      await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(100000); });
    expect(screen.getByText(/request timed out/)).toBeTruthy();
    expect(mock.uploads).toHaveLength(0);
  });

  it('shows an indeterminate bar while generating and removes it on success', async () => {
    let finish;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Generating an editable ILAW lesson plan from your PDF.');
    const progress = screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' });
    expect(progress.hasAttribute('aria-valuenow')).toBe(false);
    finish({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) });
    await screen.findByRole('textbox', { name: 'Lesson plan content' });
    expect(screen.queryByRole('progressbar', { name: 'Generating ILAW lesson plan' })).toBeNull();
    expect(mock.writes).toEqual([]);
  });

  it('removes the generation bar and restores the retry action after a failed response', async () => {
    let finish;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByRole('progressbar', { name: 'Generating ILAW lesson plan' });
    finish({ ok: false, status: 502, json: async () => ({ error: 'Synthetic provider unavailable.' }) });
    await screen.findByText(/Synthetic provider unavailable/);
    expect(screen.queryByRole('progressbar', { name: 'Generating ILAW lesson plan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate lesson plan' }).disabled).toBe(false);
    expect(mock.writes).toEqual([]);
  });

  it('shows a successful first response only in the unsaved editor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>First response</p>', truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    expect(screen.getByText('Upload a PDF to generate an editable ILAW lesson plan. Generation creates a draft; it does not save the lesson plan.')).toBeTruthy();
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('First response'));
    expect(mock.uploads).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-token');
    expect(mock.showToast).toHaveBeenCalledWith('ILAW lesson plan generated. Review and edit the draft; the lesson plan has not been saved.', 'success');
    expect(mock.writes).toEqual([]);
  });

  it('keeps an HTTP failure visible and does not retry automatically', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Synthetic provider unavailable.' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByText(/Synthetic provider unavailable/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.uploads).toHaveLength(0);
    expect(mock.showToast).not.toHaveBeenCalled();
    expect(mock.writes).toEqual([]);
  });

  it('does not call the backend without a session', async () => {
    mock.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByText(/session has expired/)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.uploads).toHaveLength(0);
    expect(mock.showToast).not.toHaveBeenCalled();
    expect(mock.writes).toEqual([]);
  });

  it('retries AI after a transport failure and uploads only after success', async () => {
    let finishRetry;
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce(() => new Promise(resolve => { finishRetry = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    const generate = screen.getByRole('button', { name: 'Generate lesson plan' });
    fireEvent.click(generate);
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getByText(/Could not receive a response.*Failed to fetch/)).toBeTruthy());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.uploads).toHaveLength(0);
    expect(mock.showToast).not.toHaveBeenCalled();
    expect(mock.writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByRole('progressbar', { name: 'Generating ILAW lesson plan' });
    finishRetry({ ok: true, json: async () => ({ html: '<p>Synthetic ILAW plan</p>', truncated: false }) });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Synthetic ILAW plan'));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mock.uploads).toHaveLength(1);
    expect(mock.writes).toEqual([]);
  });

  it('uploads only the replacement PDF after the first AI request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ html: '<p>Replacement plan</p>', truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByText(/Could not receive a response.*Failed to fetch/)).toBeTruthy());
    const replacement = new File(['%PDF-1.4 different'], 'replacement.pdf', { type: 'application/pdf' });
    fireEvent.change(document.querySelector('#lesson-pdf-upload'), { target: { files: [replacement] } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Replacement plan'));
    expect(mock.uploads).toHaveLength(1);
    expect(mock.writes).toEqual([]);
  });
});

describe('saved-plan draft-only weekly job handoff', () => {
  it.each([false, true])('submits an owned saved %s plan with the selected count and no fixture or save', async manual => {
    const client = jobClient();
    const { name } = await renderSavedJob(client, vi.fn(), manual);
    fireEvent.change(screen.getByRole('combobox', { name: 'Questions per day' }), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    expect(client.submit).toHaveBeenCalledTimes(1);
    expect(client.submit.mock.calls[0][0]).toMatchObject({ sourceLessonPlanId: savedPlanId, questionCount: 40 });
    expect(client.submit.mock.calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mock.writes).toEqual([]);
    expect(mock.uploads).toEqual([]);
  });

  it('reuses an uncertain submit request ID only on an explicit retry', async () => {
    const client = jobClient({ submit: vi.fn()
      .mockRejectedValueOnce({ code: 'submit_unconfirmed' }).mockResolvedValueOnce(jobSummary()) });
    const { name } = await renderSavedJob(client);
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    expect(screen.getByText(/Could not confirm whether the job was submitted/)).toBeTruthy();
    expect(client.submit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same request' }));
    await flushJob();
    expect(client.submit).toHaveBeenCalledTimes(2);
    expect(client.submit.mock.calls[1][0]).toEqual(client.submit.mock.calls[0][0]);
    expect(screen.getByText(/0 of 15 batches validated/)).toBeTruthy();
    expect(Object.keys(JSON.parse(sessionStorage.getItem('eduscribe-weekly-draft-job-v1'))).sort())
      .toEqual(['jobId', 'planId', 'questionCount', 'requestId', 'teacherId']);
  });

  it('polls confirmed counts without an estimate and stops after closing the view', async () => {
    const client = jobClient({ status: vi.fn()
      .mockResolvedValueOnce(jobSummary('QUEUED'))
      .mockResolvedValueOnce(jobSummary('RUNNING', 2)) });
    const { name } = await renderSavedJob(client);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    expect(screen.getByText(/queued: 0 of 15 batches validated; 0 provider requests attempted/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(screen.getByText(/running: 2 of 15 batches validated; 2 provider requests attempted/)).toBeTruthy();
    expect(screen.queryByText(/%|minutes remaining|tokens used/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const calls = client.status.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(9000); });
    expect(client.status).toHaveBeenCalledTimes(calls);
  });

  it('reads a completed result and hands it off once without using the legacy callback', async () => {
    const handoff = vi.fn();
    const oldHandoff = vi.fn();
    const result = { kind: 'weekly-worksheet-collection', saved: false };
    const client = jobClient({ status: vi.fn(async () => jobSummary('COMPLETED', 15)),
      result: vi.fn(async () => result) });
    mock.plans.push(savedPlan());
    render(<MemoryRouter><LessonPlansTab jobClient={client} onCompletedWeeklyJobDraft={handoff}
      onGeneratedDraft={oldHandoff} /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: /Generate Worksheet from Synthetic AI ILAW/ });
    fireEvent.click(button);
    await flushJob();
    expect(client.result).toHaveBeenCalledTimes(1);
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(handoff).toHaveBeenCalledWith(jobId, result);
    expect(oldHandoff).not.toHaveBeenCalled();
    expect(mock.writes).toEqual([]);
  });

  it('confirms Cancel and never opens a draft', async () => {
    const handoff = vi.fn();
    const client = jobClient();
    const { name } = await renderSavedJob(client, handoff);
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
    await flushJob();
    expect(client.cancel).toHaveBeenCalledWith(jobId);
    expect(screen.getAllByRole('alert').some(alert => alert.textContent.includes('canceled'))).toBe(true);
    expect(client.result).not.toHaveBeenCalled();
    expect(handoff).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME'])(
    'follows a confirmed %s Cancel receipt to its actual terminal status', async status => {
      const handoff = vi.fn();
      const client = jobClient({
        cancel: vi.fn(async () => ({ id: jobId, status })),
        status: vi.fn().mockResolvedValueOnce(jobSummary()).mockResolvedValueOnce(jobSummary(status)),
      });
      const { name } = await renderSavedJob(client, handoff);
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      fireEvent.click(screen.getByRole('button', { name }));
      await flushJob();
      fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
      await flushJob();
      expect(screen.getByText('The job already ended. Checking its final status.')).toBeTruthy();
      expect(screen.queryByText(/Could not confirm cancellation/)).toBeNull();
      await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
      const expected = status === 'FAILED' ? /Weekly generation failed/ : /unknown outcome/;
      expect(screen.getAllByRole('alert').some(alert => expected.test(alert.textContent))).toBe(true);
      expect(client.result).not.toHaveBeenCalled();
      expect(handoff).not.toHaveBeenCalled();
    });

  it('keeps checking after an unconfirmed Cancel and reports a completion race', async () => {
    let finishResult;
    const handoff = vi.fn();
    const client = jobClient({ cancel: vi.fn(async () => { throw { code: 'cancel_unconfirmed' }; }),
      status: vi.fn().mockResolvedValueOnce(jobSummary()).mockResolvedValueOnce(jobSummary('COMPLETED', 15)),
      result: vi.fn(() => new Promise(resolve => { finishResult = resolve; })) });
    const { name } = await renderSavedJob(client, handoff);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
    await flushJob();
    expect(screen.getByText(/Could not confirm cancellation/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(client.result).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/completed before cancellation/)).toBeTruthy();
    await act(async () => finishResult({ kind: 'weekly-worksheet-collection', saved: false }));
    expect(handoff).toHaveBeenCalledTimes(1);
  });

  it('does not call a completed job canceled when completion wins the Cancel request', async () => {
    let finishResult;
    const handoff = vi.fn();
    const client = jobClient({ cancel: vi.fn(async () => ({ id: jobId, status: 'COMPLETED' })),
      status: vi.fn().mockResolvedValueOnce(jobSummary()).mockResolvedValueOnce(jobSummary('COMPLETED', 15)),
      result: vi.fn(() => new Promise(resolve => { finishResult = resolve; })) });
    const { name } = await renderSavedJob(client, handoff);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
    await flushJob();
    expect(screen.getByText(/completed before cancellation/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    await act(async () => finishResult({ kind: 'weekly-worksheet-collection', saved: false }));
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/generation was canceled/i)).toBeNull();
  });

  it('reports a changed source or expired job without opening a draft', async () => {
    const handoff = vi.fn();
    const client = jobClient({ submit: vi.fn(async () => { throw { code: 'source_changed' }; }) });
    const { name } = await renderSavedJob(client, handoff);
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    expect(screen.getByText(/saved lesson plan changed/)).toBeTruthy();
    expect(handoff).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    client.submit.mockResolvedValueOnce(jobSummary());
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    client.status.mockRejectedValueOnce({ code: 'not_found' });
    await act(async () => { vi.advanceTimersByTime(3000); await Promise.resolve(); });
    expect(screen.getByText(/unavailable or expired/)).toBeTruthy();
    expect(client.result).not.toHaveBeenCalled();
  });

  it('ignores an in-flight status response after unmount and clears its polling interval', async () => {
    let finishStatus;
    const handoff = vi.fn();
    const client = jobClient({ status: vi.fn(() => new Promise(resolve => { finishStatus = resolve; })) });
    const { name, view } = await renderSavedJob(client, handoff);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    const calls = client.status.mock.calls.length;
    view.unmount();
    await act(async () => { finishStatus(jobSummary('COMPLETED', 15));
      vi.advanceTimersByTime(9000); });
    expect(client.status).toHaveBeenCalledTimes(calls);
    expect(client.result).not.toHaveBeenCalled();
    expect(handoff).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'CANCELED', 'INTERRUPTED_UNKNOWN_OUTCOME'])(
    'does not open a draft for terminal %s', async status => {
      const handoff = vi.fn();
      const client = jobClient({ status: vi.fn(async () => jobSummary(status)) });
      const { name } = await renderSavedJob(client, handoff);
      fireEvent.click(screen.getByRole('button', { name }));
      await flushJob();
      expect(screen.getAllByRole('alert').some(alert => /failed|canceled|unknown outcome/i.test(alert.textContent))).toBe(true);
      expect(client.result).not.toHaveBeenCalled();
      expect(handoff).not.toHaveBeenCalled();
    });

  it('resumes a pending job after remount and verifies ownership through status before Cancel', async () => {
    const client = jobClient();
    const { name, view } = await renderSavedJob(client);
    fireEvent.click(screen.getByRole('button', { name }));
    await flushJob();
    view.unmount();
    const resumed = await renderSavedJob(client);
    fireEvent.click(screen.getByRole('button', { name: 'Resume weekly job' }));
    await flushJob();
    expect(client.status.mock.calls.length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole('button', { name: 'Request cancellation' }));
    await flushJob();
    expect(client.cancel).toHaveBeenCalledWith(jobId);
    resumed.view.unmount();
  });
});
