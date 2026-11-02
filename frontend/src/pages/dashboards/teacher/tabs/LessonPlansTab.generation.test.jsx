// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';

const mock = vi.hoisted(() => ({ uploads: [], writes: [], uploadGate: null, teacherId: 'synthetic-teacher', showToast: vi.fn(), session: { access_token: 'synthetic-token' } }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: mock.teacherId } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mock.session } }) },
  from(table) {
    if (table === 'teacher_subjects') return { select() { return this; }, eq() { return this; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
    return { select() { return this; }, eq() { return this; }, order: async () => ({ data: [], error: null }),
      insert() { mock.writes.push('insert'); throw new Error('Unexpected database write'); } };
  },
  storage: { from(bucket) {
    if (bucket !== 'lesson-pdfs') throw new Error('Unexpected bucket');
    return { upload: async (path) => { mock.uploads.push(path); await mock.uploadGate; return { error: null }; },
      getPublicUrl: path => ({ data: { publicUrl: `https://synthetic.invalid/${path}` } }) };
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
  mock.writes.length = 0;
  mock.uploadGate = null;
  mock.teacherId = 'synthetic-teacher';
  mock.session = { access_token: 'synthetic-token' };
  mock.showToast.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
    await screen.findByText('Uploading the PDF...');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Generate lesson plan' }).disabled).toBe(false);
    mock.uploadGate = new Promise(resolve => { finishRetryUpload = resolve; });
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(mock.uploads).toHaveLength(2));
    await act(async () => { finishUpload(); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Lesson plan content' })).toBeNull();
    expect(screen.queryAllByRole('alert').every(alert => !alert.textContent.trim())).toBe(true);
    expect(screen.getByText('Uploading the PDF...')).toBeTruthy();
    await act(async () => { finishRetryUpload(); });
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('New draft');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('cancels an AI request, aborts fetch, and clears the waiting and request timers', async () => {
    let finishUpload;
    let requestSignal;
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      requestSignal = options.signal;
      return new Promise(() => {});
    }));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Uploading the PDF...');
    vi.useFakeTimers();
    await act(async () => { finishUpload(); });
    expect(vi.getTimerCount()).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(requestSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryAllByRole('alert').every(alert => !alert.textContent.trim())).toBe(true);
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
    expect(screen.queryByRole('textbox', { name: 'Lesson plan content' })).toBeNull();
    await act(async () => { pending[1]({ ok: true, json: async () => ({ html: '<p>New draft</p>', truncated: false }) }); });
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('New draft');
    expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).not.toContain('Old draft');
    expect(mock.showToast).toHaveBeenCalledTimes(1);
  });

  it('rotates honest messages during a pending AI request and shows a long wait without a percentage', async () => {
    let finishUpload;
    let finishGeneration;
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finishGeneration = resolve; })));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Uploading the PDF...');
    vi.useFakeTimers();
    await act(async () => { finishUpload(); });
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
    await act(async () => { finishGeneration({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) }); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the wait timer after failure and starts messages from the beginning on explicit retry', async () => {
    let finishUpload;
    const pending = [];
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    const fetchMock = vi.fn(() => new Promise(resolve => { pending.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Uploading the PDF...');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    await act(async () => { finishUpload(); });
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
    expect(mock.uploads).toHaveLength(1);
    await act(async () => { pending[1]({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) }); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the rotating message timer when the tab unmounts during a pending request', async () => {
    let finishUpload;
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const view = render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Uploading the PDF...');
    vi.useFakeTimers();
    await act(async () => { finishUpload(); });
    expect(vi.getTimerCount()).toBe(2);
    view.unmount();
    expect(vi.getTimerCount()).toBe(1); // The pre-existing request timeout remains until its own cleanup.
  });

  it('shows the real upload state before AI generation, then clears progress when the draft opens', async () => {
    let finishUpload;
    let finishGeneration;
    mock.uploadGate = new Promise(resolve => { finishUpload = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finishGeneration = resolve; })));
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await screen.findByText('Uploading the PDF...');
    expect(screen.getByRole('progressbar', { name: 'Preparing PDF for lesson plan' }).hasAttribute('aria-valuenow')).toBe(false);
    finishUpload();
    await screen.findByText('Generating an editable ILAW lesson plan from your PDF.');
    expect(screen.getByRole('progressbar', { name: 'Generating ILAW lesson plan' }).hasAttribute('aria-valuenow')).toBe(false);
    finishGeneration({ ok: true, json: async () => ({ html: '<p>Editable draft</p>', truncated: false }) });
    await screen.findByRole('textbox', { name: 'Lesson plan content' });
    expect(screen.queryByRole('progressbar')).toBeNull();
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
    expect(mock.uploads).toHaveLength(1);
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

  it('reuses the uploaded PDF after a transport failure and an explicit retry', async () => {
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
    expect(mock.uploads).toHaveLength(1);
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

  it('uploads again when the teacher replaces the selected PDF after failure', async () => {
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
    expect(mock.uploads).toHaveLength(2);
    expect(mock.writes).toEqual([]);
  });
});
