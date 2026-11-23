import test from 'node:test';
import assert from 'node:assert/strict';
import { cooldownLeft, inviteLinkState, isNotActivated, lastLinkSentAt, LINK_LIFETIME_MS } from './inviteState.js';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const invited = { invited_at: '2026-11-23T11:00:00Z', app_metadata: { intended_role: 'teacher' } };

test('not activated: invited, no first password yet, profile neither active nor archived', () => {
  assert.equal(isNotActivated('inactive', invited), true);
  assert.equal(isNotActivated(undefined, invited), true, 'profile status unknown (browser right after verify)');
  assert.equal(isNotActivated('guest', { ...invited, email_confirmed_at: '2026-11-23T11:05:00Z' }), true, 'link opened (or scanned), no password');
  assert.equal(isNotActivated('active', invited), false);
  assert.equal(isNotActivated('ARCHIVED', invited), false);
  assert.equal(isNotActivated('inactive', { ...invited, app_metadata: { onboarding_complete: true } }), false);
  assert.equal(isNotActivated('inactive', { app_metadata: {} }), false, 'never invited');
  assert.equal(isNotActivated('inactive', null), false);
});

test('the newest link time is the latest of invite, confirmation and recovery', () => {
  assert.equal(lastLinkSentAt(null), null);
  assert.equal(lastLinkSentAt({ invited_at: 'not a date' }), null);
  assert.equal(lastLinkSentAt({ ...invited, recovery_sent_at: '2026-11-23T11:30:00Z' }), Date.parse('2026-11-23T11:30:00Z'));
  assert.equal(lastLinkSentAt({ ...invited, confirmation_sent_at: '2026-11-23T11:10:00Z' }), Date.parse('2026-11-23T11:10:00Z'));
});

test('link state: invited while unopened and young; stale once opened or too old', () => {
  assert.equal(inviteLinkState(invited, NOW), 'invited');
  assert.equal(inviteLinkState({ ...invited, email_confirmed_at: '2026-11-23T11:01:00Z' }, NOW), 'link_stale');
  assert.equal(inviteLinkState(invited, Date.parse(invited.invited_at) + LINK_LIFETIME_MS + 1), 'link_stale');
  assert.equal(inviteLinkState(invited, Date.parse(invited.invited_at) + LINK_LIFETIME_MS), 'invited');
  assert.equal(inviteLinkState({ app_metadata: {} }, NOW), 'link_stale');
});

test('cooldown counts down from the newest link', () => {
  const sentNow = { invited_at: new Date(NOW - 10_000).toISOString() };
  assert.equal(cooldownLeft(sentNow, 60_000, NOW), 50);
  assert.equal(cooldownLeft(sentNow, 10_000, NOW), 0);
  assert.equal(cooldownLeft({}, 60_000, NOW), 0);
});
