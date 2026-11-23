// @vitest-environment jsdom
// U6: Change Password and Reset Password show the live checklist of the real
// policy on the new password, and never show raw auth or server text.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  navigate: vi.fn(), updatePassword: vi.fn(), updateUser: vi.fn(), backendRequest: vi.fn(), signOut: vi.fn(),
}));
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => h.navigate }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ updatePassword: h.updatePassword, userData: { email: 'maximiliana.concepcion.delacruz.villanueva.buenaventura@deped-example.ph' } }),
}));
vi.mock('../../lib/backendApi', () => ({ backendRequest: h.backendRequest }));
vi.mock('../../config/supabase', () => ({
  supabase: { auth: {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'recovery' } } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: h.signOut, updateUser: h.updateUser,
  } },
}));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div aria-hidden="true" /> }));

const ChangePassword = (await import('./ChangePassword')).default;
const ResetPassword = (await import('./ResetPassword')).default;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const checklist = () => screen.getByRole('list', { name: 'Password rules' });
const states = () => within(checklist()).getAllByRole('listitem').map(li => li.getAttribute('data-met'));
const RULE_TEXT = ['At least 12 characters', 'One uppercase letter (A-Z)', 'One number (0-9)', 'One special character (like ! or #)'];

// P2: Change Password also asks for the current password (filled here) and its submit is "Send code".
describe.each([
  ['Change Password', async () => { render(<MemoryRouter><ChangePassword /></MemoryRouter>); fireEvent.change(screen.getByLabelText('CURRENT PASSWORD'), { target: { value: 'OldPassword1!' } }); }, 'CONFIRM NEW PASSWORD', 'Send code'],
  ['Reset Password', async () => { render(<MemoryRouter><ResetPassword /></MemoryRouter>); await screen.findByLabelText('NEW PASSWORD'); }, 'CONFIRM PASSWORD', 'Update Password'],
])('U6 %s', (_name, open, CONFIRM, SUBMIT) => {
  it('the new password has the live checklist of the real rules, described by the field', async () => {
    await open();
    const input = screen.getByLabelText('NEW PASSWORD');
    expect(within(checklist()).getAllByRole('listitem').map(li => li.textContent.replace(/^[✓○]/, '').replace(/, (done|not yet)$/, '')))
      .toEqual(RULE_TEXT);
    expect(input.getAttribute('aria-describedby').split(' ')).toContain(checklist().id);
    expect(states()).toEqual(['false', 'false', 'false', 'false']);
    fireEvent.change(input, { target: { value: 'abcdefghijkl' } });
    expect(states()).toEqual(['true', 'false', 'false', 'false']);
    fireEvent.change(input, { target: { value: 'Abcdefghij1!' } });
    expect(states()).toEqual(['true', 'true', 'true', 'true']);
    expect(within(checklist()).getAllByText(', done')).toHaveLength(4);
  });

  it('only the new password has a checklist; each field has its own show/hide toggle', async () => {
    await open();
    expect(screen.getAllByRole('list', { name: 'Password rules' })).toHaveLength(1);
    const toggles = screen.getAllByRole('button', { name: 'Show password' });
    expect(toggles.slice(-2).map(t => t.getAttribute('aria-controls'))).toEqual([screen.getByLabelText('NEW PASSWORD').id, screen.getByLabelText(CONFIRM).id]);
    for (const label of ['NEW PASSWORD', CONFIRM]) {
      expect(screen.getByLabelText(label).getAttribute('autocomplete')).toBe('new-password');
      expect(screen.getByLabelText(label).className).toContain('fk-control');
    }
  });

  it('a password the checklist does not tick is still refused by the unchanged submit', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'abcdefghijkl' } });
    fireEvent.change(screen.getByLabelText(CONFIRM), { target: { value: 'abcdefghijkl' } });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(screen.getByRole('alert').textContent).toContain('Password must contain at least one uppercase letter');
    expect(h.updatePassword).not.toHaveBeenCalled();
    expect(h.updateUser).not.toHaveBeenCalled();
  });
});

describe('U6 Change Password: a 70-character e-mail wraps instead of widening the card', () => {
  it('the e-mail line can break anywhere and stays inside the card', () => {
    render(<MemoryRouter><ChangePassword /></MemoryRouter>);
    const line = screen.getByText(/^maximiliana\.concepcion/);
    expect(line.className).toContain('[overflow-wrap:anywhere]');
    expect(line.className).toContain('max-w-full');
  });
});

describe('U6 Reset Password: friendly errors only', () => {
  const submit = async () => {
    fireEvent.change(await screen.findByLabelText('NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Password|Activate Account/ }));
  };
  class AuthApiError extends Error {
    constructor(message, code) { super(message); this.name = 'AuthApiError'; this.code = code; this.status = 422; }
  }

  it('a Supabase auth error shows the app sentence for its code, not its own text', async () => {
    h.updateUser.mockResolvedValue({ error: new AuthApiError('New password should be different from the old password. (raw)', 'same_password') });
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await submit();
    expect((await screen.findByRole('alert')).textContent).toBe("Choose a password you haven't used here before.");
    expect(document.body.textContent).not.toContain('(raw)');
  });

  it('an unknown auth error shows the existing fallback sentence', async () => {
    h.updateUser.mockResolvedValue({ error: new AuthApiError('pq: relation auth.users ... (raw)', 'unexpected_failure') });
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    await submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Failed to update password. Please try again.');
  });

  it("the invitation keeps the backend's own fixed sentence", async () => {
    class BackendRequestError extends Error { constructor(m) { super(m); this.name = 'BackendRequestError'; } }
    h.backendRequest.mockRejectedValue(new BackendRequestError('This invitation was already used.'));
    render(<MemoryRouter><ResetPassword invitation /></MemoryRouter>);
    await submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('This invitation was already used.'));
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
