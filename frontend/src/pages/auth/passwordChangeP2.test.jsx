// @vitest-environment jsdom
// P2: Change Password = current password + emailed code (Supabase
// reauthenticate) + update + sign out every other session. Reset Password
// also signs out the other sessions. Supabase is faked; the real
// lib/passwordSecurity.js runs.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  getSession: vi.fn(),
  reauthenticate: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  checkSignIn: vi.fn(),
  checkSignOut: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => h.navigate }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ userData: { email: 'teacher@school.test' } }) }));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div aria-hidden="true" /> }));
vi.mock('@supabase/supabase-js', () => ({ createClient: h.createClient }));
vi.mock('../../config/supabase', () => ({
  supabase: { auth: {
    getSession: h.getSession,
    reauthenticate: h.reauthenticate,
    updateUser: h.updateUser,
    signOut: h.signOut,
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  } },
}));

const ChangePassword = (await import('./ChangePassword')).default;
const { CHANGE_MESSAGES } = await import('../../lib/passwordSecurity');
const ResetPassword = (await import('./ResetPassword')).default;
const { MESSAGES } = await import('../../lib/friendlyError');

const CURRENT = 'OldPassword1!x';
const NEW = 'NewPassword2@y';

beforeEach(() => {
  h.getSession.mockResolvedValue({ data: { session: { access_token: 'a', user: { email: 'teacher@school.test' } } } });
  h.reauthenticate.mockResolvedValue({ data: {}, error: null });
  h.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  h.signOut.mockResolvedValue({ error: null });
  h.checkSignIn.mockResolvedValue({ data: { session: { access_token: 'check' } }, error: null });
  h.checkSignOut.mockResolvedValue({ error: null });
  h.createClient.mockImplementation(() => ({ auth: { signInWithPassword: h.checkSignIn, signOut: h.checkSignOut } }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); delete window.turnstile; });

const page = () => render(<MemoryRouter><ChangePassword /></MemoryRouter>);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillDetails = (current = CURRENT, next = NEW, confirm = next) => {
  type('CURRENT PASSWORD', current);
  type('NEW PASSWORD', next);
  type('CONFIRM NEW PASSWORD', confirm);
};
const toCodeStep = async () => {
  page();
  fillDetails();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
  await screen.findByLabelText('CODE FROM THE EMAIL');
};
const enterCode = async (code) => {
  type('CODE FROM THE EMAIL', code);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Change password' })); });
};

describe('P2 Change Password', () => {
  it('success: checks the current password, emails a code, updates with the code, signs out other sessions', async () => {
    await toCodeStep();
    expect(h.checkSignIn).toHaveBeenCalledWith({ email: 'teacher@school.test', password: CURRENT });
    expect(h.checkSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.createClient.mock.calls[0][2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
    expect(h.reauthenticate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(CHANGE_MESSAGES.codeSent)).toBeTruthy();
    expect(document.activeElement.textContent).toBe('Check your email');
    expect(h.updateUser).not.toHaveBeenCalled();

    await enterCode(' 123 456 ');
    expect(h.updateUser).toHaveBeenCalledWith({ password: NEW, nonce: '123456', current_password: CURRENT });
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(h.signOut.mock.invocationCallOrder[0]).toBeGreaterThan(h.updateUser.mock.invocationCallOrder[0]);
    expect(screen.getByText(CHANGE_MESSAGES.done)).toBeTruthy();
    expect(screen.getByText(CHANGE_MESSAGES.othersOut)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(h.navigate).toHaveBeenCalledWith(-1);
  });

  it('wrong current password: field error, no email sent, no update', async () => {
    h.checkSignIn.mockResolvedValue({ data: { session: null }, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } });
    page();
    fillDetails();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    const field = screen.getByLabelText('CURRENT PASSWORD');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText(MESSAGES.currentPassword).length).toBeGreaterThan(0);
    expect(h.reauthenticate).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('a current password the server rejects later sends the person back to that field', async () => {
    await toCodeStep();
    h.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'current_password_mismatch', status: 400 } });
    await enterCode('123456');
    expect(screen.getByLabelText('CURRENT PASSWORD').getAttribute('aria-invalid')).toBe('true');
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('missing fields, a weak or reused password and a mismatch are refused before any call', async () => {
    page();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    expect(screen.getAllByText(CHANGE_MESSAGES.currentRequired).length).toBeGreaterThan(0);
    fillDetails(CURRENT, CURRENT);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    expect(screen.getAllByText(CHANGE_MESSAGES.sameAsCurrent).length).toBeGreaterThan(0);
    fillDetails(CURRENT, NEW, 'Different3#z!');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    expect(screen.getAllByText(CHANGE_MESSAGES.mismatch).length).toBeGreaterThan(0);
    expect(h.checkSignIn).not.toHaveBeenCalled();
    expect(h.reauthenticate).not.toHaveBeenCalled();
  });

  it('missing code: asks for it and does not call Supabase', async () => {
    await toCodeStep();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Change password' })); });
    expect(screen.getAllByText(CHANGE_MESSAGES.codeNeeded).length).toBeGreaterThan(0);
    await enterCode('12ab');
    expect(screen.getAllByText(CHANGE_MESSAGES.codeFormat).length).toBeGreaterThan(0);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong', { code: 'reauthentication_not_valid', status: 422, message: 'Nonce has expired or is invalid' }],
    ['expired', { code: 'reauthentication_not_valid', status: 422, message: 'Nonce has expired or is invalid' }],
  ])('%s code: one plain sentence on the code field, password unchanged, nobody signed out', async (_kind, error) => {
    await toCodeStep();
    h.updateUser.mockResolvedValue({ data: { user: null }, error });
    await enterCode('654321');
    const field = screen.getByLabelText('CODE FROM THE EMAIL');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText(MESSAGES.codeInvalid).length).toBeGreaterThan(0);
    expect(screen.queryByText(/nonce/i)).toBeNull();
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it('Supabase saying a code is required (session over 24 hours) lands on the code field', async () => {
    await toCodeStep();
    h.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'reauthentication_needed', status: 400 } });
    await enterCode('111111');
    expect(screen.getAllByText(MESSAGES.codeNeeded).length).toBeGreaterThan(0);
  });

  it('resend: waits for the cooldown, then sends a new code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await toCodeStep();
    const resend = () => screen.getByRole('button', { name: /Send a new code/ });
    expect(resend().disabled).toBe(true);
    expect(resend().textContent).toBe('Send a new code in 1:00');
    for (let i = 0; i < 58; i += 1) act(() => { vi.advanceTimersByTime(1000); });
    expect(resend().textContent).toMatch(/^Send a new code in 0:0[12]$/); // real time may add a second
    expect(resend().disabled).toBe(true);
    for (let i = 0; i < 2; i += 1) act(() => { vi.advanceTimersByTime(1000); });
    expect(resend().disabled).toBe(false);
    vi.useRealTimers();
    await act(async () => { fireEvent.click(resend()); });
    expect(h.reauthenticate).toHaveBeenCalledTimes(2);
    expect(screen.getByText(CHANGE_MESSAGES.codeResent)).toBeTruthy();
    expect(resend().disabled).toBe(true);
  });

  it('going back to edit inside the cooldown does not send a second email', async () => {
    await toCodeStep();
    fireEvent.click(screen.getByRole('button', { name: /Edit passwords/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    await screen.findByLabelText('CODE FROM THE EMAIL');
    expect(h.reauthenticate).toHaveBeenCalledTimes(1);
  });

  it('a code request refused by the email limit says so in a fixed sentence', async () => {
    h.reauthenticate.mockResolvedValue({ data: {}, error: { code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 42 seconds.' } });
    page();
    fillDetails();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    expect(screen.getByText(MESSAGES.rateLimit)).toBeTruthy();
    expect(screen.queryByText(/42 seconds/)).toBeNull();
    expect(screen.queryByLabelText('CODE FROM THE EMAIL')).toBeNull();
  });

  it('if signing out the other sessions fails, the person is told to do it by hand', async () => {
    h.signOut.mockResolvedValue({ error: { status: 500 } });
    await toCodeStep();
    await enterCode('123456');
    expect(screen.getByText(CHANGE_MESSAGES.othersUnknown)).toBeTruthy();
  });

  it('unknown failures show the fixed sentence, never the raw text', async () => {
    await toCodeStep();
    h.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('private auth detail') });
    await enterCode('123456');
    expect(screen.getByText(CHANGE_MESSAGES.failed)).toBeTruthy();
    expect(screen.queryByText('private auth detail')).toBeNull();
  });

  it('no security check without a site key: no widget, no token sent', async () => {
    await toCodeStep();
    expect(document.querySelector('[data-turnstile]')).toBeNull();
    expect(h.checkSignIn.mock.calls[0][0]).not.toHaveProperty('options');
  });

  it('with a site key the security check is required and its token goes with the password check', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    let options;
    window.turnstile = { render: vi.fn((_el, o) => { options = o; return 'w1'; }), reset: vi.fn(), remove: vi.fn() };
    page();
    await waitFor(() => expect(window.turnstile.render).toHaveBeenCalled());
    expect(options.sitekey).toBe('site-key');
    fillDetails();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    expect(h.checkSignIn).not.toHaveBeenCalled();
    act(() => { options.callback('tok-1'); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send code' })); });
    await screen.findByLabelText('CODE FROM THE EMAIL');
    expect(h.checkSignIn).toHaveBeenCalledWith({ email: 'teacher@school.test', password: CURRENT, options: { captchaToken: 'tok-1' } });
  });
});

describe('P2 lib/passwordSecurity guards', () => {
  it('changePassword refuses a missing or malformed code itself, before Supabase', async () => {
    const { changePassword } = await import('../../lib/passwordSecurity');
    for (const code of ['', undefined, '12345', 'abcdef', '12345678901']) {
      await expect(changePassword({ password: NEW, code, currentPassword: CURRENT })).rejects.toMatchObject({ code: 'reauthentication_needed' });
    }
    expect(h.updateUser).not.toHaveBeenCalled();
    expect(h.signOut).not.toHaveBeenCalled();
  });
});

describe('P2 Reset Password', () => {
  it('after a successful reset every other session is signed out', async () => {
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'recovery' } } });
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await screen.findByLabelText('NEW PASSWORD');
    type('NEW PASSWORD', NEW);
    type('CONFIRM PASSWORD', NEW);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update Password' })); });
    expect(h.updateUser).toHaveBeenCalledWith({ password: NEW });
    expect(h.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(screen.getByText(/Password updated successfully/)).toBeTruthy();
  });

  it('a failed reset signs nobody out', async () => {
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'recovery' } } });
    h.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'weak_password', status: 422 } });
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await screen.findByLabelText('NEW PASSWORD');
    type('NEW PASSWORD', NEW);
    type('CONFIRM PASSWORD', NEW);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update Password' })); });
    expect(h.signOut).not.toHaveBeenCalled();
    expect(screen.getByText(MESSAGES.weakPassword)).toBeTruthy();
  });
});
