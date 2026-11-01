// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LessonPlansTab from './LessonPlansTab';

const mock = vi.hoisted(() => ({ uploads: [], writes: [], teacherId: 'synthetic-teacher', showToast: vi.fn(), session: { access_token: 'synthetic-token' } }));

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
    return { upload: async (path) => { mock.uploads.push(path); return { error: null }; },
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
  mock.uploads.length = 0;
  mock.writes.length = 0;
  mock.teacherId = 'synthetic-teacher';
  mock.session = { access_token: 'synthetic-token' };
  mock.showToast.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('AI lesson plan generation with synthetic services', () => {
  it('shows a successful first response only in the unsaved editor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<p>First response</p>', truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('First response'));
    expect(mock.uploads).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-token');
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
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ html: '<p>Synthetic ILAW plan</p>', truncated: false }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MemoryRouter><LessonPlansTab /></MemoryRouter>);
    choosePdf();
    const generate = screen.getByRole('button', { name: 'Generate lesson plan' });
    fireEvent.click(generate);
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getByText(/Could not receive a response.*Failed to fetch/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.uploads).toHaveLength(1);
    expect(mock.showToast).not.toHaveBeenCalled();
    expect(mock.writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Generate lesson plan' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Lesson plan content' }).innerHTML).toContain('Synthetic ILAW plan'));
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
