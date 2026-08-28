// ============================================
// FILE: src/pages/dashboards/registrar/tabs/OverviewTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Users, BookOpen, Loader2, GraduationCap, Columns } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader, DonutChart } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const OverviewTab = () => {
  const [overviewData, setOverviewData] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalSections: 0,
    totalSubjects: 0,
    recentEnrollments: [],
    departmentStats: []
  });
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [{ count: students }, { count: teachers }, { count: sections }, { count: subjects }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
        supabase.from('sections').select('*', { count: 'exact', head: true }),
        supabase.from('subjects').select('*', { count: 'exact', head: true })
      ]);

      const { data: recent } = await supabase
        .from('pre_enrollments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      const { data: deptStats } = await supabase
        .from('enrollment_by_dept')
        .select('*')
        .order('current', { ascending: false });

      setOverviewData({
        totalStudents: students || 0,
        totalTeachers: teachers || 0,
        totalSections: sections || 0,
        totalSubjects: subjects || 0,
        recentEnrollments: recent || [],
        departmentStats: deptStats || []
      });
    } catch (err) {
      console.error('Overview fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOverview();
  }, []);

  const statCards = [
    { label: 'Total Students', value: overviewData.totalStudents, icon: Users, color: '#2563eb' },
    { label: 'Teachers', value: overviewData.totalTeachers, icon: GraduationCap, color: '#d97706' },
    { label: 'Sections', value: overviewData.totalSections, icon: Columns, color: '#16a34a' },
    { label: 'Subjects', value: overviewData.totalSubjects, icon: BookOpen, color: '#dc2626' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div
        className="rounded-3xl px-6 py-9 mb-6 text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)', boxShadow: '0 10px 30px rgba(25,8,223,.22)' }}
      >
        <img
          src="/capstonelogo.png"
          alt="School Logo"
          className="w-24 h-24 object-contain rounded-full mx-auto mb-4"
          style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.3))' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <h2 className="text-2xl font-extrabold text-white mb-1">
          Welcome to <span style={{ color: '#FFC542' }}>EduScribe</span>
        </h2>
        <p className="text-xs font-bold tracking-widest text-white/75 uppercase mb-5">Dela Paz National High School</p>
        <div className="inline-flex items-center rounded-2xl px-6 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide text-white/70 uppercase">School Year</p>
            <p className="text-base font-extrabold text-white">2025–2026</p>
          </div>
        </div>
      </div>

      <PageHeader title="System Overview" subtitle="At-a-glance view of the entire school system" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl overflow-hidden flex flex-col h-[184px]" style={{ border: '1px solid var(--reg-border)' }}>
              <div className="h-1/2 flex-shrink-0 flex items-center justify-center"
                style={{ background: `linear-gradient(180deg, ${s.color} 0%, ${s.color} 55%, var(--reg-surface) 100%)` }}>
                {loading ? <Loader2 className="animate-spin text-white" size={22} /> : <Icon size={38} color="#ffffff" strokeWidth={2.1} />}
              </div>
              <div className="flex-1 flex flex-col justify-center px-4 py-2" style={{ backgroundColor: 'var(--reg-surface)' }}>
                <p className="text-2xl font-bold leading-tight" style={{ color: 'var(--reg-text)', fontFamily: 'Georgia,serif' }}>
                  {loading ? '—' : s.value.toLocaleString()}
                </p>
                <p className="text-xs font-bold mt-1" style={{ color: 'var(--reg-text)' }}>{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <SectionTitle>Enrollment by Department</SectionTitle>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: 'var(--reg-muted)' }} /></div>
          ) : (
            <div className="space-y-3">
              {overviewData.departmentStats.map(d => {
                const pct = Math.round((d.current / (overviewData.totalStudents || 1)) * 100);
                return (
                  <div key={d.name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{d.name}</span>
                      <span className="text-sm" style={{ color: 'var(--reg-muted)' }}>{d.current} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--reg-border)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: d.color || 'var(--reg-navy)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Recent Enrollments</SectionTitle>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: 'var(--reg-muted)' }} /></div>
          ) : overviewData.recentEnrollments.length === 0 ? (
            <p style={{ color: 'var(--reg-muted)' }}>No recent enrollments</p>
          ) : (
            <div className="space-y-3">
              {overviewData.recentEnrollments.map(e => {
                const status = STATUS_MAP[e.status] || STATUS_MAP.pending;
                return (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: e.avatar_bg || '#1B2A4A' }}>
                      {e.initials || 'ST'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--reg-text)' }}>{e.student_name}</p>
                      <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{e.course} · {e.year} Year</p>
                    </div>
                    <Badge color={status.color} bg={status.bg}>{status.label}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default OverviewTab;
