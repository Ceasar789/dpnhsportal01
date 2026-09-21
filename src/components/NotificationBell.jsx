// ============================================
// FILE: src/components/NotificationBell.jsx
// Shared header notification bell — dropdown, mark-as-read, realtime.
// Always mounted on the navy header bar (#003b7a) in every dashboard, so
// its own button chrome needs no light/dark branching; the dropdown panel
// uses CSS vars with light-mode fallbacks so it renders correctly even in
// dashboards that don't define them (e.g. Faculty).
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { withRetry } from '../lib/supabaseRetry';

// While the tab is visible, poll this often to keep the unread badge live
// without any user action. Paused entirely while the tab is hidden so 60
// backgrounded dashboards don't hammer the free-tier connection pool.
const POLL_INTERVAL_MS = 60000;

const v = (name, fallback) => `var(${name}, ${fallback})`;

const dotColor = (type) => {
  const t = (type || '').toLowerCase();
  if (t === 'enrollment' || t === 'success') return 'bg-green-500';
  if (t === 'warning') return 'bg-amber-500';
  if (t === 'error') return 'bg-red-500';
  return 'bg-blue-500';
};

const NotificationBell = () => {
  const { userData } = useAuth();
  const uid = userData?.uid;

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  // Guards against overlapping fetches (open + poll + focus firing close
  // together) and lets the poll/visibility effect call the latest fetcher
  // without re-subscribing every render.
  const inFlightRef = useRef(false);
  const fetchNotifsRef = useRef(() => {});

  useEffect(() => {
    if (!uid) {
      fetchNotifsRef.current = () => {};
      return undefined;
    }

    // Always a full, freshly sorted re-fetch (never a manual splice/prepend)
    // so the list can never end up out of order between refreshes.
    const fetchNotifs = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data, error } = await withRetry(
          () => supabase
            .from('notifications')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(15),
          { label: 'Notifications fetch' }
        );
        if (error) {
          // Fail quietly and keep whatever is already on screen — an empty
          // bell on a flaky poll is worse than a briefly stale one.
          console.warn('Notifications fetch failed:', error.message);
          return;
        }
        setNotifications(data || []);
        setUnreadCount((data || []).filter(n => !n.is_read).length);
      } finally {
        inFlightRef.current = false;
      }
    };

    fetchNotifsRef.current = fetchNotifs;
    fetchNotifs();

    // Refresh when the tab regains visibility. `visibilitychange` alone
    // covers both "switched tabs and back" and "restored from minimize";
    // `focus` is skipped because on this same-window tab-switch flow it
    // would just double the visibilitychange fetch, not add coverage.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchNotifs();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Slow poll while visible, so the badge stays live with no user action.
    // Paused on hide and resumed on show so hidden tabs cost nothing.
    let intervalId = null;
    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(fetchNotifs, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibilityForPolling = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', onVisibilityForPolling);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityForPolling);
      stopPolling();
    };
  }, [uid]);

  // Refetch whenever the dropdown is opened, so what the user sees the
  // moment they look is fresh. Costs nothing while the bell is idle/closed.
  const toggleOpen = useCallback(() => {
    setOpen(o => {
      const next = !o;
      if (next) fetchNotifsRef.current();
      return next;
    });
  }, []);

  const markRead = async (id) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { console.warn('Mark as read failed:', error.message); return; }
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('is_read', false);
    if (error) { console.warn('Mark all as read failed:', error.message); return; }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors relative"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
            style={{ boxShadow: '0 0 0 2px #003b7a' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl shadow-xl border z-50 overflow-hidden"
            style={{ backgroundColor: v('--card-bg', '#ffffff'), borderColor: v('--border', '#e2e8f0') }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: v('--border', '#e2e8f0') }}>
              <h3 className="text-base font-bold" style={{ color: v('--text', '#1a2b4a') }}>Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-sm font-semibold hover:underline" style={{ color: '#3b82f6' }}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell size={40} className="mx-auto mb-3" style={{ color: v('--text-dim', '#cbd5e1') }} />
                  <p className="text-sm" style={{ color: v('--text-muted', '#64748b') }}>No notifications yet</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className="p-4 border-b transition-colors cursor-pointer"
                    style={{ borderColor: v('--border', '#e2e8f0'), backgroundColor: n.is_read ? 'transparent' : 'rgba(59,130,246,0.06)' }}
                    onClick={() => !n.is_read && markRead(n.id)}
                  >
                    <div className="flex gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-2 flex-shrink-0 ${dotColor(n.notification_type)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold" style={{ color: v('--text', '#1a2b4a') }}>{n.title}</p>
                        <p className="text-sm mt-1" style={{ color: v('--text-muted', '#64748b') }}>{n.message}</p>
                        <p className="text-xs mt-1.5" style={{ color: v('--text-dim', '#94a3b8') }}>
                          {new Date(n.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
