// @vitest-environment jsdom
// R5: toasts sit at the top on phones (desktop unchanged); phone tap targets.
import { existsSync, readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useToast } from './hooks';
import { Toast as TeacherToast } from '../teacher/shared/ui';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const classes = el => el.className.split(/\s+/);
const PHONE_TOP = ['max-md:left-4', 'max-md:bottom-auto', 'max-md:top-[calc(env(safe-area-inset-top,0px)+12px)]'];
const DESKTOP = ['fixed', 'bottom-4', 'right-4', 'z-50'];

afterEach(cleanup);

const StudentHarness = () => {
  const { showToast, Toast } = useToast();
  return <><button type="button" onClick={() => showToast('Saved', 'success')}>ok</button>
    <button type="button" onClick={() => showToast('Could not save', 'error')}>fail</button><Toast /></>;
};

describe('toast placement', () => {
  it('student: phone-top classes added, desktop classes kept, live regions unchanged', () => {
    render(<StudentHarness />);
    act(() => { fireEvent.click(screen.getByText('ok')); });
    const ok = screen.getByText('Saved');
    expect(classes(ok)).toEqual(expect.arrayContaining([...DESKTOP, ...PHONE_TOP]));
    expect(ok.parentElement.getAttribute('role')).toBe('status');
    expect(ok.parentElement.getAttribute('aria-live')).toBe('polite');
    act(() => { fireEvent.click(screen.getByText('fail')); });
    const bad = screen.getByText('Could not save');
    expect(bad.parentElement.getAttribute('role')).toBe('alert');
    expect(bad.parentElement.getAttribute('aria-live')).toBe('assertive');
  });

  it('teacher: phone-top classes added, desktop classes and z-index kept, live regions unchanged', () => {
    render(<TeacherToast toast={{ msg: 'Worksheet created', type: 'success' }} />);
    const ok = screen.getByText('Worksheet created');
    expect(classes(ok)).toEqual(expect.arrayContaining([...DESKTOP, ...PHONE_TOP]));
    expect(ok.style.zIndex).toBe('60');
    expect(ok.parentElement.getAttribute('role')).toBe('status');
    expect(ok.parentElement.getAttribute('aria-live')).toBe('polite');
  });

  it('admin: one phone rule moves the toast to the top; the base rule is unchanged', () => {
    const admin = read('pages/dashboards/admin/AdminDashboard.jsx');
    expect(admin).toContain('.toast { position: fixed; bottom: 24px; right: 24px;');
    expect(admin).toMatch(/@media\(max-width:767px\) \{\s*\.toast \{ top: calc\(env\(safe-area-inset-top, 0px\) \+ 12px\); bottom: auto; left: 16px; right: 16px; \}/);
    expect(admin).toContain("aria-live={toast?.type === 'error' ? 'assertive' : 'polite'}");
  });
});

describe('phone tap targets (40px on phones only)', () => {
  it('Home slideshow dots are 40px boxes on phones; Pause keeps its 24px circle with a 40px tap area', () => {
    const home = read('pages/public/Home.jsx');
    expect(home).toContain('className="grid h-6 w-6 max-md:h-10 max-md:w-10 place-items-center rounded-full cursor-pointer');
    expect(home).toContain("className=\"ml-2 grid h-6 w-6 max-md:relative max-md:before:absolute max-md:before:-inset-2 max-md:before:content-[''] place-items-center");
  });

  it.each(['pages/auth/StudentLogin.jsx', 'pages/auth/FacultyLogin.jsx'])('%s: the password eye is 40x40 on phones, icon size unchanged', (file) => {
    const src = read(file);
    expect(src).toContain('className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded max-md:right-1 max-md:inline-flex max-md:items-center max-md:justify-center max-md:min-w-10 max-md:min-h-10"');
  });

  it('teacher Announcements chips, the student profile toggle and the admin profile toggle reach 40px on phones', () => {
    expect(read('pages/dashboards/teacher/tabs/AnnouncementsTab.jsx')).toContain('className="px-4 py-1.5 rounded-lg text-sm font-medium max-md:min-h-10"');
    expect(read('pages/dashboards/student/StudentDashboard.jsx')).toContain('className={`w-full flex items-center gap-3 text-left max-md:min-h-10 ');
    expect(read('pages/dashboards/admin/AdminDashboard.jsx')).toMatch(/@media\(max-width:767px\) \{[^}]*\}\s*\.admin-profile-row > button \{ min-height: 40px; \}/);
  });
});
