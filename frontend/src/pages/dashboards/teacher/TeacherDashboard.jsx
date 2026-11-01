// ============================================
// FILE: src/pages/dashboards/teacher/TeacherDashboard.jsx
// SHELL: ThemeContext.Provider + TeacherLayout (sidebar, header) + <Routes>
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Routes, Route, Link, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useProfileUnsavedChanges } from '../../../context/ProfileUnsavedChangesContext';
import {
  Users, BookOpen, GraduationCap,
  CalendarCheck, Megaphone, Moon, Sun, LogOut, Menu,
  LayoutDashboard, ClipboardList, ChevronRight, ChevronLeft, Settings, X
} from 'lucide-react';
import { ThemeContext, useTheme } from './hooks';
import { useDashboardTheme, DashboardThemeStyles } from '../../../styles/dashboardTheme';
import PageTransition from '../../../components/PageTransition';
import Avatar from '../../../components/Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import NotificationBell from '../../../components/NotificationBell';
import { cycleTab, focusableWithin, lockScroll } from '../../../lib/focusTrap';
import { Modal, Btn } from './shared/ui';
import OverviewTab from './tabs/OverviewTab';
import StudentsTab from './tabs/StudentsTab';
import LessonPlansTab from './tabs/LessonPlansTab';
import WorksheetsTab from './tabs/WorksheetsTab';
import { restoreLocallySavedWorksheet } from './worksheets/generatedDraftModel';
import { saveAiWeeklyWorksheets, weeklyWorksheetSaveFlagEnabled } from './persistence/aiWeeklyWorksheetSaveClient';
import GradesTab from './tabs/GradesTab';
import EssayReviewLab from './worksheets/EssayReviewLab';
import AttendanceTab from './tabs/AttendanceTab';
import AnnouncementsTab from './tabs/AnnouncementsTab';
import ProfileTab from '../../profile/ProfileTab';
import './TeacherDashboard.css';

// ============================================
// TEACHER LAYOUT (sidebar, header, theme toggle)
// ============================================
const TeacherLayout = ({ children }) => {
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
        main.scrollTo?.(0, scrollPositionsRef.current.get(location.key));
        return;
      }
      main.scrollTo?.(0, 0);
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
    { path: '/teacher-dashboard/grades', icon: GraduationCap, label: 'Worksheet Scores' },
    { path: '/teacher-dashboard/attendance', icon: CalendarCheck, label: 'Attendance' },
    { path: '/teacher-dashboard/announcements', icon: Megaphone, label: 'Announcements' },
  ];

  const mainBg = 'var(--bg)';
  const borderColor = 'var(--border)';
  const textPrimary = 'var(--text)';
  const textMuted = 'var(--text-muted)';
  const sidebarBg = 'var(--sidebar-bg)';
  const brandBackground = '#003b7a';

  return (
    <div className="dashboard-shell teacher-dashboard-shell flex flex-col h-screen overflow-hidden" style={{ backgroundColor: mainBg }}>
      {/* ===== HEADER ===== */}
      <header ref={headerRef} className="teacher-header flex items-center gap-4 px-4 sm:px-5 flex-shrink-0 z-30" style={{ backgroundColor: brandBackground }}>
        <button ref={menuButtonRef} onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={sidebarOpen} aria-controls="teacher-sidebar" className="teacher-header-action lg:hidden rounded-full text-white/90 hover:bg-white/10 flex-shrink-0 flex items-center justify-center">
          <Menu size={20} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
          <img src="/EduScribeLogoIcon.png" alt="EduScribe" className="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-full flex-shrink-0" />
          <div className="hidden sm:block leading-tight">
            <h1 className="font-work font-extrabold text-2xl tracking-wide">
              <span style={{ color: 'var(--brand-gold)' }}>Edu</span><span style={{ color: 'var(--brand-cyan)' }}>Scribe</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="font-work text-sm text-white/85">Teacher Dashboard</p>
              {userData?.profile?.department && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold tracking-wide leading-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
                >
                  {userData.profile.department.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <button onClick={toggleDark} aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} className="teacher-header-action rounded-full flex items-center justify-center text-white/90 bg-white/10 hover:bg-white/20">
            {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <NotificationBell className="teacher-notification-bell" />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
        )}

        {/* ===== SIDEBAR ===== */}
        <aside
          id="teacher-sidebar"
          ref={sidebarRef}
          tabIndex={-1}
          role={sidebarOpen ? 'dialog' : undefined}
          aria-modal={sidebarOpen ? 'true' : undefined}
          aria-label={sidebarOpen ? 'Navigation' : undefined}
          className={`
            fixed lg:static inset-y-0 left-0 z-50 flex flex-col flex-shrink-0
            transform
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            ${sidebarOpen ? 'visible' : 'invisible lg:visible'}
            w-64 ${sidebarCollapsed ? 'lg:w-20' : ''}
          `}
          style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${borderColor}` }}
        >
          <button onClick={() => setSidebarOpen(false)} aria-label="Close navigation" className="teacher-drawer-close lg:hidden flex items-center gap-2 self-start mx-3 mt-3 px-3 rounded-lg text-sm font-semibold" style={{ color: textPrimary }}>
            <X size={16} aria-hidden="true" /> Close
          </button>
          <button
            onClick={() => { setSidebarCollapsed(c => !c); setProfileOpen(false); }}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            className="hidden lg:flex absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full items-center justify-center shadow-md z-10"
            style={{ backgroundColor: sidebarBg, border: `1px solid ${borderColor}`, color: textMuted }}
          >
            {sidebarCollapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronLeft size={13} aria-hidden="true" />}
          </button>

          <div className="p-5 border-b" style={{ borderColor }}>
            <button
              onClick={() => {
                if (sidebarCollapsed && !sidebarOpen) setSidebarCollapsed(false);
                setProfileOpen(open => !open);
              }}
              className={`w-full flex items-center gap-3 text-left ${sidebarCollapsed ? 'lg:justify-center' : ''}`}
              aria-expanded={profileOpen}
              aria-label="Toggle profile menu"
            >
            <Avatar
              src={photoUrl}
              name={userData?.name || 'Teacher'}
              size={36}
              bg="var(--brand-gold-bright)"
              color="#12069f"
            />
            <div className={`min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>{userData?.name || 'Teacher'}</p>
                <p className="text-[11px]" style={{ color: textMuted }}>Teacher</p>
            </div>
            <ChevronRight size={15} className={`ml-auto ${sidebarCollapsed ? 'lg:hidden' : ''} ${profileOpen ? 'rotate-90' : ''}`} style={{ color: textMuted }} />
            </button>
            {profileOpen && (
              <button onClick={() => { navigate('profile'); setProfileOpen(false); setSidebarOpen(false); }} className={`teacher-profile-link mt-3 w-full items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${sidebarCollapsed ? 'flex lg:hidden' : 'flex'}`}>
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
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                  className={`teacher-sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold mb-1 ${isActive ? 'teacher-sidebar-link-active' : ''} ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
                >
                  <span
                    className="teacher-sidebar-icon w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <Icon size={16} />
                  </span>
                  <span className={sidebarCollapsed ? 'lg:hidden' : ''}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t" style={{ borderColor }}>
            <button ref={logoutButtonRef} aria-label="Logout"
              onClick={handleLogout}
              className={`flex items-center gap-2 w-full min-h-11 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
              style={{ color: 'var(--red)', borderColor: 'var(--badge-red-border)', backgroundColor: 'var(--badge-red-bg)' }}
            >
              <LogOut size={16} />
              <span className={sidebarCollapsed ? 'lg:hidden' : ''}>Logout</span>
            </button>
          </div>
        </aside>

        <main ref={mainRef} onScroll={(event) => scrollPositionsRef.current.set(location.key, event.currentTarget.scrollTop)} className="flex-1 overflow-y-auto min-w-0" style={{ backgroundColor: mainBg }}>
          {location.pathname.endsWith('/profile') && <h1 className="sr-only">Profile Settings</h1>}
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
// MAIN TEACHER DASHBOARD — SINGLE DECLARATION
// ============================================
const TeacherDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isTeacher, userData } = useAuth();
  const { darkMode, toggleDarkMode } = useDashboardTheme();
  const [generatedDraft, setGeneratedDraft] = useState(null);
  const [weeklyCollections, setWeeklyCollections] = useState([]);
  const [weeklySaveStates, setWeeklySaveStates] = useState({});
  const weeklySaveStatesRef = useRef({});
  const weeklySnapshotsRef = useRef(new Map());
  const weeklyInFlightRef = useRef(new Set());
  const weeklyOwnerRef = useRef(userData?.uid);
  weeklyOwnerRef.current = userData?.uid;
  const [manualDrafts, setManualDrafts] = useState([]);
  const [localDistributions, setLocalDistributions] = useState([]);
  const previousTeacherId = useRef(userData?.uid);
  const previousPath = useRef(location.pathname);
  const recordWeeklySave = useCallback((id, value) => {
    weeklySaveStatesRef.current = { ...weeklySaveStatesRef.current, [id]: value };
    setWeeklySaveStates(weeklySaveStatesRef.current);
  }, []);
  const saveWeeklyCollection = useCallback(async (collection, retry = false) => {
    if (!weeklyWorksheetSaveFlagEnabled()) return;
    const id = collection.collectionId;
    const previous = weeklySaveStatesRef.current[id];
    if (weeklyInFlightRef.current.has(id) || ['saved', 'blocked'].includes(previous?.status)
      || (retry && !['failed', 'unknown'].includes(previous?.status))) return;
    const snapshot = previous?.status === 'unknown'
      ? weeklySnapshotsRef.current.get(id) : structuredClone(collection);
    if (!snapshot) return;
    weeklySnapshotsRef.current.set(id, snapshot);
    weeklyInFlightRef.current.add(id);
    const owner = userData?.uid;
    recordWeeklySave(id, { status: 'saving', code: null, message: '', receipt: null });
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL
        || `${window.location.protocol}//${window.location.hostname}:3001`;
      const result = await saveAiWeeklyWorksheets(apiBase, { requestId: id, collection: snapshot });
      if (weeklyOwnerRef.current !== owner) return;
      const blocked = ['idempotency_conflict', 'invalid_state'].includes(result.code);
      const editable = ['invalid_document', 'unsafe_markup', 'mcq_options_not_distinct',
        'payload_too_large', 'integration_blocked', 'inactive_teacher', 'not_authenticated',
        'source_plan_denied'].includes(result.code);
      const status = result.status === 'saved' ? 'saved' : blocked ? 'blocked'
        : result.status === 'unknown' || !editable ? 'unknown' : 'failed';
      recordWeeklySave(id, { status, code: result.code, message: result.message,
        receipt: status === 'saved' ? result.receipt : null });
    } finally {
      weeklyInFlightRef.current.delete(id);
    }
  }, [recordWeeklySave, userData?.uid]);
  const openGeneratedDraft = useCallback(draft => {
    if (draft?.kind === 'weekly-worksheet-collection') {
      setWeeklyCollections(current => current.some(item => item.collectionId === draft.collectionId)
        ? current : [...current, draft]);
      if (weeklyWorksheetSaveFlagEnabled()) void saveWeeklyCollection(draft);
      return;
    }
    setGeneratedDraft({ teacherId: userData?.uid, draft });
    setLocalDistributions([]);
  }, [saveWeeklyCollection, userData?.uid]);
  const updateGeneratedDraft = useCallback(update => {
    setGeneratedDraft(current => current?.teacherId === userData?.uid
      ? { ...current, draft: typeof update === 'function' ? update(current.draft) : update } : current);
  }, [userData?.uid]);
  const updateManualDraft = useCallback(draft => {
    setManualDrafts(current => {
      const previous = current.find(item => item.draftId === draft.draftId);
      return previous && JSON.stringify(previous) !== JSON.stringify(draft)
        ? current.map(item => item.draftId === draft.draftId ? draft : item) : current;
    });
  }, []);
  const discardGeneratedDraft = useCallback(() => { setGeneratedDraft(null); setLocalDistributions([]); }, []);
  const updateWeeklyCollection = useCallback((collectionId, update) => setWeeklyCollections(current => current.map(collection =>
    collection.collectionId === collectionId && !['saving', 'saved'].includes(weeklySaveStatesRef.current[collectionId]?.status)
      ? typeof update === 'function' ? update(collection) : update : collection)), []);
  const discardWeeklyCollection = useCallback(collectionId => setWeeklyCollections(current =>
    current.filter(collection => collection.collectionId !== collectionId)), []);

  useEffect(() => {
    if (previousTeacherId.current !== userData?.uid) {
      previousTeacherId.current = userData?.uid;
      setGeneratedDraft(null);
      setWeeklyCollections([]);
      weeklySaveStatesRef.current = {};
      weeklySnapshotsRef.current.clear();
      weeklyInFlightRef.current.clear();
      setWeeklySaveStates({});
      setManualDrafts([]);
      setLocalDistributions([]);
    }
  }, [userData?.uid]);

  useEffect(() => {
    if (previousPath.current.endsWith('/worksheets') && !location.pathname.endsWith('/worksheets')) {
      setGeneratedDraft(current => current?.draft?.saved
        ? { ...current, draft: restoreLocallySavedWorksheet(current.draft) }
        : current?.draft?.kind === 'weekly-worksheet-collection' ? current : null);
      setManualDrafts(current => current.filter(item => item.saved).map(restoreLocallySavedWorksheet));
    }
    previousPath.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!isTeacher()) {
      navigate('/', { replace: true });
    }
  }, [isTeacher, navigate]);

  return (
    <ThemeContext.Provider value={{ dark: darkMode, toggleDark: toggleDarkMode }}>
      <DashboardThemeStyles />
      <TeacherLayout>
        <PageTransition>
          <Routes>
            <Route path="/" element={<OverviewTab />} />
            <Route path="/students" element={<StudentsTab />} />
            <Route path="/lesson-plans" element={<LessonPlansTab onGeneratedDraft={openGeneratedDraft}
              weeklySaveStates={weeklySaveStates}
              generatedDraft={generatedDraft?.teacherId === userData?.uid ? generatedDraft.draft : null} />} />
            <Route path="/worksheets" element={<WorksheetsTab generatedDraft={generatedDraft?.teacherId === userData?.uid ? generatedDraft.draft : null}
              onGeneratedDraftChange={updateGeneratedDraft} onDiscardGeneratedDraft={discardGeneratedDraft}
              weeklyCollections={weeklyCollections.filter(collection => collection.teacherId === userData?.uid)}
               weeklySaveStates={weeklySaveStates} onRetryWeeklySave={saveWeeklyCollection}
              onWeeklyCollectionChange={updateWeeklyCollection} onDiscardWeeklyCollection={discardWeeklyCollection}
              manualDrafts={manualDrafts.filter(item => item.teacherId === userData?.uid)}
              onCreateManualDraft={draft => setManualDrafts(current => [...current, draft])}
              onManualDraftChange={updateManualDraft}
              onDiscardManualDraft={draftId => setManualDrafts(current => current.filter(item => item.draftId !== draftId))}
              localDistributions={localDistributions} onLocalDistribution={result => setLocalDistributions(current => [...current, result])}
              onClearLocalDistributions={() => setLocalDistributions([])} />} />
            <Route path="/grades" element={<GradesTab />} />
            {import.meta.env.DEV && <Route path="/essay-review-lab" element={<EssayReviewLab />} />}
            <Route path="/attendance" element={<AttendanceTab />} />
            <Route path="/announcements" element={<AnnouncementsTab />} />
            <Route path="/profile" element={<div className="teacher-profile"><ProfileTab teacherView /></div>} />
          </Routes>
        </PageTransition>
      </TeacherLayout>
    </ThemeContext.Provider>
  );
};

export default TeacherDashboard;
