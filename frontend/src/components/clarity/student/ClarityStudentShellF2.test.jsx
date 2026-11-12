// @vitest-environment jsdom
// Clarity F2 (Student shell, final design): seal logo, no preview wording,
// no MENU label, footer user card with the same logout handler, the Tasks
// count badge from the real pending number, and a plain bell.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, loading: false, logout: vi.fn() }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 's1', name: 'Juan Dela Cruz', role: 'student', profile: {} }, logout: state.logout }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../pages/dashboards/student/hooks', () => ({ useTheme: () => ({ dark: false, toggleDark: vi.fn() }) }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../NotificationBell', () => ({ default: () => <div className="notification-bell"><button type="button" className="notification-bell-button" aria-label="Notifications" /></div> }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: state.loading }),
}));

import ClarityStudentLayout from './ClarityStudentLayout';

const quiz = id => ({ id, title: `Task ${id}`, subject_id: 'eng', task_type: 'quiz', items: 5, instructions: 'A.' });
// pending: assigned quizzes with no submission (the Overview's rule).
const graphOf = ({ pending = 0, done = 0, sections = { name: 'Mabini', grade_level: 'Grade 8' }, extra = {} } = {}) => {
  const ids = [...Array(pending + done)].map((_, i) => `t${i}`);
  return {
    fatalError: null, scheduleError: null, studentRecord: null, attendance: [], releasedScores: [], subjects: [],
    enrolments: sections === 'none' ? [] : [{ section_id: 's', sections }],
    assignees: ids.map(task_id => ({ task_id, section_id: 's', due_at: null, assigned_at: null })),
    sheetById: new Map(ids.map(id => [id, quiz(id)])),
    submissionStates: ids.slice(pending).map(worksheet_id => ({ worksheet_id, status: 'submitted' })),
    ...extra,
  };
};

const show = () => render(
  <MemoryRouter initialEntries={['/student-dashboard']}>
    <Routes>
      <Route path="/student-dashboard/*" element={<ClarityStudentLayout onClassicView={() => {}}><p>content</p></ClarityStudentLayout>} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>
  </MemoryRouter>,
);
const tasksLink = () => screen.getByRole('link', { name: /^Tasks/ });
const foot = () => document.querySelector('.x-side-foot');

beforeEach(() => { Object.assign(state, { graph: graphOf(), loading: false }); state.logout.mockReset(); });
afterEach(() => cleanup());

describe('brand and wording', () => {
  it('uses the EduScribe seal logo', () => {
    show();
    const logo = document.querySelector('.x-brand img');
    expect(logo.getAttribute('src')).toBe('/EduScribeLogoIcon.png');
    expect(logo.getAttribute('alt')).toBe('EduScribe');
  });

  it('never shows the word "preview": not in text, aria-label, title or alt', () => {
    const { container } = show();
    expect(container.textContent).not.toMatch(/preview/i);
    for (const el of container.querySelectorAll('[aria-label], [title], [alt]')) {
      for (const attr of ['aria-label', 'title', 'alt']) expect(el.getAttribute(attr) || '').not.toMatch(/preview/i);
    }
  });

  it('has no "MENU" group label; no "Classic view" in the top bar', () => {
    show();
    expect([...document.querySelectorAll('.x-grp')].map(el => el.textContent)).not.toContain('Menu');
    expect(screen.queryByText('Menu')).toBeNull();
    expect(within(document.querySelector('.x-top')).queryByRole('button', { name: 'Classic view' })).toBeNull();
  });
});

describe('footer user card', () => {
  it.each([
    ['grade and section', { name: 'Mabini', grade_level: 'Grade 8' }, 'Grade 8 – Mabini'],
    ['grade only', { name: '', grade_level: '8' }, 'Grade 8'],
    ['section only', { name: 'Mabini', grade_level: null }, 'Mabini'],
    ['neither', { name: null, grade_level: null }, 'Student'],
    ['no enrolment', 'none', 'Student'],
  ])('%s: the second line is "%s" from the loaded enrolment', (_, sections, expected) => {
    state.graph = graphOf({ sections });
    show();
    const card = within(foot());
    expect(card.getByText('Juan Dela Cruz')).toBeTruthy();
    expect(card.getByText(expected)).toBeTruthy();
    expect(foot().textContent).not.toMatch(/undefined|null|NaN/);
  });

  it('initials sit in the yellow avatar; the profile toggle still opens Profile Settings', () => {
    show();
    expect(foot().querySelector('.x-ava').textContent).toBe('JD');
    const toggle = within(foot()).getByRole('button', { name: 'Toggle profile menu' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Profile Settings' })).toBeTruthy();
  });

  it('the logout icon button keeps the name "Logout" and the same handler (confirm, then log out)', async () => {
    show();
    const logout = within(foot()).getByRole('button', { name: 'Logout' });
    expect(logout.className).toBe('x-iconbtn');
    expect(logout.textContent).toBe('');
    fireEvent.click(logout);
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Log out' })); });
    expect(state.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy();
  });
});

describe('Tasks count badge', () => {
  it('shows the real pending count (the Overview rule)', () => {
    state.graph = graphOf({ pending: 3, done: 2 });
    show();
    expect(tasksLink().querySelector('.cnt').textContent).toBe('3 pending');
    expect(tasksLink().textContent).toBe('Tasks3 pending');
  });

  it.each([
    ['0 pending', () => { state.graph = graphOf({ pending: 0, done: 2 }); }],
    ['loading', () => { state.loading = true; }],
    ['a failed load', () => { state.graph = graphOf({ pending: 2, extra: { fatalError: new Error('x') } }); }],
    ['a schedule failure', () => { state.graph = graphOf({ pending: 2, extra: { scheduleError: new Error('x') } }); }],
    ['no graph', () => { state.graph = null; }],
    ['an incomplete graph', () => { state.graph = { fatalError: null, enrolments: [] }; }],
  ])('%s: no badge', (_, arrange) => {
    arrange();
    show();
    expect(tasksLink().querySelector('.cnt')).toBeNull();
    expect(tasksLink().textContent).toBe('Tasks');
  });
});

describe('bell', () => {
  it('is wrapped in .x-bell with no dark circle (no inline background)', () => {
    show();
    const wrap = document.querySelector('.x-bell');
    expect(wrap.contains(screen.getByRole('button', { name: 'Notifications' }))).toBe(true);
    expect(wrap.getAttribute('style')).toBeNull();
  });
});
