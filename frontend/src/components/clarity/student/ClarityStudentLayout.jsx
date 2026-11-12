// ============================================
// FILE: src/components/clarity/student/ClarityStudentLayout.jsx
// The Clarity Student shell, shown only when the Clarity flag is on. It
// keeps every behaviour of the classic StudentLayout (StudentDashboard.jsx):
// the same nav items, paths and order; aria-current on the active link; the
// drawer below 1024px with scrim, Escape, focus trap, inert header and main,
// and focus back on the menu button; the notification bell; the theme
// toggle (same names, same useDashboardTheme via the student ThemeContext);
// the profile menu; Log out with the same confirmation and the same logout.
// Its own elements use only Clarity classes (x-*) and --cl-* tokens. The tab
// content is the classic tabs, unchanged, rendered as children.
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarCheck, ClipboardCheck, LayoutDashboard, LogOut, Megaphone, Menu, Moon, Settings, Sun, X,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useProfileUnsavedChanges } from '../../../context/ProfileUnsavedChangesContext';
import { useTheme } from '../../../pages/dashboards/student/hooks';
import { cycleTab, focusableWithin, lockScroll } from '../../../lib/focusTrap';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { normalizeGradeLevel } from '../../../lib/academicRules';
import Avatar from '../../Avatar';
import NotificationBell from '../../NotificationBell';
import ClarityModal from '../ui/ClarityModal';
import { useHtmlClass } from '../useHtmlClass';
import { overviewSummary } from './overviewSummary';

// The same items, paths and order as the classic StudentLayout.
const STUDENT_NAV = [
  { path: '/student-dashboard', icon: LayoutDashboard, label: 'Overview' },
  { path: '/student-dashboard/tasks', icon: ClipboardCheck, label: 'Tasks' },
  { path: '/student-dashboard/scores', icon: BarChart3, label: 'Scores' },
  { path: '/student-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
  { path: '/student-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
];

const ClarityStudentLayout = ({ children, onClassicView }) => {
  useHtmlClass('theme-clarity');
  const { dark, toggleDark } = useTheme();
  const { logout, userData } = useAuth();
  const { requestProfileNavigation } = useProfileUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const name = userData?.name || 'Student User';
  // The brand subtitle shows the real grade from the enrolment already loaded
  // by StudentDataProvider (sections.grade_level, read the same way as the
  // Overview). No usable grade, or a failed load: the old text stays.
  const { graph, loading } = useStudentData();
  const grade = graph && !graph.fatalError ? normalizeGradeLevel(graph.enrolments?.[0]?.sections?.grade_level) : null;
  // The footer card's second line: grade and section from the same loaded
  // enrolment, only the parts that exist; "Student" when neither does.
  const sectionName = graph && !graph.fatalError ? graph.enrolments?.[0]?.sections?.name?.trim() || null : null;
  const studentLine = [grade, sectionName].filter(Boolean).join(' – ') || 'Student';
  // The Tasks badge: the same pending count the Overview shows (overviewSummary),
  // hidden while loading, after a failed load (the summary is then blank), or at 0.
  const pendingCount = useMemo(() => {
    if (loading || !graph) return 0;
    // The badge is extra information: if the graph is ever incomplete, show
    // no badge rather than let the whole shell fail.
    try { return overviewSummary(graph, name).pendingCount; } catch { return 0; }
  }, [graph, loading, name]);

  // Reaching the desktop width closes the drawer, as in the classic shell.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event) => { if (event.matches) setSidebarOpen(false); };
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
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
      if (opener && document.contains(opener)) opener.focus();
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

  // Below 1024px a closed drawer is off-screen; hide it from tab and readers.
  const drawerHidden = !desktop && !sidebarOpen;

  return (
    <div className="x-app">
      {sidebarOpen && <div className="x-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <aside
        id="student-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? 'true' : undefined}
        aria-label={sidebarOpen ? 'Navigation' : undefined}
        className={`x-side${sidebarOpen ? ' open' : ''}`}
        style={drawerHidden ? { visibility: 'hidden' } : undefined}
      >
        <button type="button" className="x-btn gh x-menubtn" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
          <X size={16} aria-hidden="true" /> Close
        </button>

        <div className="x-brand">
          <img src="/EduScribeLogoIcon.png" alt="EduScribe" />
          <div>
            <b>EduScribe</b>
            <span>{grade ? `Student · ${grade}` : 'Student Dashboard'}</span>
          </div>
        </div>

        <nav aria-label="Student">
          {STUDENT_NAV.map((item) => {
            const isActive = location.pathname === item.path || location.pathname === `${item.path}/`;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? 'page' : undefined} className={`x-nav${isActive ? ' on' : ''}`}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {item.label === 'Tasks' && pendingCount > 0 && (
                  <span className="cnt">{pendingCount}<span className="x-sr"> pending</span></span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Pinned to the bottom: the profile link (when open) above the user card. */}
        <div style={{ marginTop: 'auto' }}>
        {profileOpen && (
          <button type="button" className="x-nav" onClick={() => { navigate('profile'); setProfileOpen(false); setSidebarOpen(false); }}>
            <Settings size={16} aria-hidden="true" /> Profile Settings
          </button>
        )}
        <div className="x-side-foot">
          <button type="button" className="x-user" onClick={() => setProfileOpen(open => !open)}
            aria-expanded={profileOpen} aria-label="Toggle profile menu">
            <span className="x-ava" data-shared="avatar"><Avatar src={photoUrl} name={name} size={36} bg="transparent" color="currentColor" /></span>
            <span className="x-user-txt">
              <b>{name}</b>
              <span>{studentLine}</span>
            </span>
          </button>
          <button ref={logoutButtonRef} type="button" className="x-iconbtn" onClick={handleLogout} aria-label="Logout" title="Logout">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
        </div>
      </aside>

      <div className="x-main">
        <header ref={headerRef} className="x-top">
          <button ref={menuButtonRef} type="button" className="x-iconbtn x-menubtn" onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="student-sidebar">
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="x-sp" />
          {/* The shared bell keeps its real unread count; .x-bell restyles its
              button as a plain icon (scoped CSS, NotificationBell unchanged). */}
          <span className="x-bell" data-shared="bell">
            <NotificationBell followLinks />
          </span>
          <button type="button" className="x-iconbtn" onClick={toggleDark}
            aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="x-btn gh" onClick={onClassicView}>Classic view</button>
        </header>

        <main ref={mainRef} className="x-content">
          {children}
        </main>
      </div>

      {logoutConfirmOpen && (
        <ClarityModal
          title="Log out of EduScribe?"
          description="Are you sure you want to log out of your account?"
          onClose={closeLogoutConfirmation}
          dismissible={!logoutPending}
          closeDisabled={logoutPending}
          footer={(
            <>
              <button type="button" className="x-btn" onClick={closeLogoutConfirmation} disabled={logoutPending}>Cancel</button>
              <button type="button" className="x-btn dng" onClick={confirmLogout} disabled={logoutPending} aria-busy={logoutPending || undefined}>
                {logoutPending ? 'Logging out…' : 'Log out'}
              </button>
            </>
          )}
        >
          {logoutError && <p role="alert" className="x-cs" style={{ color: 'var(--cl-er)' }}>{logoutError}</p>}
          {logoutPending && <p role="status" className="x-cs">Logging out…</p>}
        </ClarityModal>
      )}
    </div>
  );
};

export default ClarityStudentLayout;
