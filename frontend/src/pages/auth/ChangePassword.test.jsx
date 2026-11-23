// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  verifyCurrentPassword: vi.fn(),
  sendPasswordCode: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => h.navigate,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { email: 'admin@example.test' } }),
}));
// P2: the password change goes through lib/passwordSecurity (current password, emailed code, update).
vi.mock('../../lib/passwordSecurity', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyCurrentPassword: h.verifyCurrentPassword,
  sendPasswordCode: h.sendPasswordCode,
  changePassword: h.changePassword,
}));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div data-testid="logo" /> }));

const ChangePassword = (await import('./ChangePassword')).default;

const renderPage = () => render(<MemoryRouter><ChangePassword /></MemoryRouter>);

beforeEach(() => {
  h.navigate.mockReset();
  h.verifyCurrentPassword.mockReset().mockResolvedValue();
  h.sendPasswordCode.mockReset().mockResolvedValue();
  h.changePassword.mockReset();
});
const fillCurrent = () => fireEvent.change(screen.getByLabelText('CURRENT PASSWORD'), { target: { value: 'OldPassword1!' } });
const toCodeStep = async () => {
  fillCurrent();
  fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
  fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
  fireEvent.change(await screen.findByLabelText('CODE FROM THE EMAIL'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
};
afterEach(cleanup);

describe('Change Password presentation and behavior', () => {
  it('CP-01 reuses the Reset Password background treatment and overlay', () => {
    const { container } = renderPage();
    const surface = container.firstElementChild;
    expect(surface.style.backgroundImage).toContain('/capstonebackground.jpg');
    expect(surface.style.backgroundSize).toBe('cover');
    expect(surface.style.backgroundPosition).toContain('center');
    expect(surface.querySelector('.bg-black\\/60')).toBeTruthy();
    expect(surface.querySelector('.relative.z-10')).toBeTruthy();
  });

  it('CP-02 preserves accessible labels and password descriptions', () => {
    renderPage();
    // U6: the description is now the live checklist of the same policy rules (was the one-line hint).
    expect(screen.getByLabelText('NEW PASSWORD').getAttribute('aria-describedby').split(' '))
      .toContain(screen.getByRole('list', { name: 'Password rules' }).id);
    expect(screen.getByLabelText('CONFIRM NEW PASSWORD')).toBeTruthy();
  });

  it('CP-03 exposes the password toggle with an accessible pressed state', () => {
    renderPage();
    const newId = screen.getByLabelText('NEW PASSWORD').id;
    const toggle = screen.getAllByRole('button', { name: 'Show password' }).find(b => b.getAttribute('aria-controls') === newId);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getAllByRole('button', { name: 'Hide password' })[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('NEW PASSWORD').getAttribute('type')).toBe('text');
  });

  it('CP-04 rejects a weak password without invoking authentication', () => {
    renderPage();
    fillCurrent();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(h.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(h.changePassword).not.toHaveBeenCalled();
  });

  it('CP-05 rejects mismatched passwords without invoking authentication', () => {
    renderPage();
    fillCurrent();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'ValidPassword2!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.getByRole('alert').textContent).toMatch(/do not match/i);
    expect(h.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(h.changePassword).not.toHaveBeenCalled();
  });

  it('CP-06 changes the password after the current password and the emailed code', async () => {
    h.changePassword.mockResolvedValue({ othersSignedOut: true });
    renderPage();
    await toCodeStep();
    await waitFor(() => expect(h.changePassword).toHaveBeenCalledWith({ password: 'ValidPassword1!', code: '123456', currentPassword: 'OldPassword1!' }));
    expect(h.verifyCurrentPassword).toHaveBeenCalledWith('OldPassword1!', { captchaToken: '' });
    expect(h.sendPasswordCode).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Your password was changed.')).toBeTruthy();
  });

  it('CP-07 preserves safe authentication failure feedback', async () => {
    h.changePassword.mockRejectedValue(new Error('private auth detail'));
    renderPage();
    await toCodeStep();
    expect(await screen.findByText('Failed to change password. Please try again.')).toBeTruthy();
    expect(screen.queryByText('private auth detail')).toBeNull();
  });

  it('CP-08 preserves Go back navigation', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));
    expect(h.navigate).toHaveBeenCalledWith(-1);
  });

  it('CP-09 does not invoke authentication while merely rendering the new surface', () => {
    renderPage();
    expect(h.verifyCurrentPassword).not.toHaveBeenCalled();
    expect(h.sendPasswordCode).not.toHaveBeenCalled();
    expect(h.changePassword).not.toHaveBeenCalled();
  });
});
