// @vitest-environment jsdom
// Clarity T1: the Teacher Clarity shell. The real TeacherDashboard is rendered
// (tabs mocked), with the flag off (classic, untouched) and on (?clarity=1).
// Every shell behaviour of the classic TeacherLayout is checked again here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import TeacherDashboard from '../../../pages/dashboards/teacher/TeacherDashboard';
import { CLARITY_STORAGE_KEY } from '../useClarityFlag';

const h = vi.hoisted(() => ({
  logout: vi.fn(), guard: { mode: 'clean', action: null }, profile: {}, desktop: false,
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ isTeacher: () => true, userData: { uid: 'teacher-1', name: 'Sample Teacher', profile: h.profile }, logout: h.logout }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => {
    if (h.guard.mode === 'clean') { go(); return true; }
    h.guard.action = go;
    return false;
  } }),
}));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => h.desktop }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../components/NotificationBell', () => ({ default: ({ className }) => <button className={className}>Notifications</button> }));
vi.mock('../../../pages/dashboards/teacher/tabs/OverviewTab', () => ({ default: () => <h2>Overview content</h2> }));
vi.mock('../../../pages/dashboards/teacher/tabs/StudentsTab', () => ({ default: () => <h1>Students content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/LessonPlansTab', () => ({ default: () => <h1>Lesson plans content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/WorksheetsTab', () => ({ default: () => <h1>Worksheets content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/GradesTab', () => ({ default: () => <h1>Grades content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/AttendanceTab', () => ({ default: () => <h1>Attendance content</h1> }));
vi.mock('../../../pages/dashboards/teacher/tabs/AnnouncementsTab', () => ({ default: () => <h1>Announcements content</h1> }));
vi.mock('../../../pages/profile/ProfileTab', () => ({ default: () => <div>Profile content</div> }));

const SCOPE = ['theme', 'clarity'].join('-');
const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const HistoryControls = () => {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></>;
};
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <HistoryControls />
    <Routes>
      <Route path="/teacher-dashboard/*" element={<><TeacherDashboard /><Where /></>} />
      <Route path="/login" element={<h1>Login page</h1>} />
    </Routes>
  </MemoryRouter>,
);
const CLARITY = '/teacher-dashboard?clarity=1';
const CLASSIC = '/teacher-dashboard';
const sidebar = () => document.getElementById('teacher-sidebar');
const navLinks = () => within(sidebar()).getAllByRole('link').map(a => [a.textContent.trim() || a.getAttribute('aria-label'), a.getAttribute('href'), a.getAttribute('aria-current')]);
const setScrollY = (y) => { Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: y }); fireEvent.scroll(window); };

let saved;
beforeEach(() => {
  Object.assign(h, { profile: {}, desktop: true });
  h.guard.mode = 'clean'; h.guard.action = null;
  h.logout.mockReset();
  window.localStorage.clear();
  saved = { raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame, scrollTo: window.scrollTo,
    offsetParent: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent') };
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
  window.requestAnimationFrame = (cb) => window.setTimeout(cb, 0);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  window.scrollTo = vi.fn();
  setScrollY(0);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.classList.remove(SCOPE);
  window.requestAnimationFrame = saved.raf;
  window.cancelAnimationFrame = saved.caf;
  window.scrollTo = saved.scrollTo;
  if (saved.offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', saved.offsetParent);
  else delete HTMLElement.prototype.offsetParent;
});

describe('the switch', () => {
  it('flag OFF (default): the classic shell, untouched; no Clarity class', () => {
    const { container } = renderAt(CLASSIC);
    expect(container.querySelector('.teacher-dashboard-shell > .teacher-header')).toBeTruthy();
    expect(container.querySelector('.x-app')).toBeNull();
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
  });

  it('?clarity=1: the Clarity shell, remembered; Classic view turns it off (?clarity=0) and shows the classic shell', () => {
    const { container } = renderAt(CLARITY);
    expect(container.querySelector('.x-app.x-tch')).toBeTruthy();
    expect(document.documentElement.classList.contains(SCOPE)).toBe(true);
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(screen.getByTestId('where').textContent).toBe('/teacher-dashboard?clarity=0');
    expect(container.querySelector('.teacher-header')).toBeTruthy();
    expect(container.querySelector('.x-app')).toBeNull();
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
  });

  it('the classic tabs render inside the classic shell class names', () => {
    renderAt(CLARITY);
    const heading = screen.getByRole('heading', { name: 'Overview content' });
    expect(heading.closest('.dashboard-shell.teacher-dashboard-shell.x-tch-classic')).toBeTruthy();
    expect(heading.closest('main.x-content')).toBeTruthy();
  });
});

describe('sidebar, brand and top bar', () => {
  it('the same seven links, paths, labels and order as the classic sidebar, under the design groups', () => {
    renderAt(CLASSIC);
    const classic = navLinks();
    cleanup();
    renderAt(CLARITY);
    expect(navLinks()).toEqual(classic);
    expect(classic.map(([label]) => label)).toEqual(['Overview', 'Students', 'Lesson Plans', 'Worksheets', 'Grading', 'Attendance', 'Announcements']);
    const order = [...sidebar().querySelectorAll('nav .x-grp, nav .x-nav')].map(el => el.textContent.trim());
    expect(order).toEqual(['Overview', 'Students', 'Teaching', 'Lesson Plans', 'Worksheets', 'Grading', 'Attendance', 'School', 'Announcements']);
    expect(sidebar().querySelector('.cnt')).toBeNull();
  });

  it('brand: the real logo; "Teacher Dashboard", or "Teacher · {department}" when the profile has one', () => {
    renderAt(CLARITY);
    expect(within(sidebar()).getByAltText('EduScribe').getAttribute('src')).toBe('/EduScribeLogoIcon.png');
    expect(sidebar().querySelector('.x-brand').textContent).toBe('EduScribeTeacher Dashboard');
    cleanup();
    h.profile = { department: 'Science' };
    renderAt(CLARITY);
    expect(sidebar().querySelector('.x-brand').textContent).toBe('EduScribeTeacher · Science');
  });

  it('footer: the name and "Teacher"; the top bar has the bell, the theme toggle and Classic view, and no search box', () => {
    renderAt(CLARITY);
    expect(sidebar().querySelector('.x-side-foot').textContent).toContain('Sample TeacherTeacher');
    const top = document.querySelector('.x-top');
    expect(within(top).getByRole('button', { name: 'Notifications' }).className).toBe('teacher-notification-bell');
    expect(within(top).getByRole('button', { name: /Switch to (Dark|Light) Mode/ })).toBeTruthy();
    expect(within(top).getByRole('button', { name: 'Classic view' })).toBeTruthy();
    expect(document.querySelector('input[type="search"], [role="searchbox"]')).toBeNull();
  });

  it('the theme toggle is the same ThemeContext toggle (its name flips)', () => {
    renderAt(CLARITY);
    const before = within(document.querySelector('.x-top')).getByRole('button', { name: /Switch to (Dark|Light) Mode/ }).getAttribute('aria-label');
    fireEvent.click(screen.getByRole('button', { name: before }));
    const after = within(document.querySelector('.x-top')).getByRole('button', { name: /Switch to (Dark|Light) Mode/ }).getAttribute('aria-label');
    expect(after).not.toBe(before);
    fireEvent.click(screen.getByRole('button', { name: after }));
  });

  it('no "preview" anywhere', () => {
    const { container } = renderAt(CLARITY);
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});

describe('navigation behaviour (as classic)', () => {
  it('a link moves aria-current, resets the page scroll and focuses the destination heading', async () => {
    renderAt(CLARITY);
    fireEvent.click(within(sidebar()).getByRole('link', { name: 'Students' }));
    const heading = await screen.findByRole('heading', { name: 'Students content' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(within(sidebar()).getByRole('link', { name: 'Students' }).getAttribute('aria-current')).toBe('page');
    expect(within(sidebar()).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
  });

  it('Back and Forward restore each entry\'s scroll without focusing a heading', async () => {
    renderAt(CLARITY);
    setScrollY(200);
    fireEvent.click(within(sidebar()).getByRole('link', { name: 'Students' }));
    await screen.findByRole('heading', { name: 'Students content' });
    setScrollY(120);
    fireEvent.click(within(sidebar()).getByRole('link', { name: 'Lesson Plans' }));
    await screen.findByRole('heading', { name: 'Lesson plans content' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 120));
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Students content' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 200));
  });

  it('Profile Settings opens the profile page with its focusable heading', async () => {
    renderAt(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle profile menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Profile Settings' }));
    const heading = await screen.findByRole('heading', { name: 'Profile Settings' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByTestId('where').textContent).toBe('/teacher-dashboard/profile');
    expect(screen.getByText('Profile content').closest('.teacher-profile')).toBeTruthy();
  });

  it('phone drawer: focus inside, header and main inert, Escape closes and returns focus to the menu button', async () => {
    h.desktop = false;
    renderAt(CLARITY);
    const opener = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(sidebar().style.visibility).toBe('hidden');
    opener.focus();
    fireEvent.click(opener);
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close navigation' }));
    expect(opener.closest('header').inert).toBe(true);
    expect(screen.getByRole('main').inert).toBe(true);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(opener.closest('header').inert).toBe(false);
  });

  it('a link inside the open drawer closes it', async () => {
    h.desktop = false;
    renderAt(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Navigation' })).getByRole('link', { name: 'Grading' }));
    await screen.findByRole('heading', { name: 'Grades content' });
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull();
  });

  it('desktop: Collapse / Expand like classic (labels become link names, the profile menu closes)', () => {
    h.desktop = true;
    renderAt(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle profile menu' }));
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(collapse);
    expect(screen.queryByRole('button', { name: 'Profile Settings' })).toBeNull();
    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    expect(sidebar().classList.contains('x-tch-mini')).toBe(true);
    expect(within(sidebar()).getByRole('link', { name: 'Lesson Plans' }).textContent).toBe('');
    expect(sidebar().querySelector('.x-grp')).toBeNull();
    // Opening the profile menu while collapsed expands the sidebar, as classic.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle profile menu' }));
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile Settings' })).toBeTruthy();
  });
});

describe('logout (as classic)', () => {
  it('the confirmation; Cancel keeps the session and returns focus to Logout', async () => {
    renderAt(CLARITY);
    const trigger = screen.getByRole('button', { name: 'Logout' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialog.textContent).toContain('Are you sure you want to log out of your account?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(h.logout).not.toHaveBeenCalled();
  });

  it('confirms exactly once while pending, then goes to /login', async () => {
    let finish;
    h.logout.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderAt(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    const confirm = screen.getByRole('button', { name: 'Log out' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('dialog', { name: 'Log out of EduScribe?' })).getByRole('status').textContent).toContain('Logging out');
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    await act(async () => finish());
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeTruthy();
  });

  it('a rejected logout stays recoverable with the same message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.logout.mockRejectedValueOnce(new Error('Synthetic logout rejection'));
    renderAt(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not log out. Please try again.');
    expect(screen.queryByRole('heading', { name: 'Login page' })).toBeNull();
    logged.mockRestore();
  });

  it('defers to the Profile unsaved-changes guard', () => {
    h.guard.mode = 'dirty';
    renderAt(CLARITY);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(h.guard.action).toBeTypeOf('function');
    expect(screen.queryByRole('dialog', { name: 'Log out of EduScribe?' })).toBeNull();
    act(() => h.guard.action());
    expect(screen.getByRole('dialog', { name: 'Log out of EduScribe?' })).toBeTruthy();
    expect(h.logout).not.toHaveBeenCalled();
  });
});
