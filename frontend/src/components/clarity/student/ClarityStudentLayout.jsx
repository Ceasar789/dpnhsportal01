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
  BarChart3, BookOpen, CalendarCheck, ClipboardCheck, LayoutDashboard, LogOut, Megaphone, X,
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
import ClarityTopBar from '../ClarityTopBar';
import { PHONE_QUERY, PhoneBottomNav, PhoneMenuSheet } from '../phone/PhoneNav';
import { useHtmlClass } from '../useHtmlClass';
import { overviewSummary } from './overviewSummary';
import ClarityStudentProfileTab from './ClarityStudentProfileTab';
import ClarityStudentAttendanceTab from './ClarityStudentAttendanceTab';
import ClarityStudentAnnouncementsTab from './ClarityStudentAnnouncementsTab';
import ClarityStudentMaterialsTab from './ClarityStudentMaterialsTab';
import { studentMaterialsFlagEnabled } from './studentMaterials';
import '../../../styles/top-title.css';

// Routes shown with a Clarity page instead of the classic tab (the classic
// route stays in StudentDashboard and is what ?clarity=0 shows).
const CLARITY_PAGES = {
  '/student-dashboard/attendance': ClarityStudentAttendanceTab,
  '/student-dashboard/announcements': ClarityStudentAnnouncementsTab,
  '/student-dashboard/profile': ClarityStudentProfileTab,
  // 4e: only with VITE_STUDENT_LEARNING_MATERIALS_ENABLED=1 (needs autorun/sql/4e).
  ...(studentMaterialsFlagEnabled() ? { '/student-dashboard/materials': ClarityStudentMaterialsTab } : {}),
};

// Classic tabs shown in the final design's layout by scoped CSS only (S2b):
// the classic component and every read, filter and answer/submit flow are
// unchanged; its wrapper just gets one class.
const RESTYLED_CLASSIC = {
  '/student-dashboard/tasks': 'x-stk',
};

// The same items, paths and order as the classic StudentLayout.
// SHELL: the phone tab bar (the final design's four, then Menu); the rest
// of STUDENT_NAV and Profile & password are in the Menu sheet.
const PHONE_BAR = ['/student-dashboard', '/student-dashboard/tasks', '/student-dashboard/scores', '/student-dashboard/attendance'];

const STUDENT_NAV = [
  { path: '/student-dashboard', icon: LayoutDashboard, label: 'Overview' },
  { path: '/student-dashboard/tasks', icon: ClipboardCheck, label: 'Tasks' },
  { path: '/student-dashboard/scores', icon: BarChart3, label: 'Scores' },
  { path: '/student-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
  { path: '/student-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ...(studentMaterialsFlagEnabled() ? [{ path: '/student-dashboard/materials', icon: BookOpen, label: 'Learning Materials' }] : []),
];

const ClarityStudentLayout = ({ children }) => {
  useHtmlClass('theme-clarity');
  const { dark, toggleDark } = useTheme();
  const { logout, userData } = useAuth();
  const { requestProfileNavigation } = useProfileUnsavedChanges();
  const navigate = useNavigate();
  const location = useLocation();
  const ClarityPage = CLARITY_PAGES[location.pathname.replace(/\/+$/, '')];
  const restyled = RESTYLED_CLASSIC[location.pathname.replace(/\/+$/, '')];
  // V2a: the page name in the phone top bar (the longest matching nav path).
  const trimmedPath = location.pathname.replace(/\/+$/, '');
  const onProfile = trimmedPath === '/student-dashboard/profile';
  const pageTitle = onProfile ? 'Profile Settings' : STUDENT_NAV
    .filter(item => trimmedPath === item.path || trimmedPath.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.label || '';
  const photoUrl = useSignedPhotoUrl(userData?.profile?.photo_url);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  // U-S2: "Grade 8 · Rizal" as in the design, and the LRN on its own line
  // only when the student record has one (never a placeholder).
  const sectionName = graph && !graph.fatalError ? graph.enrolments?.[0]?.sections?.name?.trim() || null : null;
  const studentLine = [grade, sectionName].filter(Boolean).join(' · ') || 'Student';
  const lrn = graph && !graph.fatalError ? String(graph.studentRecord?.lrn ?? '').trim() || null : null;
  // The Tasks badge: the same pending count the Overview shows (overviewSummary),
  // hidden while loading, after a failed load (the summary is then blank), or at 0.
  const pendingCount = useMemo(() => {
    if (loading || !graph) return 0;
    // The badge is extra information: if the graph is ever incomplete, show
    // no badge rather than let the whole shell fail.
    try { return overviewSummary(graph, name).pendingCount; } catch { return 0; }
  }, [graph, loading, name]);
  // SHELL: on phones the bottom tab bar and the Menu sheet replace the drawer.
  const phone = useMediaQuery(PHONE_QUERY) && !desktop;
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const phoneMenuRef = useRef(null);
  const currentPath = STUDENT_NAV
    .filter(item => trimmedPath === item.path || trimmedPath.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path || '';
  const phoneItem = item => ({ key: item.path, label: item.label, icon: item.icon, href: item.path,
    current: !onProfile && currentPath === item.path, onSelect: () => navigate(item.path),
    badge: item.label === 'Tasks' ? pendingCount : 0, badgeText: 'pending' });
  const phoneBar = PHONE_BAR.map(path => phoneItem(STUDENT_NAV.find(item => item.path === path)));
  const phoneGroups = [{ heading: null, items: STUDENT_NAV.filter(item => !PHONE_BAR.includes(item.path)).map(phoneItem) }];
  const phoneMenuCurrent = onProfile || !PHONE_BAR.includes(currentPath);

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
      {/* G11b #20: the first stop for keyboard users, hidden until focused. */}
      <a href="#x-main" className="x-skip" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
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

        {/* Pinned to the bottom: the user card. U-S6: the card itself opens
            Profile Settings (photo, name and password); no separate item. */}
        <div style={{ marginTop: 'auto' }}>
        <div className="x-side-foot">
          <Link to="/student-dashboard/profile" className={`x-user${onProfile ? ' on' : ''}`} onClick={() => setSidebarOpen(false)}
            aria-current={onProfile ? 'page' : undefined}>
            <span className="x-ava" data-shared="avatar"><Avatar src={photoUrl} name={name} size={36} bg="transparent" color="currentColor" /></span>
            <span className="x-user-txt">
              <b>{name}</b>
              <span>{studentLine}</span>
              {lrn && <span className="x-user-lrn">LRN {lrn}</span>}
            </span>
            <span className="x-sr"> (Profile settings)</span>
          </Link>
          <button ref={logoutButtonRef} type="button" className="x-iconbtn" onClick={handleLogout} aria-label="Logout" title="Logout">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
        </div>
      </aside>

      <div className="x-main">
        <ClarityTopBar headerRef={headerRef} phone={phone} menuButtonRef={menuButtonRef}
          menuLabel="Open navigation menu" menuOpen={sidebarOpen} menuControls="student-sidebar" onOpenMenu={() => setSidebarOpen(true)}
          pageTitle={pageTitle} dark={dark} onToggleDark={toggleDark}
          bell={<span className="x-bell" data-shared="bell"><NotificationBell followLinks /></span>} />

        <main ref={mainRef} id="x-main" tabIndex={-1} className="x-content">
          {ClarityPage ? <ClarityPage /> : restyled ? <div className={restyled}>{children}</div> : children}
        </main>
      </div>

      {phone && (
        <>
          <PhoneBottomNav items={phoneBar} menuOpen={phoneMenuOpen} menuCurrent={phoneMenuCurrent}
            onMenu={() => setPhoneMenuOpen(true)} menuButtonRef={phoneMenuRef} sheetId="student-phone-menu" />
          <PhoneMenuSheet id="student-phone-menu" open={phoneMenuOpen} onClose={() => setPhoneMenuOpen(false)}
            groups={phoneGroups} returnFocusRef={phoneMenuRef} closeKey={location.pathname}
            profile={{ key: 'profile', label: name, sub: [studentLine, lrn && `LRN ${lrn}`].filter(Boolean).join(' · '), href: '/student-dashboard/profile',
              avatar: <Avatar src={photoUrl} name={name} size={40} bg="transparent" color="currentColor" />,
              current: onProfile, onSelect: () => navigate('/student-dashboard/profile') }}
            onSignOut={handleLogout} />
        </>
      )}

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
