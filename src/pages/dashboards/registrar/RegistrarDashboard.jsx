// ============================================
// FILE: src/pages/dashboards/registrar/RegistrarDashboard.jsx
// SHELL: ThemeStyles + RegistrarLayout (sidebar, header) + <Routes>
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import {
  LayoutDashboard, Users, ClipboardList, Calendar, FileText,
  Moon, Sun, LogOut, Menu, ChevronRight, School,
  BarChart3, Settings
} from 'lucide-react';
import { ThemeStyles } from './shared/ui';
import { useDashboardTheme } from '../../../styles/dashboardTheme';
import PageTransition from '../../../components/PageTransition';
import Avatar from '../../../components/Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import NotificationBell from '../../../components/NotificationBell';
import DashboardTab from './tabs/DashboardTab';
import OverviewTab from './tabs/OverviewTab';
import StudentsTab from './tabs/StudentsTab';
import PreEnrollmentTab from './tabs/PreEnrollmentTab';
import SchedulingTab from './tabs/SchedulingTab';
import DocumentsTab from './tabs/DocumentsTab';
import AnalyticsTab from './tabs/AnalyticsTab';
import ProfileTab from '../../profile/ProfileTab';
import FlippingLogo from '../../../components/FlippingLogo';

// ============================================
// LAYOUT COMPONENT
// ============================================
const RegistrarLayout = ({ children, darkMode, setDarkMode }) => {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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

  return (
    <div className="dashboard-shell flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col transform transition-all duration-300 ease-in-out shadow-lg lg:shadow-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}`}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}>

        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full items-center justify-center shadow-md z-10"
          style={{ backgroundColor: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronRight size={13} className="rotate-180" />}
        </button>

        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setProfileOpen(open => !open)}
            className={`w-full flex items-center gap-3 text-left ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
            aria-expanded={profileOpen}
            aria-label="Toggle profile menu"
          >
          <Avatar
            src={userData?.profile?.photo_url}
            name={userData?.name || 'Registrar'}
            size={36}
            bg="#FFC542"
            color="#12069f"
          />
          {!sidebarCollapsed && <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{userData?.name || 'Registrar'}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Registrar</p>
          </div>}
          {!sidebarCollapsed && <ChevronRight size={15} className={`ml-auto transition-transform ${profileOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />}
          </button>
          {profileOpen && !sidebarCollapsed && (
            <button onClick={() => { navigate('profile'); setProfileOpen(false); }} className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg)' }}>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
                style={{
                  backgroundColor: active ? '#eef0f5' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: active ? '#ffffff' : 'transparent',
                    border: active ? 'none' : '1px solid var(--border)',
                    boxShadow: active ? '0 2px 6px rgba(25,8,223,.18)' : 'none',
                  }}>
                  <Icon size={16} />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 px-2">
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 animate-pulse" />
            {!sidebarCollapsed && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>All systems online</span>}
          </div>
          {!sidebarCollapsed && <div className="mt-3 px-2">
            <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              Academic Year 2025–2026
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              Semester: 2nd Semester
            </p>
          </div>}
        </div>
        <div className="px-5 pb-5">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
            style={{ color: '#dc2626', borderColor: '#f3b9ba', backgroundColor: 'var(--sidebar-bg)' }}
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <LogOut size={15} />
            {!sidebarCollapsed && 'Logout'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30"
          style={{ backgroundColor: '#003b7a' }}>
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-full text-white/90 hover:bg-white/10 transition-colors flex-shrink-0"><Menu size={20} /></button>
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
            <FlippingLogo className="w-12 h-12 sm:w-16 sm:h-16" />
            <div className="hidden sm:block leading-tight">
              <h1 className="font-work font-bold text-2xl tracking-tight leading-none"><span style={{ color: '#FEB300' }}>Edu</span><span style={{ color: '#00D4FF' }}>Scribe</span></h1>
              <p className="font-work text-sm mt-0.5 text-white/85">Registrar Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <NotificationBell />

            <button onClick={() => setDarkMode(!darkMode)} className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <Avatar
              src={photoUrl}
              name={userData?.name || 'Registrar'}
              size={36}
              bg="#FFC542"
              color="#12069f"
            />

          </div>
        </header>

        <main className="flex-1 overflow-y-auto" style={{ backgroundColor: 'var(--bg)' }}>
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
  const { darkMode, setDarkMode } = useDashboardTheme();

  useEffect(() => {
    if (!isRegistrar()) navigate('/', { replace: true });
  }, [isRegistrar, navigate]);

  return (
    <>
      <ThemeStyles />
      <RegistrarLayout darkMode={darkMode} setDarkMode={setDarkMode}>
        <PageTransition>
          <Routes>
            <Route path="/" element={<DashboardTab />} />
            <Route path="/overview" element={<OverviewTab />} />
            <Route path="/students" element={<StudentsTab />} />
            <Route path="/pre-enrollment" element={<PreEnrollmentTab />} />
            <Route path="/scheduling" element={<SchedulingTab />} />
            <Route path="/documents" element={<DocumentsTab />} />
            <Route path="/analytics" element={<AnalyticsTab />} />
            <Route path="/profile" element={<ProfileTab />} />
          </Routes>
        </PageTransition>
      </RegistrarLayout>
    </>
  );
};

export default RegistrarDashboard;
