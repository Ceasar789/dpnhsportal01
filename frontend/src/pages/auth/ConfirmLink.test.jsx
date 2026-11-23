// @vitest-environment jsdom
// P1: the new link landing page. Nothing is verified on load (mail scanners
// open links); verifyOtp runs only on the button press.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock('../../config/supabase', () => ({ supabase: { auth: { verifyOtp: h.verifyOtp } } }));
vi.mock('../../lib/backendApi', () => ({ API_BASE: '' }));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div aria-hidden="true" /> }));

const ConfirmLink = (await import('./ConfirmLink')).default;
const { rememberUsedLink } = await import('../../lib/authLinks');

const HASH = 'f'.repeat(56);
const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/auth/confirm" element={<ConfirmLink />} />
      <Route path="/setup-password" element={<p>setup page</p>} />
      <Route path="/reset-password" element={<p>reset page</p>} />
    </Routes>
  </MemoryRouter>,
);
const press = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Set my password' })); });

beforeEach(() => { h.verifyOtp.mockReset(); localStorage.clear(); });
afterEach(cleanup);

describe('verify on click only', () => {
  it('opening the link does not touch the token', async () => {
    renderAt(`/auth/confirm?token_hash=${HASH}&type=invite`);
    expect(screen.getByRole('heading', { name: 'Set your password' })).toBeTruthy();
    expect(screen.getByText(/You were invited/)).toBeTruthy();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(h.verifyOtp).not.toHaveBeenCalled();
  });

  it('the button verifies once, then an invitee goes to password setup', async () => {
    let finish;
    h.verifyOtp.mockImplementation(() => new Promise((r) => { finish = r; }));
    renderAt(`/auth/confirm?token_hash=${HASH}&type=invite`);
    await press();
    fireEvent.click(screen.getByRole('button', { name: 'Checking your link…' }));
    expect(h.verifyOtp).toHaveBeenCalledTimes(1);
    expect(h.verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'invite' });
    await act(async () => finish({ data: { user: { invited_at: '2026-11-01T00:00:00Z', app_metadata: {} }, session: {} }, error: null }));
    expect(await screen.findByText('setup page')).toBeTruthy();
  });

  it('a recovery link for an activated account goes to the reset page', async () => {
    h.verifyOtp.mockResolvedValue({ data: { user: { app_metadata: { onboarding_complete: true } }, session: {} }, error: null });
    renderAt(`/auth/confirm?token_hash=${HASH}&type=recovery`);
    expect(screen.getByText(/choose a new password/)).toBeTruthy();
    await press();
    expect(await screen.findByText('reset page')).toBeTruthy();
    expect(h.verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' });
  });

  it('a recovery link for a not-activated invitee still goes to password setup', async () => {
    h.verifyOtp.mockResolvedValue({ data: { user: { invited_at: '2026-11-01T00:00:00Z', email_confirmed_at: '2026-11-01T00:01:00Z', app_metadata: {} }, session: {} }, error: null });
    renderAt(`/auth/confirm?token_hash=${HASH}&type=recovery`);
    await press();
    expect(await screen.findByText('setup page')).toBeTruthy();
  });
});

describe('expired vs used vs invalid', () => {
  it('expired', async () => {
    h.verifyOtp.mockResolvedValue({ data: {}, error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' } });
    renderAt(`/auth/confirm?token_hash=${HASH}&type=invite`);
    await press();
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Token has expired or is invalid');
  });

  it('already used (in this browser)', async () => {
    rememberUsedLink(HASH);
    h.verifyOtp.mockResolvedValue({ data: {}, error: { status: 403, code: 'otp_expired' } });
    renderAt(`/auth/confirm?token_hash=${HASH}&type=invite`);
    await press();
    expect(screen.getByRole('heading', { name: 'This link was already used' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeTruthy();
  });

  it('not valid: a broken link shows at once, without calling Supabase', () => {
    renderAt('/auth/confirm?token_hash=abc&type=invite');
    expect(screen.getByRole('heading', { name: 'This link is not valid' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeTruthy();
    expect(h.verifyOtp).not.toHaveBeenCalled();
  });

  it('not valid: Supabase refuses for another reason', async () => {
    h.verifyOtp.mockResolvedValue({ data: {}, error: { status: 400, code: 'validation_failed' } });
    renderAt(`/auth/confirm?token_hash=${HASH}&type=invite`);
    await press();
    expect(screen.getByRole('heading', { name: 'This link is not valid' })).toBeTruthy();
  });

  it('the email field is prefilled when the link carries a valid email', () => {
    renderAt('/auth/confirm?token_hash=bad&type=invite&email=ana%40school.test');
    expect(screen.getByLabelText('Email address').value).toBe('ana@school.test');
  });

  it('a network failure keeps the button (the link was not used) with a friendly sentence', async () => {
    h.verifyOtp.mockResolvedValue({ data: {}, error: { status: 0, name: 'AuthRetryableFetchError', message: 'Failed to fetch' } });
    renderAt(`/auth/confirm?token_hash=${HASH}&type=invite`);
    await press();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("We couldn't reach the server. Check your connection and try again."));
    expect(screen.getByRole('button', { name: 'Set my password' })).toBeTruthy();
  });
});
