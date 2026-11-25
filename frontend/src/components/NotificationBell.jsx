// ============================================
// FILE: src/components/NotificationBell.jsx
// Shared header notification bell — dropdown, mark-as-read, realtime.
// Always mounted on the navy header bar (#003b7a) in every dashboard, so
// its own button chrome needs no light/dark branching; the dropdown panel
// uses CSS vars with light-mode fallbacks so it renders correctly even in
// dashboards that don't define them (e.g. Faculty).
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../lib/formatDate';
import { Bell, Check, FileText, Megaphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { withRetry } from '../lib/supabaseRetry';
import { inAppPath } from '../lib/inAppPath';

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

// A notification row with an in-app action_url: one button that marks it read
// and goes there. Only mounted when the bell is asked to follow links, so
// dashboards that do not opt in never need a router here.
// U-PDF-S (design p23), student panel only: a type icon and a relative time.
const typeIcon = (type) => {
  const t = (type || '').toLowerCase();
  if (t.includes('score') || t.includes('grade') || t === 'success') return Check;
  if (t.includes('announce') || t.includes('news') || t.includes('memo')) return Megaphone;
  if (t.includes('worksheet') || t.includes('task') || t.includes('assign') || t.includes('lesson')) return FileText;
  return Bell;
};
const DAY_SHORT = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
const MANILA_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
const relativeTime = (value, now = new Date()) => {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes >= 0 && minutes < 1) return 'Just now';
  if (minutes >= 0 && minutes < 60) return `${minutes} min ago`;
  if (minutes >= 0 && minutes < 24 * 60 && MANILA_KEY.format(at) === MANILA_KEY.format(now)) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (MANILA_KEY.format(at) === MANILA_KEY.format(yesterday)) return 'Yesterday';
  return DAY_SHORT.format(at);
};

const NotificationLink = ({ path, onFollow, children, style }) => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => { onFollow(); navigate(path); }}
      className="block w-full text-left p-4 border-b transition-colors min-h-11" style={style}>
      {children}
    </button>
  );
};

// followLinks: rows with a relative or same-origin action_url open that page.
// Off by default, so every existing dashboard keeps its current behavior.
// designPanel (U-PDF-S, student shell only): "N new", "Mark all as read", a
// type icon per row and relative times. Without it the panel is unchanged.
const NotificationBell = ({ className = '', followLinks = false, designPanel = false }) => {
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

  const toggleOpen = useCallback(() => setOpen(o => !o), []);

  const markRead = async (id) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { console.warn('Mark as read failed:', error.message); return; }
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // `quiet` is the open-the-bell path: the write and the badge happen, the
  // rows keep their highlight. The button passes nothing and greys the list
  // immediately, which is what pressing "Mark all read" is asking for.
  const markAllRead = useCallback(async ({ quiet = false } = {}) => {
    if (!uid) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('is_read', false);
    // The badge is NOT cleared on failure. Showing zero unread over a write
    // that never landed is the lie this whole change is meant to remove —
    // it would come back on the next login exactly as before, except now
    // without the user having any idea why.
    if (error) { console.warn('Mark all as read failed:', error.message); return; }
    if (!quiet) setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [uid]);

  // Opening the bell refetches, then marks everything read.
  //
  // Before this, the only things that marked anything read were clicking an
  // individual row and pressing "Mark all read" — so a user who opened the
  // bell, read the list and closed it came back after logging in to the same
  // unread badge, having done nothing wrong. Looking at a notification is
  // reading it.
  //
  // Strictly ordered, not fired together: both are async, and a fetch that
  // resolved after the mark would set the badge back from rows it read
  // before the write landed. The bug would be intermittent and look exactly
  // like the one being fixed.
  //
  // `quiet` leaves the rows' own highlight alone. The blue tint is how you
  // tell what is new, and clearing it the instant the panel opens would
  // erase that answer before it could be read.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      await fetchNotifsRef.current();
      if (!cancelled) await markAllRead({ quiet: true });
    })();
    return () => { cancelled = true; };
  }, [open, markAllRead]);

  // Rows still shown as unread (opening the panel marks them read quietly).
  const newCount = notifications.filter(n => !n.is_read).length;
  return (
    <div className={`notification-bell relative ${className}`.trim()}>
      <button
        onClick={toggleOpen}
        className="notification-bell-button w-10 h-10 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors relative"
        aria-label="Notifications"
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="notification-badge absolute top-0 right-0 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center"
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
            className="notification-panel absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl shadow-xl border z-50 overflow-hidden"
            style={{ backgroundColor: v('--card-bg', '#ffffff'), borderColor: v('--border', '#e2e8f0') }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: v('--border', '#e2e8f0') }}>
              <h3 className="text-base font-bold flex items-center gap-2" style={{ color: v('--text', '#1a2b4a') }}>
                Notifications
                {designPanel && newCount > 0 && (
                  <span className="notification-new text-xs font-semibold rounded-full px-2 py-0.5"
                    style={{ color: v('--cl-ac', '#3d34e0'), backgroundColor: v('--cl-ac-s', '#eeedfd') }}>{newCount} new</span>
                )}
              </h3>
              {designPanel ? (newCount > 0 && (
                <button type="button" onClick={() => markAllRead()} className="min-h-11 px-1 text-sm font-semibold hover:underline flex items-center gap-1"
                  style={{ color: v('--cl-ac', '#3d34e0') }}>
                  <Check size={14} aria-hidden="true" /> Mark all as read
                </button>
              )) : unreadCount > 0 && (
                <button onClick={() => markAllRead()} className="text-sm font-semibold hover:underline" style={{ color: '#3b82f6' }}>
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
                notifications.map(n => {
                  const rowStyle = { borderColor: v('--border', '#e2e8f0'), backgroundColor: n.is_read ? 'transparent' : 'rgba(59,130,246,0.06)' };
                  const path = followLinks ? inAppPath(n.action_url) : null;
                  const TypeIcon = typeIcon(n.notification_type);
                  const body = designPanel ? (
                    <div className="flex gap-3 items-start">
                      <span className={`w-2 h-2 rounded-full mt-3 flex-shrink-0 ${n.is_read ? 'opacity-0' : ''}`}
                        style={{ backgroundColor: v('--cl-ac', '#3d34e0') }} aria-hidden="true" />
                      <span className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" aria-hidden="true"
                        style={{ color: v('--cl-ac', '#3d34e0'), backgroundColor: v('--cl-ac-s', '#eeedfd') }}><TypeIcon size={16} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: v('--text', '#1a2b4a') }}>
                          {!n.is_read && <span className="sr-only">Unread: </span>}{n.title}
                        </p>
                        <p className="text-sm mt-0.5 [overflow-wrap:anywhere]" style={{ color: v('--text-muted', '#64748b') }}>{n.message}</p>
                        <p className="text-xs mt-1" style={{ color: v('--text-dim', '#94a3b8') }} title={formatDateTime(n.created_at)}>
                          {relativeTime(n.created_at)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-2 flex-shrink-0 ${dotColor(n.notification_type)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold [overflow-wrap:anywhere]" style={{ color: v('--text', '#1a2b4a') }}>{n.title}</p>
                        <p className="text-sm mt-1 [overflow-wrap:anywhere]" style={{ color: v('--text-muted', '#64748b') }}>{n.message}</p>
                        <p className="text-xs mt-1.5" style={{ color: v('--text-dim', '#94a3b8') }}>
                          {formatDateTime(n.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                  return path ? (
                    <NotificationLink key={n.id} path={path} style={rowStyle}
                      onFollow={() => { if (!n.is_read) markRead(n.id); setOpen(false); }}>
                      {body}
                    </NotificationLink>
                  ) : (
                    <div
                      key={n.id}
                      className="p-4 border-b transition-colors cursor-pointer"
                      style={rowStyle}
                      onClick={() => !n.is_read && markRead(n.id)}
                    >
                      {body}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
