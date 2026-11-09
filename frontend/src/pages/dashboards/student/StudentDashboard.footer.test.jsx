// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('./tabs/ScoresTab', () => ({ default: () => <h1>Scores content</h1> }));
vi.mock('./tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('./tabs/AnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('../../profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

import StudentDashboard from './StudentDashboard';

afterEach(() => cleanup());

describe('student shell footer', () => {
  it('no longer shows a status line, and Logout still sits in the sidebar footer', () => {
    render(
      <MemoryRouter initialEntries={['/student-dashboard']}>
        <Routes><Route path="/student-dashboard/*" element={<StudentDashboard />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.queryByText('All systems online')).toBeNull();
    expect(document.querySelector('aside .bg-green-500')).toBeNull();
    const logout = screen.getByRole('button', { name: 'Logout' });
    expect(logout.closest('aside')).toBeTruthy();
    expect(logout.parentElement.className).toContain('border-t');
  });
});
