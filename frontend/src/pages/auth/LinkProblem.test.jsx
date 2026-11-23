// @vitest-environment jsdom
// P1: the request-a-new-link form (on the link problem view and on
// /request-link) and the old-format setup page messages.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ requestNewLink: vi.fn(), getSession: vi.fn() }));
vi.mock('../../lib/authLinks', async (original) => ({ ...(await original()), requestNewLink: h.requestNewLink }));
vi.mock('../../lib/backendApi', () => ({ API_BASE: '', backendRequest: vi.fn() }));
vi.mock('../../config/supabase', () => ({
  supabase: { auth: { getSession: h.getSession, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: vi.fn() } },
}));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div aria-hidden="true" /> }));

const { RequestLinkForm } = await import('./LinkProblem');
const RequestLink = (await import('./RequestLink')).default;
const ResetPassword = (await import('./ResetPassword')).default;

const SENT = 'If this email belongs to an account that still needs a password, we sent a new link. Check your inbox and spam folder.';
beforeEach(() => { h.requestNewLink.mockReset().mockResolvedValue(undefined); h.getSession.mockReset().mockResolvedValue({ data: { session: null } }); });
afterEach(cleanup);

const submit = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Request a new link' })); });

describe('request a new link', () => {
  it('an empty or malformed email is caught before anything is sent', async () => {
    render(<MemoryRouter><RequestLinkForm /></MemoryRouter>);
    await submit();
    expect(screen.getByRole('alert').textContent).toContain('Enter your email address.');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ana@' } });
    await submit();
    expect(screen.getByRole('alert').textContent).toContain('Enter an email address like name@school.edu.ph.');
    expect(h.requestNewLink).not.toHaveBeenCalled();
  });

  it('the same answer whatever the address', async () => {
    render(<MemoryRouter><RequestLinkForm initialEmail="ana@school.test" /></MemoryRouter>);
    expect(screen.getByLabelText('Email address').value).toBe('ana@school.test');
    await submit();
    expect(h.requestNewLink).toHaveBeenCalledWith('ana@school.test');
    expect(screen.getByRole('status').textContent).toBe(SENT);
    expect(document.activeElement).toBe(screen.getByRole('status'));
  });

  it('too many requests and network failures get friendly sentences, never server text', async () => {
    h.requestNewLink.mockRejectedValueOnce({ status: 429, message: 'raw' });
    render(<MemoryRouter><RequestLinkForm initialEmail="ana@school.test" /></MemoryRouter>);
    await submit();
    expect(screen.getByRole('alert').textContent).toBe('Too many attempts. Please wait a moment and try again.');
    h.requestNewLink.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await submit();
    expect(screen.getByRole('alert').textContent).toBe("We couldn't reach the server. Check your connection and try again.");
  });

  it('/request-link prefills the email handed over by the page before it', () => {
    render(<MemoryRouter initialEntries={[{ pathname: '/request-link', state: { email: 'ben@school.test' } }]}><RequestLink /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Get a new link' })).toBeTruthy();
    expect(screen.getByLabelText('Email address').value).toBe('ben@school.test');
  });
});

describe('old-format links on /setup-password', () => {
  it('#error_code=otp_expired shows the expired message at once, with the request form', async () => {
    render(<MemoryRouter initialEntries={['/setup-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid']}><ResetPassword invitation /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'This link has expired' }, { timeout: 500 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Email link is invalid');
  });

  it('another error code is "not valid"', async () => {
    render(<MemoryRouter initialEntries={['/setup-password#error=server_error']}><ResetPassword invitation /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'This link is not valid' }, { timeout: 500 })).toBeTruthy();
  });

  it('the reset-password page keeps its own expired branch', async () => {
    render(<MemoryRouter initialEntries={['/reset-password#error_code=otp_expired']}><ResetPassword /></MemoryRouter>);
    expect(await screen.findByText('Link Expired or Invalid', {}, { timeout: 2500 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request New Link' }).getAttribute('href')).toBe('/forgot-password');
  });
});
