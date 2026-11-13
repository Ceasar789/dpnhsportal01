// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherLayout.jsx
// The Clarity Teacher shell, shown only when the Clarity flag is on. It keeps
// every behaviour of the classic TeacherLayout (TeacherDashboard.jsx): the
// same seven links, paths, labels and order (grouped as in the final design,
// nothing renamed or dropped); aria-current on the active link; the desktop
// collapse button; the drawer below 1024px with scrim, Escape, focus trap,
// inert header and main, and focus back on the menu button; focus on the
// destination heading after a route change, and the scroll position kept per
// history entry; the notification bell; the theme toggle (same names, same
// ThemeContext); the profile menu; Log out with the same confirmation and the
// same logout, through the Profile unsaved-changes guard.
//
// The tab content is the classic tabs, unchanged, rendered as children inside
// a wrapper that carries the two classic shell class names, so every classic
// rule the tabs rely on (TeacherDashboard.css, the dashboard theme styles,
// the shared dashboard transitions) applies exactly as before. No CSS copy.
//
// TEMPORARY word-for-word copy from pages/dashboards/teacher/TeacherDashboard.jsx
// :44-165 (TeacherLayout's state, effects, handlers and nav items), source-
// parity tested in ClarityTeacherShellSources.test.js; after the defense the
// classic layout and this one should share it. Declared substitutions: in
// Clarity the page scrolls, not <main>, so the two scroll calls use window.
// ============================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation, useNavigationType } from 'react-router-dom';
import {
  Users, BookOpen, GraduationCap,
  CalendarCheck, Megaphone, Moon, Sun, LogOut, Menu,
  LayoutDashboard, ClipboardList, ChevronRight, ChevronLeft, Settings, X, FolderOpen,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useProfileUnsavedChanges } from '../../../context/ProfileUnsavedChangesContext';
import { useTheme } from '../../../pages/dashboards/teacher/hooks';
import { cycleTab, focusableWithin, lockScroll } from '../../../lib/focusTrap';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import Avatar from '../../Avatar';
import NotificationBell from '../../NotificationBell';
import ClarityModal from '../ui/ClarityModal';
import { useHtmlClass } from '../useHtmlClass';
import ClarityTeacherOverviewTab from './ClarityTeacherOverviewTab';
import ClarityTeacherStudentsTab from './ClarityTeacherStudentsTab';
import ClarityTeacherAnnouncementsTab from './ClarityTeacherAnnouncementsTab';
import ClarityTeacherGradingTab from './ClarityTeacherGradingTab';
import ClarityTeacherAttendanceTab from './ClarityTeacherAttendanceTab';
import ClarityTeacherMaterialsTab from './ClarityTeacherMaterialsTab';
import '../../../styles/phone-tap.css';

// The pages already rebuilt in Clarity; every other route keeps its classic tab.
const CLARITY_TABS = {
  '/teacher-dashboard': ClarityTeacherOverviewTab,
  '/teacher-dashboard/students': ClarityTeacherStudentsTab,
  '/teacher-dashboard/learning-materials': ClarityTeacherMaterialsTab,
  '/teacher-dashboard/grades': ClarityTeacherGradingTab,
  '/teacher-dashboard/attendance': ClarityTeacherAttendanceTab,
  '/teacher-dashboard/announcements': ClarityTeacherAnnouncementsTab,
};

// Classic tabs shown in the final design's layout by scoped CSS only (G4):
// the classic component, its props and every editor, dialog and save path
// are unchanged; the wrapper just gets one more class.
const RESTYLED_CLASSIC = {
  '/teacher-dashboard/lesson-plans': 'x-tlp',
  '/teacher-dashboard/worksheets': 'x-tws',
};

// The final design's groups, by path. Every classic item appears exactly
// once, in the classic order (tested); Learning Materials is Clarity-only (M2).
const GROUPS = [
  [null, ['/teacher-dashboard', '/teacher-dashboard/students']],
  ['Teaching', ['/teacher-dashboard/lesson-plans', '/teacher-dashboard/worksheets', '/teacher-dashboard/learning-materials',
    '/teacher-dashboard/grades', '/teacher-dashboard/attendance']],
  ['School', ['/teacher-dashboard/announcements']],
];

const ClarityTeacherLayout = ({ children }) => {
  useHtmlClass('theme-clarity');
  const desktop = useMediaQuery('(min-width: 1024px)');
  // ---- TEMPORARY copy (TeacherDashboard.jsx:44-165) ----
  const { dark, toggleDark } = useTheme();
  const { logout, userData } = useAuth();
  const { requestProfileNavigation } = useProfileUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
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
  const previousPathRef = useRef(location.pathname);
  const scrollPositionsRef = useRef(new Map());

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = (event) => { if (event.matches) setSidebarOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

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

  useEffect(() => {
    if (previousPathRef.current === location.pathname) return undefined;
    previousPathRef.current = location.pathname;
    const frame = window.requestAnimationFrame(() => {
      const main = mainRef.current;
      if (!main) return;
      if (navigationType === 'POP' && scrollPositionsRef.current.has(location.key)) {
        window.scrollTo?.(0, scrollPositionsRef.current.get(location.key));
        return;
      }
      window.scrollTo?.(0, 0);
      const heading = main.querySelector('h1, h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.key, location.pathname, navigationType]);

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
      console.error('Teacher logout failed:', error);
      setLogoutError('Could not log out. Please try again.');
      setLogoutPending(false);
      logoutInFlightRef.current = false;
    }
  };

  const navItems = [
    { path: '/teacher-dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/teacher-dashboard/students', icon: Users, label: 'Students' },
    { path: '/teacher-dashboard/lesson-plans', icon: BookOpen, label: 'Lesson Plans' },
    { path: '/teacher-dashboard/worksheets', icon: ClipboardList, label: 'Worksheets' },
    { path: '/teacher-dashboard/grades', icon: GraduationCap, label: 'Grading' },
    { path: '/teacher-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
    { path: '/teacher-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ];
  // ---- end of the copy ----

  // M2: a Clarity-only page (no classic route or nav item), so it is kept
  // out of the copy above; GROUPS places it between Worksheets and Grading.
  const clarityOnlyNavItems = [
    { path: '/teacher-dashboard/learning-materials', icon: FolderOpen, label: 'Learning Materials' },
  ];

  // The classic shell records each entry's scroll from <main>'s scroll event;
  // here the page scrolls, so the same map is filled from the window.
  useEffect(() => {
    const onScroll = () => scrollPositionsRef.current.set(location.key, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.key]);

  const name = userData?.name || 'Teacher';
  // The brand line: the real department when the profile has one (the classic
  // header shows it as a badge), else the classic "Teacher Dashboard".
  const department = userData?.profile?.department?.trim();
  const collapsed = desktop && sidebarCollapsed;
  // Below 1024px a closed drawer is off-screen; hide it from tab and readers.
  const drawerHidden = !desktop && !sidebarOpen;
  const byPath = new Map([...navItems, ...clarityOnlyNavItems].map(item => [item.path, item]));
  const ClarityTab = CLARITY_TABS[location.pathname.replace(/\/+$/, '')];
  const restyled = RESTYLED_CLASSIC[location.pathname.replace(/\/+$/, '')];

  return (
    <div className="x-app x-tch">
      {sidebarOpen && <div className="x-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <aside
        id="teacher-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? 'true' : undefined}
        aria-label={sidebarOpen ? 'Navigation' : undefined}
        className={`x-side${sidebarOpen ? ' open' : ''}${collapsed ? ' x-tch-mini' : ''}`}
        style={drawerHidden ? { visibility: 'hidden' } : undefined}
      >
        <button type="button" className="x-btn gh x-menubtn" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
          <X size={16} aria-hidden="true" /> Close
        </button>

        <div className="x-brand">
          <img src="/EduScribeLogoIcon.png" alt="EduScribe" width="36" height="36" />
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <b>EduScribe</b>
              <span>{department ? `Teacher · ${department}` : 'Teacher Dashboard'}</span>
            </div>
          )}
        </div>

        {desktop && (
          <button type="button" className="x-nav"
            onClick={() => { setSidebarCollapsed(c => !c); setProfileOpen(false); }}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}>
            {sidebarCollapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
          </button>
        )}

        <nav aria-label="Teacher">
          {GROUPS.map(([heading, paths]) => (
            <div key={heading || 'top'}>
              {heading && !collapsed && <p className="x-grp">{heading}</p>}
              {paths.map((path) => {
                const item = byPath.get(path);
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`x-nav${isActive ? ' on' : ''}`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Pinned to the bottom: the profile link (when open) above the user card. */}
        <div style={{ marginTop: 'auto' }}>
          {profileOpen && !collapsed && (
            <button type="button" className="x-nav" onClick={() => { navigate('profile'); setProfileOpen(false); setSidebarOpen(false); }}>
              <Settings size={16} aria-hidden="true" /> <span>Profile Settings</span>
            </button>
          )}
          <div className="x-side-foot" style={collapsed ? { flexDirection: 'column' } : undefined}>
            <button type="button" className="x-user"
              onClick={() => {
                if (sidebarCollapsed && !sidebarOpen) setSidebarCollapsed(false);
                setProfileOpen(open => !open);
              }}
              aria-expanded={profileOpen} aria-label="Toggle profile menu">
              <span className="x-ava"><Avatar src={photoUrl} name={name} size={36} bg="transparent" color="currentColor" /></span>
              {!collapsed && (
                <span className="x-user-txt">
                  <b>{name}</b>
                  <span>Teacher</span>
                </span>
              )}
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
            aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="teacher-sidebar">
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="x-sp" />
          {/* The shared bell keeps its real unread count; .x-bell restyles its
              button as a plain icon (scoped CSS, NotificationBell unchanged). */}
          <span className="x-bell">
            <NotificationBell className="teacher-notification-bell" />
          </span>
          <button type="button" className="x-iconbtn" onClick={toggleDark}
            aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
        </header>

        <main ref={mainRef} className="x-content">
          {location.pathname.endsWith('/profile') && <h1 className="sr-only">Profile Settings</h1>}
          {/* The classic shell's class names, so the classic tabs keep every
              rule they rely on. */}
          {ClarityTab ? <ClarityTab /> : (
            <div className={`dashboard-shell teacher-dashboard-shell x-tch-classic${restyled ? ` ${restyled}` : ''}`}>
              {children}
            </div>
          )}
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

export default ClarityTeacherLayout;
