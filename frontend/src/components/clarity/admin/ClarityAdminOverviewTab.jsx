// ============================================
// FILE: src/components/clarity/admin/ClarityAdminOverviewTab.jsx
// The Admin Overview in Clarity (final design), shown only inside the
// Clarity Admin shell. It reads ONLY what useAdminContext() already loads
// (the same fetches the classic Overview and tabs use); nothing is fetched
// here. Anything without real data is left out or shown as an empty state,
// never as a made-up number.
// ============================================

import { useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Calendar, FileText, Newspaper, Plus, Settings, Users,
} from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { useDelayedFlag } from '../../../lib/useDelayedFlag';
import { manilaDateToday } from '../../../lib/taskFormatting';
import { wholePercents } from '../../../lib/percentages';
import ProgressRing from '../charts/ProgressRing';
import Donut from '../charts/Donut';
import StackedBar from '../charts/StackedBar';
import RankedBars from '../charts/RankedBars';

// The school's static name (as in the final design). It is not stored in
// school_settings today; if settings.school_name is ever set, that wins.
const SCHOOL_NAME = 'Dela Paz National High School';

const NUMBER = new Intl.NumberFormat('en-PH');
const SHORT_DATE = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
const MONTH = (value) => (value ? manilaDateToday(new Date(value)).slice(0, 7) : null);

// The three roles the app has; an admin may still be stored as "admin".
const ROLES = [
  { key: 'student', label: 'Students', match: r => r === 'student' },
  { key: 'teacher', label: 'Teachers', match: r => r === 'teacher' },
  { key: 'admin', label: 'Admins', match: r => r === 'main_admin' || r === 'admin' },
];

// The icon for an activity row, from the words the app logs
// (logActivity: "Created news", "Invited user", "Updated settings", ...).
const activityIcon = (action = '') => {
  const a = action.toLowerCase();
  if (a.includes('user')) return Users;
  if (a.includes('memo')) return FileText;
  if (a.includes('news')) return Newspaper;
  if (a.includes('event') || a.includes('calendar')) return Calendar;
  if (a.includes('setting')) return Settings;
  return Activity;
};

// "Just now", "12 min ago", "3 h ago" within a day; otherwise "Nov 10".
const relativeTime = (value, now = new Date()) => {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes >= 0 && minutes < 1) return 'Just now';
  if (minutes >= 0 && minutes < 60) return `${minutes} min ago`;
  if (minutes >= 0 && minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return SHORT_DATE.format(at);
};

// A segmented control: real buttons (Tab, Enter, Space), the chosen one
// announced with aria-pressed.
const Segmented = ({ label, options, value, onChange }) => (
  <div className="x-seg" role="group" aria-label={label}>
    {options.map(option => (
      <button key={option} type="button" className={value === option ? 'on' : undefined}
        aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>
    ))}
  </div>
);

const Kpi = ({ label, icon: Icon, value, caption, side }) => (
  <div className="x-card x-kpi">
    <div className="x-ov-kpi">
      <div style={{ minWidth: 0 }}>
        <p className="x-kl">{label}</p>
        <p className="x-kv">{value}</p>
        {caption && <p className="x-kd">{caption}</p>}
      </div>
      {side || (Icon && <span className="x-ico" aria-hidden="true"><Icon size={16} /></span>)}
    </div>
  </div>
);

const ClarityAdminOverviewTab = () => {
  const {
    stats = {}, statsErrors = {}, overviewLoading = false, fetchStats,
    settings = {}, settingsStatus,
    users = [], usersLoading = false, usersError = null, fetchUsers,
    newsItems = [], newsLoading = false, newsError = '',
    calEvents = [], calLoading = false, calError = false,
    memos = [], memosLoading = false, memosError = '',
    activityLogs = [], activityError = '', fetchLogs,
    setPage, openCreateUser,
  } = useAdminContext() || {};
  const slow = useDelayedFlag(overviewLoading);
  const [roleView, setRoleView] = useState('Donut');
  const thisMonth = manilaDateToday(new Date()).slice(0, 7);

  const totalsKnown = !overviewLoading;
  const kpiValue = key => (statsErrors[key] ? 'Unavailable' : totalsKnown ? NUMBER.format(Number(stats[key]) || 0) : 'Loading…');

  const usersReady = !usersLoading && !usersError;
  const newThisMonth = usersReady ? users.filter(u => MONTH(u.created_at) === thisMonth).length : null;

  const newsReady = !newsLoading && !newsError;
  const drafts = newsReady ? newsItems.filter(n => String(n.status || '').toLowerCase() === 'draft').length : null;
  const published = !statsErrors.news && totalsKnown ? Number(stats.news) || 0 : null;
  const ringValue = published !== null && drafts !== null && published + drafts > 0
    ? Math.round((published / (published + drafts)) * 100) : null;

  const eventsThisMonth = !calLoading && !calError
    ? calEvents.filter(e => String(e.event_date || '').slice(0, 7) === thisMonth).length : null;
  const lastMemo = !memosLoading && !memosError && memos.length ? memos[0]?.created_at : null;

  // Role distribution: the three app roles, ACTIVE accounts only (not
  // archived, not an invitation still waiting to be set up). A row with no
  // status is active, as everywhere else in the admin screens.
  const roleCounts = useMemo(() => (usersReady
    ? ROLES.map(r => ({ label: r.label, value: users.filter(u => r.match(u.role) && String(u.status || 'active').toLowerCase() === 'active').length }))
    : null), [users, usersReady]);
  const roleTotal = roleCounts ? roleCounts.reduce((sum, r) => sum + r.value, 0) : 0;
  const rolePercents = roleCounts ? wholePercents(roleCounts.map(r => r.value)) : [];

  const subtitle = [
    String(settings.school_name || '').trim() || SCHOOL_NAME,
    settingsStatus === 'ready' && settings.academic_year ? `Academic Year ${settings.academic_year}` : null,
    settingsStatus === 'ready' && settings.semester ? settings.semester : null,
  ].filter(Boolean).join(' · ');

  const createUser = () => { setPage?.('users'); openCreateUser?.(); };

  return (
    <div className="x-ov">
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Dashboard Overview</h1>
          {subtitle && <p className="x-sub">{subtitle}</p>}
        </div>
        {openCreateUser && setPage && (
          <div className="x-act">
            <button type="button" className="x-btn pri" onClick={createUser}>
              <Plus size={16} aria-hidden="true" /> Create user
            </button>
          </div>
        )}
      </div>

      {Object.values(statsErrors).some(Boolean) && (
        <div className="x-card x-pad x-rail" role="alert" style={{ marginBottom: 16 }}>
          <span>Some dashboard totals are unavailable.</span>
          {fetchStats && <button type="button" className="x-btn" onClick={fetchStats}>Retry totals</button>}
        </div>
      )}

      <section className="x-kpis" aria-label="Totals">
        <Kpi label="Total users" icon={Users} value={kpiValue('users')}
          caption={newThisMonth !== null && !statsErrors.users
            ? <><span className="x-ov-up">+{NUMBER.format(newThisMonth)}</span> new this month</> : null} />
        <Kpi label="Published news" value={kpiValue('news')}
          caption={drafts !== null ? `${NUMBER.format(drafts)} ${drafts === 1 ? 'draft' : 'drafts'} waiting` : null}
          side={ringValue !== null ? (
            <div className="x-ov-ring">
              <ProgressRing value={ringValue} label="Published share of news"
                detail={`${published} published, ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`} />
            </div>
          ) : <span className="x-ico" aria-hidden="true"><Newspaper size={16} /></span>} />
        <Kpi label="Calendar events" icon={Calendar} value={kpiValue('events')}
          caption={eventsThisMonth !== null ? `${NUMBER.format(eventsThisMonth)} this month` : null} />
        <Kpi label="Memos sent" icon={FileText} value={kpiValue('memos')}
          caption={lastMemo ? `Last sent ${SHORT_DATE.format(new Date(lastMemo))}` : null} />
      </section>

      <div className="x-ov-row">
        <section className="x-card x-pad" aria-labelledby="ov-signins">
          <div className="x-ov-ch">
            <div>
              <h2 id="ov-signins" className="x-ct">Sign-in activity</h2>
              <p className="x-cs">Daily sign-ins, this week</p>
            </div>
          </div>
          <p className="x-empty">No sign-in data yet</p>
        </section>

        <section className="x-card x-pad" aria-labelledby="ov-roles">
          <div className="x-ov-ch">
            <div>
              <h2 id="ov-roles" className="x-ct">Role distribution</h2>
              {roleCounts && <p className="x-cs">{NUMBER.format(roleTotal)} active {roleTotal === 1 ? 'account' : 'accounts'}</p>}
            </div>
            {roleCounts && roleTotal > 0 && (
              <Segmented label="Role distribution view" options={['Donut', 'Split', 'Ranked']} value={roleView} onChange={setRoleView} />
            )}
          </div>
          {usersError ? (
            <div role="alert" className="x-empty">
              <p>Role distribution is unavailable.</p>
              {fetchUsers && <button type="button" className="x-btn" style={{ marginTop: 12 }} onClick={() => fetchUsers()}>Retry</button>}
            </div>
          ) : !roleCounts ? (
            <p className="x-empty">{slow || usersLoading ? 'Loading roles…' : ''}</p>
          ) : roleTotal === 0 ? (
            <p className="x-empty">No accounts yet</p>
          ) : roleView === 'Donut' ? (
            <Donut segments={roleCounts} label="Role distribution" totalLabel="users" gap={0.5} />
          ) : roleView === 'Split' ? (
            <StackedBar segments={roleCounts} label="Role distribution" unit="users" />
          ) : (
            <RankedBars rows={roleCounts.map((r, i) => ({ label: r.label, value: rolePercents[i] }))} label="Role distribution" />
          )}
        </section>
      </div>

      <section className="x-card x-pad" aria-labelledby="ov-activity">
        <div className="x-ov-ch">
          <h2 id="ov-activity" className="x-ct">Recent activity</h2>
          {setPage && (
            <button type="button" className="x-link" onClick={() => setPage('users')}>
              View users <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        {overviewLoading ? (
          <p className="x-empty">{slow ? 'Loading activity…' : ''}</p>
        ) : activityError ? (
          <div role="alert" className="x-empty">
            <p>{activityError}</p>
            {fetchLogs && <button type="button" className="x-btn" style={{ marginTop: 12 }} onClick={fetchLogs}>Retry</button>}
          </div>
        ) : activityLogs.length === 0 ? (
          <p className="x-empty">No recent activity</p>
        ) : (
          <ul className="x-rows">
            {activityLogs.map((log) => {
              const Icon = activityIcon(log.action);
              return (
                <li key={log.id}>
                  <span className="x-ico" aria-hidden="true"><Icon size={16} /></span>
                  <div className="g">
                    <span className="t" style={{ display: 'block' }}>{log.action}</span>
                    <span className="m" style={{ display: 'block' }}>{log.actorName}{log.message ? ` · ${log.message}` : ''}</span>
                  </div>
                  <time className="x-ov-time" dateTime={log.created_at}>{relativeTime(log.created_at)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ClarityAdminOverviewTab;
