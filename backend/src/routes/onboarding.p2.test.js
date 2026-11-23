// P2: the server-side password policy on the invitee's first password, and
// the optional Turnstile check on the public request-link route. Fakes
// only; nothing leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { completeOnboarding, requestLink } from './onboarding.js';
import { verifyTurnstile } from '../lib/turnstile.js';

const res = () => {
  const out = { statusCode: 200, body: null };
  out.status = (code) => { out.statusCode = code; return out; };
  out.json = (body) => { out.body = body; return out; };
  return out;
};
const untouchable = () => { throw new Error('the database must not be reached'); };
const noProfileClient = () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
});

test('server refuses every first password that breaks the 12-character policy, before touching Supabase', async () => {
  const cases = [
    [undefined, 'Password must be at least 12 characters'],
    ['Short1!', 'Password must be at least 12 characters'],
    ['alllowercase1!', 'Password must contain at least one uppercase letter'],
    ['NoNumbersHere!', 'Password must contain at least one number'],
    ['NoSpecials1234', 'Password must contain at least one special character'],
  ];
  for (const [password, error] of cases) {
    const out = res();
    await completeOnboarding({ body: { password }, authUser: { id: 'u1' } }, out, untouchable);
    assert.equal(out.statusCode, 400);
    assert.deepEqual(out.body, { error });
  }
});

test('request-link: a failed security check answers 400 captcha_failed and sends nothing', async () => {
  const out = res();
  let seen;
  await requestLink({ body: { email: 'someone@school.test', captchaToken: 'bad' } }, out, untouchable,
    { minMs: 0, verifyCaptcha: async (token) => { seen = token; return false; } });
  assert.equal(seen, 'bad');
  assert.equal(out.statusCode, 400);
  assert.equal(out.body.code, 'captcha_failed');
  assert.doesNotMatch(JSON.stringify(out.body), /someone@school\.test/);
});

test('request-link: a passed check (or the check switched off) keeps the same generic answer', async () => {
  for (const verifyCaptcha of [async () => true, (token) => verifyTurnstile(token, { secret: '' })]) {
    const out = res();
    await requestLink({ body: { email: 'nobody@school.test' } }, out, noProfileClient, { minMs: 0, verifyCaptcha });
    assert.equal(out.statusCode, 200);
    assert.match(out.body.message, /^If this email belongs to an account/);
  }
});

test('verifyTurnstile: off without a secret (no network call)', async () => {
  const fetchImpl = () => { throw new Error('no call expected'); };
  assert.equal(await verifyTurnstile(undefined, { secret: '', fetchImpl }), true);
});

test('verifyTurnstile: with a secret it fails closed', async () => {
  const calls = [];
  const reply = (status, body) => async (url, init) => { calls.push({ url, init }); return { ok: status === 200, json: async () => body }; };
  const secret = 'test-secret';
  assert.equal(await verifyTurnstile('', { secret, fetchImpl: reply(200, { success: true }) }), false, 'missing token');
  assert.equal(await verifyTurnstile('x'.repeat(2049), { secret, fetchImpl: reply(200, { success: true }) }), false, 'oversized token');
  assert.equal(calls.length, 0, 'no network call without a usable token');
  assert.equal(await verifyTurnstile('tok', { secret, fetchImpl: reply(200, { success: false }) }), false, 'rejected');
  assert.equal(await verifyTurnstile('tok', { secret, fetchImpl: reply(500, { success: true }) }), false, 'server error');
  assert.equal(await verifyTurnstile('tok', { secret, fetchImpl: async () => { throw new Error('offline'); } }), false, 'unreachable');
  assert.equal(await verifyTurnstile('tok', { secret, fetchImpl: reply(200, { success: true }) }), true, 'accepted');
  const last = calls.at(-1);
  assert.equal(last.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(last.init.method, 'POST');
  assert.equal(last.init.body.get('secret'), secret);
  assert.equal(last.init.body.get('response'), 'tok');
});
