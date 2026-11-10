// @vitest-environment jsdom
// R5 tweak: on phones the toast lets taps through to the header under it; desktop unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useToast } from './hooks';
import { Toast as TeacherToast } from '../teacher/shared/ui';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const classes = el => el.className.split(/\s+/);

afterEach(cleanup);

const StudentHarness = () => {
  const { showToast, Toast } = useToast();
  return <><button type="button" onClick={() => showToast('Could not save', 'error')}>fail</button><Toast /></>;
};

describe('phone toast is click-through', () => {
  it('student: max-md:pointer-events-none only, no unprefixed pointer-events class; live region kept', () => {
    render(<StudentHarness />);
    act(() => { fireEvent.click(screen.getByText('fail')); });
    const el = screen.getByText('Could not save');
    expect(classes(el)).toContain('max-md:pointer-events-none');
    expect(classes(el).filter(c => c.startsWith('pointer-events'))).toEqual([]);
    expect(classes(el)).toEqual(expect.arrayContaining(['fixed', 'bottom-4', 'right-4', 'z-50']));
    expect(el.parentElement.getAttribute('role')).toBe('alert');
  });

  it('teacher: max-md:pointer-events-none only, desktop classes and z-index kept', () => {
    render(<TeacherToast toast={{ msg: 'Worksheet created', type: 'success' }} />);
    const el = screen.getByText('Worksheet created');
    expect(classes(el)).toContain('max-md:pointer-events-none');
    expect(classes(el).filter(c => c.startsWith('pointer-events'))).toEqual([]);
    expect(classes(el)).toEqual(expect.arrayContaining(['fixed', 'bottom-4', 'right-4', 'z-50']));
    expect(el.style.zIndex).toBe('60');
    expect(el.parentElement.getAttribute('role')).toBe('status');
  });

  it('admin: pointer-events: none sits inside the phone media block and nowhere else', () => {
    const admin = read('pages/dashboards/admin/AdminDashboard.jsx');
    const block = admin.match(/@media\(max-width:767px\) \{[\s\S]*?\n\s*\}\r?\n/)[0];
    expect(block).toMatch(/\.toast \{ pointer-events: none; \}/);
    expect(admin.match(/\.toast \{ pointer-events: none; \}/g)).toHaveLength(1);
    expect(admin).toContain('.toast { position: fixed; bottom: 24px; right: 24px;');
    expect(admin).not.toMatch(/\.toast \{ position: fixed;[^}]*pointer-events/);
  });
});
