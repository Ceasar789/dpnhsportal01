// ============================================
// FILE: src/pages/dashboards/admin/useAdminLogic.jsx
// ALL state / fetchers / handlers / realtime subscriptions for the
// admin dashboard, extracted into one custom hook so every tab shares
// the exact same state via AdminContext.
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../../config/supabase';

export const useAdminLogic = (userData) => {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  }, [darkMode]);

  // ❌ DELETE THIS USEEFFECT (removed):
  // useEffect(() => {
  //   if (userData && userData.role !== 'main_admin') navigate('/', { replace: true });
  // }, [userData?.role]);

  const [page, setPage]                     = useState('overview');
  const [activeSettingsSub, setActiveSettingsSub] = useState('sec-general');
  const [modal, setModal]                   = useState(null);
  const [logoErr, setLogoErr]               = useState(false);
  const [toast, setToast]                   = useState(null);
  const [notifications, setNotifications]   = useState([]);
  const [onlineUsers, setOnlineUsers]         = useState(new Set());

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
  const logActivity = useCallback(async (action, details = '') => {
    try {
      await supabase.from('activity_logs').insert([{
        action,
        details,
        user_id: userData?.uid,
        user_name: userData?.name || 'Admin',
        created_at: new Date().toISOString(),
      }]);
    } catch (e) { console.error('Activity log error:', e); }
  }, [userData]);

  // ═══════════════════════════════════════════
  //  OVERVIEW STATS — Real-time
  // ═══════════════════════════════════════════
  const [stats, setStats] = useState({ users: 0, news: 0, events: 0, memos: 0 });

  const fetchStats = useCallback(async () => {
    try {
      const results = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('news').select('*', { count: 'exact', head: true }).eq('status', 'Published'),
        supabase.from('calendar_events').select('*', { count: 'exact', head: true }),
        supabase.from('memos').select('*', { count: 'exact', head: true }),
      ]);
      const [{ count: users, error: usersErr }, { count: news, error: newsErr }, { count: events, error: eventsErr }, { count: memos, error: memosErr }] = results;
      
      if (usersErr && (usersErr.status === 403 || usersErr.status === 406)) {
        console.warn('Profiles table access denied - check RLS policies');
      }
      
      setStats({ 
        users: !usersErr ? (users || 0) : 0, 
        news: !newsErr ? (news || 0) : 0, 
        events: !eventsErr ? (events || 0) : 0, 
        memos: !memosErr ? (memos || 0) : 0 
      });
    } catch (e) {
      console.warn('Stats fetch error:', e);
      setStats({ users: 0, news: 0, events: 0, memos: 0 });
    }
  }, []);

  const [activityLogs, setActivityLogs] = useState([]);
  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('activity_logs').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) {
        console.warn('Activity logs unavailable:', error);
        setActivityLogs([]);
      } else {
        setActivityLogs(data || []);
      }
    } catch (e) {
      console.warn('Activity logs fetch error:', e);
      setActivityLogs([]);
    }
  }, []);

  const [roleDist, setRoleDist] = useState([]);
  const fetchRoleDist = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('role');
      if (error) {
        if (error.status === 403 || error.status === 406) {
          console.warn('Role distribution unavailable - profiles table access denied');
        } else {
          console.warn('Role distribution fetch error:', error);
        }
        setRoleDist([]);
        return;
      }
      if (!data) { setRoleDist([]); return; }
      const counts = {};
      data.forEach(r => { counts[r.role] = (counts[r.role] || 0) + 1; });
      setRoleDist(Object.entries(counts).map(([role, count]) => ({ role, count })));
    } catch (e) {
      console.warn('Role distribution error:', e);
      setRoleDist([]);
    }
  }, []);

  // ═══════════════════════════════════════════
  //  USERS — Supabase CRUD + Real-time
  // ═══════════════════════════════════════════
  const [users, setUsers]           = useState([]);
  const [usersLoading, setUL]       = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editUser, setEditUser]     = useState(null);

  const [uName,   setUName]   = useState('');
  const [uEmail,  setUEmail]  = useState('');
  const [uDept,   setUDept]   = useState('');
  const [uRole,   setURole]   = useState('student');
  const [uPass,   setUPass]   = useState('');
  const [uSaving, setUSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setUL(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
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
    setEditUser(null); setUName(''); setUEmail(''); setUDept(''); setURole('student'); setUPass('');
    openModal('user');
  };
  const openEditUser = (u) => {
    setEditUser(u); setUName(u.name || ''); setUEmail(u.email || '');
    setUDept(u.department || ''); setURole(u.role || 'student'); setUPass('');
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
        name: uName.trim(), role: uRole, department: uDept.trim(), updated_at: new Date().toISOString()
      }).eq('id', editUser.id).select().single();
      
      if (error) throw error;
      
      setUsers(prev => prev.map(u => u.id === editUser.id ? data : u));
      showToast('User updated!');
      console.log('✅ User updated:', data.id);
      
    } else {
      // ════════════════════════════════════════════════
      // CREATE NEW USER
      // ════════════════════════════════════════════════
      if (!uPass || uPass.length < 6) return showToast('Password must be at least 6 chars', 'error');

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
              department: uDept.trim(), 
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
      try {
        await supabase.from('activity_logs').insert([{
          action: 'Created user',
          details: `${uName} (${uRole})`,
          user_id: userData?.uid,
          user_name: userData?.name || 'Admin',
          created_at: new Date().toISOString(),
        }]);
      } catch (logErr) {
        console.warn('⚠️ Activity log failed (non-blocking):', logErr);
      }

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
          const { error } = await supabase.from('profiles').delete().eq('id', id);
          if (error) throw error;
          // Update local state immediately to prevent UI flickering
          setUsers(prev => prev.filter(u => u.id !== id));
          // Update stats immediately
          setStats(prev => ({ ...prev, users: Math.max(0, prev.users - 1) }));
          await logActivity('Deleted user', userToDelete?.name || id);
          showToast('User deleted');
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
      (!s || (u.name || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s)) &&
      (!roleFilter || u.role === roleFilter)
    );
  }, [users, userSearch, roleFilter]);

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
  const [nSaving,  setNSaving]      = useState(false);

  const fetchNews = useCallback(async () => {
    setNL(true);
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    if (error) { showToast('Error loading news: ' + error.message, 'error'); }
    else setNewsItems(data || []);
    setNL(false);
  }, []);

  const openNewPost = () => {
    setEditNews(null); setNTitle(''); setNCat('Academics'); setNAuthor(''); setNContent(''); setNStatus('Draft'); setNTarget('all'); setNCustomTarget('');
    openModal('news');
  };
  const openEditNews = (n) => {
    setEditNews(n); setNTitle(n.title || ''); setNCat(n.category || 'Academics');
    setNAuthor(n.author || ''); setNContent(n.content || ''); setNStatus(n.status || 'Draft');
    setNTarget(n.target_roles?.startsWith('custom:') ? 'custom' : (n.target_roles || 'all'));
    setNCustomTarget(n.target_roles?.startsWith('custom:') ? n.target_roles.slice(7) : '');
    openModal('news');
  };

  const saveNews = async () => {
    if (!nTitle.trim()) return showToast('Title required', 'error');
    if (nTarget === 'custom' && !nCustomTarget.trim()) return showToast('Custom audience required', 'error');
    setNSaving(true);
    try {
      const payload = {
        title: nTitle.trim(), category: nCat, content: nContent, status: nStatus,
        author_id: userData?.uid,
        target_roles: nTarget === 'custom' ? `custom:${nCustomTarget.trim()}` : nTarget,
        published_at: nStatus === 'Published' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
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
      await fetchNews(); await fetchStats();
      closeModal();
    } catch (e) {
      showToast(e.message || 'Error', 'error');
    } finally { setNSaving(false); }
  };

  const updateNewsStatus = async (id, status) => {
    await supabase.from('news').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    const newsItem = newsItems.find(n => n.id === id);
    await logActivity('Updated news status', `${newsItem?.title} → ${status}`);
    showToast(`Post ${status.toLowerCase()}`);
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
      const { data, error } = await supabase.from('calendar_events').select('*').order('event_date', { ascending: true });
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

  const typeColor = (t) => ({ Event:'#3b82f6', Deadline:'#f59e0b', Holiday:'#22c55e', Meeting:'#a78bfa', Other:'#2dd4bf' }[t] || '#3b82f6');
  const typeClass = (t) => ({ Event:'ev-blue', Deadline:'ev-yellow', Holiday:'ev-green', Meeting:'ev-purple', Other:'ev-teal' }[t] || 'ev-blue');

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
    const { data, error } = await supabase.from('memos').select('*').order('created_at', { ascending: false });
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
    portal_name: 'DPNHS Portal', academic_year: '2025-2026', semester: '2nd Semester',
  });
  const [settingsSaving, setSS] = useState(false);
  const [autoSave, setAutoSave] = useState(false); // NEW
  const [twoFactorAuth,       setTwoFactorAuth]       = useState(true);
  const [sessionTimeout,      setSessionTimeout]      = useState('30 min');
  const [loginAttemptLimit,   setLoginAttemptLimit]   = useState(true);
  const [emailNotifications,  setEmailNotifications]  = useState(false);
  const [lmsIntegration,      setLmsIntegration]      = useState(false);
  const [smsGateway,          setSmsGateway]          = useState(false);
  const [autoBackup,          setAutoBackup]          = useState(true);
  const [activityLogsDays,    setActivityLogsDays]    = useState('90 days');
  const [theme,               setTheme]               = useState('Dark');
  const [language,            setLanguage]            = useState('English');

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('school_settings').select('*').eq('id', 1).single();
      if (!error && data) {
        setSettings(data);
        setTheme(data.theme || 'Dark');
        setLanguage(data.language || 'English');
        setAutoSave(data.auto_save || false);
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
        theme,
        language,
        auto_save: autoSave,
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
  //  REAL-TIME SUBSCRIPTIONS — ALL TABLES
  // ═══════════════════════════════════════════
  useEffect(() => {
    const channels = [];

    // Shared Realtime presence channel for live online/offline status.
    const presenceChannel = supabase.channel('portal-presence');
    const updateOnlineUsers = () => {
      setOnlineUsers(new Set(Object.keys(presenceChannel.presenceState())));
    };

    presenceChannel
      .on('presence', { event: 'sync' }, updateOnlineUsers)
      .on('presence', { event: 'join' }, updateOnlineUsers)
      .on('presence', { event: 'leave' }, updateOnlineUsers)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') updateOnlineUsers();
      });
    channels.push(presenceChannel);

    // Users subscription (debounced to prevent race conditions)
    channels.push(
      supabase.channel('admin-users')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          debouncedFetchUsers(); debouncedFetchStats(); debouncedFetchRoleDist();
        })
        .subscribe()
    );

    // News subscription
    channels.push(
      supabase.channel('admin-news')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'news' }, () => {
          fetchNews(); fetchStats();
        })
        .subscribe()
    );

    // Calendar subscription
    channels.push(
      supabase.channel('admin-calendar')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
          fetchCalEvents(); fetchStats();
        })
        .subscribe()
    );

    // Memos subscription
    channels.push(
      supabase.channel('admin-memos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, () => {
          fetchMemos(); fetchStats();
        })
        .subscribe()
    );

    // Activity logs subscription
    channels.push(
      supabase.channel('admin-logs')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, () => {
          fetchLogs();
        })
        .subscribe()
    );

    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [debouncedFetchUsers, debouncedFetchStats, debouncedFetchRoleDist, fetchNews, fetchStats, fetchCalEvents, fetchMemos, fetchLogs]);

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
    // Add timeout protection (5 seconds max per fetch)
    const timeout = (promise, ms = 5000) => Promise.race([
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
    Toggle, activeSettingsSub, activityLogs, activityLogsDays, autoBackup, autoSave,
    calEvents, calFilter, calGrid, calMonth, calYear, closeModal,
    darkMode, debounceTimersRef, debouncedFetchRoleDist, debouncedFetchStats, debouncedFetchUsers, deleteConfirm,
    deleteEvent, deleteMemo, deleteNewsItem, deleteUser, editEvent, editMemo,
    editNews, editUser, emailNotifications, evDate, evDesc, evEnd,
    evCustomType, evSaving, evTitle, evType, fetchCalEvents, fetchLogs, fetchMemos,
    fetchNews, fetchRoleDist, fetchSettings, fetchStats, fetchUsers, filteredMemos,
    filteredNews, filteredUsers, handleOverlayClick, language, lmsIntegration, logActivity,
    loginAttemptLimit, logoErr, mBody, mFrom, mSaving, mSubj,
    mTo, memoFilter, memoSearch, memos, memosLoading, modal,
    nAuthor, nCat, nContent, nCustomTarget, nSaving, nStatus, nTarget,
    nTitle, newsCatF, newsItems, newsLoading, newsSearch, newsStatF,
    nextMonth, notifications, openCompose, openCreateEvent, openCreateUser, openEditEvent,
    openEditMemo, openEditNews, openEditUser, openModal, openNewPost, page,
    prevMonth, roleDist, roleFilter, saveEvent, saveMemo, saveNews,
    saveSettings, saveUser, scrollToSection, selMemo, sessionTimeout, setActiveSettingsSub,
    setActivityLogs, setActivityLogsDays, setAutoBackup, setAutoSave, setCalEvents, setCalFilter,
    setCalMonth, setCalYear, setDarkMode, setDeleteConfirm, setEditEvent, setEditMemo,
    setEditNews, setEditUser, setEmailNotifications, setEvDate, setEvDesc, setEvEnd,
    setEvCustomType, setEvSaving, setEvTitle, setEvType, setLanguage, setLmsIntegration, setLoginAttemptLimit,
    setLogoErr, setMBody, setMFrom, setML, setMSaving, setMSubj,
    setMTo, setMemoFilter, setMemoSearch, setMemos, setModal, setNAuthor,
    setNCat, setNContent, setNCustomTarget, setNL, setNSaving, setNStatus, setNTarget,
    setNTitle, setNewsCatF, setNewsItems, setNewsSearch, setNewsStatF, setNotifications,
    setPage, setRoleDist, setRoleFilter, setSS, setSelMemo, setSessionTimeout,
    setSettings, setSmsGateway, setStats, setTheme, setToast, setTwoFactorAuth,
    setUDept, setUEmail, setUL, setUName, setUPass, setURole,
    setUSaving, setUserSearch, setUsers, settings, settingsSaving, showToast,
    smsGateway, stats, theme, toast, today, twoFactorAuth, onlineUsers,
    typeClass, typeColor, uDept, uEmail, uName, uPass,
    uRole, uSaving, upcomingEvents, updateNewsStatus, userSearch, users,
    usersLoading,
  };
};
