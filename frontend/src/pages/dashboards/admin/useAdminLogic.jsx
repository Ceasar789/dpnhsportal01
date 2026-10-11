// ============================================
// FILE: src/pages/dashboards/admin/useAdminLogic.jsx
// ALL state / fetchers / handlers / realtime subscriptions for the
// admin dashboard, extracted into one custom hook so every tab shares
// the exact same state via AdminContext.
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../../config/supabase';
import { useAuth } from '../../../context/AuthContext';
import { useDashboardTheme } from '../../../styles/dashboardTheme';
import { withRetry } from '../../../lib/supabaseRetry';
import { ACTIVITY_SELECT, toActivityRow } from '../../../lib/activityLog';
import { publishedAtPatch } from '../../../lib/newsRules';
import { backendRequest, isAmbiguousBackendRequestError } from '../../../lib/backendApi';
import { combineDateAndTime, DEFAULT_DUE_TIME, localNowTimestamp } from '../../../lib/taskFormatting';
import { currentSchoolYear } from '../../../lib/academicRules';
import { hasExactDeletedIds } from '../../../lib/deleteVerification';
import {
  buildSettingsUpdate,
  classifySettingsReadError,
  isActiveMainAdmin,
  quarterFromNumber,
  settingsReadMessage,
  validateSettingsValues,
  verifyUpdatedSettingsRows,
} from './shared/settingsRules';
import { filterAndRankUsers } from './shared/userSearch';
import {
  isInvalidCalendarRange,
  philippineDateKey,
  upcomingCalendarEvents as selectUpcomingCalendarEvents,
} from '../../../lib/calendarRules';

// The three General-card values the UI assumes it has. They are also the
// fallback when the row does not carry them, which today it does not.
// school_settings.current_semester is an INT. The UI has always offered
// quarters, so 1-4 is what goes in it. Nothing in the codebase reads this
// column — not one query outside useAdminLogic — and there is no CHECK
// constraint on it, so 3 and 4 are accepted. The column NAME is the only
// thing that still says "semester"; renaming it is a migration, and the
// drift is logged in docs/ux-workarounds.md rather than fixed here.
// Reached only when school_settings has no school_year. Computed rather
// than frozen: a hardcoded year is the thing that hid the wrong live value
// for as long as the banner carried one, and currentSchoolYear() is the
// same function the academic tabs already use, so the fallback agrees with
// them instead of inventing a third answer.
const SETTINGS_DEFAULTS = {
  portal_name: 'EduScribe Portal',
  academic_year: currentSchoolYear(),
  semester: '2nd Quarter',
};

const diagnoseSettings = (label, error) => {
  if (import.meta.env.DEV) console.warn(label, error?.message || error);
};

const safeNewsImageName = (name) => {
  const safe = String(name || 'news-image')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/\.{2,}/g, '.');
  return safe || 'news-image';
};

const isOwnedNewsImagePath = (path, userId) => {
  if (typeof path !== 'string' || !userId || path.includes('://') || path.includes('\\')) return false;
  const parts = path.split('/');
  if (parts.length !== 2 || parts[0] !== userId) return false;
  return /^\d+-[a-zA-Z0-9._-]+$/.test(parts[1]) && !parts[1].includes('..');
};

export const useAdminLogic = (userData) => {
  const { onlineUserIds } = useAuth();
  const { darkMode, setDarkMode, themePref, setThemePref } = useDashboardTheme();

  // ❌ DELETE THIS USEEFFECT (removed):
  // useEffect(() => {
  //   if (userData && userData.role !== 'main_admin') navigate('/', { replace: true });
  // }, [userData?.role]);

  const [page, setPage]                     = useState('overview');
  const [activeSettingsSub, setActiveSettingsSub] = useState('sec-general');
  const [modal, setModal]                   = useState(null);
  const [toast, setToast]                   = useState(null);
  const [notifications, setNotifications]   = useState([]);

  // ── Delete confirmation modal state ─────────────────────────────────────────
  // Shape: { title?, message?, label, role?, warning?, confirmLabel?, onConfirm } | null
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const openModal  = (id) => setModal(id);
  const closeModal = ()   => setModal(null);

  const scrollToSection = (id) => {
    setActiveSettingsSub(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // ═══════════════════════════════════════════
  //  ACTIVITY LOGGING HELPER
  // ═══════════════════════════════════════════
  // 7A. There used to be a localStorage mirror of the activity log here,
  // written on every action and merged into whatever the server returned.
  // It existed because the server write had ALWAYS failed — every insert
  // was rejected for naming a column the live table does not have — so
  // the cache was the only thing making the panel look alive. It made a
  // real bug look like a working feature for the whole of Phase 4 and 5,
  // and it was per-browser, so two admins never saw the same history.
  //
  // The write is fixed now, so the mirror is deleted rather than kept as
  // a fallback: a fallback that silently replaces an audit trail with
  // this one browser's guess is worse than an empty panel.
  const activityStorageKey = 'smartedu-admin-activity-logs';
  const [activityLogs, setActivityLogs] = useState([]);
  const [activityError, setActivityError] = useState('');
  const activityRequestRef = useRef(0);

  // Clear what previous versions left behind, once. Those rows were never
  // on the server and cannot be recovered to it: they have local- ids and
  // no user_id, and the insert policy would reject them anyway.
  useEffect(() => {
    try { localStorage.removeItem(activityStorageKey); } catch { /* private mode */ }
  }, []);

  const [overviewLoading, setOverviewLoading] = useState(true);
  const [calLoading, setCalLoading] = useState(true);
  // Declared up here, above fetchLogs, deliberately: a useCallback's
  // dependency array is evaluated where it is written, so a reference to a
  // const declared lower in the same scope throws on first render.
  //
  // Three fetches feed the Overview and they finish in any order, so the
  // flag counts them rather than tracking one. A ref, because the three
  // callbacks must see each other's writes within the same tick.
  const overviewPending = useRef(0);
  const overviewStarted = useCallback(() => {
    overviewPending.current += 1;
    setOverviewLoading(true);
  }, []);
  const overviewSettled = useCallback(() => {
    overviewPending.current = Math.max(0, overviewPending.current - 1);
    if (overviewPending.current === 0) setOverviewLoading(false);
  }, []);

  const fetchLogs = useCallback(async () => {
    const requestId = ++activityRequestRef.current;
    overviewStarted();
    try {
      const { data, error } = await withRetry(
        () => supabase.from('activity_logs').select(ACTIVITY_SELECT)
          .order('created_at', { ascending: false }).limit(5),
        { label: 'Activity logs fetch' }
      );
      if (error) {
        console.warn('Activity logs unavailable:', error.message);
        if (requestId === activityRequestRef.current) setActivityError('Recent activity is unavailable.');
        return false;
      }
      if (requestId === activityRequestRef.current) {
        setActivityLogs((data || []).map(toActivityRow));
        setActivityError('');
      }
      return true;
    } catch (e) {
      console.warn('Activity logs fetch error:', e.message);
      if (requestId === activityRequestRef.current) setActivityError('Recent activity is unavailable.');
      return false;
    } finally {
      overviewSettled();
    }
  }, [overviewStarted, overviewSettled]);

  const logActivity = useCallback(async (action, details = '') => {
    // user_id must be the AUTH uid: the insert policy checks
    // `auth.uid() = user_id`, so anything else is rejected. userData.uid
    // is built from the Supabase auth user's id in AuthContext, and
    // profiles.id is that same id, so the two cannot drift.
    const uid = userData?.uid;
    if (!uid) {
      console.warn('Activity log skipped: no signed-in user to attribute it to');
      return;
    }
    try {
      // `description`, not `details`. The live table has description TEXT
      // and has never had a details column — every insert this app made
      // for two phases was rejected with PGRST204 and the failure was
      // hidden by a localStorage mirror.
      const { error } = await supabase.from('activity_logs').insert([{
        action,
        user_id: uid,
        description: details || null,
        created_at: new Date().toISOString(),
      }]);
      if (error) {
        console.warn('Activity log insert failed:', error.message);
        return;
      }
      await fetchLogs();
    } catch (e) { console.error('Activity log error:', e); }
  }, [fetchLogs, userData]);

  // ═══════════════════════════════════════════
  //  OVERVIEW STATS — Real-time
  // ═══════════════════════════════════════════
  const [stats, setStats] = useState({ users: 0, news: 0, events: 0, memos: 0 });
  const [statsErrors, setStatsErrors] = useState({ users: false, news: false, events: false, memos: false });
  const statsRequestRef = useRef(0);
  // UX-047. Without these the Overview's zeros and "No recent activity"
  // were what rendered while the fetches were still in flight — an empty
  // state that looked like an answer.

  const fetchStats = useCallback(async () => {
    const requestId = ++statsRequestRef.current;
    overviewStarted();
    try {
      const results = await Promise.all([
        withRetry(() => supabase.from('profiles').select('*', { count: 'exact', head: true }), { label: 'Stats: users count fetch' }),
        // A Published post whose expires_at has passed is no longer visible
        // to anyone reading the public/dashboard news feeds, so it must not
        // count here either — otherwise this tile would disagree with what
        // any reader can actually see.
        withRetry(() => supabase.from('news').select('*', { count: 'exact', head: true }).eq('status', 'Published').or(`expires_at.is.null,expires_at.gt.${localNowTimestamp()}`), { label: 'Stats: news count fetch' }),
        withRetry(() => supabase.from('calendar_events').select('*', { count: 'exact', head: true }), { label: 'Stats: events count fetch' }),
        withRetry(() => supabase.from('memos').select('*', { count: 'exact', head: true }), { label: 'Stats: memos count fetch' }),
      ]);
      const [{ count: users, error: usersErr }, { count: news, error: newsErr }, { count: events, error: eventsErr }, { count: memos, error: memosErr }] = results;

      // Every failure gets reported, not just 403/406 — a timed-out count was
      // previously indistinguishable from a genuine zero.
      [['users', usersErr], ['news', newsErr], ['events', eventsErr], ['memos', memosErr]]
        .forEach(([label, err]) => {
          if (err) console.warn(`Stats: ${label} count failed —`, err.message || err);
        });

      // A failed count keeps its previous value. Rendering "0 Total Users" when
      // the read simply failed reads as data loss and is worse than stale data.
      if (requestId === statsRequestRef.current) {
        setStats(prev => ({
          users:  usersErr  ? prev.users  : (users  || 0),
          news:   newsErr   ? prev.news   : (news   || 0),
          events: eventsErr ? prev.events : (events || 0),
          memos:  memosErr  ? prev.memos  : (memos || 0),
        }));
        setStatsErrors({ users: Boolean(usersErr), news: Boolean(newsErr), events: Boolean(eventsErr), memos: Boolean(memosErr) });
      }
    } catch (e) {
      console.warn('Stats fetch error:', e);
      if (requestId === statsRequestRef.current) {
        setStatsErrors({ users: true, news: true, events: true, memos: true });
      }
    } finally {
      overviewSettled();
    }
  }, [overviewStarted, overviewSettled]);

  const [roleDist, setRoleDist] = useState([]);
  const [roleDistError, setRoleDistError] = useState('');
  const roleDistRequestRef = useRef(0);
  const fetchRoleDist = useCallback(async () => {
    const requestId = ++roleDistRequestRef.current;
    overviewStarted();
    try {
      const { data, error } = await withRetry(
        () => supabase.from('profiles').select('role'),
        { label: 'Role distribution fetch' }
      );
      // Keep the last good distribution on failure rather than blanking the
      // chart, which looks like "this school has no users".
      if (error) {
        console.warn('Role distribution fetch failed —', error.message || error);
        if (requestId === roleDistRequestRef.current) setRoleDistError('Role distribution is unavailable.');
        return false;
      }
      if (!data) {
        if (requestId === roleDistRequestRef.current) setRoleDistError('Role distribution is unavailable.');
        return false;
      }
      const counts = {};
      data.forEach(r => { counts[r.role] = (counts[r.role] || 0) + 1; });
      if (requestId === roleDistRequestRef.current) {
        setRoleDist(Object.entries(counts).map(([role, count]) => ({ role, count })));
        setRoleDistError('');
      }
      return true;
    } catch (e) {
      console.warn('Role distribution error:', e);
      if (requestId === roleDistRequestRef.current) setRoleDistError('Role distribution is unavailable.');
      return false;
    } finally {
      overviewSettled();
    }
  }, [overviewStarted, overviewSettled]);

  // ═══════════════════════════════════════════
  //  USERS — Supabase CRUD + Real-time
  // ═══════════════════════════════════════════
  const [users, setUsers]           = useState([]);
  const [usersLoading, setUL]       = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editUser, setEditUser]     = useState(null);

  const [uName,   setUName]   = useState('');
  const [uEmail,  setUEmail]  = useState('');
  const [uDept,   setUDept]   = useState('');
  const [uRole,   setURole]   = useState('student');
  const [uStatus, setUStatus] = useState('active');
  const [uSaving, setUSaving] = useState(false);
  // Guards saveUser against a double click now that Rule B2 has taken the
  // disabled attribute off the button. See the note in saveUser.
  const savingUserRef = useRef(false);
  const usersRequestRef = useRef(0);

  const fetchUsers = useCallback(async (options = {}) => {
    const silent = options?.silent === true;
    const requestId = ++usersRequestRef.current;
    setUL(true);
    setUsersError(null);
    try {
      const { users: directory } = await backendRequest('/api/admin/users');
      const nextUsers = directory || [];
      if (requestId !== usersRequestRef.current) {
        return { ok: false, users: null, stale: true };
      }
      setUsers(nextUsers);
      return { ok: true, users: nextUsers };
    } catch (e) {
      if (requestId !== usersRequestRef.current) {
        return { ok: false, users: null, stale: true };
      }
      console.error('Users fetch exception:', e);
      setUsersError('Unable to load users.');
      if (!silent) showToast('Unable to load users. Please try again.', 'error');
      return { ok: false, users: null };
    } finally {
      if (requestId === usersRequestRef.current) setUL(false);
    }
  }, []);

  const resendInvitation = async (invitedUser) => {
    try {
      await backendRequest(`/api/admin/users/${invitedUser.id}/resend-invitation`, { method: 'POST' });
      showToast(`Invitation resent to ${invitedUser.email}.`);
    } catch (error) {
      showToast(error.message || 'Invitation could not be resent.', 'error');
      throw error;
    }
  };
  const openCreateUser = () => {
    setEditUser(null); setUName(''); setUEmail(''); setUDept(''); setURole('student'); setUStatus('active');
    openModal('user');
  };
  const openEditUser = (u) => {
    setEditUser(u); setUName(u.name || ''); setUEmail(u.email || '');
    setUDept(u.department || ''); setURole(u.role || 'student'); setUStatus(u.status?.toLowerCase() || 'active');
    openModal('user');
  };

  const saveUser = async () => {
  if (!uName.trim() || !uEmail.trim()) return showToast('Name and email required', 'error');
  if (editUser?.id === userData?.uid
      && (uRole !== editUser.role || uStatus !== (editUser.status || 'active').toLowerCase())) {
    showToast('You cannot change your own administrator role or account status.', 'error');
    return;
  }
  if (savingUserRef.current) return;   // the second of a double click
  savingUserRef.current = true;
  setUSaving(true);
  try {
    if (editUser) {
      // ════════════════════════════════════════════════
      // UPDATE EXISTING USER
      // ════════════════════════════════════════════════
      const pendingInvitation = editUser.onboarding_status === 'invitation_pending';
      const { data, error } = await supabase.from('profiles').update({
        name: uName.trim(),
        department: uDept.trim() || null,
        ...(!pendingInvitation && { role: uRole, status: uStatus }),
        updated_at: new Date().toISOString(),
      }).eq('id', editUser.id).select().single();
      
      if (error) throw error;
      
      setUsers(prev => prev.map(u => u.id === editUser.id
        ? { ...data, onboarding_status: u.onboarding_status, can_resend_invitation: u.can_resend_invitation }
        : u));
      showToast('User updated!');
      console.log('✅ User updated:', data.id);
      
    } else {
      // ════════════════════════════════════════════════
      // CREATE NEW USER
      // ════════════════════════════════════════════════
      const { user: invitedUser } = await backendRequest('/api/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          name: uName.trim(),
          email: uEmail.trim(),
          role: uRole,
          department: uDept.trim() || null,
        }),
      });
      setUsers(prev => [invitedUser, ...prev]);
      setStats(prev => ({ ...prev, users: prev.users + 1 }));
      await logActivity('Invited user', `${uName} (${uRole})`);
      showToast('User invited. They can create their password from the email link.');
    }
    
    // Step 6: Refresh stats (non-blocking)
    try {
      await fetchStats();
      await fetchRoleDist();
    } catch (err) {
      console.warn('⚠️ Stats refresh failed (non-blocking):', err);
    }
    
    closeModal();
    console.log('🎉 User operation completed successfully');
    
  } catch (e) {
    console.error('❌ User save error:', e);
    showToast(e.message || 'Error saving user', 'error');
  } finally { 
    savingUserRef.current = false;
    setUSaving(false); 
  }
};

  const setUserArchivedState = (id, archived, onConfirmStart) => {
    const targetUser = users.find(u => u.id === id);
    if (!archived && id === userData?.uid) {
      showToast('You cannot archive your own administrator account.', 'error');
      return;
    }
    const action = archived ? 'Restore' : 'Archive';
    const desiredArchived = !archived;
    const expectedStatus = desiredArchived
      ? 'archived'
      : (targetUser?.can_resend_invitation ? 'inactive' : 'active');
    const hasExpectedState = (candidate) => (
      candidate?.id === id
      && (candidate.status || '').toLowerCase() === expectedStatus
    );
    const completeConfirmedChange = async (updatedUser, reconciled = false) => {
      if (!reconciled) {
        await logActivity(`${action}d user`, targetUser?.name || id);
        setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      }
      onConfirmStart?.();
      if (reconciled) {
        await fetchStats();
      } else {
        setStats(prev => ({
          ...prev,
          users: archived ? prev.users + 1 : Math.max(0, prev.users - 1),
        }));
      }
      showToast(`User ${action.toLowerCase()}d.`);
      await fetchRoleDist();
      return true;
    };
    const reconcileAmbiguousChange = async () => {
      const result = await fetchUsers({ silent: true });
      if (!result.ok) {
        showToast('The account change may have succeeded, but its status could not be confirmed. Check the Users or Archive list after your connection returns before trying again.', 'error');
        return false;
      }

      const freshUser = result.users.find(user => user.id === id);
      if (hasExpectedState(freshUser)) {
        return completeConfirmedChange(freshUser, true);
      }

      if (freshUser && (freshUser.status || '').toLowerCase() === (targetUser?.status || '').toLowerCase()) {
        showToast(`The user was not ${action.toLowerCase()}d. You can try again.`, 'error');
        return false;
      }

      showToast('The account change could not be confirmed. Refresh the Users and Archive lists before trying again.', 'error');
      return false;
    };
    setDeleteConfirm({
      title: `${action} User?`,
      message: archived
        ? 'This user will return to the active user list:'
        : 'This user will be moved to the archive and removed from the active user list:',
      label: targetUser?.name || targetUser?.email || 'this user',
      role: targetUser?.role,
      warning: archived ? null : 'The account will not be permanently deleted.',
      confirmLabel: `Yes, ${action}`,
      busyLabel: archived ? 'Restoring…' : 'Archiving…',
      onConfirm: async () => {
        try {
          const { user: updatedUser } = await backendRequest(`/api/admin/users/${id}/archive-state`, {
            method: 'PATCH', body: JSON.stringify({ archived: desiredArchived }),
          });
          if (!hasExpectedState(updatedUser)) return reconcileAmbiguousChange();
          return completeConfirmedChange(updatedUser);
        } catch (e) {
          if (isAmbiguousBackendRequestError(e)) return reconcileAmbiguousChange();
          showToast(`The user could not be ${action.toLowerCase()}d. Please try again.`, 'error');
          return false;
        }
      },
    });
  };

  const deleteUser = (id, onConfirmStart) => setUserArchivedState(id, false, onConfirmStart);
  const restoreUser = (id, onConfirmStart) => setUserArchivedState(id, true, onConfirmStart);

  const filteredUsers = useMemo(() => {
    return filterAndRankUsers({
      users,
      query: userSearch,
      roleFilter,
      statusFilter,
      showArchived,
      onlineUserIds,
    });
  }, [users, userSearch, roleFilter, showArchived, statusFilter, onlineUserIds]);

  // ═══════════════════════════════════════════
  //  NEWS — Supabase CRUD + Role Targeting + Real-time
  // ═══════════════════════════════════════════
  const [newsItems, setNewsItems]   = useState([]);
  const [newsLoading, setNL]        = useState(true);
  const [newsError, setNewsError]   = useState('');
  const newsRequestRef = useRef(0);
  const [newsSearch, setNewsSearch] = useState('');
  const [newsCatF, setNewsCatF]     = useState('');
  const [newsStatF, setNewsStatF]   = useState('');
  const [editNews, setEditNews]     = useState(null);
  const [nTitle,   setNTitle]       = useState('');
  const [nCat,     setNCat]         = useState('Academics');
  const [nAuthor,  setNAuthor]      = useState('');
  const [nContent, setNContent]     = useState('');
  const [nStatus,  setNStatus]      = useState('Draft');
  const [nTarget,  setNTarget]      = useState('all'); // NEW: role targeting
  const [nCustomTarget, setNCustomTarget] = useState('');
  const [nImageFile, setNImageFile] = useState(null);
  const [nImageUrl, setNImageUrl] = useState('');
  // Optional expiry date, entered as a plain 'YYYY-MM-DD' from a date input.
  // '' means "no expiry" and must be sent to Supabase as null, not as ''.
  const [nExpiresDate, setNExpiresDate] = useState('');
  const [newsReadOnly, setNewsReadOnly] = useState(false);
  const [nSaving,  setNSaving]      = useState(false);
  // Rule B2 took the disabled attribute off the save buttons, so the second
  // half of a double click now reaches the handler. A ref is what stops it:
  // it is set synchronously, where a state flag would not update until the
  // next render and both clicks would get through.
  const savingNewsRef = useRef(false);
  const newsSaveOutcomeUncertainRef = useRef(false);

  const fetchNews = useCallback(async () => {
    const requestId = ++newsRequestRef.current;
    setNL(true);
    const { data, error } = await withRetry(
      () => supabase.from('news').select('*').order('created_at', { ascending: false }),
      { label: 'News fetch' }
    );
    if (requestId !== newsRequestRef.current) return false;
    if (error) {
      console.warn('News fetch failed —', error.message || error);
      setNewsError('Could not load news. Check your connection and try again.');
      setNL(false);
      return false;
    }
    setNewsItems(data || []);
    setNewsError('');
    setNL(false);
    return true;
  }, []);

  const openNewPost = () => {
    newsSaveOutcomeUncertainRef.current = false;
    const inThirtyDays = new Date();
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    setEditNews(null); setNewsReadOnly(false); setNTitle(''); setNCat('Academics'); setNAuthor(''); setNContent(''); setNStatus('Draft'); setNTarget('all'); setNCustomTarget(''); setNImageFile(null); setNImageUrl('');
    setNExpiresDate(inThirtyDays.toISOString().slice(0, 10));
    openModal('news');
  };
  const openEditNews = (n) => {
    newsSaveOutcomeUncertainRef.current = false;
    setNewsReadOnly(n.status === 'Published');
    setEditNews(n); setNTitle(n.title || ''); setNCat(n.category || 'Academics');
    setNAuthor(n.author || ''); setNContent(n.content || ''); setNStatus(n.status || 'Draft'); setNImageFile(null); setNImageUrl(n.featured_image_url || '');
    setNTarget(n.target_roles?.startsWith('custom:') ? 'custom' : (n.target_roles || 'all'));
    setNCustomTarget(n.target_roles?.startsWith('custom:') ? n.target_roles.slice(7) : '');
    // expires_at is stored as an end-of-day timestamp; the date input only
    // needs the date part back out of it.
    setNExpiresDate(n.expires_at ? String(n.expires_at).slice(0, 10) : '');
    openModal('news');
  };

  // ═══════════════════════════════════════════
  //  ANNOUNCEMENT → NOTIFICATION FAN-OUT
  //  When a post is published, every user in its target audience gets a
  //  real notifications row so it shows up in their dashboard.
  // ═══════════════════════════════════════════
  const notifyAudience = useCallback(async ({ title, content, targetRoles }) => {
    // 'custom:<free text>' can't be resolved to roles — skip rather than guess.
    if (!targetRoles || targetRoles.startsWith('custom:')) return;

    const roles = targetRoles === 'all'
      ? ['student', 'teacher', 'faculty', 'registrar']
      : targetRoles.split(',').map(r => r.trim()).filter(Boolean);
    if (!roles.length) return;

    try {
      const { data: recipients, error: recipientsError } = await supabase
        .from('profiles')
        .select('id, status')
        .in('role', roles);
      if (recipientsError) throw recipientsError;

      const rows = (recipients || [])
        .filter(r => (r.status || 'active').toLowerCase() !== 'archived')
        .map(r => ({
          user_id: r.id,
          title: `New announcement: ${title}`,
          message: (content || '').replace(/<[^>]*>/g, '').slice(0, 180) || 'A new announcement has been posted.',
          notification_type: 'announcement',
          is_read: false,
          created_at: new Date().toISOString(),
        }));
      if (!rows.length) return;

      const { error: insertError } = await supabase.from('notifications').insert(rows);
      if (insertError) throw insertError;
    } catch (e) {
      // Don't fail the publish itself — just surface that the fan-out didn't happen.
      console.warn('Notification fan-out failed:', e.message);
      showToast('Post saved, but notifications could not be sent: ' + e.message, 'error');
    }
  }, []);

  const saveNews = async () => {
    if (newsReadOnly) return showToast('Published news is locked and cannot be edited.', 'error');
    if (!nTitle.trim()) return showToast('Title required', 'error');
    if (nTarget === 'custom' && !nCustomTarget.trim()) return showToast('Custom audience required', 'error');
    if (newsSaveOutcomeUncertainRef.current) {
      return showToast('The previous save outcome could not be confirmed. Close and reopen this post before trying again.', 'error');
    }
    if (savingNewsRef.current) return;   // the second of a double click
    savingNewsRef.current = true;
    setNSaving(true);
    const ownerId = userData?.uid || userData?.id;
    let uploadedPath = null;
    let databaseOutcome = 'not-started';
    let cleanupFailed = false;
    try {
      let featuredImageUrl = nImageUrl || null;
      if (nImageFile) {
        if (!ownerId) throw new Error('NEWS_IMAGE_OWNER_UNAVAILABLE');
        const filePath = `${ownerId}/${Date.now()}-${safeNewsImageName(nImageFile.name)}`;
        const { error: uploadError } = await supabase.storage.from('news-images').upload(filePath, nImageFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        uploadedPath = filePath;
        const { data: publicUrlData } = supabase.storage.from('news-images').getPublicUrl(filePath);
        if (!publicUrlData?.publicUrl) throw new Error('NEWS_IMAGE_URL_UNAVAILABLE');
        featuredImageUrl = publicUrlData.publicUrl;
      }
      const payload = {
        title: nTitle.trim(), category: nCat, content: nContent, status: nStatus,
        author_id: userData?.uid,
        target_roles: nTarget === 'custom' ? `custom:${nCustomTarget.trim()}` : nTarget,
        ...publishedAtPatch(nStatus, editNews?.published_at),
        featured_image_url: featuredImageUrl,
        // "Expires on Sep 30" means visible through all of Sep 30 and gone
        // Oct 1, so this stores end-of-day, not midnight. news.expires_at is
        // a TIMESTAMP WITHOUT TIME ZONE holding local wall-clock — never
        // route this through toISOString(), which would shift it by the
        // browser's UTC offset. Clearing the field must send null, not ''.
        expires_at: nExpiresDate ? combineDateAndTime(nExpiresDate, DEFAULT_DUE_TIME) : null,
        updated_at: new Date().toISOString(),
      };
      // Only notify when a post newly enters the Published state, so editing
      // an already-published post doesn't spam the audience again.
      const becomesPublished = nStatus === 'Published' && editNews?.status !== 'Published';

      let saveResult;
      try {
        saveResult = editNews
          ? await supabase.from('news').update(payload).eq('id', editNews.id)
          : await supabase.from('news').insert([{ ...payload, created_at: new Date().toISOString() }]);
      } catch (error) {
        // A transport failure can arrive after PostgreSQL committed. Deleting
        // the image here could break a record that actually saved.
        databaseOutcome = 'ambiguous';
        throw error;
      }
      if (saveResult.error) {
        databaseOutcome = 'rejected';
        throw saveResult.error;
      }
      databaseOutcome = 'succeeded';

      if (editNews) {
        await logActivity('Updated news', nTitle);
        showToast('Post updated!');
      } else {
        await logActivity('Created news', `${nTitle} (${nStatus})`);
        showToast('Post created!');
      }

      if (becomesPublished) {
        await notifyAudience({ title: payload.title, content: payload.content, targetRoles: payload.target_roles });
      }

      await fetchNews(); await fetchStats();
      closeModal();
    } catch (e) {
      if (uploadedPath && databaseOutcome !== 'succeeded' && databaseOutcome !== 'ambiguous') {
        if (isOwnedNewsImagePath(uploadedPath, ownerId)) {
          try {
            const { error: removeError } = await supabase.storage
              .from('news-images')
              .remove([uploadedPath]);
            cleanupFailed = Boolean(removeError);
          } catch {
            cleanupFailed = true;
          }
        } else {
          cleanupFailed = true;
        }
        if (cleanupFailed) {
          console.warn('A failed News save left its newly uploaded image pending cleanup.');
        }
      }

      if (databaseOutcome === 'ambiguous') {
        newsSaveOutcomeUncertainRef.current = true;
        showToast('The post save outcome could not be confirmed. The uploaded image was not removed. Close and reopen the post before trying again.', 'error');
      } else if (cleanupFailed) {
        showToast('The post could not be saved, and the newly uploaded image could not be removed automatically.', 'error');
      } else if (uploadedPath) {
        showToast('The post could not be saved. The newly uploaded image was removed; you can retry.', 'error');
      } else if (String(e?.message || '') === 'NEWS_IMAGE_OWNER_UNAVAILABLE') {
        showToast('Your session could not be verified for this image upload. Sign in again, then retry.', 'error');
      } else {
        showToast('The post or image could not be saved. Please try again.', 'error');
      }
    } finally { savingNewsRef.current = false; setNSaving(false); }
  };

  // A published post's content is locked (see newsReadOnly in openEditNews)
  // so an admin can't quietly rewrite a live announcement. But expiry is a
  // visibility control, not content — "post it, later decide it should stop
  // showing at the end of the month" is the normal case this feature exists
  // for, and it must work on an already-published post. This writes only
  // expires_at (+ updated_at) and nothing else: no status change, so
  // becomesPublished is never true and notifyAudience is never called —
  // re-saving a published post's expiry must not re-notify its audience.
  const saveNewsExpiry = async () => {
    if (!editNews) return;
    if (savingNewsRef.current) return;   // the second of a double click
    savingNewsRef.current = true;
    setNSaving(true);
    try {
      const expires_at = nExpiresDate ? combineDateAndTime(nExpiresDate, DEFAULT_DUE_TIME) : null;
      const { error } = await supabase
        .from('news')
        .update({ expires_at, updated_at: new Date().toISOString() })
        .eq('id', editNews.id);
      if (error) throw error;
      await logActivity('Updated news expiry', nExpiresDate ? `${nTitle} → expires ${nExpiresDate}` : `${nTitle} → expiry cleared`);
      showToast('Expiry date updated!');
      await fetchNews(); await fetchStats();
      closeModal();
    } catch (e) {
      showToast(e.message || 'Error updating expiry', 'error');
    } finally { savingNewsRef.current = false; setNSaving(false); }
  };

  const updateNewsStatus = async (id, status) => {
    const newsItem = newsItems.find(n => n.id === id);
    const becomesPublished = status === 'Published' && newsItem?.status !== 'Published';

    const { error } = await supabase
      .from('news')
      .update({
        status,
        ...publishedAtPatch(status, newsItem?.published_at),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return showToast('Error updating status: ' + error.message, 'error');

    await logActivity('Updated news status', `${newsItem?.title} → ${status}`);
    showToast(`Post ${status.toLowerCase()}`);

    if (becomesPublished && newsItem) {
      await notifyAudience({
        title: newsItem.title,
        content: newsItem.content,
        targetRoles: newsItem.target_roles,
      });
    }

    await fetchNews(); await fetchStats();
  };

  const deleteNewsItem = (id, focusAfterConfirm) => {
    const newsItem = newsItems.find(n => n.id === id);
    setDeleteConfirm({
      label: newsItem?.title || 'this post',
      title: 'Delete Post?',
      message: 'This post will be permanently deleted.',
      warning: 'This cannot be undone.',
      confirmLabel: 'Yes, Delete',
      requireConfirmedResult: true,
      focusAfterConfirm,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.from('news').delete().eq('id', id).select('id');
          if (error) throw error;
          if (!hasExactDeletedIds(data, id)) throw new Error('Delete result was not verified');
        } catch (error) {
          console.warn('News delete failed —', error?.message || String(error));
          showToast('Could not delete the post. Please try again.', 'error');
          return false;
        }
        await logActivity('Deleted news', newsItem?.title);
        showToast('Post deleted');
        await fetchNews(); await fetchStats();
        return true;
      },
    });
  };

  const filteredNews = useMemo(() =>
    newsItems.filter(n =>
      (!newsSearch || n.title?.toLowerCase().includes(newsSearch.toLowerCase())) &&
      (!newsCatF || n.category === newsCatF) &&
      (!newsStatF || n.status === newsStatF)
    ), [newsItems, newsSearch, newsCatF, newsStatF]);

  // ═══════════════════════════════════════════
  //  CALENDAR — Supabase CRUD + Real-time + EDIT
  // ═══════════════════════════════════════════
  const today      = new Date();
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calEvents, setCalEvents] = useState([]);
  const [calError, setCalError] = useState(false);
  const [calFilter, setCalFilter] = useState('');
  const [editEvent, setEditEvent] = useState(null); // NEW: event editing
  const [evTitle, setEvTitle]   = useState('');
  const [evDate,  setEvDate]    = useState('');
  const [evEnd,   setEvEnd]     = useState('');
  const [evType,  setEvType]    = useState('Event');
  const [evCustomType, setEvCustomType] = useState('');
  const [evDesc,  setEvDesc]    = useState('');
  const [evSaving, setEvSaving] = useState(false);
  const savingEventRef = useRef(false);

  const fetchCalEvents = useCallback(async () => {
    setCalLoading(true);
    setCalError(false);
    try {
      const { data, error } = await withRetry(
        () => supabase.from('calendar_events').select('*').order('event_date', { ascending: true }),
        { label: 'Calendar events fetch' }
      );
      if (error) throw error;
      setCalEvents(data || []);
      return true;
    } catch (err) {
      console.error('Error loading events:', err);
      showToast('Error loading events: ' + err.message, 'error');
      setCalError(true);
      return false;
    } finally {
      setCalLoading(false);
    }
  }, []);

  const openCreateEvent = () => {
    setEditEvent(null); setEvTitle(''); setEvDate(''); setEvEnd(''); setEvType('Event'); setEvCustomType(''); setEvDesc('');
    openModal('event');
  };

  const openEditEvent = (e) => {
    setEditEvent(e); setEvTitle(e.title || ''); setEvDate(e.event_date || ''); 
    setEvEnd(e.end_date || ''); setEvType(e.custom_event_type ? 'Custom Type' : (e.event_type || 'Event')); setEvCustomType(e.custom_event_type || ''); setEvDesc(e.description || '');
    openModal('event');
  };

  const saveEvent = async () => {
    if (!evTitle.trim() || !evDate) return showToast('Title and date required', 'error');
    if (evType === 'Custom Type' && !evCustomType.trim()) return showToast('Custom event type required', 'error');
    if (isInvalidCalendarRange(evDate, evEnd)) return false;
    if (savingEventRef.current) return;   // the second of a double click
    savingEventRef.current = true;
    setEvSaving(true);
    try {
      const payload = {
        title: evTitle.trim(), event_date: evDate, end_date: evEnd || null,
        event_type: evType === 'Custom Type' ? 'Other' : evType,
        custom_event_type: evType === 'Custom Type' ? evCustomType.trim() : null,
        description: evDesc, updated_at: new Date().toISOString(),
      };
      if (editEvent) {
        const { error } = await supabase.from('calendar_events').update(payload).eq('id', editEvent.id);
        if (error) throw error;
        await logActivity('Updated event', evTitle);
        showToast('Event updated!');
      } else {
        // 7B. created_by was never written, so every event in the system
        // was anonymous — while the column has existed in both schema
        // files all along. News records author_id and memos record
        // sender_id; this was the one that did not.
        //
        // Only on INSERT. An edit records who edited it in activity_logs;
        // overwriting created_by on update would turn "who made this"
        // into "who touched it last", which is a different fact and the
        // less useful one.
        const { error } = await supabase.from('calendar_events').insert([{
          ...payload,
          created_by: userData?.uid || null,
          created_at: new Date().toISOString(),
        }]);
        if (error) throw error;
        await logActivity('Created event', evTitle);
        showToast('Event added!');
      }
      setEvTitle(''); setEvDate(''); setEvEnd(''); setEvType('Event'); setEvCustomType(''); setEvDesc('');
      await fetchCalEvents(); await fetchStats();
      closeModal();
    } catch (e) {
      showToast(e.message || 'Error', 'error');
    } finally { savingEventRef.current = false; setEvSaving(false); }
  };

  const deleteEvent = (id) => {
    const eventToDelete = calEvents.find(e => e.id === id);
    setDeleteConfirm({
      label: eventToDelete?.title || 'this event',
      title: 'Delete Event?',
      message: 'This calendar event will be permanently deleted.',
      warning: 'This cannot be undone.',
      confirmLabel: 'Yes, Delete',
      onConfirm: async () => {
        try {
          const { data, error } = await supabase
            .from('calendar_events')
            .delete()
            .eq('id', id)
            .select('id');
          if (error) throw error;
          if (!data?.some((event) => event.id === id)) {
            throw new Error('The event was not deleted.');
          }
        } catch (error) {
          showToast(`Could not delete event: ${error.message}`, 'error');
          return false;
        }
        await logActivity('Deleted event', eventToDelete?.title);
        showToast('Event deleted');
        await fetchCalEvents(); await fetchStats();
        closeModal();
        return true;
      },
    });
  };

  const typeColor = (t) => ({ Event:'#60a5fa', Deadline:'#fbbf24', Holiday:'#f87171', Other:'#2dd4bf' }[t] || '#60a5fa');
  const typeClass = (t) => ({ Event:'ev-blue', Deadline:'ev-yellow', Holiday:'ev-red', Other:'ev-teal' }[t] || 'ev-blue');

  const calGrid = useMemo(() => {
    const first = new Date(calYear, calMonth, 1).getDay();
    const days  = new Date(calYear, calMonth + 1, 0).getDate();
    const prev  = new Date(calYear, calMonth, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push({ d: prev - first + i + 1, cur: false });
    for (let d = 1; d <= days; d++) cells.push({ d, cur: true });
    let x = 1; while (cells.length % 7) cells.push({ d: x++, cur: false });
    return cells;
  }, [calYear, calMonth]);

  const todayDateKey = philippineDateKey(today);
  const upcomingEvents = useMemo(
    () => selectUpcomingCalendarEvents(calEvents, calFilter, todayDateKey),
    [calEvents, calFilter, todayDateKey]
  );

  const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11)}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0)}else setCalMonth(m=>m+1); };

  // ═══════════════════════════════════════════
  //  MEMOS — Supabase CRUD + Real-time + Search
  // ═══════════════════════════════════════════
  const [memos, setMemos]         = useState([]);
  const [memosLoading, setML]     = useState(true);
  const [memosError, setMemosError] = useState('');
  const memosRequestRef = useRef(0);
  const [selMemo, setSelMemo]     = useState(null);
  const [editMemo, setEditMemo]   = useState(null);
  const [mFrom,   setMFrom]       = useState('');
  const [mTo,     setMTo]         = useState('All Faculty');
  const [mSubj,   setMSubj]       = useState('');
  const [mBody,   setMBody]       = useState('');
  const [mSaving, setMSaving]     = useState(false);
  const savingMemoRef = useRef(false);
  const [memoSearch, setMemoSearch] = useState(''); // NEW: search
  const [memoFilter, setMemoFilter] = useState(''); // NEW: filter

  const fetchMemos = useCallback(async () => {
    const requestId = ++memosRequestRef.current;
    setML(true);
    const { data, error } = await withRetry(
      () => supabase.from('memos').select('*').order('created_at', { ascending: false }),
      { label: 'Memos fetch' }
    );
    if (requestId !== memosRequestRef.current) return false;
    if (error) {
      console.warn('Memos fetch failed —', error.message || error);
      setMemosError('Could not load memos. Check your connection and try again.');
      setML(false);
      return false;
    } else {
      const nextMemos = data || [];
      setMemos(nextMemos);
      setMemosError('');
      // RC2: fetchMemos is intentionally stable, so reading selMemo here
      // captured its initial null forever and every refresh selected row one.
      // Reconcile inside the state setter: keep the current id when it still
      // exists, replace its object with the fresh row, and fall back only when
      // the selection is absent or was removed.
      setSelMemo(current => (
        nextMemos.find(memo => memo.id === current?.id) || nextMemos[0] || null
      ));
    }
    setML(false);
    return true;
  }, []);

  const openCompose = () => {
    setEditMemo(null); setMFrom(''); setMTo('All Faculty'); setMSubj(''); setMBody('');
    openModal('memo');
  };
  const openEditMemo = (m) => {
    setEditMemo(m); setMFrom(m.from_office || ''); setMTo(m.recipient || 'All Faculty');
    setMSubj(m.subject || ''); setMBody(m.content || '');
    openModal('memo');
  };

  const saveMemo = async () => {
    if (!mSubj.trim()) return showToast('Subject required', 'error');
    if (savingMemoRef.current) return;   // the second of a double click
    savingMemoRef.current = true;
    setMSaving(true);
    try {
      const payload = {
        sender_id: userData?.uid,
        subject: mSubj.trim(), from_office: mFrom.trim(), recipient: mTo,
        content: mBody, status: 'Sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      if (editMemo) {
        const { error } = await supabase.from('memos').update(payload).eq('id', editMemo.id);
        if (error) throw error;
        await logActivity('Updated memo', mSubj);
        showToast('Memo updated!');
      } else {
        const { error } = await supabase.from('memos').insert([{ ...payload, created_at: new Date().toISOString() }]);
        if (error) throw error;
        await logActivity('Created memo', `${mSubj} → ${mTo}`);
        showToast('Memo sent!');
      }
      await fetchMemos(); await fetchStats();
      closeModal();
    } catch (e) {
      showToast(e.message || 'Error', 'error');
    } finally { savingMemoRef.current = false; setMSaving(false); }
  };

  const deleteMemo = (id, focusAfterConfirm) => {
    const memoToDelete = memos.find(m => m.id === id);
    setDeleteConfirm({
      label: memoToDelete?.subject || memoToDelete?.title || 'this memo',
      title: 'Delete Memo?',
      message: 'This memo will be permanently deleted.',
      warning: 'This cannot be undone.',
      confirmLabel: 'Yes, Delete',
      requireConfirmedResult: true,
      focusAfterConfirm,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase.from('memos').delete().eq('id', id).select('id');
          if (error) throw error;
          if (!hasExactDeletedIds(data, id)) throw new Error('Delete result was not verified');
        } catch (error) {
          console.warn('Memo delete failed —', error?.message || String(error));
          showToast('Could not delete the memo. Please try again.', 'error');
          return false;
        }
        await logActivity('Deleted memo', memoToDelete?.title);
        if (selMemo?.id === id) setSelMemo(null);
        showToast('Memo deleted');
        await fetchMemos(); await fetchStats();
        return true;
      },
    });
  };

  const filteredMemos = useMemo(() => {
    const s = memoSearch.toLowerCase();
    return memos.filter(m =>
      (!s || (m.subject || '').toLowerCase().includes(s) || (m.content || '').toLowerCase().includes(s)) &&
      (!memoFilter || m.recipient === memoFilter)
    );
  }, [memos, memoSearch, memoFilter]);

  // ═══════════════════════════════════════════
  //  SETTINGS — Supabase + Auto-save option
  // ═══════════════════════════════════════════
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
  const [settingsSaving, setSS] = useState(false);
  const savingSettingsRef = useRef(false);
  const [autoSave, setAutoSave] = useState(false); // NEW
  const [twoFactorAuth,       setTwoFactorAuth]       = useState(true);
  const [sessionTimeout,      setSessionTimeout]      = useState('30 min');
  const [loginAttemptLimit,   setLoginAttemptLimit]   = useState(true);
  const [emailNotifications,  setEmailNotifications]  = useState(false);
  const [autoBackup,          setAutoBackup]          = useState(true);
  const [backupFrequency,     setBackupFrequency]     = useState('daily');
  const [backupTime,          setBackupTime]          = useState('00:00');
  const [activityLogsDays,    setActivityLogsDays]    = useState('90 days');
  const [backupHistory,       setBackupHistory]       = useState([]);
  const [backupHistoryStatus, setBackupHistoryStatus] = useState('idle');
  const [backupHistoryError, setBackupHistoryError] = useState('');
  const [theme,               setTheme]               = useState('Dark');
  const [language,            setLanguage]            = useState('English');

  // UX-028. Three settings are editable — Academic Year, Quarter and
  // Session Timeout — and the save bar appears only when one of them
  // differs from what was loaded. Everything else on that page is either a
  // read-only statement of fact or, in Theme's case, a per-device
  // preference that saves itself, so neither belongs in this comparison.
  //
  // Null until the first read lands: before that there is nothing to differ
  // from, and a bar that appears while the page is still loading would be
  // claiming unsaved work that does not exist.
  const [settingsBaseline, setSettingsBaseline] = useState(null);

  // UX-047 again, in the one place Phase 3a did not reach. Both history
  // panels render "No … yet" from an empty array, and the array is empty
  // until the read lands — so for the ~100ms after the Settings tab first
  // opens, the page states as fact that there are no backups. Measured:
  // the empty state is on screen at +2600ms and the response arrives at
  // +2657ms. That is how a screenshot caught "No backup history yet" on a
  // database holding ten records.
  const [settingsStatus, setSettingsStatus] = useState('idle');
  const [settingsError, setSettingsError] = useState('');
  const settingsRequestRef = useRef(0);
  const backupRequestRef = useRef(0);
  const settingsMountedRef = useRef(true);

  useEffect(() => {
    settingsMountedRef.current = true;
    return () => {
      settingsMountedRef.current = false;
      settingsRequestRef.current += 1;
      backupRequestRef.current += 1;
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    const requestId = ++settingsRequestRef.current;
    setSettingsStatus('loading');
    setSettingsError('');
    setSettingsBaseline(null);
    try {
      const { data, error, status } = await withRetry(
        () => supabase.from('school_settings')
          .select('id, school_year, current_semester, session_timeout')
          .eq('id', 1),
        { label: 'School settings fetch' }
      );
      if (!settingsMountedRef.current || requestId !== settingsRequestRef.current) return;
      if (error) {
        const kind = classifySettingsReadError({ ...error, status });
        diagnoseSettings(`School settings ${kind} error:`, error);
        setSettingsStatus('error');
        setSettingsError(settingsReadMessage(kind));
        return;
      }
      if (!Array.isArray(data)) {
        setSettingsStatus('error');
        setSettingsError(settingsReadMessage('malformed'));
        return;
      }
      if (data.length === 0) {
        setSettingsStatus('missing');
        setSettingsError('System Settings have not been provisioned. A database administrator must create the required settings record.');
        return;
      }
      if (data.length !== 1 || Number(data[0]?.id) !== 1) {
        setSettingsStatus('error');
        setSettingsError(settingsReadMessage('malformed'));
        return;
      }
      {
        const row = data[0];
        const quarter = quarterFromNumber(row.current_semester);
        if (!quarter) {
          setSettingsStatus('error');
          setSettingsError(settingsReadMessage('invalid_quarter'));
          return;
        }
        const loadedValidation = validateSettingsValues({
          academicYear: row.school_year,
          quarter,
          sessionTimeout: row.session_timeout,
        });
        if (loadedValidation.sessionTimeout) {
          setSettingsStatus('error');
          setSettingsError(settingsReadMessage('invalid_timeout'));
          return;
        }
        // The page's two General fields come from the columns that
        // actually exist: school_year and current_semester. They were read
        // as academic_year and semester for as long as this page has
        // existed, which is why neither ever showed a stored value.
        //
        // prev FIRST, then data, so a column that is missing or null keeps
        // its default rather than becoming undefined — an undefined value
        // on a controlled input flips it to uncontrolled mid-session, and
        // then Discard has nothing to put back.
        const academicYear = row.school_year ?? '';
        setSettings(prev => ({
          ...prev,
          portal_name: 'EduScribe Portal',
          academic_year: academicYear,
          semester: quarter,
        }));
        setSessionTimeout(row.session_timeout);
        // The baseline is what the PAGE loaded, not what the row held, so
        // Discard restores what the admin actually saw.
        setSettingsBaseline({
          academic_year: academicYear,
          semester: quarter,
          session_timeout: row.session_timeout,
        });
        setSettingsStatus('ready');
      }
    } catch (err) {
      if (!settingsMountedRef.current || requestId !== settingsRequestRef.current) return;
      diagnoseSettings('Settings fetch threw:', err);
      setSettingsStatus('error');
      setSettingsError(settingsReadMessage(err?.offline ? 'network' : 'unknown'));
    }
  }, []);

  const fetchBackupHistory = useCallback(async () => {
    const requestId = ++backupRequestRef.current;
    setBackupHistoryStatus('loading');
    setBackupHistoryError('');
    try {
      const { data, error } = await withRetry(
        () => supabase.from('backup_history').select('*').order('started_at', { ascending: false }).limit(10),
        { label: 'Backup history fetch' }
      );
      if (!settingsMountedRef.current || requestId !== backupRequestRef.current) return;
      if (error) {
        diagnoseSettings('Backup history read failed:', error);
        setBackupHistory([]);
        setBackupHistoryStatus('error');
        setBackupHistoryError('Backup history is unavailable. Retry the read or contact the database administrator.');
        return;
      }
      if (!Array.isArray(data)) {
        setBackupHistory([]);
        setBackupHistoryStatus('error');
        setBackupHistoryError('Backup history returned an unexpected response. Please retry.');
        return;
      }
      setBackupHistory(data);
      setBackupHistoryStatus('ready');
    } catch (err) {
      if (!settingsMountedRef.current || requestId !== backupRequestRef.current) return;
      diagnoseSettings('Backup history read threw:', err);
      setBackupHistory([]);
      setBackupHistoryStatus('error');
      setBackupHistoryError('Backup history could not be loaded. Check your connection and retry.');
    }
  }, []);

  const saveSettings = async () => {
    if (savingSettingsRef.current) return;   // the second of a double click
    if (!isActiveMainAdmin(userData)) {
      showToast('Only an active Main Admin can change system settings.', 'error');
      return;
    }
    if (settingsStatus !== 'ready' || !settingsBaseline) {
      showToast('System Settings are unavailable. Retry the settings read before saving.', 'error');
      return;
    }
    const { payload, errors } = buildSettingsUpdate({
      academicYear: settings.academic_year,
      quarter: settings.semester,
      sessionTimeout,
      updatedAt: new Date().toISOString(),
    });
    if (!payload) {
      showToast(errors.academicYear || errors.quarter || errors.sessionTimeout || 'Correct the invalid settings before saving.', 'error');
      return;
    }
    savingSettingsRef.current = true;
    setSS(true);
    try {
      // Explicit keys, no `...settings` spread. The spread was the whole
      // bug: it carried academic_year, semester and portal_name — none of
      // which are columns on this table — so PostgREST rejected the entire
      // PATCH with PGRST204 and nothing was ever written, including
      // session_timeout, the one setting the app actually enforces.
      //
      // Theme stays in localStorage. Informational and legacy values are not
      // resent: this page owns only these three persisted settings.
      const { data: updatedRows, error: saveError } = await supabase.from('school_settings')
        .update(payload).eq('id', 1)
        .select('id, school_year, current_semester, session_timeout');
      // A failed write used to fall straight through to "Settings saved!",
      // because the returned error was never destructured. That is how a
      // page which had never once saved anything went on looking like it
      // worked. On a failure the bar stays up and the edits stay in the
      // fields, so nothing the admin typed is lost.
      if (saveError) {
        diagnoseSettings('Settings save failed:', saveError);
        showToast('System Settings could not be saved. Your changes are still available to retry.', 'error');
        return;
      }
      const updated = verifyUpdatedSettingsRows(updatedRows, payload);
      if (!updated) {
        diagnoseSettings('Settings save did not return exactly the intended row:', updatedRows);
        showToast('The settings update could not be verified. Your changes were not marked as saved.', 'error');
        return;
      }
      setSettingsBaseline({
        academic_year: updated.school_year,
        semester: quarterFromNumber(updated.current_semester),
        session_timeout: updated.session_timeout,
      });
      await logActivity('Updated settings');
      showToast('Settings saved!');
    } catch (err) {
      diagnoseSettings('Settings save threw:', err);
      showToast('System Settings could not be saved. Check your connection and retry.', 'error');
    }
    finally { savingSettingsRef.current = false; setSS(false); }
  };

  // The auto-save effect that used to sit here is gone (UX-028). It watched
  // [settings, theme, language, autoSave] and therefore could not see six of
  // the settings at all, so changing Email Notifications or any backup field
  // saved nothing until you later edited something unrelated. It also raised
  // a toast and wrote an activity_logs row every two seconds of idle typing.
  // One explicit save bar replaces it. `autoSave` is still read and still
  // sent in the payload, so the auto_save column is untouched.

  // What the save bar is for: the editable settings, against what loaded.
  const settingsDirty = Boolean(settingsBaseline) && (
    settings.academic_year !== settingsBaseline.academic_year
    || settings.semester !== settingsBaseline.semester
    || sessionTimeout !== settingsBaseline.session_timeout
  );

  const settingsValidation = validateSettingsValues({
    academicYear: settings.academic_year,
    quarter: settings.semester,
    sessionTimeout,
  });
  const settingsAuthorized = isActiveMainAdmin(userData);
  const settingsCanEdit = settingsStatus === 'ready' && settingsAuthorized && !settingsSaving;
  const settingsCanSave = settingsCanEdit && settingsDirty && !Object.values(settingsValidation).some(Boolean);

  const settingsChangeCount = !settingsBaseline ? 0 : (
    (settings.academic_year !== settingsBaseline.academic_year ? 1 : 0)
    + (settings.semester !== settingsBaseline.semester ? 1 : 0)
    + (sessionTimeout !== settingsBaseline.session_timeout ? 1 : 0)
  );

  const discardSettings = () => {
    if (!settingsBaseline) return;
    setSettings(s => ({
      ...s,
      academic_year: settingsBaseline.academic_year,
      semester: settingsBaseline.semester,
    }));
    setSessionTimeout(settingsBaseline.session_timeout);
  };

  // ═══════════════════════════════════════════
  //  DEBOUNCED FETCH FUNCTIONS — Prevent race conditions
  // ═══════════════════════════════════════════
  const debounceTimersRef = React.useRef({});

  const debouncedFetchUsers = useCallback(() => {
    if (debounceTimersRef.current.users) clearTimeout(debounceTimersRef.current.users);
    debounceTimersRef.current.users = setTimeout(() => {
      fetchUsers();
    }, 500); // Wait 500ms before fetching to debounce multiple rapid changes
  }, [fetchUsers]);

  const debouncedFetchStats = useCallback(() => {
    if (debounceTimersRef.current.stats) clearTimeout(debounceTimersRef.current.stats);
    debounceTimersRef.current.stats = setTimeout(() => {
      fetchStats();
    }, 500);
  }, [fetchStats]);

  const debouncedFetchRoleDist = useCallback(() => {
    if (debounceTimersRef.current.roleDist) clearTimeout(debounceTimersRef.current.roleDist);
    debounceTimersRef.current.roleDist = setTimeout(() => {
      fetchRoleDist();
    }, 500);
  }, [fetchRoleDist]);

  // ═══════════════════════════════════════════
  //  CLEANUP — Clear debounce timers on unmount
  // ═══════════════════════════════════════════
  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer));
    };
  }, []);

  // ═══════════════════════════════════════════
  //  INITIAL LOAD
  // ═══════════════════════════════════════════
  useEffect(() => {
    // Must stay above withRetry's worst case (attempt + 1.5s backoff + retry).
    // At the old 5s this wrapper killed the retry mid-flight on a slow
    // connection, so the fetch reported failure the retry would have fixed.
    const timeout = (promise, ms = 20000) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]).catch(err => console.warn('Fetch timeout:', err));

    const startTimer = setTimeout(() => {
      timeout(fetchStats());
      timeout(fetchLogs());
      timeout(fetchRoleDist());
      timeout(fetchUsers());
      timeout(fetchNews());
      timeout(fetchCalEvents());
      timeout(fetchMemos());
      timeout(fetchSettings());
      timeout(fetchBackupHistory());
    }, 0);
    return () => clearTimeout(startTimer);
  }, [fetchStats, fetchLogs, fetchRoleDist, fetchUsers, fetchNews, fetchCalEvents, fetchMemos, fetchSettings, fetchBackupHistory]);

  // The shared Toggle that used to live here is gone with its last call
  // site. It was UX-093's fix — a click-only div turned into a real
  // role="switch" — and it worked; the three settings it switched
  // (Auto-Save, Email Notifications, Auto-Backup) are what turned out to be
  // inert. The fix outlived the thing it fixed.

  return {
    activeSettingsSub, activityError, activityLogs, activityLogsDays, autoBackup, autoSave, backupFrequency, backupHistory, backupHistoryError, backupHistoryStatus, backupTime,
    calError, calEvents, calFilter, calGrid, calLoading, calMonth, calYear, closeModal,
    darkMode, debounceTimersRef, debouncedFetchRoleDist, debouncedFetchStats, debouncedFetchUsers, deleteConfirm,
    deleteEvent, deleteMemo, deleteNewsItem, deleteUser, restoreUser, editEvent, editMemo,
    editNews, editUser, emailNotifications, evDate, evDesc, evEnd,
    evCustomType, evSaving, evTitle, evType, fetchCalEvents, fetchLogs, fetchMemos,
    fetchNews, fetchRoleDist, fetchSettings, fetchStats, fetchUsers, filteredMemos,
    filteredNews, filteredUsers, language, logActivity,
    loginAttemptLimit, mBody, mFrom, mSaving, mSubj,
    mTo, memoFilter, memoSearch, memos, memosError, memosLoading, modal,
    nAuthor, nCat, nContent, nCustomTarget, nExpiresDate, nSaving, nStatus, nTarget,
    nTitle, nImageFile, nImageUrl, newsReadOnly, newsCatF, newsError, newsItems, newsLoading, newsSearch, newsStatF,
    nextMonth, notifications, openCompose, openCreateEvent, openCreateUser, openEditEvent,
    openEditMemo, openEditNews, openEditUser, openModal, openNewPost, page,
    prevMonth, resendInvitation, roleDist, roleDistError, roleFilter, saveEvent, saveMemo, saveNews, saveNewsExpiry,
    saveSettings, saveUser, scrollToSection, selMemo, sessionTimeout, setActiveSettingsSub,
    setActivityLogs, setActivityLogsDays, setAutoBackup, setAutoSave, setBackupFrequency, setBackupTime, setCalEvents, setCalFilter,
    setCalMonth, setCalYear, setDarkMode, setDeleteConfirm, setEditEvent, setEditMemo,
    setEditNews, setEditUser, setEmailNotifications, setEvDate, setEvDesc, setEvEnd,
    setEvCustomType, setEvSaving, setEvTitle, setEvType, setLanguage, setLoginAttemptLimit,
    setMBody, setMFrom, setML, setMSaving, setMSubj,
    setMTo, setMemoFilter, setMemoSearch, setMemos, setModal, setNAuthor,
    setNCat, setNContent, setNCustomTarget, setNExpiresDate, setNL, setNImageFile, setNImageUrl, setNSaving, setNStatus, setNTarget,
    setNTitle, setNewsCatF, setNewsItems, setNewsSearch, setNewsStatF, setNotifications,
    setPage, setRoleDist, setRoleFilter, setSS, setSelMemo, setSessionTimeout,
    setSettings, setStats, setTheme, setToast, setTwoFactorAuth,
    setUDept, setUEmail, setUL, setUName, setURole,
    setUSaving, setUserSearch, setUsers, setUStatus, setStatusFilter, setShowArchived, settings, settingsSaving, showToast,
    stats, statsErrors, overviewLoading, theme, toast, today, twoFactorAuth, onlineUsers: onlineUserIds,
    themePref, setThemePref, settingsDirty, settingsChangeCount, discardSettings,
    settingsStatus, settingsLoading: settingsStatus === 'idle' || settingsStatus === 'loading', settingsError,
    settingsValidation, settingsAuthorized, settingsCanEdit, settingsCanSave, fetchBackupHistory,
    typeClass, typeColor, uDept, uEmail, uName,
    uRole, uSaving, uStatus, statusFilter, showArchived, upcomingEvents, updateNewsStatus, userSearch, users,
    usersLoading, usersError,
  };
};
