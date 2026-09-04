// ============================================
// FILE: src/pages/dashboards/teacher/TeacherDashboard.jsx
// SHELL: ThemeContext.Provider + TeacherLayout (sidebar, header) + <Routes>
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import {
  Users, BookOpen, FileText, GraduationCap,
  CalendarCheck, Megaphone, Moon, Sun, LogOut, Menu,
  LayoutDashboard, ClipboardList, ChevronRight, ChevronLeft, Bell, Search, Settings
} from 'lucide-react';
import { ThemeContext, useTheme } from './hooks';
import OverviewTab from './tabs/OverviewTab';
import StudentsTab from './tabs/StudentsTab';
import LessonPlansTab from './tabs/LessonPlansTab';
import WorksheetsTab from './tabs/WorksheetsTab';
import AssessmentsTab from './tabs/AssessmentsTab';
import GradesTab from './tabs/GradesTab';
import AttendanceTab from './tabs/AttendanceTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';

// ============================================
// TEACHER LAYOUT (sidebar, header, theme toggle)
// ============================================
const TeacherLayout = ({ children }) => {
  const { dark, toggleDark } = useTheme();
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/teacher-dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/teacher-dashboard/students', icon: Users, label: 'Students' },
    { path: '/teacher-dashboard/lesson-plans', icon: BookOpen, label: 'Lesson Plans' },
    { path: '/teacher-dashboard/worksheets', icon: ClipboardList, label: 'Worksheets' },
    { path: '/teacher-dashboard/assignments', icon: FileText, label: 'Assessments' },
    { path: '/teacher-dashboard/grades', icon: GraduationCap, label: 'Grades' },
    { path: '/teacher-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
    { path: '/teacher-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ];

  const mainBg = dark ? '#0f172a' : '#f1f5f9';
  const borderColor = dark ? '#334155' : '#e2e8f0';
  const textPrimary = dark ? '#f1f5f9' : '#1a2b4a';
  const textMuted = dark ? '#94a3b8' : '#64748b';
  const sidebarBg = dark ? '#1e293b' : '#ffffff';
  const activeBg = dark ? '#1a2540' : '#eef0f5';
  const brandGradient = 'linear-gradient(100deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)';

  useEffect(() => {
    const fetchNotifs = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userData?.uid)
        .eq('is_read', false);
      setNotifCount(count || 0);
    };

    if (userData?.uid) fetchNotifs();

    const channel = supabase
      .channel('teacher-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, fetchNotifs)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userData]);

  return (
    <div className="dashboard-shell flex flex-col h-screen overflow-hidden" style={{ backgroundColor: mainBg }}>
      {/* ===== HEADER ===== */}
      <header className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30" style={{ background: brandGradient }}>
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex-shrink-0 overflow-hidden">
            <img src="/capstonelogo.png" alt="School Logo" className="w-full h-full object-contain"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div className="hidden sm:block leading-tight">
            <h1 className="font-work font-extrabold text-xl tracking-wide">
              <span style={{ color: '#F1CA0B' }}>EDU</span><span style={{ color: '#31F745' }}>SCRIBE</span>
            </h1>
            <p className="text-[11px] text-white/70 font-medium">Teacher Dashboard</p>
          </div>
        </div>

        <div className="flex-1 hidden md:flex justify-center">
          <div className="w-full max-w-md flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm">
            <Search size={15} className="text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search students, worksheets, announcements..."
              className="bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
          <button onClick={toggleDark} className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors relative">
            <Bell size={16} />
            {notifCount > 0 && (
              <span
                className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                style={{ boxShadow: '0 0 0 2px #1908DF' }}
              >
                {notifCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ===== SIDEBAR ===== */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50 flex flex-col flex-shrink-0
            transform transition-all duration-300 ease-in-out shadow-sm
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}
          `}
          style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${borderColor}` }}
        >
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            className="hidden lg:flex absolute -right-3 top-7 w-6 h-6 rounded-full items-center justify-center shadow-md z-10 transition-transform"
            style={{ backgroundColor: sidebarBg, border: `1px solid ${borderColor}`, color: textMuted }}
          >
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>

          <div className="p-5 border-b" style={{ borderColor }}>
            <button
              onClick={() => setProfileOpen(open => !open)}
              className={`w-full flex items-center gap-3 text-left ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
              aria-expanded={profileOpen}
              aria-label="Toggle profile menu"
            >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: '#FFC542', color: '#12069f' }}
            >
              {(userData?.name || 'T')[0].toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{userData?.name || 'Teacher'}</p>
                <p className="text-[11px]" style={{ color: textMuted }}>Teacher</p>
              </div>
            )}
            {!sidebarCollapsed && <ChevronRight size={15} className={`ml-auto transition-transform ${profileOpen ? 'rotate-90' : ''}`} style={{ color: textMuted }} />}
            </button>
            {profileOpen && !sidebarCollapsed && (
              <button onClick={() => navigate('/change-password')} className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-100" style={{ color: textMuted }}>
                <Settings size={15} />
                <span>Profile Settings</span>
              </button>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
                  style={{
                    backgroundColor: isActive ? activeBg : 'transparent',
                    color: isActive ? '#1908DF' : textMuted,
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: isActive ? sidebarBg : 'transparent',
                      border: isActive ? 'none' : `1px solid ${borderColor}`,
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

          <div className="p-4 border-t" style={{ borderColor }}>
            <button
              onClick={handleLogout}
              className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
              style={{ color: '#dc2626', borderColor: '#f3b9ba', backgroundColor: dark ? 'rgba(220,38,38,.12)' : '#fdf1f1' }}
            >
              <LogOut size={16} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0" style={{ backgroundColor: mainBg }}>
          {children}
        </main>
      </div>
    </div>
  );
};

// ============================================
// MAIN TEACHER DASHBOARD — SINGLE DECLARATION
// ============================================
const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { isTeacher, userData } = useAuth();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!isTeacher()) {
      navigate('/', { replace: true });
    }
  }, [isTeacher, navigate]);

  return (
    <ThemeContext.Provider value={{ dark, toggleDark: () => setDark(d => !d) }}>
      <TeacherLayout>
        <Routes>
          <Route path="/" element={<OverviewTab />} />
          <Route path="/students" element={<StudentsTab />} />
          <Route path="/lesson-plans" element={<LessonPlansTab />} />
          <Route path="/worksheets" element={<WorksheetsTab />} />
          <Route path="/assignments" element={<AssessmentsTab />} />
          <Route path="/grades" element={<GradesTab />} />
          <Route path="/attendance" element={<AttendanceTab />} />
          <Route path="/announcements" element={<AnnouncementsTab />} />
        </Routes>
      </TeacherLayout>
    </ThemeContext.Provider>
  );
};

export default TeacherDashboard;
