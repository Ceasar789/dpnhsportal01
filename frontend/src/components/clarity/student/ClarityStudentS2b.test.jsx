// @vitest-environment jsdom
// Clarity S2b: the classic student Tasks tab in the final design's layout
// (Student PDF p2) by scoped CSS only. The real StudentDashboard: the classic
// TasksTab still renders, inside one wrapper class; ?clarity=0 has no wrapper.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isStudent: () => true, userData: { uid: 'student-1', name: 'Sample Student', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; }, registerProfileGuard: () => () => {} }),
}));
vi.mock('../../../styles/dashboardTheme', () => ({ useDashboardTheme: () => ({ darkMode: false, toggleDarkMode: vi.fn() }), DashboardThemeStyles: () => null }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../components/FlippingLogo', () => ({ default: () => <span>Logo</span> }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => ({
  default: (await import('react')).createContext(null),
  StudentDataProvider: ({ children }) => children, useStudentData: () => ({ graph: null, loading: false, refresh: null }),
}));
vi.mock('../../../pages/dashboards/student/tabs/OverviewTab', () => ({ default: () => <h1>Overview content</h1> }));
vi.mock('../../../pages/dashboards/student/tabs/TasksTab', () => ({ default: () => <div className="p-6"><header><h1>Tasks</h1></header></div> }));
vi.mock('../../../pages/dashboards/student/tabs/ScoresTab', () => ({ default: () => <h1>Scores content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

import StudentDashboard from '../../../pages/dashboards/student/StudentDashboard';

const SCOPE = ['theme', 'clarity'].join('-');
const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/student-dashboard/*" element={<StudentDashboard />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); document.documentElement.classList.remove(SCOPE); });

describe('the classic Tasks tab inside the Clarity shell, restyled', () => {
  it('the classic component renders inside main, wrapped in x-stk (the URL view parameter is kept)', () => {
    renderAt('/student-dashboard/tasks?view=done');
    const h1 = screen.getByRole('heading', { level: 1, name: 'Tasks' });
    const wrap = h1.closest('.x-stk');
    expect(wrap).toBeTruthy();
    expect(wrap.parentElement.matches('main.x-content')).toBe(true);
    expect(wrap.querySelector('.page-transition > .p-6')).toBeTruthy();
  });

  it('other classic routes are not wrapped', () => {
    const { container } = renderAt('/student-dashboard/scores?clarity=1');
    expect(container.querySelector('.x-stk')).toBeNull();
  });

  it('?clarity=0: the classic shell, no Clarity markup, no wrapper', () => {
    const { container } = renderAt('/student-dashboard/tasks?clarity=0');
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeTruthy();
    expect(container.querySelector('.x-app, .x-stk')).toBeNull();
  });
});

describe('the scoped rules (Student PDF p2): layout and type only', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const T = `html.${['theme', 'clarity'].join('-')} .x-stk > .page-transition > div`;
  const block = css.slice(css.indexOf('/* S2b:'), css.indexOf('/* S2a:'));
  it('no double inset; the design title size; 40px filter tabs; roomier task cards with 16px titles', () => {
    expect(block).toContain(`${T} { padding: 0; }`);
    expect(block).toContain(`${T} > header h1 { font-size: 26px; font-weight: 700;`);
    expect(block).toContain(`${T} [aria-label="Filter tasks"] > button { min-height: 40px; padding: 0 20px; font-size: 14px; }`);
    expect(block).toContain(`${T} > .space-y-3 > .rounded-xl { padding: 18px 24px; gap: 16px; }`);
    expect(block).toContain(`${T} > .space-y-3 > .rounded-xl > .min-w-0 > div:first-child > p { font-size: 16px; font-weight: 600; }`);
  });
  it('sets no colour, background, border or display:none (the classic inline colours stay)', () => {
    expect(block).not.toMatch(/color:|background|border|display: none/);
  });
});
