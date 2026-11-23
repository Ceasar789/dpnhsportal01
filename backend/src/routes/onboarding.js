import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminClient, requireAuth, requireSession } from '../middleware/requireAuth.js';
import { validatePassword } from '../../../shared/passwordPolicy.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { cooldownLeft, inviteLinkState, isNotActivated } from '../../../shared/inviteState.js';

const ADMIN_ROLES = ['main_admin'];
// The app has three roles. faculty and registrar were removed: an invite or a
// pending password setup naming either is refused.
export const ASSIGNABLE_ROLES = new Set(['student', 'teacher', 'main_admin']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A DepEd LRN: exactly twelve digits. Required when the invited role is student.
export const LRN_PATTERN = /^\d{12}$/;
const LRN_REQUIRED = 'A 12-digit LRN is required for a student.';
const LRN_TAKEN = 'This LRN is already used by another student.';
// P1: the invite form, Resend and the public request-link page.
const INVITE_PENDING = 'This person was already invited. Use Resend instead.';
const RESEND_COOLDOWN = 'A link was sent less than a minute ago. Wait a minute, then try again.';
const REQUEST_LINK_SENT = 'If this email belongs to an account that still needs a password, we sent a new link. Check your inbox and spam folder.';
const REQUEST_LINK_INVALID = 'Enter a valid email address.';
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const REQUEST_LINK_COOLDOWN_MS = 10 * 60 * 1000;

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many invitation requests. Try again later.' },
});

// The public request-link route. The limit that holds on serverless is the
// per-email one: cooldownLeft reads the auth user's own link timestamps,
// which Supabase stores. This per-IP limiter lives in one function
// instance's memory.
// ponytail: an extra brake only; a durable per-IP limit needs a table (P1 report).
const requestLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Vercel sets x-real-ip to the caller; the app does not trust proxies, so
  // req.ip there is the platform's own address.
  keyGenerator: (req) => String(req.get('x-real-ip') || req.ip),
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests. Try again later.' },
});

function inviteMetadata({ name, role }) {
  return { full_name: name, portal_role: role };
}

export function setupRedirect() {
  const configured = process.env.APP_URL?.replace(/\/$/, '');
  if (!configured) throw new Error('APP_URL must be configured for invitation redirects.');
  return `${configured}/setup-password`;
}

async function allAuthUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

export function onboardingStatus(profile, authUser) {
  if ((profile.status || '').toLowerCase() === 'archived') return 'archived';
  if ((profile.status || '').toLowerCase() === 'active') return 'active';
  if (isNotActivated(profile.status, authUser)) return 'invitation_pending';
  return (profile.status || 'inactive').toLowerCase();
}

async function rollbackProvisioning(client, userId, profileCreated, studentCreated = false) {
  if (studentCreated) {
    const { error } = await client.from('students').delete().eq('id', userId);
    if (error) console.error('[onboarding] student record rollback failed —', error.message);
  }
  if (profileCreated) {
    const { error } = await client.from('profiles').delete().eq('id', userId);
    if (error) console.error('[onboarding] profile rollback failed —', error.message);
  }
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) console.error('[onboarding] auth rollback failed —', error.message);
}

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth(ADMIN_ROLES));

// The handlers take a client factory so a test can pass a fake one; the
// router passes adminClient, called where it always was.
export async function listDirectory(res, getClient = adminClient) {
  try {
    const client = getClient();
    const [{ data: profiles, error }, authUsers, { data: students, error: studentsError }] = await Promise.all([
      client.from('profiles').select('*').order('created_at', { ascending: false }),
      allAuthUsers(client),
      client.from('students').select('id, lrn'),
    ]);
    if (error) throw error;
    if (studentsError) throw studentsError;
    const authById = new Map(authUsers.map((user) => [user.id, user]));
    const lrnById = new Map((students || []).map((student) => [student.id, student.lrn]));
    res.json({
      users: (profiles || []).map((profile) => {
        const authUser = authById.get(profile.id);
        const setupIncomplete = Boolean(authUser?.invited_at && authUser.app_metadata?.onboarding_complete !== true);
        const pending = isNotActivated(profile.status, authUser);
        return {
          ...profile,
          role: setupIncomplete ? (authUser?.app_metadata?.intended_role || profile.role) : profile.role,
          onboarding_status: onboardingStatus(profile, authUser),
          // P1: every not-activated account can get a new link, also when
          // the first one was opened (or scanned) without a password set.
          can_resend_invitation: pending,
          invite_link_state: pending ? inviteLinkState(authUser) : null,
          lrn: lrnById.get(profile.id) ?? null,
        };
      }),
    });
  } catch (err) {
    console.error('[onboarding] user directory failed —', err.message);
    res.status(503).json({ error: 'Unable to load the user directory. Try again.' });
  }
}
adminUsersRouter.get('/', (_req, res) => listDirectory(res));

export async function inviteUser(req, res, getClient = adminClient) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = String(req.body?.role || 'student').trim().toLowerCase();
  const department = String(req.body?.department || '').trim() || null;
  if (!name || !EMAIL.test(email) || !ASSIGNABLE_ROLES.has(role)) {
    return res.status(400).json({ error: 'A valid name, email, and role are required.' });
  }
  // Students only: any other role ignores lrn, exactly as before.
  const lrn = role === 'student' ? String(req.body?.lrn ?? '').trim() : null;
  if (role === 'student' && !LRN_PATTERN.test(lrn)) return res.status(400).json({ error: LRN_REQUIRED });

  const client = getClient();
  let userId = null;
  let profileCreated = false;
  let studentCreated = false;
  try {
    const { data: existingProfile, error: lookupError } = await client
      .from('profiles').select('id, status').eq('email', email).maybeSingle();
    if (lookupError) throw lookupError;
    if (existingProfile) {
      // Admins only (this router): say whether it is a pending invite, so
      // the form can offer Resend instead.
      const { data: existingAuth } = await client.auth.admin.getUserById(existingProfile.id);
      if (isNotActivated(existingProfile.status, existingAuth?.user)) {
        return res.status(409).json({ error: INVITE_PENDING, code: 'invite_pending' });
      }
      return res.status(409).json({ error: 'An account already uses this email address.', code: 'account_exists' });
    }

    const authUsers = await allAuthUsers(client);
    if (authUsers.some((user) => user.email?.toLowerCase() === email)) {
      return res.status(409).json({ error: 'An authentication account already uses this email address.' });
    }
    if (lrn) {
      const { data: lrnOwner, error: lrnError } = await client
        .from('students').select('id').eq('lrn', lrn).maybeSingle();
      if (lrnError) throw lrnError;
      if (lrnOwner) return res.status(409).json({ error: LRN_TAKEN });
    }

    const redirectTo = setupRedirect();
    const metadata = inviteMetadata({ name, role });
    const { data: generated, error: generateError } = await client.auth.admin.generateLink({
      type: 'invite', email, options: { data: metadata, redirectTo },
    });
    if (generateError || !generated?.user?.id) throw generateError || new Error('Supabase did not create the invited user.');
    userId = generated.user.id;

    const { error: metadataError } = await client.auth.admin.updateUserById(userId, {
      app_metadata: { ...generated.user.app_metadata, intended_role: role },
    });
    if (metadataError) throw metadataError;

    const { data: profile, error: profileError } = await client.from('profiles').insert({
      id: userId, email, name, role: 'guest', department, status: 'inactive',
    }).select().single();
    if (profileError) throw profileError;
    profileCreated = true;

    if (lrn) {
      const { error: studentError } = await client.from('students').insert({ id: userId, lrn });
      if (studentError?.code === '23505') {
        // Taken between the check above and this insert: undo and say so.
        await rollbackProvisioning(client, userId, profileCreated);
        return res.status(409).json({ error: LRN_TAKEN });
      }
      if (studentError) throw studentError;
      studentCreated = true;
    }

    const { error: inviteError } = await client.auth.admin.inviteUserByEmail(email, {
      data: metadata, redirectTo,
    });
    if (inviteError) throw inviteError;

    res.status(201).json({ user: { ...profile, role, onboarding_status: 'invitation_pending', can_resend_invitation: true, invite_link_state: 'invited', ...(lrn && { lrn }) } });
  } catch (err) {
    if (userId) await rollbackProvisioning(client, userId, profileCreated, studentCreated);
    console.error('[onboarding] invitation failed —', err.message);
    res.status(502).json({ error: 'The invitation could not be completed. No account was added.' });
  }
}
adminUsersRouter.post('/invite', inviteLimiter, (req, res) => inviteUser(req, res));

// Supabase's own per-user email limit (Auth > Rate limits) answers 429.
const isEmailRateLimit = (err) => err?.status === 429 || err?.code === 'over_email_send_rate_limit';

// P1: a new link for a not-activated account. A link that was never opened
// is sent again as an invite. Once a link was opened (by the person or by a
// mail scanner) Supabase has confirmed the email and refuses a second
// invite, so a set-password (recovery) link goes out instead; it lands on
// the same password setup (/complete accepts it). Never creates a user.
// Links and tokens are never logged.
async function sendSetupLink(client, profile, authUser) {
  const email = authUser.email || profile.email;
  const redirectTo = setupRedirect();
  if (authUser.email_confirmed_at) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return 'recovery';
  }
  const { error } = await client.auth.admin.inviteUserByEmail(email, {
    data: inviteMetadata({ name: profile.name, role: authUser.app_metadata?.intended_role || profile.role }),
    redirectTo,
  });
  if (error) throw error;
  return 'invite';
}

export async function resendInvitation(req, res, getClient = adminClient, now = Date.now) {
  try {
    const client = getClient();
    const { data: profile, error } = await client.from('profiles')
      .select('id, email, name, role, status').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!profile) return res.status(404).json({ error: 'User not found.' });
    if (profile.status === 'archived') return res.status(409).json({ error: 'Archived accounts cannot receive invitations.' });

    // profiles.id references auth.users ON DELETE CASCADE, so a profile
    // always has its auth user: there is no "invite a missing user" case.
    const { data: authData, error: authError } = await client.auth.admin.getUserById(profile.id);
    if (authError || !authData?.user) throw authError || new Error('Authentication account not found.');
    if (!isNotActivated(profile.status, authData.user)) {
      return res.status(409).json({ error: 'This account no longer has a pending invitation.' });
    }
    if (cooldownLeft(authData.user, RESEND_COOLDOWN_MS, now()) > 0) {
      return res.status(429).json({ error: RESEND_COOLDOWN, code: 'resend_cooldown' });
    }

    const link = await sendSetupLink(client, profile, authData.user);
    res.json({ message: link === 'recovery' ? 'A set-password link was sent.' : 'Invitation sent again.', link });
  } catch (err) {
    if (isEmailRateLimit(err)) return res.status(429).json({ error: RESEND_COOLDOWN, code: 'resend_cooldown' });
    console.error('[onboarding] resend failed —', err.message);
    res.status(502).json({ error: 'The invitation could not be resent. Try again.' });
  }
}
adminUsersRouter.post('/:id/resend-invitation', inviteLimiter, (req, res) => resendInvitation(req, res));

adminUsersRouter.patch('/:id/archive-state', async (req, res) => {
  try {
    const client = adminClient();
    const archived = req.body?.archived === true;
    const { data, error: authError } = await client.auth.admin.getUserById(req.params.id);
    if (authError || !data?.user) throw authError || new Error('Authentication account not found.');
    const pending = isNotActivated(undefined, data.user);
    let nextStatus = 'archived';
    let nextOnboardingStatus = 'archived';
    if (!archived) {
      nextStatus = pending ? 'inactive' : 'active';
      nextOnboardingStatus = pending ? 'invitation_pending' : 'active';
    }
    const { data: profile, error } = await client.from('profiles')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({
      user: {
        ...profile,
        role: pending ? (data.user.app_metadata?.intended_role || profile.role) : profile.role,
        onboarding_status: nextOnboardingStatus,
        can_resend_invitation: Boolean(pending && !archived),
        invite_link_state: pending && !archived ? inviteLinkState(data.user) : null,
      },
    });
  } catch (err) {
    console.error('[onboarding] archive state failed —', err.message);
    res.status(502).json({ error: 'The account status could not be changed.' });
  }
});

export const onboardingRouter = Router();

// P1: POST /api/onboarding/request-link { email }. Public. Always the same
// answer, so it never tells whether an account exists or what state it is
// in. Mail goes out only for a not-activated account, at most once per
// REQUEST_LINK_COOLDOWN_MS per account. A short floor on the answer time
// hides most of the difference between "nothing to do" and "sent".
export async function requestLink(req, res, getClient = adminClient, { now = Date.now, minMs = 600, verifyCaptcha = verifyTurnstile } = {}) {
  const started = Date.now();
  const raw = req.body?.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) return res.status(400).json({ error: REQUEST_LINK_INVALID });
  // P2: optional security check (on only when TURNSTILE_SECRET_KEY is set).
  if (!(await verifyCaptcha(req.body?.captchaToken))) {
    return res.status(400).json({ error: 'The security check did not pass. Complete it again, then retry.', code: 'captcha_failed' });
  }
  try {
    const client = getClient();
    const { data: profile, error } = await client.from('profiles')
      .select('id, email, name, role, status').eq('email', email).maybeSingle();
    if (error) throw error;
    if (profile) {
      const { data: authData, error: authError } = await client.auth.admin.getUserById(profile.id);
      if (authError) throw authError;
      const authUser = authData?.user;
      if (isNotActivated(profile.status, authUser) && cooldownLeft(authUser, REQUEST_LINK_COOLDOWN_MS, now()) === 0) {
        await sendSetupLink(client, profile, authUser);
      }
    }
  } catch (err) {
    // Logged without the address; the caller still gets the same answer.
    console.error('[onboarding] request-link failed —', err?.message);
  }
  const wait = minMs - (Date.now() - started);
  if (wait > 0) await new Promise((resolve) => { setTimeout(resolve, wait); });
  res.json({ message: REQUEST_LINK_SENT });
}
onboardingRouter.post('/request-link', requestLinkLimiter, (req, res) => requestLink(req, res));

// The invitee's first password. The 12-character policy is checked here, on
// the server, before anything else (P2 test: onboarding.p2.test.js).
export async function completeOnboarding(req, res, getClient = adminClient) {
  const passwordError = validatePassword(req.body?.password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const client = getClient();
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('id, status').eq('id', req.authUser.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return res.status(403).json({ error: 'No invited profile exists for this account.' });
    if (profile.status === 'archived') return res.status(403).json({ error: 'This invitation is no longer active.' });
    if (!req.authUser.invited_at || req.authUser.app_metadata?.onboarding_complete === true) {
      return res.status(409).json({ error: 'This account does not have a pending password setup.' });
    }
    const intendedRole = req.authUser.app_metadata?.intended_role;
    if (!ASSIGNABLE_ROLES.has(intendedRole)) {
      return res.status(409).json({ error: 'This invitation does not contain a valid assigned role.' });
    }

    const { error: passwordUpdateError } = await client.auth.admin.updateUserById(req.authUser.id, {
      password: req.body.password,
    });
    if (passwordUpdateError) throw passwordUpdateError;

    const { error: activationError } = await client.from('profiles')
      .update({ role: intendedRole, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', req.authUser.id);
    if (activationError) throw activationError;

    const { error: metadataError } = await client.auth.admin.updateUserById(req.authUser.id, {
      app_metadata: { ...req.authUser.app_metadata, onboarding_complete: true },
    });
    if (metadataError) {
      // The password and profile activation already succeeded. Do not report
      // false failure or undo a usable account solely because this secondary
      // status marker could not be written; profile.status remains the
      // authoritative active state.
      console.error('[onboarding] completion metadata failed —', metadataError.message);
    }

    res.json({ message: 'Password created. Your account is active.' });
  } catch (err) {
    console.error('[onboarding] password setup failed —', err.message);
    res.status(502).json({ error: 'Password setup could not be completed. The invitation can be tried again.' });
  }
}
onboardingRouter.post('/complete', requireSession, (req, res) => completeOnboarding(req, res));
