// ============================================
// FILE: backend/src/middleware/requireAuth.js
// Who is calling, and are they allowed to?
//
// The token is verified by asking Supabase, not by decoding it here. A JWT
// can be read by anyone; only the issuer can say whether it is still valid,
// and a locally-decoded token would keep working after the account was
// suspended or the session revoked.
//
// This is NOT where data authorization lives. Row Level Security handles
// that, per query, inside the database. This middleware answers one narrower
// question: may this caller spend the school's Gemini budget?
// ============================================

import { createClient } from '@supabase/supabase-js';

let anon = null;
const anonClient = () => {
  if (!anon) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set on the server.');
    anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return anon;
};

let admin = null;
const adminClient = () => {
  if (!admin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server.');
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
};

export { adminClient };

/**
 * Verifies the bearer token and attaches { id, email, role } to req.user.
 *
 * @param {string[]} [allowedRoles] profiles.role values permitted through.
 *   Omitted, any authenticated account passes.
 */
export function requireAuth(allowedRoles) {
  return async (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token.' });

    let user;
    try {
      const { data, error } = await anonClient().auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session.' });
      user = data.user;
    } catch (err) {
      // An outage here must not read as "not authorised" — that would send
      // the caller to fix a login that is not broken.
      console.error('[auth] token verification failed —', err.message);
      return res.status(503).json({ error: 'Could not verify your session. Try again.' });
    }

    // The app's role lives in profiles.role, not in the JWT. Read with the
    // service key because a teacher's own RLS view of profiles is not
    // guaranteed to include the column this decision needs.
    let role = null;
    try {
      const { data, error } = await adminClient()
        .from('profiles').select('role, status').eq('id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(403).json({ error: 'No profile for this account.' });
      if (data.status !== 'active') return res.status(403).json({ error: 'This account is not active.' });
      role = data.role;
    } catch (err) {
      console.error('[auth] profile lookup failed —', err.message);
      return res.status(503).json({ error: 'Could not verify your account. Try again.' });
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Your account may not do this.' });
    }

    req.user = { id: user.id, email: user.email, role };
    next();
  };
}
