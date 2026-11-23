// P1: Resend for every not-activated account, the public request-link route
// and the invite 409s. The handlers run against a fake Supabase client;
// nothing leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteUser, listDirectory, requestLink, resendInvitation, RESEND_COOLDOWN_MS, REQUEST_LINK_COOLDOWN_MS } from './onboarding.js';

process.env.APP_URL = 'https://portal.example.test';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

// The accounts the fake knows, by state.
const ACCOUNTS = {
  pending: {
    profile: { id: 'u-pending', email: 'pending@school.test', name: 'Pia', role: 'guest', status: 'inactive' },
    auth: { id: 'u-pending', email: 'pending@school.test', invited_at: ago(2 * HOUR), app_metadata: { intended_role: 'teacher' } },
  },
  consumed: {
    profile: { id: 'u-consumed', email: 'consumed@school.test', name: 'Cora', role: 'guest', status: 'inactive' },
    auth: { id: 'u-consumed', email: 'consumed@school.test', invited_at: ago(2 * HOUR), email_confirmed_at: ago(HOUR), app_metadata: { intended_role: 'student' } },
  },
  active: {
    profile: { id: 'u-active', email: 'active@school.test', name: 'Abe', role: 'teacher', status: 'active' },
    auth: { id: 'u-active', email: 'active@school.test', invited_at: ago(50 * HOUR), email_confirmed_at: ago(49 * HOUR), app_metadata: { intended_role: 'teacher', onboarding_complete: true } },
  },
  archived: {
    profile: { id: 'u-archived', email: 'archived@school.test', name: 'Ari', role: 'guest', status: 'archived' },
    auth: { id: 'u-archived', email: 'archived@school.test', invited_at: ago(2 * HOUR), app_metadata: {} },
  },
};

const fakeClient = ({ accounts = ACCOUNTS, sendError = null } = {}) => {
  const sent = [];
  const all = Object.values(accounts);
  const find = (key, value) => all.find((a) => a.profile[key] === value) || null;
  const from = (table) => {
    const where = {};
    const builder = {
      select: () => builder,
      eq: (k, v) => { where[k] = v; return builder; },
      order: () => builder,
      maybeSingle: async () => ({ data: table === 'profiles' ? (find(...Object.entries(where)[0] || [])?.profile ?? null) : null, error: null }),
      then: (ok, bad) => Promise.resolve({ data: table === 'profiles' ? all.map((a) => a.profile) : [], error: null }).then(ok, bad),
    };
    return builder;
  };
  return {
    sent,
    from,
    auth: {
      resetPasswordForEmail: async (email, options) => { sent.push(['recovery', email, options]); return { error: sendError }; },
      admin: {
        getUserById: async (id) => {
          const account = all.find((a) => a.auth.id === id);
          return account ? { data: { user: account.auth }, error: null } : { data: { user: null }, error: { status: 404, message: 'User not found' } };
        },
        inviteUserByEmail: async (email, options) => { sent.push(['invite', email, options]); return { error: sendError }; },
        listUsers: async () => ({ data: { users: all.map((a) => a.auth) }, error: null }),
        generateLink: async () => { throw new Error('must not create a user'); },
      },
    },
  };
};
const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const resend = async (id, client, now = NOW) => {
  const res = fakeRes();
  await quiet(() => resendInvitation({ params: { id } }, res, () => client, () => now));
  return res;
};
const request = async (body, client, now = NOW) => {
  const res = fakeRes();
  await quiet(() => requestLink({ body }, res, () => client, { now: () => now, minMs: 0 }));
  return res;
};

test('resend: a pending invite (link never opened) is sent again as an invite with the setup redirect', async () => {
  const client = fakeClient();
  const res = await resend('u-pending', client);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'Invitation sent again.', link: 'invite' });
  assert.deepEqual(client.sent, [['invite', 'pending@school.test', {
    data: { full_name: 'Pia', portal_role: 'teacher' }, redirectTo: 'https://portal.example.test/setup-password',
  }]]);
});

test('resend: a link opened or scanned without a password set gets a set-password (recovery) link', async () => {
  const client = fakeClient();
  const res = await resend('u-consumed', client);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: 'A set-password link was sent.', link: 'recovery' });
  assert.deepEqual(client.sent, [['recovery', 'consumed@school.test', { redirectTo: 'https://portal.example.test/setup-password' }]]);
});

test('resend: an activated account, an archived one and an unknown id are refused and nothing is sent', async () => {
  const client = fakeClient();
  const active = await resend('u-active', client);
  assert.equal(active.statusCode, 409);
  assert.equal(active.body.error, 'This account no longer has a pending invitation.');
  const archived = await resend('u-archived', client);
  assert.equal(archived.statusCode, 409);
  assert.equal(archived.body.error, 'Archived accounts cannot receive invitations.');
  const unknown = await resend('nobody', client);
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.body.error, 'User not found.');
  assert.deepEqual(client.sent, []);
});

test('resend: a short cooldown after any link, with a clear message', async () => {
  const fresh = { ...ACCOUNTS, pending: { ...ACCOUNTS.pending, auth: { ...ACCOUNTS.pending.auth, invited_at: ago(10_000) } } };
  const client = fakeClient({ accounts: fresh });
  const res = await resend('u-pending', client);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, { error: 'A link was sent less than a minute ago. Wait a minute, then try again.', code: 'resend_cooldown' });
  assert.deepEqual(client.sent, []);
  const later = await resend('u-pending', client, NOW - 10_000 + RESEND_COOLDOWN_MS);
  assert.equal(later.statusCode, 200);
});

test("resend: Supabase's own email limit becomes the same cooldown message; other failures stay generic", async () => {
  const limited = await resend('u-pending', fakeClient({ sendError: { status: 429, code: 'over_email_send_rate_limit', message: 'raw' } }));
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'resend_cooldown');
  const broken = await resend('u-pending', fakeClient({ sendError: { status: 500, message: 'raw smtp detail' } }));
  assert.equal(broken.statusCode, 502);
  assert.deepEqual(broken.body, { error: 'The invitation could not be resent. Try again.' });
});

const GENERIC = { message: 'If this email belongs to an account that still needs a password, we sent a new link. Check your inbox and spam folder.' };

test('request-link: the same answer for unknown, pending, consumed, active and archived emails; mail only for not-activated', async () => {
  const client = fakeClient();
  for (const email of ['nobody@school.test', 'active@school.test', 'archived@school.test']) {
    const res = await request({ email }, client);
    assert.equal(res.statusCode, 200, email);
    assert.deepEqual(res.body, GENERIC, email);
  }
  assert.deepEqual(client.sent, []);
  const pending = await request({ email: '  Pending@School.TEST ' }, client);
  const consumed = await request({ email: 'consumed@school.test' }, client);
  assert.deepEqual(pending.body, GENERIC);
  assert.deepEqual(consumed.body, GENERIC);
  assert.deepEqual(client.sent.map(([kind, email]) => [kind, email]), [['invite', 'pending@school.test'], ['recovery', 'consumed@school.test']]);
});

test('request-link: a failure inside still gives the same answer and leaks nothing', async () => {
  const res = await request({ email: 'pending@school.test' }, fakeClient({ sendError: { status: 500, message: 'smtp down' } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, GENERIC);
});

test('request-link: per-email limit from the stored link time (survives any number of server instances)', async () => {
  const recent = { ...ACCOUNTS, consumed: { ...ACCOUNTS.consumed, auth: { ...ACCOUNTS.consumed.auth, recovery_sent_at: ago(60_000) } } };
  const client = fakeClient({ accounts: recent });
  const res = await request({ email: 'consumed@school.test' }, client);
  assert.deepEqual(res.body, GENERIC, 'limited, yet the same answer');
  assert.deepEqual(client.sent, []);
  await request({ email: 'consumed@school.test' }, client, NOW - 60_000 + REQUEST_LINK_COOLDOWN_MS);
  assert.equal(client.sent.length, 1);
});

test('request-link: the email is validated and normalised before any lookup', async () => {
  const client = fakeClient();
  for (const body of [{}, { email: '' }, { email: 'nope' }, { email: ['pending@school.test'] }, { email: { a: 1 } }, { email: `${'a'.repeat(250)}@x.co` }]) {
    const res = await request(body, client);
    assert.equal(res.statusCode, 400, JSON.stringify(body).slice(0, 40));
    assert.deepEqual(res.body, { error: 'Enter a valid email address.' });
  }
  assert.deepEqual(client.sent, []);
});

test('request-link: the answer waits for a floor so "nothing to do" is not visibly faster', async () => {
  const res = fakeRes();
  const t0 = Date.now();
  await requestLink({ body: { email: 'nobody@school.test' } }, res, () => fakeClient(), { minMs: 120 });
  assert.ok(Date.now() - t0 >= 110);
  assert.deepEqual(res.body, GENERIC);
});

const invite = async (email) => {
  const res = fakeRes();
  await quiet(() => inviteUser({ body: { name: 'X', email, role: 'teacher' } }, res, () => fakeClient()));
  return res;
};

test('invite 409: a pending invite says use Resend; an active account says it already has one', async () => {
  for (const email of ['pending@school.test', 'consumed@school.test']) {
    const res = await invite(email);
    assert.equal(res.statusCode, 409, email);
    assert.deepEqual(res.body, { error: 'This person was already invited. Use Resend instead.', code: 'invite_pending' });
  }
  for (const email of ['active@school.test', 'archived@school.test']) {
    const res = await invite(email);
    assert.equal(res.statusCode, 409, email);
    assert.deepEqual(res.body, { error: 'An account already uses this email address.', code: 'account_exists' });
  }
});

test('directory: Resend for every not-activated account, with the link state for the chip', async () => {
  const res = fakeRes();
  await listDirectory(res, () => fakeClient());
  const byId = Object.fromEntries(res.body.users.map((u) => [u.id, [u.onboarding_status, u.can_resend_invitation, u.invite_link_state]]));
  assert.deepEqual(byId['u-pending'], ['invitation_pending', true, 'invited']);
  assert.deepEqual(byId['u-consumed'], ['invitation_pending', true, 'link_stale']);
  assert.deepEqual(byId['u-active'], ['active', false, null]);
  assert.deepEqual(byId['u-archived'], ['archived', false, null]);
});
