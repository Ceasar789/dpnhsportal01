// @vitest-environment jsdom
// G11b #2 and #20 (student, phone width). Logout from the drawer: the drawer
// steps aside while the dialog is open and comes back when it closes. Escape
// closes only the dialog (one layer), Tab stays inside it, and afterwards
// focus is back inside the reopened drawer, never lost behind it.
// The skip link is the first focusable element and moves focus to <main>.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isStudent: () => true, userData: { uid: 'student-1', name: 'Sample Student', profile: {} }, logout: h.logout }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; }, registerProfileGuard: () => () => {} }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false })); // phone: the drawer layout
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../styles/dashboardTheme', () => ({ useDashboardTheme: () => ({ darkMode: false, toggleDarkMode: () => {} }), DashboardThemeStyles: () => null }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => ({ default: (await import('react')).createContext(null), StudentDataProvider: ({ children }) => children, useStudentData: () => ({ graph: null, loading: false, refresh: null }) }));
vi.mock('../../../pages/dashboards/student/tabs/OverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('./OverviewTabSwitch', () => ({ default: () => <h1>Overview content</h1> }));

import StudentDashboard from '../../../pages/dashboards/student/StudentDashboard';

const renderShell = () => render(
  <MemoryRouter initialEntries={['/student-dashboard?clarity=1']}>
    <Routes><Route path="/student-dashboard/*" element={<StudentDashboard />} /></Routes>
  </MemoryRouter>,
);
const drawer = () => document.querySelector('.x-side');

let saved;
beforeEach(() => {
  saved = { raf: window.requestAnimationFrame, offsetParent: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent') };
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
  window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
  window.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  window.requestAnimationFrame = saved.raf;
  if (saved.offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', saved.offsetParent);
  else delete HTMLElement.prototype.offsetParent;
});

describe('student shell at phone width: dialog over the drawer', () => {
  it('Escape closes only the logout dialog; the drawer is open again and holds focus', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /Open navigation/ }));
    expect(drawer().className).toContain('open');
    const logout = screen.getByRole('button', { name: 'Logout' });
    logout.focus();
    fireEvent.click(logout);
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull();
    expect(drawer().className).toContain('open');
    await waitFor(() => expect(drawer().contains(document.activeElement)).toBe(true));

    // With the dialog gone, Escape is the drawer's again.
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(drawer().className).not.toContain('open');
  });

  it('Tab from the last button wraps to the first button inside the dialog (not into the drawer)', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: /Open navigation/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.at(-1).focus();
    fireEvent.keyDown(buttons.at(-1), { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('skip link (#20)', () => {
  it('is the first focusable element, targets the main landmark, and moves focus there', () => {
    const { container } = renderShell();
    const first = container.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    expect(first.textContent).toBe('Skip to content');
    expect(first.className).toBe('x-skip');
    expect(first.getAttribute('href')).toBe('#x-main');
    const main = screen.getByRole('main');
    expect(main.id).toBe('x-main');
    expect(main.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(first);
    expect(document.activeElement).toBe(main);
  });
});
