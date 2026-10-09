// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ backendRequest: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/backendApi', () => ({ backendRequest: h.backendRequest }));
vi.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'invite-session' } } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: h.signOut,
      updateUser: vi.fn(),
    },
  },
}));
vi.mock('../../components/FlippingLogo', () => ({ default: () => <div aria-hidden="true" /> }));

const ResetPassword = (await import('./ResetPassword')).default;

beforeEach(() => {
  h.backendRequest.mockReset().mockResolvedValue({ message: 'ok' });
  h.signOut.mockReset().mockResolvedValue({});
});

describe('invitation password setup', () => {
  it('uses the shared password form and completes onboarding through Express', async () => {
    render(<MemoryRouter><ResetPassword invitation /></MemoryRouter>);

    const password = await screen.findByLabelText('NEW PASSWORD');
    fireEvent.change(password, { target: { value: 'StrongPassword1!' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD'), { target: { value: 'StrongPassword1!' } });
    expect(screen.getByRole('status').textContent).toContain('Strong');
    fireEvent.click(screen.getByRole('button', { name: 'Activate Account' }));

    await waitFor(() => expect(h.backendRequest).toHaveBeenCalledWith('/api/onboarding/complete', {
      method: 'POST', body: JSON.stringify({ password: 'StrongPassword1!' }),
    }));
    expect(h.signOut).toHaveBeenCalledOnce();
  });
});
