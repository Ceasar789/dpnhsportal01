// @vitest-environment jsdom
// B2: both login pages require the consent box, identically, after their
// existing checks, and make no sign-in attempt without it.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ login: null }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: h.login, logout: vi.fn(), user: null, userData: null }),
}));
vi.mock('../../config/supabase', () => ({ supabase: {} }));
const StudentLogin = (await import('./StudentLogin')).default;
const FacultyLogin = (await import('./FacultyLogin')).default;

const CONSENT_ERROR = 'Please agree to the Terms of Use and Privacy Statement to sign in.';

beforeEach(() => {
  h.login = vi.fn(() => new Promise(() => {}));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PAGES = [
  ['StudentLogin', StudentLogin, 'student', () => {}, (email) => [email, 'pw']],
  ['FacultyLogin', FacultyLogin, 'faculty', () => {
    fireEvent.click(document.getElementById('role-trigger'));
    fireEvent.click(screen.getByRole('option', { name: 'Teacher' }));
  }, (email) => [email, 'pw', 'teacher']],
];

const box = () => screen.getByRole('checkbox', { name: /agree to the terms of use/i });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /^Sign In/ }));
const fill = (prefix) => {
  fireEvent.change(document.getElementById(`${prefix}-email`), { target: { value: 'user@example.test' } });
  fireEvent.change(document.getElementById(`${prefix}-password`), { target: { value: 'pw' } });
};

describe.each(PAGES)('%s consent', (_name, Page, prefix, chooseRole, loginArgs) => {
  it('the box sits directly above the sign-in button, unchecked', () => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(box().checked).toBe(false);
    expect(box().id).toBe(`${prefix}-consent`);
    const button = screen.getByRole('button', { name: /^Sign In/ });
    expect(button.previousElementSibling.contains(box())).toBe(true);
  });

  it('valid fields but no consent: inline alert, aria-invalid, focus on the box, no sign-in attempt', async () => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    chooseRole(); fill(prefix);
    await act(async () => { submit(); });
    expect(h.login).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(CONSENT_ERROR);
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(box());
    expect(screen.getByRole('button', { name: /^Sign In/ }).disabled).toBe(false);
  });

  it('ticking the box clears the error; signing in then proceeds exactly as before', async () => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    chooseRole(); fill(prefix);
    await act(async () => { submit(); });
    fireEvent.click(box());
    expect(screen.queryByText(CONSENT_ERROR)).toBeNull();
    expect(box().hasAttribute('aria-invalid')).toBe(false);
    await act(async () => { submit(); });
    expect(h.login).toHaveBeenCalledWith(...loginArgs('user@example.test'));
  });

  it('the existing "Please fill in all fields" still comes first', async () => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    chooseRole();
    await act(async () => { submit(); });
    expect(screen.getByRole('alert').textContent).toBe('Please fill in all fields');
    expect(screen.queryByText(CONSENT_ERROR)).toBeNull();
    expect(h.login).not.toHaveBeenCalled();
  });
});

describe('FacultyLogin order', () => {
  it('"Please select your role" still comes first', async () => {
    render(<MemoryRouter><FacultyLogin /></MemoryRouter>);
    fill('faculty');
    await act(async () => { submit(); });
    expect(screen.getByRole('alert').textContent).toBe('Please select your role');
    expect(screen.queryByText(CONSENT_ERROR)).toBeNull();
    expect(h.login).not.toHaveBeenCalled();
  });
});
