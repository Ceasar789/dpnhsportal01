// ============================================
// FILE: src/components/clarity/admin/ClarityAdminLayout.jsx
// The Admin shell in Clarity (only with the Clarity flag on). It hosts the
// SAME classic tab components, unchanged, inside the same AdminProvider and
// data router, so the tabs keep their data, writes and guards. The classic
// tabs still need the classic admin CSS, so ClassicAdminStyles is mounted
// here too (a mixed look is expected until each tab gets a Clarity version).
//
// Behaviour comes from useAdminShellBehavior, a temporary copy of the
// classic shell's. The classic style text styles every bare nav element, so this
// shell uses a div with role="navigation" for its menu, never a nav element.
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import {
  Sun, Moon, LogOut, LayoutDashboard, Users, Newspaper, Calendar, FileText, Settings,
  ChevronLeft, ChevronRight, Menu, X, BookMarked, GraduationCap, Columns, Clock,
} from 'lucide-react';
import NotificationBell from '../../NotificationBell';
import Avatar from '../../Avatar';
import ClarityAdminOverviewTab from './ClarityAdminOverviewTab';
import UsersTab from '../../../pages/dashboards/admin/tabs/UsersTab';
import ClarityAdminSubjectsTab from './ClarityAdminSubjectsTab';
import TeachingLoadTab from '../../../pages/dashboards/admin/tabs/TeachingLoadTab';
import ClarityAdminSectionsTab from './ClarityAdminSectionsTab';
import ClarityAdminSchedulesTab from './ClarityAdminSchedulesTab';
import NewsTab from '../../../pages/dashboards/admin/tabs/NewsTab';
import ClarityAdminCalendarTab from './ClarityAdminCalendarTab';
import MemosTab from '../../../pages/dashboards/admin/tabs/MemosTab';
import SettingsTab from '../../../pages/dashboards/admin/tabs/SettingsTab';
import ProfileTab from '../../../pages/profile/ProfileTab';
import { roleLabel } from '../../../pages/dashboards/admin/shared/helpers';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import ClarityModal from '../ui/ClarityModal';
import { useHtmlClass } from '../useHtmlClass';
import ClassicAdminStyles from './ClassicAdminStyles';
import { useAdminShellBehavior } from './useAdminShellBehavior';

// The classic items, keys, labels and order (AdminDashboard.jsx:1338-1349),
// grouped under headings. The grouping is an ASSUMPTION the owner may change.
// Two labels are shorter here than in the classic shell, as in the final
// design (News, Settings); the page keys are the classic ones.
const NAV_GROUPS = [
  { heading: null, items: [['overview', 'Overview', LayoutDashboard]] },
  { heading: 'People', items: [['users', 'User Management', Users]] },
  { heading: 'Academics', items: [
    ['subjects', 'Subjects', BookMarked],
    ['teaching-load', 'Teaching Load', GraduationCap],
    ['sections', 'Sections', Columns],
    ['schedules', 'Schedules', Clock],
  ] },
  { heading: 'Communication', items: [
    ['news', 'News', Newspaper],
    ['calendar', 'Calendar', Calendar],
    ['memos', 'Memos', FileText],
  ] },
  { heading: 'System', items: [['settings', 'Settings', Settings]] },
];

const SETTINGS_SECTIONS = [
  ['sec-general', 'General'],
  ['sec-security', 'Security'],
  ['sec-notifications', 'Notifications'],
  ['sec-backup', 'Backup & Logs'],
  ['sec-appearance', 'Appearance'],
];

const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

// The type-the-name field of the classic ConfirmationDialog.
const TypeToConfirm = ({ name, value, onChange }) => {
  const id = useId();
  return (
    <div className="x-field" style={{ marginTop: 16 }}>
      <label className="x-label" htmlFor={id}>Type <strong>{name}</strong> to confirm</label>
      <input id={id} className="x-input" value={value} autoComplete="off" spellCheck={false}
        onChange={event => onChange(event.target.value)} />
    </div>
  );
};

// The classic delete/archive ConfirmationDialog, with the same texts,
// defaults and rules, drawn as a ClarityModal.
const DeleteConfirm = ({ confirm, busy, onCancel, onConfirm }) => {
  const [typed, setTyped] = useState('');
  const confirmName = confirm.confirmName;
  const nameMatches = !confirmName || typed === confirmName;
  const warning = confirm.warning === null ? null : confirm.warning || 'The account will not be permanently deleted.';
  return (
    <ClarityModal
      title={confirm.title || 'Archive User?'}
      onClose={onCancel}
      closeDisabled={busy}
      footer={(
        <>
          <button type="button" className="x-btn" aria-disabled={busy || undefined} onClick={() => { if (!busy) onCancel(); }}>Cancel</button>
          <button type="button" className="x-btn dng" aria-busy={busy || undefined}
            onClick={confirmName ? () => { if (nameMatches) onConfirm(); } : onConfirm}
            disabled={confirmName ? !nameMatches : undefined}>
            {busy ? (confirm.busyLabel || 'Deleting…') : (confirm.confirmLabel || 'Yes, Archive')}
          </button>
        </>
      )}
    >
      <p className="x-cs">{confirm.message || 'This user will be moved to the archive and removed from the active user list:'}</p>
      {confirm.label && <p className="x-ct" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>{confirm.label}</p>}
      {confirm.role && <span className="x-badge" style={{ marginTop: 8 }}>{roleLabel(confirm.role)}</span>}
      {confirm.details?.length > 0 && (
        <ul className="x-cs" style={{ margin: '12px 0 0', paddingLeft: 16, listStyle: 'disc' }}>
          {confirm.details.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
      {confirm.counts?.length > 0 && (
        <dl aria-live="polite" style={{ margin: '12px 0 0' }}>
          {confirm.counts.map(({ label, value }) => (
            <div key={label} className="x-rail">
              <dt className="x-cs">{label}</dt>
              <dd className="x-ct" style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {warning && <p className="x-cs" style={{ marginTop: 12, color: 'var(--cl-er)' }}>{warning}</p>}
      {confirm.recommendation && <p className="x-cs" style={{ marginTop: 8 }}>{confirm.recommendation}</p>}
      {confirmName && <TypeToConfirm name={confirmName} value={typed} onChange={setTyped} />}
    </ClarityModal>
  );
};

const ClarityAdminLayout = ({ navigate, logout, userData, onClassicView }) => {
  useHtmlClass('theme-clarity');
  const shell = useAdminShellBehavior({ navigate, logout, userData });
  const {
    sidebarCollapsed, setSidebarCollapsed, sidebarOpen, setSidebarOpen, sidebarRef, menuButtonRef,
    deleteConfirmBusy, profileOpen, setProfileOpen, logoutConfirmOpen, setLogoutConfirmOpen,
    darkMode, page, setDarkMode, setPage, toast, activeSettingsSub, deleteConfirm,
    requestSidebarNavigation, openSettingsSection, photoUrl,
  } = shell;
  const desktop = useMediaQuery('(min-width: 1024px)');
  // The stored collapse preference only applies on desktop (as in the classic shell).
  const collapsed = desktop && sidebarCollapsed;
  const headerRef = useRef(null);
  const mainRef = useRef(null);
  const name = userData?.name || 'Admin User';
  // The footer card's second line: the classic shell's "Administrator" for
  // the admin role, else the role's own label (real data, nothing invented).
  const roleText = userData?.role === 'main_admin' ? 'Administrator' : roleLabel(userData?.role) || '';
  // The News badge: the same published-news count as the Overview's
  // "Published News" tile; hidden when unknown, failed or 0.
  const { stats, statsErrors } = useAdminContext();
  const publishedNews = !statsErrors?.news && Number(stats?.news) > 0 ? Number(stats.news) : 0;

  // While the drawer is open, the page behind it is inert (as in the
  // Clarity Student shell); the hook already traps focus and locks scroll.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const targets = [headerRef.current, mainRef.current].filter(Boolean);
    const before = targets.map(el => el.inert);
    targets.forEach((el) => { el.inert = true; });
    return () => targets.forEach((el, i) => { el.inert = Boolean(before[i]); });
  }, [sidebarOpen]);

  // Below 1024px a closed drawer is off-screen; hide it from tab and readers.
  const drawerHidden = !desktop && !sidebarOpen;

  return (
    <div className="x-app">
      <ClassicAdminStyles />

      {/* The same live region as the classic shell: mounted always, alert
          for an error, status for a success. */}
      <div
        className={toast ? 'x-toast' : undefined}
        role={toast?.type === 'error' ? 'alert' : 'status'}
        aria-live={toast?.type === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        style={toast ? undefined : HIDDEN}
      >
        {toast?.msg ?? ''}
      </div>

      {sidebarOpen && <div className="x-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <aside
        id="admin-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? 'true' : undefined}
        aria-label={sidebarOpen ? 'Navigation' : undefined}
        className={`x-side${sidebarOpen ? ' open' : ''}`}
        style={{ ...(drawerHidden ? { visibility: 'hidden' } : null), ...(collapsed ? { width: 76 } : null), overflowY: 'auto' }}
      >
        <button type="button" className="x-btn gh x-menubtn" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
          <X size={16} aria-hidden="true" /> Close
        </button>

        <div className="x-brand">
          <img src="/EduScribeLogoIcon.png" alt="EduScribe" width="36" height="36" />
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <b>EduScribe</b>
              <span>Admin Portal</span>
            </div>
          )}
        </div>

        {desktop && (
          <button type="button" className="x-nav" onClick={() => setSidebarCollapsed(c => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {sidebarCollapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
          </button>
        )}

        <div role="navigation" aria-label="Main">
          {NAV_GROUPS.map(({ heading, items }) => (
            <div key={heading || 'top'}>
              {heading && !collapsed && <p className="x-grp">{heading}</p>}
              {items.map(([k, v, Icon]) => (
                <button
                  key={k}
                  type="button"
                  className={`x-nav${page === k ? ' on' : ''}`}
                  aria-current={page === k ? 'page' : undefined}
                  aria-label={collapsed ? v : undefined}
                  title={collapsed ? v : undefined}
                  onClick={() => requestSidebarNavigation(() => setPage(k), v)}
                >
                  <Icon size={18} aria-hidden="true" />
                  {!collapsed && <span>{v}</span>}
                  {!collapsed && k === 'news' && publishedNews > 0 && (
                    <span className="cnt">{publishedNews}<span className="x-sr"> published</span></span>
                  )}
                </button>
              ))}
            </div>
          ))}

          {page === 'settings' && !collapsed && (
            <div>
              <p className="x-grp">Sections</p>
              {SETTINGS_SECTIONS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`x-nav${activeSettingsSub === id ? ' on' : ''}`}
                  style={{ paddingLeft: 42 }}
                  aria-current={activeSettingsSub === id ? 'true' : undefined}
                  onClick={() => openSettingsSection(id)}
                >{label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Pinned to the bottom: the profile link (when open) above the user card. */}
        <div style={{ marginTop: 'auto' }}>
          {profileOpen && !collapsed && (
            <button type="button" className="x-nav"
              onClick={() => requestSidebarNavigation(() => { setPage('profile'); setProfileOpen(false); }, 'Profile Settings')}>
              <Settings size={16} aria-hidden="true" /> <span>Profile Settings</span>
            </button>
          )}
          <div className="x-side-foot" style={collapsed ? { flexDirection: 'column' } : undefined}>
            <button type="button" className="x-user" onClick={() => setProfileOpen(open => !open)}
              aria-expanded={profileOpen} aria-label="Toggle profile menu">
              <span className="x-ava"><Avatar src={photoUrl} name={name} size={36} bg="transparent" color="currentColor" /></span>
              {!collapsed && (
                <span className="x-user-txt">
                  <b>{name}</b>
                  <span>{roleText}</span>
                </span>
              )}
            </button>
            <button type="button" className="x-iconbtn" aria-label="Logout" title="Logout"
              onClick={() => requestSidebarNavigation(() => setLogoutConfirmOpen(true), 'Logout')}>
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="x-main">
        <header ref={headerRef} className="x-top">
          <button ref={menuButtonRef} type="button" className="x-iconbtn x-menubtn" onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation" aria-expanded={sidebarOpen} aria-controls="admin-sidebar">
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="x-sp" />
          {/* The shared bell keeps its real unread count; .x-bell restyles its
              button as a plain icon (scoped CSS, NotificationBell unchanged). */}
          <span className="x-bell">
            <NotificationBell className="admin-notification-bell" />
          </span>
          <button type="button" className="x-iconbtn" onClick={() => setDarkMode(d => !d)}
            aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="x-btn gh" onClick={onClassicView}>Classic view</button>
        </header>

        <main ref={mainRef} className="x-content">
          <div key={page} className="x-pagein">
            {page === 'overview' && <ClarityAdminOverviewTab />}
            {page === 'users' && <UsersTab />}
            {page === 'subjects' && <ClarityAdminSubjectsTab />}
            {page === 'teaching-load' && <TeachingLoadTab />}
            {page === 'sections' && <ClarityAdminSectionsTab />}
            {page === 'schedules' && <ClarityAdminSchedulesTab />}
            {page === 'news' && <NewsTab />}
            {page === 'calendar' && <ClarityAdminCalendarTab />}
            {page === 'memos' && <MemosTab />}
            {page === 'settings' && <SettingsTab />}
            {page === 'profile' && <ProfileTab />}
          </div>
        </main>
      </div>

      {deleteConfirm && (
        <DeleteConfirm confirm={deleteConfirm} busy={deleteConfirmBusy}
          onCancel={shell.cancelDeleteConfirm} onConfirm={shell.confirmDelete} />
      )}

      {logoutConfirmOpen && (
        <ClarityModal
          title="Sign Out?"
          description="Are you sure you want to sign out of the Admin Dashboard?"
          onClose={shell.cancelLogout}
          footer={(
            <>
              <button type="button" className="x-btn" onClick={shell.cancelLogout}>Cancel</button>
              <button type="button" className="x-btn pri" onClick={shell.confirmLogout}>Sign Out</button>
            </>
          )}
        />
      )}
    </div>
  );
};

export default ClarityAdminLayout;
