import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext(null);

const normalizeRole = (role) => {
  if (!role) return 'student';
  const normalized = role.toString().trim().toLowerCase();
  const roleMap = {
    main_admin: 'main_admin',
    admin: 'main_admin',
    teacher: 'teacher',
    faculty: 'faculty',
    registrar: 'registrar',
    student: 'student',
  };
  return roleMap[normalized] || 'student';
};

const isArchivedProfile = (profile) => profile?.status?.toString().trim().toLowerCase() === 'archived';
const loginAttemptKey = (email) => `smartedu-login-attempts:${email.trim().toLowerCase()}`;
const readLoginAttempts = (email) => {
  try { return JSON.parse(localStorage.getItem(loginAttemptKey(email)) || '{"count":0}'); }
  catch { return { count: 0 }; }
};
const clearLoginAttempts = (email) => localStorage.removeItem(loginAttemptKey(email));
const recordLoginFailure = (email) => {
  const attempts = readLoginAttempts(email);
  const next = { count: Math.min(5, (attempts.count || 0) + 1), updatedAt: Date.now() };
  localStorage.setItem(loginAttemptKey(email), JSON.stringify(next));
  return next.count;
};

const buildUserData = (user, profile, role) => ({
  uid: user.id,
  id: user.id,
  email: user.email,
  name:
    profile?.name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'User',
  role,
  status: profile?.status || 'active',
  profile: profile || null,
  // Convenience role flags
  isMainAdmin: role === 'main_admin',
  isTeacher: role === 'teacher',
  isFaculty: role === 'faculty',
  isRegistrar: role === 'registrar',
  isStudent: role === 'student',
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [sessionTimeoutMs, setSessionTimeoutMs] = useState(30 * 60 * 1000);
  const mountedRef = useRef(true);
  const loginInProgressRef = useRef(false);
  const userDataRef = useRef(null);
  // Guards against a slow/stale profile fetch (a background TOKEN_REFRESHED
  // auth event, a tab regaining visibility) overwriting fresher data — e.g.
  // one just written by updateProfile() — if it resolves later out of order.
  const profileOpSeqRef = useRef(0);

  // Announce the authenticated user to the shared Realtime presence channel.
  useEffect(() => {
    if (!userData?.uid) {
      setOnlineUserIds(new Set());
      return undefined;
    }

    const presenceChannel = supabase.channel('portal-presence', {
      config: { presence: { key: userData.uid } },
    });
    const updateOnlineUsers = () => {
      setOnlineUserIds(new Set(Object.keys(presenceChannel.presenceState())));
    };

    presenceChannel
      .on('presence', { event: 'sync' }, updateOnlineUsers)
      .on('presence', { event: 'join' }, updateOnlineUsers)
      .on('presence', { event: 'leave' }, updateOnlineUsers)
      .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const { error: trackError } = await presenceChannel.track({
          user_id: userData.uid,
          name: userData.name,
        });

        if (trackError) console.warn('Presence tracking error:', trackError.message);
        updateOnlineUsers();
      }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [userData?.uid, userData?.name]);

  useEffect(() => {
    let active = true;
    supabase.from('school_settings').select('session_timeout').eq('id', 1).single().then(({ data }) => {
      if (!active || !data?.session_timeout) return;
      const match = data.session_timeout.match(/(\d+)\s*(min|hour)/i);
      if (match) setSessionTimeoutMs(Number(match[1]) * (match[2].toLowerCase() === 'hour' ? 60 : 1) * 60 * 1000);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!userData?.uid) return undefined;
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => logout(), sessionTimeoutMs);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [userData?.uid, sessionTimeoutMs]);

  // ─── Fetch profile from profiles table ───────────────────────────────────
  // Retries once after a short pause if the first attempt times out (4s
  // timeout, 800ms pause, one retry — worst case ~8.8s) — the project's
  // connection pool (free-tier, small compute) is occasionally saturated
  // for a few seconds, and a lot of the time a retry a moment later goes
  // through fine, avoiding a manual re-login to recover.
  const fetchProfileOnce = async (userId) => {
    const profilePromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Safety net: if the profiles query hangs (e.g. connection pool
    // saturation on the backend), don't block forever.
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ data: null, error: { code: 'CLIENT_TIMEOUT' } }), 4000)
    );

    return Promise.race([profilePromise, timeoutPromise]);
  };

  // Returns { profile, fetchFailed }. The distinction matters: a failed READ is
  // not the same answer as "this account has no profile row". Collapsing both
  // to null lets a connection hiccup silently demote a real admin to student,
  // because normalizeRole(null) === 'student'.
  const fetchProfile = async (userId) => {
    try {
      let { data, error: profileError } = await fetchProfileOnce(userId);

      if (profileError?.code === 'CLIENT_TIMEOUT') {
        console.warn('⚠️ Profile fetch timed out after 4s — retrying once...');
        await new Promise((r) => setTimeout(r, 800));
        ({ data, error: profileError } = await fetchProfileOnce(userId));
      }

      if (profileError?.code === 'CLIENT_TIMEOUT') {
        console.warn('⚠️ Profile fetch timed out again — role cannot be verified');
        return { profile: null, fetchFailed: true };
      }

      // PGRST116 is "no rows matched", a real answer rather than a failure.
      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('⚠️ Profile fetch failed:', profileError.message);
        return { profile: null, fetchFailed: true };
      }

      return { profile: data || null, fetchFailed: false };
    } catch (err) {
      console.warn('⚠️ fetchProfile error:', err.message);
      return { profile: null, fetchFailed: true };
    }
  };

  // ─── Bootstrap session on mount ──────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // There is deliberately no separate initSession() here any more.
    //
    // supabase-js always emits INITIAL_SESSION once at startup, carrying the
    // restored session or null, so the subscription below already does this
    // job. Running a second initialiser alongside it was a race, and it had
    // a real symptom: on reload both started, the later one bumped
    // profileOpSeqRef, initSession correctly declined to apply its own
    // now-stale result — and then cleared `loading` anyway. ProtectedRoute
    // saw loading=false with isAuthenticated=false and redirected. Every F5
    // on a dashboard logged the user out, while a perfectly valid session
    // sat in sessionStorage.
    //
    // Two initialisers writing the same state is the defect; one is the fix.


    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mountedRef.current) return;

        console.log('🔄 Auth state change:', event);

        // supabase-js holds an internal lock for the duration of this
        // callback. Issuing a supabase.from(...) query from inside it — even
        // behind an `await`, which merely suspends this function without
        // returning control to supabase-js — blocks on that same lock, which
        // cannot release until the callback returns. The query hangs until
        // our own client-side fetch timeout fires (see fetchProfileOnce),
        // deadlocking every login. Deferring the body with setTimeout(...,0)
        // lets this callback return synchronously right away, releasing the
        // lock before the deferred function ever calls supabase.from(...).
        setTimeout(async () => {
          // The component may have unmounted between scheduling and running.
          if (!mountedRef.current) return;

          const opSeq = ++profileOpSeqRef.current;

          // try/finally because two paths below return early — an archived
          // profile, and an unreadable one with no cached role. With
          // initSession gone, nothing else clears `loading`, and a bare
          // return would leave the app on its spinner for ever.
          try {
          if (session?.user) {
            const { profile, fetchFailed } = await fetchProfile(session.user.id);
            if (!mountedRef.current) return;

            if (isArchivedProfile(profile)) {
              await supabase.auth.signOut({ scope: 'local' });
              return;
            }
            // Role comes ONLY from the profiles row. user_metadata is writable
            // by the account holder via supabase.auth.updateUser({data:{...}}),
            // so trusting it here would let anyone grant themselves any role.
            // The cached fallback is a previous successful read of this same
            // profile, so it is server-derived too — it covers only the case
            // where the fetch times out on a flaky connection.
            const cachedRole = userDataRef.current?.uid === session.user.id
              ? userDataRef.current.role
              : null;

            if (fetchFailed && !cachedRole) return;

            // A transient failure with a cached role must leave userData
            // untouched rather than rebuild it with a null profile. This is the path a browser tab-visibility refresh
            // takes, so without this a photo/name flicker on tab-switch is a
            // dropped read away, not a real account change.
            if (fetchFailed) {
              if (mountedRef.current) setLoading(false);
              return;
            }

            const role = normalizeRole(profile?.role || cachedRole);
            const built = buildUserData(session.user, profile, role);

            // Guards against this deferred callback applying stale data if a
            // newer auth event (or updateProfile) has already bumped the
            // sequence while this fetch was in flight — unchanged by the
            // deferral, since opSeq is still read/compared around the same
            // await boundary, just shifted a macrotask later.
            if (profileOpSeqRef.current === opSeq) {
              setUser(session.user);
              setUserData(built);
              userDataRef.current = built;
              setIsAuthenticated(true);
            }
          } else if (!loginInProgressRef.current) {
            setUser(null);
            setUserData(null);
            userDataRef.current = null;
            setIsAuthenticated(false);
          }

          } finally {
            if (mountedRef.current) setLoading(false);
          }
        }, 0);
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // ─── Login ────────────────────────────────────────────────────────────────
  // expectedRole is OPTIONAL. StudentLogin calls login(email, password) and is
  // completely unaffected. FacultyLogin calls login(email, password, selectedRole)
  // so the role check happens BEFORE isAuthenticated is ever set to true —
  // closing the race-condition window (ID-010 / VULN: role mismatch).
  const login = async (email, password, expectedRole = null) => {
    setLoading(true);
    setError(null);
    loginInProgressRef.current = true;
    setUser(null);
    setUserData(null);
    setIsAuthenticated(false);

    await supabase.auth.signOut({ scope: 'local' });

    if (readLoginAttempts(email).count >= 5) {
      const lockedErr = new Error('LOGIN_ATTEMPTS_EXCEEDED');
      lockedErr.userMessage = 'Too many failed login attempts. Please contact the administrator.';
      setError(lockedErr.userMessage);
      setLoading(false);
      loginInProgressRef.current = false;
      throw lockedErr;
    }

    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔐 Login attempt ${attempt} for: ${email}`);

        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) throw authError;

        if (!data?.user) throw new Error('No user returned from Supabase');

        console.log('✅ Supabase Auth login successful:', data.user.email);

        const { profile, fetchFailed } = await fetchProfile(data.user.id);

        // Signing in without a verified role would hand an admin the student
        // dashboard. Stop here and let them retry instead of guessing.
        if (fetchFailed) {
          await supabase.auth.signOut();
          const unavailableErr = new Error('PROFILE_UNAVAILABLE');
          unavailableErr.userMessage =
            'Could not verify your account right now. Please check your connection and try again.';
          throw unavailableErr;
        }

        if (isArchivedProfile(profile)) {
          await supabase.auth.signOut();
          const archivedErr = new Error('ARCHIVED_ACCOUNT');
          archivedErr.userMessage = 'This account has been archived. Please contact the administrator.';
          throw archivedErr;
        }

        // Profiles row only — never user_metadata (self-writable, see above).
        const role = normalizeRole(profile?.role);

        // ─── Role gate: runs BEFORE setIsAuthenticated(true) ───────────────
        // If the caller specified which role they expect (e.g. the dropdown
        // selection on the Faculty/Admin login page) and it doesn't match the
        // account's real role, sign out immediately and never authenticate.
        if (expectedRole && normalizeRole(expectedRole) !== role) {
          console.warn(`🚫 Role mismatch: account is "${role}", expected "${normalizeRole(expectedRole)}"`);
          await supabase.auth.signOut();
          const mismatchErr = new Error(`ROLE_MISMATCH:${role}`);
          mismatchErr.actualRole = role;
          throw mismatchErr;
        }

        const built = buildUserData(data.user, profile, role);

        setUser(data.user);
        setUserData(built);
        userDataRef.current = built;
        setIsAuthenticated(true);
        setError(null);
        clearLoginAttempts(email);
        setLoading(false);
        loginInProgressRef.current = false;

        return data.user;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Login attempt ${attempt} failed:`, err.message);

        // Don't retry on role mismatch — retrying won't change the account's role.
        if (err.message?.startsWith('ROLE_MISMATCH:') || err.message === 'ARCHIVED_ACCOUNT') break;

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }

    // All retries failed (or role mismatch short-circuited the loop)
    const msg = lastError?.userMessage || lastError?.message || 'Login failed. Please try again.';
    // A connection failure is not a wrong password — it must not count toward
    // the lockout, or a flaky network would lock a legitimate user out.
    if (lastError?.message !== 'ARCHIVED_ACCOUNT'
        && lastError?.message !== 'PROFILE_UNAVAILABLE'
        && !lastError?.message?.startsWith('ROLE_MISMATCH:')) {
      const failures = recordLoginFailure(email);
      if (failures >= 5) lastError.userMessage = 'Too many failed login attempts. The next login attempt is blocked.';
    }
    loginInProgressRef.current = false;
    setError(lastError?.userMessage || msg);
    setLoading(false);
    throw lastError || new Error(msg);
  };

  // ─── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('⚠️ Logout error:', err.message);
    } finally {
      setUser(null);
      setUserData(null);
      userDataRef.current = null;
      setIsAuthenticated(false);
      setError(null);
    }
  };

  const sendPasswordReset = async (email) => {
    // Follows whatever origin the app is served from, rather than a
    // hardcoded domain. The previous value was a Vercel URL that died the
    // moment the project was renamed, and that failure is invisible from
    // here: the email still sends, and the link inside it 404s on someone
    // else's screen days later. It also meant a reset requested from
    // localhost sent the developer to production.
    //
    // Supabase only honours a redirect it already trusts, so the deployed
    // origin must be listed under Authentication -> URL Configuration ->
    // Redirect URLs. Unlisted, it silently falls back to the Site URL.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) throw resetError;
  };

  const updatePassword = async (password) => {
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  };

  // ─── Update profile ───────────────────────────────────────────────────────
  const updateProfile = async (updates) => {
    if (!user) throw new Error('Not authenticated');

    // Privilege fields are never settable through self-service profile edits —
    // only an admin may change them, through the admin user-management flow.
    // (The database RLS policy enforces this too; this is the client-side half.)
    const { role: _role, status: _status, id: _id, ...safeUpdates } = updates;

    const opSeq = ++profileOpSeqRef.current;

    // Use the row returned by the UPDATE itself (UPDATE ... RETURNING) rather
    // than a separate follow-up SELECT — one less round-trip through RLS,
    // and avoids a slow re-fetch racing with (and losing to) this update.
    const { data: profile, error: updateError } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const role = normalizeRole(profile?.role);
    const built = buildUserData(user, profile, role);

    // Only commit if nothing newer (a fresh login, another save) started meanwhile.
    if (profileOpSeqRef.current === opSeq) {
      setUserData(built);
      userDataRef.current = built;
    }
  };

  // ─── Role helpers ─────────────────────────────────────────────────────────
  const isTeacher = () => userData?.role === 'teacher';
  const isFaculty = () => userData?.role === 'faculty';
  const isMainAdmin = () => userData?.role === 'main_admin';
  const isRegistrar = () => userData?.role === 'registrar';
  const isStudent = () => userData?.role === 'student';

  const value = {
    user,
    userData,
    loading,
    isAuthenticated,
    error,
    login,
    logout,
    sendPasswordReset,
    updatePassword,
    updateProfile,
    onlineUserIds,
    isTeacher,
    isFaculty,
    isMainAdmin,
    isRegistrar,
    isStudent,
    // Convenience: current user's Supabase UUID
    userId: user?.id || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;