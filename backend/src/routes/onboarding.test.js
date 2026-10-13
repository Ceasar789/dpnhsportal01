import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingStatus, setupRedirect } from './onboarding.js';

test('onboarding status follows persisted profile state and invite completion metadata', () => {
  const invited = { invited_at: '2026-10-09T00:00:00Z', app_metadata: {} };
  assert.equal(onboardingStatus({ status: 'inactive' }, invited), 'invitation_pending');
  assert.equal(onboardingStatus({ status: 'active' }, invited), 'active');
  assert.equal(onboardingStatus({ status: 'archived' }, invited), 'archived');
  assert.equal(
    onboardingStatus({ status: 'inactive' }, { ...invited, app_metadata: { onboarding_complete: true } }),
    'inactive',
  );
});

test('password setup redirects require the configured application origin', () => {
  const previous = process.env.APP_URL;
  try {
    delete process.env.APP_URL;
    assert.throws(() => setupRedirect(), /APP_URL/);
    process.env.APP_URL = 'https://portal.example.edu/';
    assert.equal(setupRedirect(), 'https://portal.example.edu/setup-password');
  } finally {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  }
});
