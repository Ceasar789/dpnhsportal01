import { describe, expect, it } from 'vitest';
import { invitationCallbackDecision } from './invitationCallback';

describe('invitation callback routing', () => {
  it('routes an incomplete invited session to password setup', () => {
    expect(invitationCallbackDecision({
      pathname: '/',
      hash: '',
      loading: false,
      user: { invited_at: '2026-10-09T00:00:00Z', app_metadata: {} },
      profileStatus: 'inactive',
    })).toEqual({ destination: '/setup-password', preserveHash: false });
  });

  it('routes a root-level expired callback to the friendly setup error state', () => {
    expect(invitationCallbackDecision({
      pathname: '/',
      hash: '#error=access_denied&error_code=otp_expired',
      loading: false,
      user: null,
      profileStatus: null,
    })).toEqual({ destination: '/setup-password', preserveHash: false });
  });

  it('holds a root callback while Supabase restores its session', () => {
    expect(invitationCallbackDecision({
      pathname: '/',
      hash: '#access_token=redacted',
      loading: true,
      user: null,
      profileStatus: null,
    })).toEqual({ pending: true });
  });

  it('does not redirect an activated invited account', () => {
    expect(invitationCallbackDecision({
      pathname: '/',
      hash: '',
      loading: false,
      user: { invited_at: '2026-10-09T00:00:00Z', app_metadata: {} },
      profileStatus: 'active',
    })).toBeNull();
  });
});
