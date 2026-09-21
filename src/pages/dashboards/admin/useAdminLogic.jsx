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
import { validatePassword } from '../../../lib/passwordPolicy';
import { combineDateAndTime, DEFAULT_DUE_TIME, localNowTimestamp } from '../../../lib/taskFormatting';

export const useAdminLogic = (userData) => {
  const { onlineUserIds } = useAuth();
  const { darkMode, setDarkMode } = useDashboardTheme();

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
  // Shape: { label: string, role?: string, onConfirm: () => Promise<void> } | null
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const openModal  = (id) => setModal(id);
  const closeModal = ()   => setModal(null);
  const handleOverlayClick = (e) => { if (e.target === e.currentTarget) closeModal(); };

  const scrollToSection = (id) => {
    setActiveSettingsSub(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // ═══════════════════════════════════════════
  //  ACTIVITY LOGGING HELPER
  // ═══════════════════════════════════════════
  const activityStorageKey = 'smartedu-admin-activity-logs';
  const [activityLogs, setActivityLogs] = useState([]);
  const readLocalActivityLogs = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(activityStorageKey) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  };
  const saveLocalActivityLogs = (logs) => {
    try {
      localStorage.setItem(activityStorageKey, JSON.stringify(logs.slice(0, 25)));
    } catch (e) {
      console.warn('Local activity cache unavailable:', e);
    }
  };
  const fetchLogs = useCallback(async () => {
    const localLogs = readLocalActivityLogs();
    try {
      const { data, error } = await withRetry(
        () => supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(5),
        { label: 'Activity logs fetch' }
      );
      if (error) {
        console.warn('Activity logs unavailable; using local activity cache:', error.message);
        setActivityLogs(localLogs.slice(0, 5));
      } else {
        const serverLogs = (data || []).map(log => ({
          ...log,
          details: typeof log.details === 'string' ? { message: log.details } : log.details,
        }));
        const mergedLogs = [...serverLogs, ...localLogs]
          .filter((log, index, logs) => logs.findIndex(item => item.id && item.id === log.id) === index)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setActivityLogs(mergedLogs.slice(0, 5));
      }
    } catch (e) {
      console.warn('Activity logs fetch error; using local activity cache:', e.message);
      setActivityLogs(localLogs.slice(0, 5));
    }
  }, []);

  const logActivity = useCallback(async (action, details = '') => {
    const localLog = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      action,
      details: { message: details, actor_name: userData?.name || 'Admin' },
      created_at: new Date().toISOString(),
    };
    const localLogs = [localLog, ...readLocalActivityLogs()].slice(0, 25);
    saveLocalActivityLogs(localLogs);
    setActivityLogs(localLogs.slice(0, 5));

    try {
      const { error } = await supabase.from('activity_logs').insert([{
        action,
        user_id: userData?.uid || null,
        details: {
          message: details,
          actor_name: userData?.name || 'Admin',
        },
        created_at: new Date().toISOString(),
      }]);
      if (error) {
        console.warn('Activity log insert failed; local activity retained:', error.message);
        return;
      }
      await fetchLogs();
    } catch (e) { console.error('Activity log error:', e); }
  }, [fetchLogs, userData]);

  // ═══════════════════════════════════════════
  //  OVERVIEW STATS — Real-time
  // ═══════════════════════════════════════════
  const [stats, setStats] = useState({ users: 0, news: 0, events: 0, memos: 0 });

  const fetchStats = useCallback(async () => {
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
      setStats(prev => ({
        users:  usersErr  ? prev.users  : (users  || 0),
        news:   newsErr   ? prev.news   : (news   || 0),
        events: eventsErr ? prev.events : (events || 0),
        memos:  memosErr  ? prev.memos  : (memos  || 0),
      }));
    } catch (e) {
      console.warn('Stats fetch error:', e);
    }
  }, []);

  const [roleDist, setRoleDist] = useState([]);
  const fetchRoleDist = useCallback(async () => {
    try {
      const { data, error } = await withRetry(
        () => supabase.from('profiles').select('role'),
        { label: 'Role distribution fetch' }
      );
      // Keep the last good distribution on failure rather than blanking the
      // chart, which looks like "this school has no users".
      if (error) {
        console.warn('Role distribution fetch failed —', error.message || error);
        return;
      }
      if (!data) return;
      const counts = {};
      data.forEach(r => { counts[r.role] = (counts[r.role] || 0) + 1; });
      setRoleDist(Object.entries(counts).map(([role, count]) => ({ role, count })));
    } catch (e) {
      console.warn('Role distribution error:', e);
    }
  }, []);

  // ═══════════════════════════════════════════
  //  USERS — Supabase CRUD + Real-time
  // ═══════════════════════════════════════════
  const [users, setUsers]           = useState([]);
  const [usersLoading, setUL]       = useState(true);
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
  const [uPass,   setUPass]   = useState('');
  const [uSaving, setUSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setUL(true);
    try {
      let { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });

      // The project's connection pool (free-tier, small compute) can be
      // briefly saturated — retry once after a short pause before giving up,
      // instead of leaving the list empty until a manual refresh/re-login.
      if (error) {
        console.warn('Users fetch failed, retrying once:', error.message);
        await new Promise((r) => setTimeout(r, 1500));
        ({ data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }));
      }

      if (error) {
        if (error.status === 403) {
          console.warn('Users table access denied - check RLS policies on profiles table. Admin may need permission to read profiles.');
          showToast('User management requires database permissions. Contact your administrator.', 'error');
        } else if (error.status === 406) {
          console.warn('Profiles table may not exist');
          showToast('User data unavailable', 'error');
        } else {
          showToast('Error loading users: ' + error.message, 'error');
        }
      } else {
        setUsers(data || []);
      }
    } catch (e) {
      console.error('Users fetch exception:', e);
      showToast('Error loading users', 'error');
    }
    setUL(false);
  }, []);

  const openCreateUser = () => {
    setEditUser(null); setUName(''); setUEmail(''); setUDept(''); setURole('student'); setUStatus('active'); setUPass('');
    openModal('user');
  };
  const openEditUser = (u) => {
    setEditUser(u); setUName(u.name || ''); setUEmail(u.email || '');
    setUDept(u.department || ''); setURole(u.role || 'student'); setUStatus(u.status?.toLowerCase() || 'active'); setUPass('');
    openModal('user');
  };

  const saveUser = async () => {
  if (!uName.trim() || !uEmail.trim()) return showToast('Name and email required', 'error');
  setUSaving(true);
  try {
    if (editUser) {
      // ════════════════════════════════════════════════
      // UPDATE EXISTING USER
      // ════════════════════════════════════════════════
      const { data, error } = await supabase.from('profiles').update({
        name: uName.trim(), role: uRole, status: uStatus, department: uDept.trim() || null, updated_at: new Date().toISOString()
      }).eq('id', editUser.id).select().single();
      
      if (error) throw error;
      
      setUsers(prev => prev.map(u => u.id === editUser.id ? data : u));
      showToast('User updated!');
      console.log('✅ User updated:', data.id);
      
    } else {
      // ════════════════════════════════════════════════
      // CREATE NEW USER
      // ════════════════════════════════════════════════
      const passwordError = validatePassword(uPass);
      if (passwordError) return showToast(passwordError, 'error');

      console.log('📋 Starting user creation process...');
      
      // Step 1: Save admin session before signUp
      const { data: adminSessionData } = await supabase.auth.getSession();
      const adminAccessToken  = adminSessionData?.session?.access_token;
      const adminRefreshToken = adminSessionData?.session?.refresh_token;
      const adminUid          = adminSessionData?.session?.user?.id;

      if (!adminAccessToken || !adminRefreshToken) {
        throw new Error('Admin session not available - please refresh and try again');
      }
      console.log('💾 Admin session saved');

      // Step 2: Create auth user
      console.log('📝 Creating auth user...');
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: uEmail.trim(), 
        password: uPass
      });
      if (authErr) throw authErr;
      
      const uid = authData?.user?.id;
      console.log('✅ Auth user created:', uid);

      // Step 3: Restore admin session immediately
      console.log('🔒 Restoring admin session...');
      const restoreResult = await supabase.auth.setSession({
        access_token: adminAccessToken,
        refresh_token: adminRefreshToken,
      });
      
      if (restoreResult.error) {
        console.error('❌ Failed to restore admin session:', restoreResult.error);
      } else {
        console.log('✅ Admin session restored');
        await new Promise(r => setTimeout(r, 150)); // Wait for session to sync
      }

      // Step 4: Create profile in database
      if (uid) {
        console.log('📊 Creating profile in database...');
        
        try {
          const { data: newProfile, error: profileErr } = await supabase
            .from('profiles')
            .upsert([{
              id: uid,
              email: uEmail.trim(),
              name: uName.trim(),
              role: uRole,
              department: uDept.trim() || null,
              status: 'active',
              created_at: new Date().toISOString()
            }], { onConflict: 'id' })
            .select()
            .single();
          
          if (profileErr) {
            console.error('❌ Profile creation error:', profileErr);
            throw new Error(`Failed to create profile: ${profileErr.message}. Check Supabase RLS policies - see SUPABASE_RLS_SETUP.md`);
          }
          
          console.log('✅ Profile created in database:', newProfile.id);
          
          // Update UI with new user
          setUsers(prev => [newProfile, ...prev]);
          setStats(prev => ({ ...prev, users: prev.users + 1 }));
          
        } catch (err) {
          console.error('❌ Database error:', err.message);
          showToast(err.message, 'error');
          setUSaving(false);
          return;
        }
      }

      // Step 5: Log the activity (non-blocking)
      await logActivity('Created user', `${uName} (${uRole})`);

      showToast('✅ User created! They will receive a confirmation email.');
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
    setUSaving(false); 
  }
};

  const deleteUser = (id) => {
    const userToDelete = users.find(u => u.id === id);
    setDeleteConfirm({
      label: userToDelete?.name || userToDelete?.email || 'this user',
      role: userToDelete?.role,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('profiles').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
          if (error) throw error;
          await logActivity('Archived user', userToDelete?.name || id);
          setUsers(prev => prev.filter(u => u.id !== id));
          setStats(prev => ({ ...prev, users: Math.max(0, prev.users - 1) }));
          showToast('User archived. It can be restored from the archive.');
          await fetchRoleDist();
        } catch (e) {
          showToast(e.message || 'Error deleting user', 'error');
          // Refresh users list on error to ensure consistency
          await fetchUsers();
        }
      },
    });
  };

  const filteredUsers = useMemo(() => {
    const s = userSearch.toLowerCase();
    return users.filter(u =>
      (showArchived ? (u.status || '').toLowerCase() === 'archived' : (u.status || 'active').toLowerCase() !== 'archived') &&
      (!s || (u.name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s)) &&
      (!roleFilter || u.role === roleFilter) &&
      (!statusFilter || (onlineUserIds.has(u.id) ? 'online' : 'offline') === statusFilter)
    );
  }, [users, userSearch, roleFilter, showArchived, statusFilter, onlineUserIds]);

  // ═══════════════════════════════════════════
  //  NEWS — Supabase CRUD + Role Targeting + Real-time
  // ═══════════════════════════════════════════
  const [newsItems, setNewsItems]   = useState([]);
  const [newsLoading, setNL]        = useState(true);
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

  const fetchNews = useCallback(async () => {
    setNL(true);
    const { data, error } = await withRetry(
      () => supabase.from('news').select('*').order('created_at', { ascending: false }),
      { label: 'News fetch' }
    );
    if (error) { showToast('Error loading news: ' + error.message, 'error'); }
    else setNewsItems(data || []);
    setNL(false);
  }, []);

  const openNewPost = () => {
    setEditNews(null); setNewsReadOnly(false); setNTitle(''); setNCat('Academics'); setNAuthor(''); setNContent(''); setNStatus('Draft'); setNTarget('all'); setNCustomTarget(''); setNImageFile(null); setNImageUrl(''); setNExpiresDate('');
    openModal('news');
  };
  const openEditNews = (n) => {
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
    setNSaving(true);
    try {
      let featuredImageUrl = nImageUrl || null;
      if (nImageFile) {
        const filePath = `${userData?.uid || 'admin'}/${Date.now()}-${nImageFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
        const { error: uploadError } = await supabase.storage.from('news-images').upload(filePath, nImageFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('news-images').getPublicUrl(filePath);
        featuredImageUrl = publicUrlData.publicUrl;
      }
      const payload = {
        title: nTitle.trim(), category: nCat, content: nContent, status: nStatus,
        author_id: userData?.uid,
        target_roles: nTarget === 'custom' ? `custom:${nCustomTarget.trim()}` : nTarget,
        published_at: nStatus === 'Published' ? new Date().toISOString() : null,
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

      if (editNews) {
        const { error } = await supabase.from('news').update(payload).eq('id', editNews.id);
        if (error) throw error;
        await logActivity('Updated news', nTitle);
        showToast('Post updated!');
      } else {
        const { error } = await supabase.from('news').insert([{ ...payload, created_at: new Date().toISOString() }]);
        if (error) throw error;
        await logActivity('Created news', `${nTitle} (${nStatus})`);
        showToast('Post created!');
      }

      if (becomesPublished) {
        await notifyAudience({ title: payload.title, content: payload.content, targetRoles: payload.target_roles });
      }

      await fetchNews(); await fetchStats();
      closeModal();
    } catch (e) {
      showToast(e.message || 'Error', 'error');
    } finally { setNSaving(false); }
  };

  const updateNewsStatus = async (id, status) => {
    const newsItem = newsItems.find(n => n.id === id);
    const becomesPublished = status === 'Published' && newsItem?.status !== 'Published';

    const { error } = await supabase
      .from('news')
      .update({
        status,
        published_at: status === 'Published' ? new Date().toISOString() : null,
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

  const deleteNewsItem = async (id) => {
    if (!confirm('Delete this post?')) return;
    const newsItem = newsItems.find(n => n.id === id);
    await supabase.from('news').delete().eq('id', id);
    await logActivity('Deleted news', newsItem?.title);
    showToast('Post deleted');
    await fetchNews(); await fetchStats();
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
  const [calFilter, setCalFilter] = useState('');
  const [editEvent, setEditEvent] = useState(null); // NEW: event editing
  const [evTitle, setEvTitle]   = useState('');
  const [evDate,  setEvDate]    = useState('');
  const [evEnd,   setEvEnd]     = useState('');
  const [evType,  setEvType]    = useState('Event');
  const [evCustomType, setEvCustomType] = useState('');
  const [evDesc,  setEvDesc]    = useState('');
  const [evSaving, setEvSaving] = useState(false);

  const fetchCalEvents = useCallback(async () => {
    try {
      const { data, error } = await withRetry(
        () => supabase.from('calendar_events').select('*').order('event_date', { ascending: true }),
        { label: 'Calendar events fetch' }
      );
      if (error) throw error;
      setCalEvents(data || []);
    } catch (err) {
      console.error('Error loading events:', err);
      showToast('Error loading events: ' + err.message, 'error');
      setCalEvents([]);
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
        const { error } = await supabase.from('calendar_events').insert([{ ...payload, created_at: new Date().toISOString() }]);
        if (error) throw error;
        await logActivity('Created event', evTitle);
        showToast('Event added!');
      }
      setEvTitle(''); setEvDate(''); setEvEnd(''); setEvType('Event'); setEvCustomType(''); setEvDesc('');
      await fetchCalEvents(); await fetchStats();
      closeModal();
    } catch (e) {
      showToast(e.message || 'Error', 'error');
    } finally { setEvSaving(false); }
  };

  const deleteEvent = async (id) => {
    if (!confirm('Delete this event?')) return;
    const eventToDelete = calEvents.find(e => e.id === id);
    await supabase.from('calendar_events').delete().eq('id', id);
    await logActivity('Deleted event', eventToDelete?.title);
    showToast('Event deleted');
    await fetchCalEvents(); await fetchStats();
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

  const upcomingEvents = useMemo(() => {
    const ts = today.toISOString().slice(0, 10);
    return calEvents.filter(e => e.event_date >= ts).slice(0, 4);
  }, [calEvents]);

  const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11)}else setCalMonth(m=>m-1); };
  const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0)}else setCalMonth(m=>m+1); };

  // ═══════════════════════════════════════════
  //  MEMOS — Supabase CRUD + Real-time + Search
  // ═══════════════════════════════════════════
  const [memos, setMemos]         = useState([]);
  const [memosLoading, setML]     = useState(true);
  const [selMemo, setSelMemo]     = useState(null);
  const [editMemo, setEditMemo]   = useState(null);
  const [mFrom,   setMFrom]       = useState('');
  const [mTo,     setMTo]         = useState('All Faculty');
  const [mSubj,   setMSubj]       = useState('');
  const [mBody,   setMBody]       = useState('');
  const [mSaving, setMSaving]     = useState(false);
  const [memoSearch, setMemoSearch] = useState(''); // NEW: search
  const [memoFilter, setMemoFilter] = useState(''); // NEW: filter

  const fetchMemos = useCallback(async () => {
    setML(true);
    const { data, error } = await withRetry(
      () => supabase.from('memos').select('*').order('created_at', { ascending: false }),
      { label: 'Memos fetch' }
    );
    if (error) { showToast('Error loading memos: ' + error.message, 'error'); }
    else {
      setMemos(data || []);
      if (data?.length && !selMemo) setSelMemo(data[0]);
    }
    setML(false);
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
    } finally { setMSaving(false); }
  };

  const deleteMemo = async (id) => {
    if (!confirm('Delete this memo?')) return;
    const memoToDelete = memos.find(m => m.id === id);
    await supabase.from('memos').delete().eq('id', id);
    await logActivity('Deleted memo', memoToDelete?.title);
    if (selMemo?.id === id) setSelMemo(null);
    showToast('Memo deleted');
    await fetchMemos(); await fetchStats();
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
  const [settings, setSettings] = useState({
    portal_name: 'EduScribe Portal', academic_year: '2025-2026', semester: '2nd Quarter',
  });
  const [settingsSaving, setSS] = useState(false);
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
  const [theme,               setTheme]               = useState('Dark');
  const [language,            setLanguage]            = useState('English');

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await withRetry(
        () => supabase.from('school_settings').select('*').eq('id', 1).single(),
        { label: 'School settings fetch' }
      );
      if (!error && data) {
        const quarterMap = {
          '1st Semester': '1st Quarter',
          '2nd Semester': '2nd Quarter',
          Summer: '4th Quarter',
        };
        setSettings({
          ...data,
          portal_name: 'EduScribe Portal',
          semester: quarterMap[data.semester] || data.semester || '1st Quarter',
        });
        setTheme(data.theme || 'Dark');
        setLanguage(data.language || 'English');
        setAutoSave(data.auto_save || false);
        setTwoFactorAuth(data.two_factor_auth ?? true);
        setSessionTimeout(data.session_timeout || '30 min');
        setLoginAttemptLimit(data.login_attempt_limit ?? true);
        setEmailNotifications(data.email_notifications || false);
        setAutoBackup(data.auto_backup ?? true);
        setBackupFrequency(data.backup_frequency || 'daily');
        setBackupTime(data.backup_time || '00:00');
        setActivityLogsDays(data.activity_logs_retention || '90 days');
        const { data: backups } = await withRetry(
          () => supabase.from('backup_history').select('*').order('started_at', { ascending: false }).limit(10),
          { label: 'Backup history fetch' }
        );
        setBackupHistory(backups || []);
      } else if (error && (error.code === 'PGRST116' || error.status === 406 || error.status === 400)) {
        // Table doesn't exist or no settings record - use defaults
        console.warn('School settings table not available - using defaults');
        setTheme('Dark');
        setLanguage('English');
        setAutoSave(false);
      }
    } catch (err) {
      console.warn('Settings fetch error (using defaults):', err.message);
      // Use defaults if settings don't exist
      setTheme('Dark');
      setLanguage('English');
      setAutoSave(false);
    }
  }, []);

  const saveSettings = async () => {
    setSS(true);
    try {
      await supabase.from('school_settings').update({ 
        ...settings, 
        portal_name: 'EduScribe Portal',
        theme,
        language,
        auto_save: autoSave,
        two_factor_auth: true,
        session_timeout: sessionTimeout,
        login_attempt_limit: true,
        email_notifications: emailNotifications,
        auto_backup: autoBackup,
        backup_frequency: backupFrequency,
        backup_time: backupTime,
        activity_logs_retention: activityLogsDays,
        updated_at: new Date().toISOString() 
      }).eq('id', 1);
      await logActivity('Updated settings');
      showToast('Settings saved!');
    } catch (e) { showToast('Error saving settings', 'error'); }
    finally { setSS(false); }
  };

  // Auto-save effect
  useEffect(() => {
    if (!autoSave) return;
    const timer = setTimeout(() => saveSettings(), 2000);
    return () => clearTimeout(timer);
  }, [settings, theme, language, autoSave]);

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
    return () => {
      Object.values(debounceTimersRef.current).forEach(timer => clearTimeout(timer));
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

    timeout(fetchStats());
    timeout(fetchLogs());
    timeout(fetchRoleDist());
    timeout(fetchUsers());
    timeout(fetchNews());
    timeout(fetchCalEvents());
    timeout(fetchMemos());
    timeout(fetchSettings());
  }, [fetchStats, fetchLogs, fetchRoleDist, fetchUsers, fetchNews, fetchCalEvents, fetchMemos, fetchSettings]);

  const Toggle = ({ on, onClick }) => (
    <div className={`toggle ${on ? 'on' : 'off'}`} onClick={onClick}>
      <div className="toggle-knob"></div>
    </div>
  );

  return {
    Toggle, activeSettingsSub, activityLogs, activityLogsDays, autoBackup, autoSave, backupFrequency, backupHistory, backupTime,
    calEvents, calFilter, calGrid, calMonth, calYear, closeModal,
    darkMode, debounceTimersRef, debouncedFetchRoleDist, debouncedFetchStats, debouncedFetchUsers, deleteConfirm,
    deleteEvent, deleteMemo, deleteNewsItem, deleteUser, editEvent, editMemo,
    editNews, editUser, emailNotifications, evDate, evDesc, evEnd,
    evCustomType, evSaving, evTitle, evType, fetchCalEvents, fetchLogs, fetchMemos,
    fetchNews, fetchRoleDist, fetchSettings, fetchStats, fetchUsers, filteredMemos,
    filteredNews, filteredUsers, handleOverlayClick, language, logActivity,
    loginAttemptLimit, mBody, mFrom, mSaving, mSubj,
    mTo, memoFilter, memoSearch, memos, memosLoading, modal,
    nAuthor, nCat, nContent, nCustomTarget, nExpiresDate, nSaving, nStatus, nTarget,
    nTitle, nImageFile, nImageUrl, newsReadOnly, newsCatF, newsItems, newsLoading, newsSearch, newsStatF,
    nextMonth, notifications, openCompose, openCreateEvent, openCreateUser, openEditEvent,
    openEditMemo, openEditNews, openEditUser, openModal, openNewPost, page,
    prevMonth, roleDist, roleFilter, saveEvent, saveMemo, saveNews,
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
    setUDept, setUEmail, setUL, setUName, setUPass, setURole,
    setUSaving, setUserSearch, setUsers, setUStatus, setStatusFilter, setShowArchived, settings, settingsSaving, showToast,
    stats, theme, toast, today, twoFactorAuth, onlineUsers: onlineUserIds,
    typeClass, typeColor, uDept, uEmail, uName, uPass,
    uRole, uSaving, uStatus, statusFilter, showArchived, upcomingEvents, updateNewsStatus, userSearch, users,
    usersLoading,
  };
};
