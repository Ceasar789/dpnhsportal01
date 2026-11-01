// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import TeacherDashboard from './TeacherDashboard';

const { logoutMock, profileGuard, teacherState, weeklySaveMock, weeklyGate } = vi.hoisted(() => ({
  logoutMock: vi.fn(), profileGuard: { mode: 'clean', action: null }, teacherState: { uid: 'teacher-1' },
  weeklySaveMock: vi.fn(), weeklyGate: { enabled: false },
}));

vi.mock('./persistence/aiWeeklyWorksheetSaveClient', () => ({
  weeklyWorksheetSaveFlagEnabled: () => weeklyGate.enabled,
  saveAiWeeklyWorksheets: weeklySaveMock,
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    isTeacher: () => true,
    userData: { uid: teacherState.uid, name: 'Sample Teacher', profile: {} },
    logout: logoutMock,
  }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => {
    if (profileGuard.mode === 'clean') { go(); return true; }
    profileGuard.action = go;
    return false;
  } }),
}));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button>Notifications</button> }));
vi.mock('./tabs/OverviewTab', () => ({ default: () => <h2>Overview content</h2> }));
vi.mock('./tabs/StudentsTab', () => ({ default: () => <h1>Students content</h1> }));
vi.mock('./tabs/LessonPlansTab', () => ({ default: ({ onGeneratedDraft }) => <>
  <h1>Lesson plans content</h1>
  <button onClick={() => onGeneratedDraft({ draftId: 'synthetic-draft' })}>Open synthetic worksheet draft</button>
  <button onClick={() => onGeneratedDraft({ kind: 'weekly-worksheet-collection',
    collectionId: '11111111-1111-4111-8111-111111111111', teacherId: teacherState.uid,
    title: 'Synthetic week', worksheets: [{ day: 'Monday', title: 'Monday',
      questions: [{ question: 'Original question' }] }] })}>Hand off weekly collection</button>
</> }));
vi.mock('./tabs/WorksheetsTab', () => ({ default: ({ generatedDraft, weeklyCollections,
  weeklySaveStates, onRetryWeeklySave, onWeeklyCollectionChange }) => <>
  <h1>Worksheets content</h1>
  <p>{generatedDraft ? 'Private draft is visible' : 'No private draft'}</p>
  <p>Weekly collections: {weeklyCollections.length}</p>
  {weeklyCollections.map(collection => <section key={collection.collectionId}>
    <p>Weekly status: {weeklySaveStates[collection.collectionId]?.status || 'idle'}</p>
    <p>Weekly title: {collection.title}</p>
    <button onClick={() => onWeeklyCollectionChange(collection.collectionId, current => ({ ...current,
      worksheets: [{ ...current.worksheets[0], questions: [{ question: 'Edited question' }] }] }))}>Edit weekly</button>
    <button onClick={() => onRetryWeeklySave(collection, true)}>Retry weekly</button>
  </section>)}
</> }));
vi.mock('./tabs/GradesTab', () => ({ default: () => <h1>Grades content</h1> }));
vi.mock('./tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('./tabs/AnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('../../profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

describe('Teacher shell navigation', () => {
  let originalOffsetParent;
  let originalAnimationFrame;
  let originalCancelAnimationFrame;
  let originalScrollTo;
  let originalElementScrollTo;

  beforeEach(() => {
    teacherState.uid = 'teacher-1';
    logoutMock.mockReset();
    profileGuard.mode = 'clean';
    profileGuard.action = null;
    weeklyGate.enabled = false;
    weeklySaveMock.mockReset();
    originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() { return this.parentElement; },
    });
    originalAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalScrollTo = window.scrollTo;
    originalElementScrollTo = Element.prototype.scrollTo;
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
    window.scrollTo = vi.fn();
    Element.prototype.scrollTo = vi.fn(function (_left, top) {
      this.scrollTop = top;
      this.dispatchEvent(new window.Event('scroll'));
    });
  });

  afterEach(() => {
    cleanup();
    weeklyGate.enabled = false;
    if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
    else delete HTMLElement.prototype.offsetParent;
    window.requestAnimationFrame = originalAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.scrollTo = originalScrollTo;
    if (originalElementScrollTo) Element.prototype.scrollTo = originalElementScrollTo;
    else delete Element.prototype.scrollTo;
  });

  const HistoryControls = () => {
    const navigate = useNavigate();
    return <>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>;
  };

  const renderShell = () => render(
    <MemoryRouter initialEntries={['/teacher-dashboard']}>
      <HistoryControls />
      <Routes>
        <Route path="/teacher-dashboard/*" element={<TeacherDashboard />} />
        <Route path="/login" element={<h1>Login page</h1>} />
      </Routes>
    </MemoryRouter>
  );

  it('clears an in-memory worksheet draft when the authenticated Teacher changes', async () => {
    const Shell = () => <MemoryRouter initialEntries={['/teacher-dashboard/lesson-plans']}>
      <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
    </MemoryRouter>;
    const { rerender } = render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'Open synthetic worksheet draft' }));
    fireEvent.click(screen.getByRole('link', { name: 'Worksheets', exact: true }));
    expect(screen.getByText('Private draft is visible')).toBeTruthy();
    teacherState.uid = 'teacher-2';
    rerender(<Shell />);
    await waitFor(() => expect(screen.getByText('No private draft')).toBeTruthy());
  });

  it('auto-saves once, retains one collection, and blocks a second submit while pending', async () => {
    weeklyGate.enabled = true;
    let resolveSave;
    weeklySaveMock.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
    const Shell = () => <MemoryRouter initialEntries={['/teacher-dashboard/lesson-plans']}>
      <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
    </MemoryRouter>;
    render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'Hand off weekly collection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hand off weekly collection' }));
    expect(weeklySaveMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: 'Worksheets', exact: true }));
    expect(screen.getByText('Weekly collections: 1')).toBeTruthy();
    expect(weeklySaveMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry weekly' }));
    expect(weeklySaveMock).toHaveBeenCalledTimes(1);
    await act(async () => resolveSave({ status: 'saved', code: null, message: '',
      receipt: { collectionId: '22222222-2222-4222-8222-222222222222', worksheets: [] } }));
    expect(screen.getByText('Weekly status: saved')).toBeTruthy();
  });

  it('does not save on hand-off when the gate is disabled', () => {
    weeklyGate.enabled = false;
    render(<MemoryRouter initialEntries={['/teacher-dashboard/lesson-plans']}>
      <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Hand off weekly collection' }));
    fireEvent.click(screen.getByRole('link', { name: 'Worksheets', exact: true }));
    expect(weeklySaveMock).not.toHaveBeenCalled();
    expect(screen.getByText('Weekly status: idle')).toBeTruthy();
  });

  it.each(['unknown', 'persistence_failed'])('retries %s with the identical frozen collection', async outcome => {
    weeklyGate.enabled = true;
    weeklySaveMock.mockResolvedValueOnce({ status: outcome === 'unknown' ? 'unknown' : 'failed',
      code: outcome === 'unknown' ? null : outcome, message: 'Save unconfirmed.', receipt: null })
      .mockResolvedValueOnce({ status: 'saved', code: null, message: '', receipt: { collectionId: 'saved', worksheets: [] } });
    render(<MemoryRouter initialEntries={['/teacher-dashboard/lesson-plans']}>
      <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Hand off weekly collection' }));
    fireEvent.click(screen.getByRole('link', { name: 'Worksheets', exact: true }));
    await waitFor(() => expect(screen.getByText('Weekly status: unknown')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Edit weekly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry weekly' }));
    await waitFor(() => expect(weeklySaveMock).toHaveBeenCalledTimes(2));
    expect(JSON.stringify(weeklySaveMock.mock.calls[1][1])).toBe(JSON.stringify(weeklySaveMock.mock.calls[0][1]));
  });

  it('sends edited text under the same request ID after a known pre-write rejection', async () => {
    weeklyGate.enabled = true;
    weeklySaveMock.mockResolvedValueOnce({ status: 'failed', code: 'unsafe_markup',
      message: 'Remove < symbols or HTML tags.', receipt: null })
      .mockResolvedValueOnce({ status: 'saved', code: null, message: '', receipt: { collectionId: 'saved', worksheets: [] } });
    render(<MemoryRouter initialEntries={['/teacher-dashboard/lesson-plans']}>
      <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Hand off weekly collection' }));
    fireEvent.click(screen.getByRole('link', { name: 'Worksheets', exact: true }));
    await waitFor(() => expect(screen.getByText('Weekly status: failed')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Edit weekly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry weekly' }));
    await waitFor(() => expect(weeklySaveMock).toHaveBeenCalledTimes(2));
    expect(weeklySaveMock.mock.calls[1][1].requestId).toBe(weeklySaveMock.mock.calls[0][1].requestId);
    expect(weeklySaveMock.mock.calls[1][1].collection.worksheets[0].questions[0].question).toBe('Edited question');
  });

  it.each(['idempotency_conflict', 'invalid_state'])('blocks retry after %s', async code => {
    weeklyGate.enabled = true;
    weeklySaveMock.mockResolvedValue({ status: 'failed', code, message: 'Review collection.', receipt: null });
    render(<MemoryRouter initialEntries={['/teacher-dashboard/lesson-plans']}>
      <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
    </MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Hand off weekly collection' }));
    fireEvent.click(screen.getByRole('link', { name: 'Worksheets', exact: true }));
    await waitFor(() => expect(screen.getByText('Weekly status: blocked')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retry weekly' }));
    expect(weeklySaveMock).toHaveBeenCalledTimes(1);
  });

  it('uses the static logo and keeps mobile drawer focus inside until Escape restores it', async () => {
    renderShell();
    expect(screen.getByAltText('EduScribe').getAttribute('src')).toBe('/EduScribeLogoIcon.png');
    const opener = screen.getByRole('button', { name: 'Open navigation menu' });
    opener.focus();
    fireEvent.click(opener);
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    const close = screen.getByRole('button', { name: 'Close navigation' });
    expect(document.activeElement).toBe(close);
    expect(opener.closest('header').inert).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(opener.closest('header').inert).toBe(false);
  });

  it('resets the Teacher content scroller and focuses the destination heading', async () => {
    renderShell();
    const main = screen.getByRole('main');
    fireEvent.click(screen.getByRole('link', { name: 'Students' }));
    const heading = await screen.findByRole('heading', { name: 'Students content' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(main.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(screen.getByRole('link', { name: 'Students' }).getAttribute('aria-current')).toBe('page');
  });

  it('restores per-entry scroll on Back and Forward without focusing a heading at the top', async () => {
    renderShell();
    const main = screen.getByRole('main');
    main.scrollTop = 200;
    fireEvent.scroll(main);

    fireEvent.click(screen.getByRole('link', { name: 'Students' }));
    await waitFor(() => expect(main.scrollTop).toBe(0));
    main.scrollTop = 120;
    fireEvent.scroll(main);

    fireEvent.click(screen.getByRole('link', { name: 'Lesson Plans' }));
    await waitFor(() => expect(main.scrollTop).toBe(0));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(main.scrollTop).toBe(120));
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Students content' }));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(main.scrollTop).toBe(200));
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    await waitFor(() => expect(main.scrollTop).toBe(120));
  });

  it('provides a focusable destination heading for the shared Profile screen', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle profile menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Profile Settings' }));
    const heading = await screen.findByRole('heading', { name: 'Profile Settings' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('opens an accessible logout confirmation and Cancel preserves the session and focus', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Logout' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialog.textContent).toContain('Are you sure you want to log out of your account?');
    expect(logoutMock).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('closes with Escape, then confirms exactly once while pending', async () => {
    let finish;
    logoutMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    const confirm = screen.getByRole('button', { name: 'Log out' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Logging out');
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Close Log out of EduScribe?' }).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Log out of EduScribe?' })).toBeTruthy();
    await act(async () => finish());
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy();
  });

  it('keeps an unexpected rejected logout recoverable without navigating', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    logoutMock.mockRejectedValueOnce(new Error('Synthetic logout rejection'));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not log out');
    expect(screen.queryByRole('heading', { name: 'Login page' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    logged.mockRestore();
  });

  it('defers dirty and pending Profile navigation to the existing guard', async () => {
    profileGuard.mode = 'dirty';
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(profileGuard.action).toBeTypeOf('function');
    expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull();
    expect(logoutMock).not.toHaveBeenCalled();
    act(() => profileGuard.action());
    expect(screen.getByRole('dialog', { name: 'Log out of EduScribe?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull());
    profileGuard.mode = 'pending';
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull();
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
