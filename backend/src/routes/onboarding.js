import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminClient, requireAuth, requireSession } from '../middleware/requireAuth.js';
import { validatePassword } from '../../../shared/passwordPolicy.js';

const ADMIN_ROLES = ['main_admin'];
const ASSIGNABLE_ROLES = new Set(['student', 'teacher', 'faculty', 'registrar', 'main_admin']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many invitation requests. Try again later.' },
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
  if (authUser?.invited_at && authUser.app_metadata?.onboarding_complete !== true) return 'invitation_pending';
  return (profile.status || 'inactive').toLowerCase();
}

async function rollbackProvisioning(client, userId, profileCreated) {
  if (profileCreated) {
    const { error } = await client.from('profiles').delete().eq('id', userId);
    if (error) console.error('[onboarding] profile rollback failed —', error.message);
  }
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) console.error('[onboarding] auth rollback failed —', error.message);
}

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth(ADMIN_ROLES));

adminUsersRouter.get('/', async (_req, res) => {
  try {
    const client = adminClient();
    const [{ data: profiles, error }, authUsers] = await Promise.all([
      client.from('profiles').select('*').order('created_at', { ascending: false }),
      allAuthUsers(client),
    ]);
    if (error) throw error;
    const authById = new Map(authUsers.map((user) => [user.id, user]));
    res.json({
      users: (profiles || []).map((profile) => {
        const authUser = authById.get(profile.id);
        const setupIncomplete = Boolean(authUser?.invited_at && authUser.app_metadata?.onboarding_complete !== true);
        return {
          ...profile,
          role: setupIncomplete ? (authUser?.app_metadata?.intended_role || profile.role) : profile.role,
          onboarding_status: onboardingStatus(profile, authUser),
          can_resend_invitation: Boolean(authUser?.invited_at && !authUser?.email_confirmed_at),
        };
      }),
    });
  } catch (err) {
    console.error('[onboarding] user directory failed —', err.message);
    res.status(503).json({ error: 'Unable to load the user directory. Try again.' });
  }
});

adminUsersRouter.post('/invite', inviteLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = String(req.body?.role || 'student').trim().toLowerCase();
  const department = String(req.body?.department || '').trim() || null;
  if (!name || !EMAIL.test(email) || !ASSIGNABLE_ROLES.has(role)) {
    return res.status(400).json({ error: 'A valid name, email, and role are required.' });
  }

  const client = adminClient();
  let userId = null;
  let profileCreated = false;
  try {
    const { data: existingProfile, error: lookupError } = await client
      .from('profiles').select('id').eq('email', email).maybeSingle();
    if (lookupError) throw lookupError;
    if (existingProfile) return res.status(409).json({ error: 'An account already uses this email address.' });

    const authUsers = await allAuthUsers(client);
    if (authUsers.some((user) => user.email?.toLowerCase() === email)) {
      return res.status(409).json({ error: 'An authentication account already uses this email address.' });
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

    const { error: inviteError } = await client.auth.admin.inviteUserByEmail(email, {
      data: metadata, redirectTo,
    });
    if (inviteError) throw inviteError;

    res.status(201).json({ user: { ...profile, role, onboarding_status: 'invitation_pending', can_resend_invitation: true } });
  } catch (err) {
    if (userId) await rollbackProvisioning(client, userId, profileCreated);
    console.error('[onboarding] invitation failed —', err.message);
    res.status(502).json({ error: 'The invitation could not be completed. No account was added.' });
  }
});

adminUsersRouter.post('/:id/resend-invitation', inviteLimiter, async (req, res) => {
  try {
    const client = adminClient();
    const { data: profile, error } = await client.from('profiles')
      .select('id, email, name, role, status').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!profile) return res.status(404).json({ error: 'User not found.' });
    if (profile.status === 'archived') return res.status(409).json({ error: 'Archived accounts cannot receive invitations.' });

    const { data: authData, error: authError } = await client.auth.admin.getUserById(profile.id);
    if (authError || !authData?.user) throw authError || new Error('Authentication account not found.');
    if (!authData.user.invited_at || authData.user.email_confirmed_at) {
      return res.status(409).json({ error: 'This account no longer has a pending invitation.' });
    }

    const { error: inviteError } = await client.auth.admin.inviteUserByEmail(profile.email, {
      data: inviteMetadata({
        ...profile,
        role: authData.user.app_metadata?.intended_role || profile.role,
      }),
      redirectTo: setupRedirect(),
    });
    if (inviteError) throw inviteError;
    res.json({ message: 'Invitation sent again.' });
  } catch (err) {
    console.error('[onboarding] resend failed —', err.message);
    res.status(502).json({ error: 'The invitation could not be resent. Try again.' });
  }
});

adminUsersRouter.patch('/:id/archive-state', async (req, res) => {
  try {
    const client = adminClient();
    const archived = req.body?.archived === true;
    const { data, error: authError } = await client.auth.admin.getUserById(req.params.id);
    if (authError || !data?.user) throw authError || new Error('Authentication account not found.');
    const pending = Boolean(data.user.invited_at && data.user.app_metadata?.onboarding_complete !== true);
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
        can_resend_invitation: Boolean(pending && !data.user.email_confirmed_at),
      },
    });
  } catch (err) {
    console.error('[onboarding] archive state failed —', err.message);
    res.status(502).json({ error: 'The account status could not be changed.' });
  }
});

export const onboardingRouter = Router();
onboardingRouter.post('/complete', requireSession, async (req, res) => {
  const passwordError = validatePassword(req.body?.password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const client = adminClient();
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
});
