// ============================================
// FILE: src/pages/dashboards/registrar/RegistrarDashboard.jsx
// SHELL: ThemeStyles + RegistrarLayout (sidebar, header) + <Routes>
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import {
  LayoutDashboard, Users, ClipboardList, Calendar, FileText,
  Search, Moon, Sun, LogOut, Menu, ChevronRight, Bell, School,
  BarChart3, Inbox, Settings
} from 'lucide-react';
import { ThemeStyles } from './shared/ui';
import DashboardTab from './tabs/DashboardTab';
import OverviewTab from './tabs/OverviewTab';
import StudentsTab from './tabs/StudentsTab';
import PreEnrollmentTab from './tabs/PreEnrollmentTab';
import SchedulingTab from './tabs/SchedulingTab';
import DocumentsTab from './tabs/DocumentsTab';
import AnalyticsTab from './tabs/AnalyticsTab';

// ============================================
// LAYOUT COMPONENT
// ============================================
const RegistrarLayout = ({ children, darkMode, setDarkMode }) => {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = [
    { path: '/registrar-dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/registrar-dashboard/overview', icon: School, label: 'Overview' },
    { path: '/registrar-dashboard/students', icon: Users, label: 'Student Records' },
    { path: '/registrar-dashboard/pre-enrollment', icon: ClipboardList, label: 'Pre-Enrollment' },
    { path: '/registrar-dashboard/scheduling', icon: Calendar, label: 'Scheduling' },
    { path: '/registrar-dashboard/documents', icon: FileText, label: 'Documents' },
    { path: '/registrar-dashboard/analytics', icon: BarChart3, label: 'Analytics' },
  ];

  const isActive = (path) =>
    path === '/registrar-dashboard'
      ? location.pathname === '/registrar-dashboard' || location.pathname === '/registrar-dashboard/'
      : location.pathname.startsWith(path);

  // Fetch notifications
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
      .channel('registrar-notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${userData?.uid}`
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 10));
        setUnreadCount(prev => prev + 1);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userData?.uid}`
      }, fetchNotifications)
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

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--reg-bg)' }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col transform transition-all duration-300 ease-in-out shadow-lg lg:shadow-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}`}
        style={{ backgroundColor: 'var(--reg-sidebar-bg)' }}>

        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3 top-7 w-6 h-6 rounded-full items-center justify-center shadow-md z-10"
          style={{ backgroundColor: 'var(--reg-sidebar-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-muted)' }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronRight size={13} className="rotate-180" />}
        </button>

        <div className="p-5 border-b" style={{ borderColor: 'var(--reg-border)' }}>
          <button
            onClick={() => setProfileOpen(open => !open)}
            className={`w-full flex items-center gap-3 text-left ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
            aria-expanded={profileOpen}
            aria-label="Toggle profile menu"
          >
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: '#FFC542', color: '#12069f' }}>
            {(userData?.name || 'R')[0].toUpperCase()}
          </div>
          {!sidebarCollapsed && <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--reg-text)' }}>{userData?.name || 'Registrar'}</p>
            <p className="text-[11px]" style={{ color: 'var(--reg-muted)' }}>Registrar</p>
          </div>}
          {!sidebarCollapsed && <ChevronRight size={15} className={`ml-auto transition-transform ${profileOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--reg-muted)' }} />}
          </button>
          {profileOpen && !sidebarCollapsed && (
            <button onClick={() => navigate('/change-password')} className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--reg-muted)', backgroundColor: 'var(--reg-bg)' }}>
              <Settings size={15} />
              <span>Profile Settings</span>
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1"
                style={{
                  backgroundColor: active ? 'var(--reg-sidebar-active-bg)' : 'transparent',
                  color: active ? 'var(--reg-sidebar-active-text)' : 'var(--reg-sidebar-text)',
                }}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: active ? 'var(--reg-surface)' : 'transparent',
                    border: active ? 'none' : '1px solid var(--reg-border)',
                    boxShadow: active ? '0 2px 6px rgba(25,8,223,.18)' : 'none',
                  }}>
                  <Icon size={16} />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-5 border-t" style={{ borderColor: 'var(--reg-border)' }}>
          <div className="flex items-center gap-2 px-2">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 animate-pulse" />
            <span className="text-xs" style={{ color: 'var(--reg-muted)' }}>All systems online</span>
          </div>
          {!sidebarCollapsed && <div className="mt-3 px-2">
            <p className="text-[10px]" style={{ color: 'var(--reg-muted-light)' }}>
              Academic Year 2025–2026
            </p>
            <p className="text-[10px]" style={{ color: 'var(--reg-muted-light)' }}>
              Semester: 2nd Semester
            </p>
          </div>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30"
          style={{ background: 'linear-gradient(100deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)' }}>
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0"><Menu size={20} /></button>
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex-shrink-0 overflow-hidden"><img src="/capstonelogo.png" alt="School Logo" className="w-full h-full object-contain" /></div>
            <div className="hidden sm:block leading-tight">
              <h1 className="font-work font-extrabold text-xl tracking-wide"><span style={{ color: '#F1CA0B' }}>EDU</span><span style={{ color: '#31F745' }}>SCRIBE</span></h1>
              <p className="text-[11px] text-white/70 font-medium">Registrar Dashboard</p>
            </div>
          </div>
          <div className="flex-1 hidden md:flex justify-center">
            <div className="w-full max-w-md flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm"><Search size={15} className="text-slate-400 flex-shrink-0" /><input type="text" placeholder="Search students, documents, schedules..." className="bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400" /></div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
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
                    style={{ backgroundColor: 'var(--reg-surface)', borderColor: 'var(--reg-border)' }}>
                    <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--reg-border)' }}>
                      <h3 className="text-sm font-bold" style={{ color: 'var(--reg-text)' }}>Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="text-xs font-medium hover:underline" style={{ color: 'var(--reg-blue)' }}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center">
                          <Inbox size={32} className="mx-auto mb-2" style={{ color: 'var(--reg-muted-light)' }} />
                          <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>No new notifications</p>
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div key={n.id} className="p-3 border-b hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                            style={{ borderColor: 'var(--reg-border)' }}
                            onClick={() => markAsRead(n.id)}>
                            <div className="flex gap-3">
                              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                n.type === 'success' ? 'bg-green-500' : 
                                n.type === 'warning' ? 'bg-amber-500' : 
                                n.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                              }`} />
                              <div className="flex-1">
                                <p className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{n.title}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--reg-muted)' }}>{n.message}</p>
                                <p className="text-[10px] mt-1" style={{ color: 'var(--reg-muted-light)' }}>
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

            <button onClick={() => setDarkMode(!darkMode)} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors">
              {darkMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: '#FFC542', color: '#12069f' }}>
              {(userData?.name || 'R')[0].toUpperCase()}
            </div>

            <button onClick={handleLogout}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/25 text-white/85 hover:bg-white/10">
              <LogOut size={15} /> Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--reg-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

// ============================================
// MAIN REGISTRAR DASHBOARD
// ============================================
const RegistrarDashboard = () => {
  const navigate = useNavigate();
  const { isRegistrar } = useAuth();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (!isRegistrar()) navigate('/', { replace: true });
  }, [isRegistrar, navigate]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  return (
    <>
      <ThemeStyles />
      <RegistrarLayout darkMode={darkMode} setDarkMode={setDarkMode}>
        <Routes>
          <Route path="/" element={<DashboardTab />} />
          <Route path="/overview" element={<OverviewTab />} />
          <Route path="/students" element={<StudentsTab />} />
          <Route path="/pre-enrollment" element={<PreEnrollmentTab />} />
          <Route path="/scheduling" element={<SchedulingTab />} />
          <Route path="/documents" element={<DocumentsTab />} />
          <Route path="/analytics" element={<AnalyticsTab />} />
        </Routes>
      </RegistrarLayout>
    </>
  );
};

export default RegistrarDashboard;
