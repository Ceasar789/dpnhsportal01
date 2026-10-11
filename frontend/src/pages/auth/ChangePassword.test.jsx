// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => h.navigate,
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ updatePassword: h.updatePassword, userData: { email: 'admin@example.test' } }),
}));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div data-testid="logo" /> }));

const ChangePassword = (await import('./ChangePassword')).default;

const renderPage = () => render(<MemoryRouter><ChangePassword /></MemoryRouter>);

beforeEach(() => {
  h.navigate.mockReset();
  h.updatePassword.mockReset();
});
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
    expect(screen.getByLabelText('NEW PASSWORD').getAttribute('aria-describedby')).toBe('change-password-rule');
    expect(screen.getByLabelText('CONFIRM NEW PASSWORD')).toBeTruthy();
  });

  it('CP-03 exposes the password toggle with an accessible pressed state', () => {
    renderPage();
    const [toggle] = screen.getAllByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getAllByRole('button', { name: 'Hide password' })[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('NEW PASSWORD').getAttribute('type')).toBe('text');
  });

  it('CP-04 rejects a weak password without invoking authentication', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(h.updatePassword).not.toHaveBeenCalled();
  });

  it('CP-05 rejects mismatched passwords without invoking authentication', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'ValidPassword2!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
    expect(screen.getByRole('alert').textContent).toMatch(/do not match/i);
    expect(h.updatePassword).not.toHaveBeenCalled();
  });

  it('CP-06 preserves the existing successful password-update call', async () => {
    h.updatePassword.mockResolvedValue();
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
    await waitFor(() => expect(h.updatePassword).toHaveBeenCalledWith('ValidPassword1!'));
    expect(await screen.findByText('Password changed successfully!')).toBeTruthy();
  });

  it('CP-07 preserves safe authentication failure feedback', async () => {
    h.updatePassword.mockRejectedValue(new Error('private auth detail'));
    renderPage();
    fireEvent.change(screen.getByLabelText('NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.change(screen.getByLabelText('CONFIRM NEW PASSWORD'), { target: { value: 'ValidPassword1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
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
    expect(h.updatePassword).not.toHaveBeenCalled();
  });
});
