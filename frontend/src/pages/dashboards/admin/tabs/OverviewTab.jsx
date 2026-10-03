// ============================================
// FILE: src/pages/dashboards/admin/tabs/OverviewTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React from 'react';
import { useAdminContext } from '../AdminContext';
import { useDelayedFlag } from '../../../../lib/useDelayedFlag';
import { roleLabel } from '../shared/helpers';
import { Users, Newspaper, Calendar, FileText } from 'lucide-react';

const OverviewTab = () => {
  const { activityLogs, overviewLoading, roleDist, setPage, settings, stats } = useAdminContext();
  const slowOverview = useDelayedFlag(overviewLoading);
  const roleColors = { student:'#3b82f6', teacher:'#22c55e', faculty:'#2dd4bf', registrar:'#f59e0b', main_admin:'#ef4444' };
  const totalRoles = roleDist.reduce((total, { count }) => total + count, 0);
  let roleOffset = 0;
  const pieStops = roleDist.length
    ? roleDist.map(({ role, count }) => {
        const start = roleOffset;
        roleOffset += (count / totalRoles) * 100;
        return `${roleColors[role] || '#94a3b8'} ${start}% ${roleOffset}%`;
      }).join(', ')
    : '#374151 0 100%';

  return (
            <div>
              {/* D4. The welcome banner that used to sit here said "Welcome to
                  EduScribe" over the school's name, on a tinted panel with a
                  coloured drop shadow, beside a pill reading the academic
                  year. The greeting is filler — nobody opens an admin
                  dashboard to be welcomed — and the pill duplicated the page
                  subtitle immediately below it, word for word. Removing it
                  costs no information and returns a screen's worth of height
                  to the content. The logo stays in the header, where it
                  belongs. */}
              <div className="page-title">Dashboard Overview</div>
              {/* The school's name used to live in the banner, hardcoded.
                  It reads from school_settings.school_name now, so it is
                  one fact from one place; the subtitle simply omits it if
                  the row has none rather than inventing one. */}
              <div className={`page-sub${settings.school_name ? ' with-seal' : ''}`}>
                {settings.school_name && (
                  <img
                    className="page-seal"
                    src="/capstonelogo.png"
                    alt=""
                    aria-hidden="true"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                {/* One flex child, so the seal's gap applies once. The
                    segments inside it are what must not break. */}
                <span>
                  {settings.school_name && (
                    <><span className="page-sub-seg">{settings.school_name}</span>{' · '}</>
                  )}
                  <span className="page-sub-seg">Academic Year {settings.academic_year}</span>
                  {' · '}
                  <span className="page-sub-seg">{settings.semester}</span>
                </span>
              </div>
              <div className="stat-grid">
                {/* The per-card colour is gone with the tile it filled. It
                    was decorative: one fixed hue each, carrying nothing a
                    reader could act on. */}
                {[
                  { label:'Total Users',    value: stats.users,  icon: Users,     note:'Live from Portal', page:'users', primary: true },
                  { label:'Published News', value: stats.news,   icon: Newspaper, note:'Published only',   page:'news' },
                  { label:'Calendar Events',value: stats.events, icon: Calendar,  note:'All events',       page:'calendar' },
                  { label:'Memos Sent',     value: stats.memos,  icon: FileText,  note:'All memos',        page:'memos' },
                ].map(s => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className={`stat-card clickable-stat${s.primary ? ' primary' : ''}`}
                      onClick={() => setPage(s.page)}
                      aria-label={`Open ${s.label}`}
                    >
                      <div className="stat-head">
                        <Icon size={16} aria-hidden="true" strokeWidth={2} />
                        <span className="stat-label">{s.label}</span>
                      </div>
                      <div className="stat-value">{s.value}</div>
                      <div className="stat-change">{s.note}</div>
                    </button>
                  );
                })}
              </div>
              <div className="overview-grid">
                <div className="chart-card">
                  <div className="chart-title">Recent Activity</div>
                  <div className="chart-sub">Latest actions on the portal</div>
                  {/* UX-047: "No recent activity" used to be what rendered
                      for the whole span of the fetch — an empty state that
                      read as an answer. */}
                  {overviewLoading
                    ? <div style={{ color:'var(--text-muted)', fontSize: 'var(--font-size-13)' }}>{slowOverview ? 'Loading activity…' : ''}</div>
                    : activityLogs.length === 0
                    ? <div style={{ color:'var(--text-muted)', fontSize: 'var(--font-size-13)' }}>No recent activity</div>
                    : activityLogs.map((l, i) => (
                      <div key={i} className="recent-item">
                        <span className="recent-dot" style={{ background: ['#3b82f6','#22c55e','#f59e0b','#a78bfa','#2dd4bf'][i % 5] }}></span>
                        <div className="recent-info">
                          <div className="recent-title">{l.action}</div>
                          <div className="recent-time">{l.details?.actor_name || 'Portal Admin'}{l.details?.message ? ` · ${l.details.message}` : ''} · {new Date(l.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
                <div className="chart-card">
                  <div className="chart-title">Role Distribution</div>
                  <div className="role-overview">
                    <div className="role-pie" style={{ background: `conic-gradient(${pieStops})` }} aria-label="Role distribution chart" />
                    <div className="role-legend">
                      {roleDist.map(({ role, count }) => (
                        <div key={role} className="role-legend-item">
                          <span className="role-legend-dot" style={{ background: roleColors[role] || '#94a3b8' }} />
                          <span>{roleLabel(role)}</span>
                          <strong>{totalRoles ? Math.round((count / totalRoles) * 100) : 0}%</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="role-bar">
                    {roleDist.map(({ role, count }) => {
                      const pct   = totalRoles ? Math.round((count / totalRoles) * 100) : 0;
                      const color = roleColors[role] || 'var(--text-muted)';
                      return (
                        <div key={role} className="role-row">
                          <span className="role-label">{roleLabel(role)} · {count}</span>
                          <div className="role-track"><div className="role-fill" style={{ width:`${pct}%`, background: color }}></div></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
  );
};

export default OverviewTab;
