// ============================================
// FILE: src/pages/dashboards/student/StudentDashboard.jsx
// SHELL: ThemeContext.Provider + StudentLayout (sidebar, header) + <Routes>
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import {
  LayoutDashboard, ClipboardList, FileText, CalendarCheck, Megaphone,
  Moon, Sun, LogOut, Menu, ChevronRight, Settings, ClipboardCheck
} from 'lucide-react';
import { ThemeContext, useTheme } from './hooks';
import { useDashboardTheme, DashboardThemeStyles } from '../../../styles/dashboardTheme';
import PageTransition from '../../../components/PageTransition';
import Avatar from '../../../components/Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import NotificationBell from '../../../components/NotificationBell';
import OverviewTab from './tabs/OverviewTab';
import StudentWorksheetsTab from './tabs/WorksheetsTab';
import AssignmentsTab from './tabs/AssignmentsTab';
import QuizzesTab from './tabs/QuizzesTab';
import AttendanceTab from './tabs/AttendanceTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';
import ProfileTab from '../../profile/ProfileTab';
import FlippingLogo from '../../../components/FlippingLogo';

// ============================================
// MAIN STUDENT DASHBOARD
// ============================================
const StudentDashboard = () => {
  const navigate = useNavigate();
  const { isStudent } = useAuth();
  const { darkMode, toggleDarkMode } = useDashboardTheme();

  useEffect(() => {
    if (!isStudent()) {
      navigate('/', { replace: true });
    }
  }, [isStudent, navigate]);

  return (
    <ThemeContext.Provider value={{ dark: darkMode, toggleDark: toggleDarkMode }}>
      <DashboardThemeStyles />
      <StudentLayout>
        <PageTransition>
          <Routes>
            <Route path="/" element={<OverviewTab />} />
            <Route path="/worksheets" element={<StudentWorksheetsTab />} />
            <Route path="/assignments" element={<AssignmentsTab />} />
            <Route path="/quizzes" element={<QuizzesTab />} />
            <Route path="/attendance" element={<AttendanceTab />} />
            <Route path="/announcements" element={<AnnouncementsTab />} />
            <Route path="/profile" element={<ProfileTab />} />
          </Routes>
        </PageTransition>
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
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/student-dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/student-dashboard/worksheets', icon: ClipboardCheck, label: 'Worksheets' },
    { path: '/student-dashboard/assignments', icon: ClipboardList, label: 'Assignments' },
    { path: '/student-dashboard/quizzes', icon: FileText, label: 'Quizzes' },
    { path: '/student-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
    { path: '/student-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ];

  const mainBg = 'var(--bg)';
  const headerBorder = 'var(--border)';
  const textPrimary = 'var(--text)';
  const textMuted = 'var(--text-muted)';

  return (
    <div className="dashboard-shell flex flex-col h-screen overflow-hidden" style={{ backgroundColor: mainBg }}>
      {/* TOP HEADER */}
      <header
        className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30"
        style={{ backgroundColor: '#003b7a' }}
      >
        <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <FlippingLogo className="w-12 h-12 sm:w-16 sm:h-16" />
          <div className="hidden sm:block leading-tight">
            <h1 className="font-work font-bold text-2xl tracking-tight leading-none"><span style={{ color: '#FEB300' }}>Edu</span><span style={{ color: '#00D4FF' }}>Scribe</span></h1>
            <p className="font-work text-sm mt-0.5 text-white/85">Student Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <NotificationBell />

          <button
            onClick={toggleDark}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Avatar
            src={photoUrl}
            name={userData?.name || 'Student'}
            size={36}
            bg="#FFC542"
            color="#12069f"
            className="cursor-default"
            title={userData?.name || 'Student'}
          />
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
          flex-shrink-0 transform transition-all duration-300 ease-in-out shadow-sm
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}
        `}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
      >
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full items-center justify-center shadow-md z-10"
          style={{ backgroundColor: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: textMuted }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronRight size={13} className="rotate-180" />}
        </button>
        {/* Role profile */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setProfileOpen(open => !open)}
            className={`w-full flex items-center gap-3 text-left ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
            aria-expanded={profileOpen}
            aria-label="Toggle profile menu"
          >
          <Avatar
            src={photoUrl}
            name={userData?.name || 'Student User'}
            size={36}
            bg="#FFC542"
            color="#12069f"
          />
          {!sidebarCollapsed && <div>
            <p className="font-bold text-sm leading-tight" style={{ color: 'var(--text)' }}>{userData?.name || 'Student User'}</p>
            <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Student</p>
          </div>}
          {!sidebarCollapsed && <ChevronRight size={15} className={`ml-auto transition-transform ${profileOpen ? 'rotate-90' : ''}`} style={{ color: textMuted }} />}
          </button>
          {profileOpen && !sidebarCollapsed && (
            <button onClick={() => { navigate('profile'); setProfileOpen(false); }} className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ color: textMuted, backgroundColor: 'var(--card2)' }}>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
                style={{
                  color: isActive ? 'var(--accent)' : textMuted,
                  backgroundColor: isActive ? '#eef0f5' : 'transparent'
                }}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                    border: isActive ? 'none' : '1px solid var(--border)',
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
        <div className="p-5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 px-2">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            {!sidebarCollapsed && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>All systems online</span>}
          </div>
        </div>

        {/* Sidebar logout */}
        <div className="px-5 pb-5">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
            style={{ color: '#dc2626', borderColor: '#f3b9ba', backgroundColor: dark ? 'rgba(127, 29, 29, 0.2)' : '#fdf1f1' }}
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <LogOut size={15} />
            {!sidebarCollapsed && 'Logout'}
          </button>
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
