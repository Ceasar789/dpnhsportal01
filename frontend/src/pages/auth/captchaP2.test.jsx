// @vitest-environment jsdom
// P2: the optional Turnstile security check. No VITE_TURNSTILE_SITE_KEY =
// no widget, no script, calls exactly as before. With a key: the widget
// shows, a token is required, and it goes to Supabase (sign-in, Forgot
// Password) or to our backend (request-link). Each token is used once.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ login: vi.fn(), sendPasswordReset: vi.fn(), fetch: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ login: h.login, logout: vi.fn(), user: null, userData: null, sendPasswordReset: h.sendPasswordReset }),
}));
vi.mock('../../config/supabase', () => ({ supabase: {} }));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div aria-hidden="true" /> }));

const StudentLogin = (await import('./StudentLogin')).default;
const FacultyLogin = (await import('./FacultyLogin')).default;
const ForgotPassword = (await import('./ForgotPassword')).default;
const { RequestLinkForm } = await import('./LinkProblem');
const { CAPTCHA_MESSAGES } = await import('../../lib/turnstile');
const { MESSAGES, friendlyError } = await import('../../lib/friendlyError');
const { loginErrorMessage } = await import('../../lib/loginAttemptLimit');

let widget;
const withKey = () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
  widget = null;
  window.turnstile = {
    render: vi.fn((_el, options) => { widget = options; return 'w1'; }),
    reset: vi.fn(), remove: vi.fn(),
  };
};
const solve = async (token = 'tok-1') => {
  await waitFor(() => expect(widget).toBeTruthy());
  act(() => { widget.callback(token); });
};

beforeEach(() => {
  h.login.mockReset().mockImplementation(() => new Promise(() => {}));
  h.sendPasswordReset.mockReset().mockResolvedValue();
  h.fetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', h.fetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  delete window.turnstile;
  document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((s) => s.remove());
});

const LOGINS = [
  ['StudentLogin', StudentLogin, 'student', () => {}, []],
  ['FacultyLogin (teachers and admins)', FacultyLogin, 'faculty', () => {
    fireEvent.click(document.getElementById('role-trigger'));
    fireEvent.click(screen.getByRole('option', { name: 'Admin' }));
  }, ['main_admin']],
];
const fillLogin = (prefix, chooseRole) => {
  chooseRole();
  fireEvent.change(document.getElementById(`${prefix}-email`), { target: { value: 'user@example.test' } });
  fireEvent.change(document.getElementById(`${prefix}-password`), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /agree to the terms of use/i }));
};
const signIn = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Sign In/ })); });

describe.each(LOGINS)('P2 %s', (_name, Page, prefix, chooseRole, role) => {
  it('no site key: no widget, no Cloudflare script, sign-in called exactly as before', async () => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(document.querySelector('[data-turnstile]')).toBeNull();
    fillLogin(prefix, chooseRole);
    await signIn();
    const expected = prefix === 'student' ? ['user@example.test', 'pw'] : ['user@example.test', 'pw', ...role];
    expect(h.login).toHaveBeenCalledWith(...expected);
    expect(h.login.mock.calls[0]).toHaveLength(expected.length);
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });

  it('with a site key: no token, no sign-in; with a token, it is passed on', async () => {
    withKey();
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(document.querySelector('[data-turnstile]')).toBeTruthy();
    fillLogin(prefix, chooseRole);
    await signIn();
    expect(h.login).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(CAPTCHA_MESSAGES.needed);
    await solve('tok-9');
    await signIn();
    const roleArg = prefix === 'student' ? null : role[0];
    expect(h.login).toHaveBeenCalledWith('user@example.test', 'pw', roleArg, { captchaToken: 'tok-9' });
  });

  it('a failed sign-in resets the widget (a token works once)', async () => {
    withKey();
    h.login.mockRejectedValue(Object.assign(new Error('captcha'), { code: 'captcha_failed' }));
    render(<MemoryRouter><Page /></MemoryRouter>);
    fillLogin(prefix, chooseRole);
    await solve();
    await signIn();
    expect(window.turnstile.reset).toHaveBeenCalledWith('w1');
    expect(screen.getByRole('alert').textContent).toBe(MESSAGES.captcha);
  });
});

describe('P2 Forgot Password', () => {
  const ask = async (email = 'anyone@example.test') => {
    fireEvent.change(screen.getByLabelText('EMAIL ADDRESS'), { target: { value: email } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' })); });
  };

  it('the answer is the same generic sentence whatever the address', async () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    await ask('exists@example.test');
    const first = screen.getByRole('alert').textContent;
    cleanup();
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    await ask('nobody@example.test');
    expect(screen.getByRole('alert').textContent).toBe(first);
    expect(first).toBe('Password reset email sent! Check your inbox.');
  });

  it('no site key: no widget, sendPasswordReset(email) exactly as before', async () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    expect(document.querySelector('[data-turnstile]')).toBeNull();
    await ask();
    expect(h.sendPasswordReset).toHaveBeenCalledWith('anyone@example.test');
    expect(h.sendPasswordReset.mock.calls[0]).toHaveLength(1);
  });

  it('with a site key: required, passed to Supabase, then reset', async () => {
    withKey();
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    await ask();
    expect(h.sendPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(CAPTCHA_MESSAGES.needed);
    await solve('tok-2');
    await ask();
    expect(h.sendPasswordReset).toHaveBeenCalledWith('anyone@example.test', { captchaToken: 'tok-2' });
    expect(window.turnstile.reset).toHaveBeenCalled();
  });

  it('errors stay fixed sentences: a failed check says so, anything else keeps the old text', async () => {
    h.sendPasswordReset.mockRejectedValue({ code: 'captcha_failed', message: 'captcha protection: request disallowed (x)' });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    await ask();
    expect(screen.getByRole('alert').textContent).toBe(MESSAGES.captcha);
    h.sendPasswordReset.mockRejectedValue(new Error('raw server text'));
    await ask();
    expect(screen.getByRole('alert').textContent).toBe('Failed to send reset email. Please check the address and try again.');
  });
});

describe('P2 Request a new link', () => {
  const send = async () => {
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'invitee@example.test' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request a new link' })); });
  };
  const body = () => JSON.parse(h.fetch.mock.calls[0][1].body);

  it('no site key: no widget and the request body is unchanged', async () => {
    render(<MemoryRouter><RequestLinkForm /></MemoryRouter>);
    expect(document.querySelector('[data-turnstile]')).toBeNull();
    await send();
    expect(body()).toEqual({ email: 'invitee@example.test' });
  });

  it('with a site key: token sent to the backend; a refused check is not shown as an email error', async () => {
    withKey();
    h.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 'captcha_failed', error: 'x' }) });
    render(<MemoryRouter><RequestLinkForm /></MemoryRouter>);
    await send();
    expect(h.fetch).not.toHaveBeenCalled();
    await solve('tok-3');
    await send();
    expect(body()).toEqual({ email: 'invitee@example.test', captchaToken: 'tok-3' });
    expect(screen.getByText(MESSAGES.captcha)).toBeTruthy();
    expect(screen.getByLabelText('Email address').getAttribute('aria-invalid')).toBeNull();
    expect(window.turnstile.reset).toHaveBeenCalled();
  });
});

describe('P2 wording', () => {
  it('every new code becomes an app sentence, never the server text', () => {
    expect(friendlyError({ code: 'captcha_failed', message: 'captcha protection: request disallowed' })).toBe(MESSAGES.captcha);
    expect(friendlyError({ code: 'reauthentication_not_valid', message: 'Nonce has expired or is invalid' })).toBe(MESSAGES.codeInvalid);
    expect(friendlyError({ code: 'reauthentication_needed' })).toBe(MESSAGES.codeNeeded);
    expect(friendlyError({ code: 'current_password_mismatch' })).toBe(MESSAGES.currentPassword);
    expect(friendlyError({ code: 'current_password_required' })).toBe(MESSAGES.currentPassword);
    expect(loginErrorMessage({ code: 'captcha_failed', message: 'captcha protection: x' })).toBe(MESSAGES.captcha);
  });
});
