// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    isStudent: () => true,
    userData: { uid: 'student-1', name: 'Sample Student', profile: {} },
    logout: logoutMock,
  }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({ darkMode: false, toggleDarkMode: vi.fn() }),
  DashboardThemeStyles: () => null,
}));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button>Notifications</button> }));
vi.mock('../../../components/FlippingLogo', () => ({ default: () => <span>Logo</span> }));
vi.mock('./StudentDataContext', () => ({ StudentDataProvider: ({ children }) => children }));
vi.mock('./tabs/OverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('./tabs/TasksTab', () => ({ default: () => <h1>Tasks content</h1> }));
vi.mock('./tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('./tabs/AnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('../../profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

import StudentDashboard from './StudentDashboard';

let originalOffsetParent;
let originalAnimationFrame;
beforeEach(() => {
  logoutMock.mockReset();
  originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentElement; },
  });
  originalAnimationFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
});
afterEach(() => {
  cleanup();
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
  else delete HTMLElement.prototype.offsetParent;
  window.requestAnimationFrame = originalAnimationFrame;
});

const renderShell = (path = '/student-dashboard/tasks') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/student-dashboard/*" element={<StudentDashboard />} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>
  </MemoryRouter>
);

describe('student shell navigation', () => {
  it('marks only the current page with aria-current', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Tasks' }).className).toContain('student-sidebar-link-active');
  });

  it('keeps mobile drawer focus inside until Escape closes it and restores focus', async () => {
    renderShell();
    const opener = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(opener.getAttribute('aria-expanded')).toBe('false');
    opener.focus();
    fireEvent.click(opener);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close navigation' }));
    expect(opener.closest('header').inert).toBe(true);
    expect(document.querySelector('main').inert).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(opener.closest('header').inert).toBe(false);
  });

  it('the visible Close button closes the drawer', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
  });
});

describe('student logout', () => {
  it('asks first; Cancel keeps the session and returns focus', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Logout' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    expect(dialog.textContent).toContain('Are you sure you want to log out of your account?');
    expect(logoutMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('Log out logs out once and goes to the login page', async () => {
    let finish;
    logoutMock.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    const confirm = screen.getByRole('button', { name: 'Log out' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Logging out');
    await act(async () => finish());
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy();
  });

  it('a failed logout stays on the page with an error', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    logoutMock.mockRejectedValueOnce(new Error('Synthetic logout rejection'));
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not log out');
    expect(screen.queryByRole('heading', { name: 'Login page' })).toBeNull();
    logged.mockRestore();
  });
});
