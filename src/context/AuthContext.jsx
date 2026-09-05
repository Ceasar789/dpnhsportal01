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
  const mountedRef = useRef(true);
  const loginInProgressRef = useRef(false);
  const userDataRef = useRef(null);

  // Announce the authenticated user to the shared Realtime presence channel.
  useEffect(() => {
    if (!userData?.uid) return undefined;

    const presenceChannel = supabase.channel('portal-presence', {
      config: { presence: { key: userData.uid } },
    });

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const { error: trackError } = await presenceChannel.track({
          user_id: userData.uid,
          name: userData.name,
        });

        if (trackError) console.warn('Presence tracking error:', trackError.message);
      }
    });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [userData?.uid, userData?.name]);

  // ─── Fetch profile from profiles table ───────────────────────────────────
  const fetchProfile = async (userId, email, metadata) => {
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Safety net: if the profiles query hangs (e.g. a slow/misbehaving
      // RLS policy on the backend), don't block login forever. Give up
      // after 8s and fall back to auth metadata for role/name instead.
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ data: null, error: { code: 'CLIENT_TIMEOUT' } }), 8000)
      );

      const { data, error: profileError } = await Promise.race([profilePromise, timeoutPromise]);

      if (profileError?.code === 'CLIENT_TIMEOUT') {
        console.warn('⚠️ Profile fetch timed out after 8s — continuing with auth metadata only');
      } else if (profileError && profileError.code !== 'PGRST116') {
        console.warn('⚠️ Profile fetch warning:', profileError.message);
      }

      return data || null;
    } catch (err) {
      console.warn('⚠️ fetchProfile error:', err.message);
      return null;
    }
  };

  // ─── Bootstrap session on mount ──────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const initSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('⚠️ getSession error:', sessionError.message);
        }

        if (session?.user && mountedRef.current) {
          const profile = await fetchProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata || {}
          );
          const role = normalizeRole(
            profile?.role ||
            session.user.user_metadata?.role ||
            (userDataRef.current?.uid === session.user.id ? userDataRef.current.role : null)
          );
          const built = buildUserData(session.user, profile, role);

          setUser(session.user);
          setUserData(built);
          userDataRef.current = built;
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error('❌ initSession error:', err.message);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    initSession();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;

        console.log('🔄 Auth state change:', event);

        if (session?.user) {
          const profile = await fetchProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata || {}
          );
          const role = normalizeRole(
            profile?.role ||
            session.user.user_metadata?.role ||
            (userDataRef.current?.uid === session.user.id ? userDataRef.current.role : null)
          );
          const built = buildUserData(session.user, profile, role);

          setUser(session.user);
          setUserData(built);
          userDataRef.current = built;
          setIsAuthenticated(true);
        } else if (!loginInProgressRef.current) {
          setUser(null);
          setUserData(null);
          userDataRef.current = null;
          setIsAuthenticated(false);
        }

        if (mountedRef.current) setLoading(false);
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

        const profile = await fetchProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata || {}
        );

        const role = normalizeRole(
          data.user.user_metadata?.role || profile?.role
        );

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
        setLoading(false);
        loginInProgressRef.current = false;

        return data.user;
      } catch (err) {
        lastError = err;
        console.warn(`⚠️ Login attempt ${attempt} failed:`, err.message);

        // Don't retry on role mismatch — retrying won't change the account's role.
        if (err.message?.startsWith('ROLE_MISMATCH:')) break;

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }

    // All retries failed (or role mismatch short-circuited the loop)
    const msg = lastError?.message || 'Login failed. Please try again.';
    loginInProgressRef.current = false;
    setError(msg);
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
    const appUrl = 'https://dpnhsportal01.vercel.app';
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${appUrl}/reset-password`,
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

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (updateError) throw updateError;

    // Refresh userData
    const profile = await fetchProfile(user.id, user.email, user.user_metadata || {});
    const role = normalizeRole(user.user_metadata?.role || profile?.role);
    const built = buildUserData(user, profile, role);
    setUserData(built);
    userDataRef.current = built;
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