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

describe('Scores in the student navigation', () => {
  it('comes right after Tasks, opens /scores and is marked as the current page there', () => {
    render(
      <MemoryRouter initialEntries={['/student-dashboard/scores']}>
        <Routes><Route path="/student-dashboard/*" element={<StudentDashboard />} /></Routes>
      </MemoryRouter>
    );
    const labels = screen.getAllByRole('link').map(link => link.textContent);
    expect(labels.slice(labels.indexOf('Tasks'), labels.indexOf('Tasks') + 2)).toEqual(['Tasks', 'Scores']);
    expect(screen.getByRole('link', { name: 'Scores' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Scores' }).getAttribute('href')).toBe('/student-dashboard/scores');
    expect(screen.getByRole('heading', { name: 'Scores content' })).toBeTruthy();
  });
});
