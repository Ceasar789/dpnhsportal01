// @vitest-environment jsdom
// Clarity G4: Teacher Lesson Plans and Worksheets in the final design's layout
// by scoped CSS only. The real TeacherDashboard, Supabase mocked: the classic
// tab components still render (with the same props from TeacherDashboard)
// inside the classic wrapper, which gets one more class; ?clarity=0 is the
// classic shell with neither class.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const seen = vi.hoisted(() => ({ lesson: null, worksheets: null }));
vi.mock('../../../config/supabase', () => {
  const query = () => {
    const q = new Proxy({}, {
      get: (_, prop) => prop === 'then'
        ? (res, rej) => Promise.resolve({ data: [], count: 0, error: null }).then(res, rej)
        : () => q,
    });
    return q;
  };
  return { supabase: { from: () => query() } };
});
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: (fn) => fn() }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isTeacher: () => true, userData: { uid: 'teacher-1', name: 'Sample Teacher', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: () => <button>Notifications</button> }));
vi.mock('../../../pages/dashboards/teacher/tabs/LessonPlansTab', () => ({
  default: (props) => { seen.lesson = props; return <div><header><h1>Lesson Plans</h1></header></div>; },
}));
vi.mock('../../../pages/dashboards/teacher/tabs/WorksheetsTab', () => ({
  default: (props) => { seen.worksheets = props; return <div><h1>Worksheets</h1></div>; },
}));
vi.mock('../../../pages/dashboards/teacher/tabs/GradesTab', () => ({ default: () => <h1>Grades content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

import TeacherDashboard from '../../../pages/dashboards/teacher/TeacherDashboard';

const SCOPE = ['theme', 'clarity'].join('-');
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/teacher-dashboard/*" element={<TeacherDashboard />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => { window.localStorage.clear(); seen.lesson = null; seen.worksheets = null; });
afterEach(() => { cleanup(); window.localStorage.clear(); document.documentElement.classList.remove(SCOPE); });

describe('the classic tabs inside the Clarity shell, restyled', () => {
  it.each([
    ['/teacher-dashboard/lesson-plans', 'Lesson Plans', 'x-tlp', 'x-tws'],
    ['/teacher-dashboard/worksheets', 'Worksheets', 'x-tws', 'x-tlp'],
  ])('%s: the classic component in the classic wrapper, plus its layout class', async (path, heading, mine, other) => {
    const { container } = renderAt(path);
    const h1 = await screen.findByRole('heading', { level: 1, name: heading });
    const wrap = h1.closest('.x-tch-classic');
    expect(wrap.className).toBe(`dashboard-shell teacher-dashboard-shell x-tch-classic ${mine}`);
    expect(wrap.parentElement.matches('main.x-content')).toBe(true);
    expect(container.querySelector(`.${other}`)).toBeNull();
  });

  it('the classic components still receive the shared draft props from TeacherDashboard', async () => {
    renderAt('/teacher-dashboard/lesson-plans');
    await screen.findByRole('heading', { level: 1, name: 'Lesson Plans' });
    expect(typeof seen.lesson.onGeneratedDraft).toBe('function');
    expect(typeof seen.lesson.onCompletedWeeklyJobDraft).toBe('function');
    cleanup();
    renderAt('/teacher-dashboard/worksheets');
    await screen.findByRole('heading', { level: 1, name: 'Worksheets' });
    expect(typeof seen.worksheets.onGeneratedDraftChange).toBe('function');
    expect(typeof seen.worksheets.onDiscardGeneratedDraft).toBe('function');
  });

  it('other classic routes keep the plain classic wrapper', async () => {
    renderAt('/teacher-dashboard/profile');
    const profile = await screen.findByText('Profile content');
    expect(profile.closest('.x-tch-classic').className).toBe('dashboard-shell teacher-dashboard-shell x-tch-classic');
  });

  it.each([['/teacher-dashboard/lesson-plans?clarity=0', 'Lesson Plans'], ['/teacher-dashboard/worksheets?clarity=0', 'Worksheets']])(
    '%s: the classic shell, no Clarity markup and no layout class', async (path, heading) => {
      const { container } = renderAt(path);
      await screen.findByRole('heading', { level: 1, name: heading });
      expect(container.querySelector('.x-app, .x-tlp, .x-tws, .x-tch-classic')).toBeNull();
      expect(container.querySelector('.teacher-dashboard-shell')).toBeTruthy();
    });
});

describe('the scoped layout rules (Teacher PDF p3, p4)', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  const LIST = `${P}.x-tlp div:has(> section[aria-labelledby="saved-plans-heading"])`;
  it('no double inset: the classic body padding is removed; titles at the design size', () => {
    expect(css).toContain(`${P}.x-tlp > .page-transition > div, ${P}.x-tws > .page-transition > div { padding: 0; }`);
    expect(css).toContain(`${P}.x-tlp > .page-transition > div > header h1, ${P}.x-tws > .page-transition > div h1 { font-size: 26px;`);
  });
  it('Lesson Plans: the AI and Manual cards on the left, the saved list on the right; one column below 1100px', () => {
    expect(css).toContain(`${LIST} { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);`);
    expect(css).toContain(`${LIST} > section[aria-labelledby="saved-plans-heading"] { grid-column: 2; grid-row: 1 / span 2; }`);
    const media = css.slice(css.indexOf('@media (max-width: 1099.98px) {\n  ' + LIST));
    expect(media.split('\n}')[0]).toContain(`${LIST} { grid-template-columns: minmax(0, 1fr); }`);
  });
  it('only layout and type: no colour, background or display:none on anything but the decorative upload icon', () => {
    const block = css.slice(css.indexOf('/* G4:'), css.indexOf('/* ---------- Sidebar stays put'));
    expect(block).not.toMatch(/color:|background/);
    expect(block.match(/display: none/g)).toHaveLength(1);
    expect(block).toContain('> :first-child > .w-12.h-12 { display: none; }');
  });
});
