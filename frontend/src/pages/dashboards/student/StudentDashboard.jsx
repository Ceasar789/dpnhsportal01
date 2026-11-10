// ============================================
// FILE: src/pages/dashboards/student/StudentDashboard.jsx
// SHELL: ThemeContext.Provider + StudentLayout (sidebar, header) + <Routes>
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useProfileUnsavedChanges } from '../../../context/ProfileUnsavedChangesContext';
import {
  LayoutDashboard, CalendarCheck, Megaphone,
  Moon, Sun, LogOut, Menu, ChevronRight, Settings, ClipboardCheck, X, BarChart3
} from 'lucide-react';
import { ThemeContext, useTheme } from './hooks';
import { ThemeContext as TeacherThemeContext } from '../teacher/hooks';
import { Modal, Btn } from '../teacher/shared/ui';
import { useDashboardTheme, DashboardThemeStyles } from '../../../styles/dashboardTheme';
import { cycleTab, focusableWithin, lockScroll } from '../../../lib/focusTrap';
import PageTransition from '../../../components/PageTransition';
import Avatar from '../../../components/Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import NotificationBell from '../../../components/NotificationBell';
import OverviewTab from './tabs/OverviewTab';
import StudentTasksTab from './tabs/TasksTab';
import AttendanceTab from './tabs/AttendanceTab';
import ScoresTab from './tabs/ScoresTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';
import ProfileTab from '../../profile/ProfileTab';
import FlippingLogo from '../../../components/FlippingLogo';
import { StudentDataProvider } from './StudentDataContext';
import './StudentDashboard.css';

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

  const theme = { dark: darkMode, toggleDark: toggleDarkMode };
  return (
    <ThemeContext.Provider value={theme}>
      {/* The teacher theme is provided once here so the shared teacher
          components (Btn, Card, Modal, Toast) follow the student's dark mode. */}
      <TeacherThemeContext.Provider value={theme}>
        <DashboardThemeStyles />
        {/* Outside <Routes> on purpose: the provider must survive the student
            moving between Overview and Tasks, which is exactly the navigation
            that used to re-issue nine queries. */}
        <StudentDataProvider>
          <StudentLayout>
            <PageTransition>
              <Routes>
                <Route path="/" element={<OverviewTab />} />
                <Route path="/tasks" element={<StudentTasksTab />} />
                <Route path="/scores" element={<ScoresTab />} />
                <Route path="/attendance" element={<AttendanceTab />} />
                <Route path="/announcements" element={<AnnouncementsTab />} />
                <Route path="/profile" element={<ProfileTab />} />
              </Routes>
            </PageTransition>
          </StudentLayout>
        </StudentDataProvider>
      </TeacherThemeContext.Provider>
    </ThemeContext.Provider>
  );
};

// ============================================
// STUDENT LAYOUT (sidebar, header, theme) — same drawer and logout pattern
// as the teacher shell (TeacherDashboard.jsx).
// ============================================
const StudentLayout = ({ children }) => {
  const { dark, toggleDark } = useTheme();
  const { logout, userData } = useAuth();
  const { requestProfileNavigation } = useProfileUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const logoutInFlightRef = useRef(false);
  const logoutFromDrawerRef = useRef(false);
  const logoutButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const menuButtonRef = useRef(null);
  const headerRef = useRef(null);
  const mainRef = useRef(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event) => { if (event.matches) setSidebarOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  // Open drawer: focus stays inside, the page behind is inert and does not
  // scroll, Escape closes, and focus returns to the menu button.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const opener = menuButtonRef.current;
    const header = headerRef.current;
    const main = mainRef.current;
    const unlock = lockScroll();
    const headerWasInert = header?.inert;
    const mainWasInert = main?.inert;
    if (header) header.inert = true;
    if (main) main.inert = true;
    (focusableWithin(sidebarRef.current)[0] ?? sidebarRef.current)?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      cycleTab(sidebarRef.current, event);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (header) header.inert = Boolean(headerWasInert);
      if (main) main.inert = Boolean(mainWasInert);
      unlock();
      if (opener && document.contains(opener) && opener.offsetParent !== null) opener.focus();
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    logoutFromDrawerRef.current = sidebarOpen;
    if (sidebarOpen) setSidebarOpen(false);
    requestProfileNavigation(() => {
      setLogoutError('');
      setLogoutConfirmOpen(true);
    });
  };

  const closeLogoutConfirmation = () => {
    if (logoutInFlightRef.current) return;
    setLogoutConfirmOpen(false);
    if (logoutFromDrawerRef.current) setSidebarOpen(true);
    window.requestAnimationFrame(() => logoutButtonRef.current?.focus({ preventScroll: true }));
  };

  const confirmLogout = async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    setLogoutPending(true);
    setLogoutError('');
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Student logout failed:', error);
      setLogoutError('Could not log out. Please try again.');
      setLogoutPending(false);
      logoutInFlightRef.current = false;
    }
  };

  const navItems = [
    { path: '/student-dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/student-dashboard/tasks', icon: ClipboardCheck, label: 'Tasks' },
    { path: '/student-dashboard/scores', icon: BarChart3, label: 'Scores' },
    { path: '/student-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
    { path: '/student-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ];

  const mainBg = 'var(--bg)';
  const textMuted = 'var(--text-muted)';

  return (
    <div className="dashboard-shell student-dashboard-shell flex flex-col h-viewport overflow-hidden" style={{ backgroundColor: mainBg }}>
      {/* TOP HEADER */}
      <header
        ref={headerRef}
        className="flex items-center gap-4 px-4 sm:px-5 py-3 flex-shrink-0 shadow-sm z-30"
        style={{ backgroundColor: '#003b7a' }}
      >
        <button ref={menuButtonRef} onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu"
          aria-expanded={sidebarOpen} aria-controls="student-sidebar"
          className="student-header-action lg:hidden rounded-full text-white/90 hover:bg-white/10 flex-shrink-0 flex items-center justify-center">
          <Menu size={20} aria-hidden="true" />
        </button>
        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <FlippingLogo className="w-12 h-12 sm:w-16 sm:h-16" />
          <div className="hidden sm:block leading-tight">
            <h1 className="font-work font-bold text-2xl tracking-tight leading-none"><span style={{ color: 'var(--brand-gold)' }}>Edu</span><span style={{ color: 'var(--brand-cyan)' }}>Scribe</span></h1>
            <p className="font-work text-sm mt-0.5 text-white/85">Student Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <NotificationBell followLinks />

          <button
            onClick={toggleDark}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Avatar
            src={photoUrl}
            name={userData?.name || 'Student'}
            size={36}
            bg="var(--brand-gold-bright)"
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
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR — Theme-aware */}
      <aside
        id="student-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? 'true' : undefined}
        aria-label={sidebarOpen ? 'Navigation' : undefined}
        className={`
          fixed lg:static inset-y-0 left-0 z-50 flex flex-col
          flex-shrink-0 transform transition-all duration-300 ease-in-out shadow-sm
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarOpen ? 'visible' : 'invisible lg:visible'}
          ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}
        `}
        style={{ backgroundColor: 'var(--sidebar-bg)' }}
      >
        <button onClick={() => setSidebarOpen(false)} aria-label="Close navigation"
          className="student-drawer-close lg:hidden flex items-center gap-2 self-start mx-3 mt-3 px-3 rounded-lg text-sm font-semibold"
          style={{ color: 'var(--text)' }}>
          <X size={16} aria-hidden="true" /> Close
        </button>
        <button
          onClick={() => setSidebarCollapsed(c => !c)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          className="hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full items-center justify-center shadow-md z-10"
          style={{ backgroundColor: 'var(--sidebar-bg)', border: '1px solid var(--border)', color: textMuted }}
        >
          {sidebarCollapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronRight size={13} className="rotate-180" aria-hidden="true" />}
        </button>
        {/* Role profile */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setProfileOpen(open => !open)}
            className={`w-full flex items-center gap-3 text-left max-md:min-h-10 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
            aria-expanded={profileOpen}
            aria-label="Toggle profile menu"
          >
          <Avatar
            src={photoUrl}
            name={userData?.name || 'Student User'}
            size={36}
            bg="var(--brand-gold-bright)"
            color="#12069f"
          />
          {!sidebarCollapsed && <div className="min-w-0">
            <p className="font-bold text-sm leading-tight [overflow-wrap:anywhere]" style={{ color: 'var(--text)' }}>{userData?.name || 'Student User'}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Student</p>
          </div>}
          {!sidebarCollapsed && <ChevronRight size={15} className={`ml-auto transition-transform ${profileOpen ? 'rotate-90' : ''}`} style={{ color: textMuted }} />}
          </button>
          {profileOpen && !sidebarCollapsed && (
            <button onClick={() => { navigate('profile'); setProfileOpen(false); setSidebarOpen(false); }} className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ color: textMuted, backgroundColor: 'var(--card2)' }}>
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
                aria-current={isActive ? 'page' : undefined}
                aria-label={sidebarCollapsed ? item.label : undefined}
                className={`student-sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${isActive ? 'student-sidebar-link-active' : ''} ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
              >
                <span className="student-sidebar-icon w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={16} aria-hidden="true" />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar logout: the footer keeps its divider and even padding. */}
        <div className="p-5 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            ref={logoutButtonRef}
            onClick={handleLogout}
            className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
            style={{ color: 'var(--red)', borderColor: 'var(--badge-red-border)', backgroundColor: 'var(--badge-red-bg)' }}
            aria-label="Logout"
            title={sidebarCollapsed ? 'Logout' : undefined}
          >
            <LogOut size={15} aria-hidden="true" />
            {!sidebarCollapsed && 'Logout'}
          </button>
        </div>
      </aside>

        {/* CONTENT */}
        <main ref={mainRef} className="flex-1 overflow-y-auto min-w-0" style={{ backgroundColor: mainBg }}>
          {children}
        </main>
      </div>
      {logoutConfirmOpen && (
        <Modal title="Log out of EduScribe?"
          description="Are you sure you want to log out of your account?"
          onClose={closeLogoutConfirmation} dismissible={!logoutPending} closeDisabled={logoutPending}>
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            Are you sure you want to log out of your account?
          </p>
          {logoutError && <p role="alert" className="text-sm mb-4" style={{ color: 'var(--red)' }}>{logoutError}</p>}
          {logoutPending && <p role="status" className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Logging out…</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Btn variant="outline" className="min-h-11" onClick={closeLogoutConfirmation} disabled={logoutPending}>Cancel</Btn>
            <Btn variant="danger" className="min-h-11" onClick={confirmLogout} busy={logoutPending}>
              {logoutPending ? 'Logging out…' : 'Log out'}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============================================
// SHARED COMPONENTS (Theme-aware from old — UNCHANGED)
// ============================================

export default StudentDashboard;
