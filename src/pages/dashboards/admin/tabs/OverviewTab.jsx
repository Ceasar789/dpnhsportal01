// ============================================
// FILE: src/pages/dashboards/admin/tabs/OverviewTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// ============================================

import React from 'react';
import { useAdminContext } from '../AdminContext';
import { roleLabel } from '../shared/helpers';
import { Users, Newspaper, Calendar, FileText } from 'lucide-react';

const OverviewTab = () => {
  const { activityLogs, roleDist, setPage, settings, stats } = useAdminContext();
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
              <div
                style={{
                  borderRadius: 16, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16,
                  background: 'var(--banner-bg)', border: '1px solid var(--banner-border)',
                  boxShadow: '0 4px 16px rgba(25,8,223,.10)'
                }}
              >
                <img
                  src="/capstonelogo.png"
                  alt="School Logo"
                  style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--banner-text)', marginBottom: 2 }}>
                    Welcome to <span style={{ color: '#FEB300' }}>Edu</span><span style={{ color: '#00D4FF' }}>Scribe</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'var(--banner-subtext)', textTransform: 'uppercase' }}>
                    Dela Paz National High School
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', borderRadius: 12, padding: '12px 24px', backgroundColor: 'var(--banner-pill-bg)', border: '1px solid var(--banner-pill-border)', flexShrink: 0 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--banner-subtext)', textTransform: 'uppercase' }}>Academic Year</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--banner-text)' }}>{settings.academic_year} · {settings.semester}</div>
                  </div>
                </div>
              </div>

              <div className="page-title">Dashboard Overview</div>
              <div className="page-sub">Academic Year {settings.academic_year} · {settings.semester}</div>
              <div className="stat-grid">
                {[
                  { label:'Total Users',    value: stats.users,  color:'#2563eb',  icon: Users,    note:'Live from Portal', page:'users' },
                  { label:'Published News', value: stats.news,   color:'#16a34a',  icon: Newspaper, note:'Published only', page:'news' },
                  { label:'Calendar Events',value: stats.events, color:'#d97706',  icon: Calendar,  note:'All events', page:'calendar' },
                  { label:'Memos Sent',     value: stats.memos,  color:'#dc2626',  icon: FileText,  note:'All memos', page:'memos' },
                ].map(s => {
                  const Icon = s.icon;
                  return (
                    <button key={s.label} type="button" className="stat-card clickable-stat" onClick={() => setPage(s.page)} aria-label={`Open ${s.label}`}>
                      <div className="stat-icon-block" style={{ background: `linear-gradient(180deg, ${s.color} 0%, ${s.color} 55%, var(--card-bg) 100%)` }}>
                        <Icon size={34} color="#ffffff" strokeWidth={2.1} />
                      </div>
                      <div className="stat-body">
                        <div className="stat-value" style={{ color: 'var(--text)' }}>{s.value}</div>
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-change up">{s.note}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="overview-grid">
                <div className="chart-card">
                  <div className="chart-title">Recent Activity</div>
                  <div className="chart-sub">Latest actions on the portal</div>
                  {activityLogs.length === 0
                    ? <div style={{ color:'var(--text-muted)', fontSize:13 }}>No recent activity</div>
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
