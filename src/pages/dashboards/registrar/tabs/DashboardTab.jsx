// ============================================
// FILE: src/pages/dashboards/registrar/tabs/DashboardTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { Users, ClipboardList, FileText, Activity, Loader2, FileCheck, UserCheck, Shield, BarChart3, History, RefreshCw, Sparkles, UserPlus } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const DashboardTab = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [stats, setStats] = useState({
    totalStudents: '0',
    pendingPreEnroll: '0',
    enrolledThisSem: '0',
    docsForReview: '0'
  });
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ count: totalStudents }, { count: pendingPreEnroll },
             { count: enrolledThisSem }, { count: docsForReview }] = await Promise.all([
        withRetry(() => supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'), { label: 'Total students count fetch' }),
        withRetry(() => supabase.from('pre_enrollment').select('*', { count: 'exact', head: true }).eq('status', 'Pending'), { label: 'Pending pre-enrollment count fetch' }),
        withRetry(() => supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'), { label: 'Enrolled this semester count fetch' }),
        withRetry(() => supabase.from('documents').select('*', { count: 'exact', head: true }), { label: 'Docs for review count fetch' })
      ]);

      setStats({
        totalStudents: (totalStudents || 0).toLocaleString(),
        pendingPreEnroll: (pendingPreEnroll || 0).toLocaleString(),
        enrolledThisSem: (enrolledThisSem || 0).toLocaleString(),
        docsForReview: (docsForReview || 0).toLocaleString()
      });

      const { data: logs } = await withRetry(
        () => supabase
          .from('activity_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(6),
        { label: 'Activity logs fetch' }
      );
      setActivity(logs || []);

      const { data: ann } = await withRetry(
        () => supabase
          .from('news')
          .select('*')
          .eq('status', 'Published')
          .order('created_at', { ascending: false })
          .limit(3),
        { label: 'Announcements fetch' }
      );
      setAnnouncements(ann || []);
    } catch (err) {
      console.error('Dashboard data fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const kpis = [
    { label: 'Total Students', value: stats.totalStudents, sub: '▲ 3.2% from last sem', subColor: 'var(--reg-green)', blockColor: '#2563eb', icon: Users },
    { label: 'Pending Pre-Enroll', value: stats.pendingPreEnroll, sub: '△ Needs attention', subColor: 'var(--reg-amber)', blockColor: '#d97706', icon: ClipboardList },
    { label: 'Enrolled This Sem', value: stats.enrolledThisSem, sub: '● Active students', subColor: 'var(--reg-green)', blockColor: '#16a34a', icon: UserCheck },
    { label: 'Docs for Review', value: stats.docsForReview, sub: '△ Needs verification', subColor: 'var(--reg-amber)', blockColor: '#dc2626', icon: FileText },
  ];

  const quickActions = [
    { label: '+ Enroll Student', bg: 'var(--reg-navy)', color: '#fff', path: '/registrar-dashboard/pre-enrollment', icon: UserPlus },
    { label: 'Generate Report', bg: 'var(--reg-surface)', color: 'var(--reg-text)', border: '1px solid var(--reg-border)', path: '/registrar-dashboard/analytics', icon: BarChart3 },
    { label: 'Review Documents', bg: 'var(--reg-surface)', color: 'var(--reg-text)', border: '1px solid var(--reg-border)', path: '/registrar-dashboard/documents', icon: FileCheck },
    { label: 'Process Clearance', bg: 'var(--reg-gold)', color: 'var(--reg-navy)', path: '/registrar-dashboard/pre-enrollment', icon: Shield },
  ];

  return (
    <div className="p-6">
      <div
        className="rounded-2xl px-6 py-5 mb-6 flex items-center gap-4 relative overflow-hidden"
        style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)', boxShadow: '0 4px 16px rgba(25,8,223,.10)' }}
      >
        <img
          src="/capstonelogo.png"
          alt="School Logo"
          className="w-14 h-14 object-contain rounded-full flex-shrink-0"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--banner-text)' }}>
            Welcome to <span style={{ color: '#FEB300' }}>Edu</span><span style={{ color: '#00D4FF' }}>Scribe</span>
          </h2>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--banner-subtext)' }}>
            Dela Paz National High School
          </p>
        </div>
        <div className="hidden sm:flex items-center rounded-xl px-6 py-3 flex-shrink-0" style={{ backgroundColor: 'var(--banner-pill-bg)', border: '1px solid var(--banner-pill-border)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'var(--banner-subtext)' }}>School Year</p>
            <p className="text-lg font-extrabold" style={{ color: 'var(--banner-text)' }}>2025–2026</p>
          </div>
        </div>
      </div>

      <PageHeader plain title="Registrar Dashboard"
        subtitle={`Welcome back, ${userData?.name || 'Admin Registrar'} · ${new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}`} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl overflow-hidden flex flex-col h-[184px]" style={{ border: '1px solid var(--reg-border)' }}>
              <div className="h-1/2 flex-shrink-0 flex items-center justify-center"
                style={{ background: `linear-gradient(180deg, ${c.blockColor} 0%, ${c.blockColor} 55%, var(--reg-surface) 100%)` }}>
                {loading ? <Loader2 className="animate-spin text-white" size={22} /> : <Icon size={38} color="#ffffff" strokeWidth={2.1} />}
              </div>
              <div className="flex-1 flex flex-col justify-center px-4 py-2" style={{ backgroundColor: 'var(--reg-surface)' }}>
                <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--reg-text)' }}>
                  {loading ? '—' : c.value}
                </p>
                <p className="text-xs font-bold mt-1" style={{ color: 'var(--reg-text)' }}>{c.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: c.subColor }}>{c.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Recent Activity</SectionTitle>
            <button onClick={fetchDashboardData} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: 'var(--reg-muted)' }}>
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {activity.length === 0 ? (
              <div className="text-center py-8">
                <History size={32} className="mx-auto mb-2" style={{ color: 'var(--reg-muted-light)' }} />
                <p style={{ color: 'var(--reg-muted)' }}>No recent activity</p>
              </div>
            ) : activity.map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" 
                  style={{ backgroundColor: ['var(--reg-gold)','var(--reg-green)','var(--reg-red)','var(--reg-navy)','var(--reg-purple)','var(--reg-blue)'][i % 6] }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{a.action}</p>
                  <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{a.user_name} · {new Date(a.created_at).toLocaleString()}</p>
                  {a.details && <p className="text-xs mt-1" style={{ color: 'var(--reg-muted-light)' }}>{a.details}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle>Quick Actions</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map(btn => {
                const Icon = btn.icon;
                return (
                  <button key={btn.label} onClick={() => btn.path && navigate(btn.path)}
                    className="py-3 px-4 rounded-lg text-sm font-semibold transition-opacity hover:opacity-85 flex items-center justify-center gap-2"
                    style={{ backgroundColor: btn.bg, color: btn.color, border: btn.border || 'none' }}>
                    <Icon size={14} />
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Announcements</SectionTitle>
            {announcements.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--reg-muted)' }}>No active announcements</p>
            ) : (
              <div className="space-y-3">
                {announcements.map(a => (
                  <div key={a.id} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={12} style={{ color: 'var(--reg-gold)' }} />
                      <p className="text-sm font-semibold" style={{ color: 'var(--reg-text)' }}>{a.title}</p>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{a.content}</p>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--reg-muted-light)' }}>
                      Posted {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardTab;
