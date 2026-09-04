// ============================================
// FILE: src/pages/dashboards/student/StudentDashboard.jsx
// SHELL: ThemeContext.Provider + StudentLayout (sidebar, header) + <Routes>
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import {
  LayoutDashboard, ClipboardList, FileText, CalendarCheck, Megaphone,
  Search, Moon, Sun, LogOut, Menu, ChevronRight, Bell, Settings
} from 'lucide-react';
import { ThemeContext, useTheme } from './hooks';
import OverviewTab from './tabs/OverviewTab';
import AssignmentsTab from './tabs/AssignmentsTab';
import QuizzesTab from './tabs/QuizzesTab';
import AttendanceTab from './tabs/AttendanceTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';

// ============================================
// MAIN STUDENT DASHBOARD
// ============================================
const StudentDashboard = () => {
  const navigate = useNavigate();
  const { isStudent } = useAuth();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!isStudent()) {
      navigate('/', { replace: true });
    }
  }, [isStudent, navigate]);

  return (
    <ThemeContext.Provider value={{ dark, toggleDark: () => setDark(d => !d) }}>
      <StudentLayout>
        <Routes>
          <Route path="/" element={<OverviewTab />} />
          <Route path="/assignments" element={<AssignmentsTab />} />
          <Route path="/quizzes" element={<QuizzesTab />} />
          <Route path="/attendance" element={<AttendanceTab />} />
          <Route path="/announcements" element={<AnnouncementsTab />} />
        </Routes>
      </StudentLayout>
    </ThemeContext.Provider>
  );
};

// ============================================
// STUDENT LAYOUT (White Sidebar + Top Header + Theme)
// ============================================
const StudentLayout = ({ children }) => {
  const { dark, toggleDark } = useTheme();
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/student-dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/student-dashboard/assignments', icon: ClipboardList, label: 'Assignments' },
    { path: '/student-dashboard/quizzes', icon: FileText, label: 'Quizzes' },
    { path: '/student-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
    { path: '/student-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ];

  // Fetch notifications from Supabase
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!userData?.uid) return;
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userData.uid)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error) {
        setNotifications(data || []);
        setUnreadCount(data?.length || 0);
      }
    };

    fetchNotifications();

    const channel = supabase
      .channel('student-notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${userData?.uid}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 10));
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userData?.uid]);

  const markAsRead = async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!userData?.uid) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userData.uid);
    setNotifications([]);
    setUnreadCount(0);
  };

  const mainBg = dark ? '#0f172a' : '#f1f5f9';
  const headerBorder = dark ? '#334155' : '#e2e8f0';
  const textPrimary = dark ? '#f1f5f9' : '#1a2b4a';
  const textMuted = dark ? '#94a3b8' : '#64748b';

  return (
    <div className="dashboard-shell flex flex-col h-screen overflow-hidden" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
      {/* TOP HEADER */}
      <header
        className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30"
        style={{ background: 'linear-gradient(100deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)' }}
      >
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex-shrink-0 overflow-hidden">
            <img src="/capstonelogo.png" alt="School Logo" className="w-full h-full object-contain" />
          </div>
          <div className="hidden sm:block leading-tight">
            <h1 className="font-work font-extrabold text-xl tracking-wide"><span style={{ color: '#F1CA0B' }}>EDU</span><span style={{ color: '#31F745' }}>SCRIBE</span></h1>
            <p className="text-[11px] text-white/70 font-medium">Student Dashboard</p>
          </div>
        </div>
        <div className="flex-1 hidden md:flex justify-center">
          <div className="w-full max-w-md flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm">
            <Search size={15} className="text-slate-400 flex-shrink-0" />
            <input type="text" placeholder="Search assignments, quizzes, announcements..." className="bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
          {/* Notification Bell with Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors relative"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl shadow-xl border z-50 overflow-hidden"
                  style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', borderColor: dark ? '#334155' : '#e2e8f0' }}>
                  <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
                    <h3 className="text-sm font-bold" style={{ color: textPrimary }}>Notifications</h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-xs font-medium hover:underline" style={{ color: '#3b82f6' }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <Bell size={32} className="mx-auto mb-2" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
                        <p className="text-xs" style={{ color: textMuted }}>No new notifications</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="p-3 border-b hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                          style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}
                          onClick={() => markAsRead(n.id)}>
                          <div className="flex gap-3">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              n.type === 'success' ? 'bg-green-500' :
                              n.type === 'warning' ? 'bg-amber-500' :
                              n.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                            }`} />
                            <div className="flex-1">
                              <p className="text-sm font-medium" style={{ color: textPrimary }}>{n.title}</p>
                              <p className="text-xs mt-0.5" style={{ color: textMuted }}>{n.message}</p>
                              <p className="text-[10px] mt-1" style={{ color: dark ? '#475569' : '#94a3b8' }}>
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

          <button
            onClick={toggleDark}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold cursor-default"
            style={{ backgroundColor: '#FFC542', color: '#12069f' }}
            title={userData?.name || 'Student'}
          >
            {(userData?.name || 'S')[0].toUpperCase()}
          </div>
          <button
            onClick={handleLogout}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/25 text-white/85 hover:bg-white/10"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR — Theme-aware (ORIGINAL) */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 flex flex-col
          transform transition-transform duration-300 ease-in-out shadow-sm
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}
        `}
        style={{ backgroundColor: dark ? '#1e293b' : '#ffffff' }}
      >
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3 top-7 w-6 h-6 rounded-full items-center justify-center shadow-md z-10"
          style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: textMuted }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronRight size={13} className="rotate-180" />}
        </button>
        {/* Logo + School Name */}
        <div className="p-5 border-b" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
          <button
            onClick={() => setProfileOpen(open => !open)}
            className={`w-full flex items-center gap-3 text-left ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
            aria-expanded={profileOpen}
            aria-label="Toggle profile menu"
          >
          <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden">
            <img 
              src="/capstonelogo.png" 
              alt="School Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '<span class="font-bold text-[#1e3a5f] text-lg">D</span>';
              }}
            />
          </div>
          {!sidebarCollapsed && <div>
            <p className="font-bold text-sm leading-tight" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Dela Paz National High School</p>
            <p className="text-[10px]" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Student Portal</p>
          </div>}
          {!sidebarCollapsed && <ChevronRight size={15} className={`ml-auto transition-transform ${profileOpen ? 'rotate-90' : ''}`} style={{ color: dark ? '#94a3b8' : '#64748b' }} />}
          </button>
          {profileOpen && !sidebarCollapsed && (
            <button onClick={() => navigate('/change-password')} className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ color: textMuted, backgroundColor: dark ? '#273449' : '#f1f5f9' }}>
              <Settings size={15} />
              <span>Profile Settings</span>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname === item.path + '/';
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1"
                style={{
                  color: isActive ? '#1908DF' : (dark ? '#94a3b8' : '#64748b'),
                  backgroundColor: isActive ? (dark ? '#1a2540' : '#eef0f5') : 'transparent'
                }}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: isActive ? (dark ? '#1e293b' : '#ffffff') : 'transparent',
                    border: isActive ? 'none' : `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                    boxShadow: isActive ? '0 2px 6px rgba(25,8,223,.18)' : 'none',
                  }}
                >
                  <Icon size={16} />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* System Status */}
        <div className="p-5 border-t" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
          <div className="flex items-center gap-2 px-2">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>All systems online</span>
          </div>
        </div>
      </aside>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto" style={{ backgroundColor: mainBg }}>
          {children}
        </main>
      </div>
    </div>
  );
};

// ============================================
// SHARED COMPONENTS (Theme-aware from old — UNCHANGED)
// ============================================

export default StudentDashboard;
