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
                  borderRadius: 24, padding: '36px 24px', marginBottom: 24, textAlign: 'center',
                  background: 'linear-gradient(135deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)',
                  boxShadow: '0 10px 30px rgba(25,8,223,.22)'
                }}
              >
                <img
                  src="/capstonelogo.png"
                  alt="School Logo"
                  style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: '50%', margin: '0 auto 16px', display: 'block', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.3))' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                  Welcome to <span style={{ color: '#FFC542' }}>EduScribe</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', marginBottom: 20 }}>
                  Dela Paz National High School
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 16, padding: '10px 24px', backgroundColor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase' }}>Academic Year</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{settings.academic_year} · {settings.semester}</div>
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
                          <div className="recent-time">{l.user_name || 'Portal Admin'}{l.details ? ` · ${l.details}` : ''} · {new Date(l.created_at).toLocaleString()}</div>
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
