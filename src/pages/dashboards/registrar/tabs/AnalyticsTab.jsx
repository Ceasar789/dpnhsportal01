// ============================================
// FILE: src/pages/dashboards/registrar/tabs/AnalyticsTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Users, TrendingUp, TrendingDown, PieChart, Activity, Loader2 } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader, DonutChart } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const AnalyticsTab = () => {
  const [monthlyData, setMonthlyData] = useState([]);
  const [deptComparison, setDeptComparison] = useState([]);
  const [genderData, setGenderData] = useState([]);
  const [yearLevelData, setYearLevelData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('2026');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: monthly }, { data: depts }, { data: gender }, { data: yearLevels }] = await Promise.all([
        supabase.from('enrollment_stats_monthly').select('*').order('month', { ascending: true }),
        supabase.from('enrollment_by_dept').select('*').order('current', { ascending: false }),
        supabase.from('gender_distribution').select('*'),
        supabase.from('enrollment_by_year_level').select('*')
      ]);

      setMonthlyData(monthly || []);
      setDeptComparison(depts || []);
      setGenderData(gender || []);
      setYearLevelData(yearLevels || []);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const maxEnrolled = Math.max(...monthlyData.map(d => d.enrolled || 0), 1);
  const totalEnrolled = monthlyData.reduce((sum, d) => sum + (d.enrolled || 0), 0);
  const totalDropped = monthlyData.reduce((sum, d) => sum + (d.dropped || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Analytics" subtitle="Enrollment reports and data visualization" />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[ 
          { label: 'Total Enrollment', value: totalEnrolled.toLocaleString(), change: '+3.2%', up: true, icon: TrendingUp },
          { label: 'Retention Rate', value: totalEnrolled > 0 ? `${((1 - totalDropped/totalEnrolled) * 100).toFixed(1)}%` : '94.8%', change: '+1.1%', up: true, icon: Activity },
          { label: 'Avg. Class Size', value: '38.5', change: '-2.3%', up: false, icon: Users },
          { label: 'Graduation Rate', value: '87.2%', change: '+4.5%', up: true, icon: PieChart },
        ].map(k => (
          <Card key={k.label} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{k.label}</p>
              <k.icon size={16} style={{ color: 'var(--reg-muted)' }} />
            </div>
            <p className="text-2xl font-bold mb-1" style={{ color: 'var(--reg-text)' }}>{k.value}</p>
            <p className="text-xs font-semibold flex items-center gap-1" style={{ color: k.up ? 'var(--reg-green)' : 'var(--reg-red)' }}>
              {k.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {k.change} vs last year
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Enrollment Trend Chart */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Monthly Enrollment Trend</SectionTitle>
            <span className="text-xs" style={{ color: 'var(--reg-muted)' }}>Jan – Jun 2026</span>
          </div>
          <div className="flex items-end gap-4 h-48 px-2">
            {loading ? <Loader2 className="animate-spin mx-auto" style={{ color: 'var(--reg-muted)' }} /> : 
              monthlyData.map(d => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-1 items-end justify-center" style={{ height: 160 }}>
                    <div className="w-5 rounded-t transition-all" style={{ height: `${(d.enrolled / maxEnrolled) * 140}px`, backgroundColor: 'var(--reg-navy)' }} />
                    <div className="w-5 rounded-t transition-all" style={{ height: `${(d.dropped / maxEnrolled) * 140}px`, backgroundColor: 'var(--reg-red)' }} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--reg-muted)' }}>{d.month}</span>
                </div>
              ))
            }
          </div>
          <div className="flex gap-6 mt-3 px-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--reg-navy)' }} />
              <span className="text-xs" style={{ color: 'var(--reg-muted)' }}>Enrolled</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--reg-red)' }} />
              <span className="text-xs" style={{ color: 'var(--reg-muted)' }}>Dropped</span>
            </div>
          </div>
        </Card>

        {/* Gender Distribution */}
        <Card className="p-5">
          <SectionTitle>Gender Distribution</SectionTitle>
          {loading ? <Loader2 className="animate-spin mx-auto py-10" style={{ color: 'var(--reg-muted)' }} /> : (
            <div className="space-y-4">
              {genderData.map(g => (
                <div key={g.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm" style={{ color: 'var(--reg-text)' }}>{g.label}</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--reg-text)' }}>{g.pct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--reg-border)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${g.pct}%`, backgroundColor: g.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Year Level Distribution */}
      <Card className="p-5 mb-6">
        <SectionTitle>Enrollment by Year Level</SectionTitle>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: 'var(--reg-muted)' }} /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {yearLevelData.map(y => (
              <div key={y.level} className="p-4 rounded-lg text-center" style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--reg-muted)' }}>{y.level}</p>
                <p className="text-2xl font-bold" style={{ color: 'var(--reg-text)' }}>{y.count}</p>
                <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{y.pct}% of total</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Department Comparison */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'var(--reg-border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--reg-text)' }}>Department Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                {['Department', 'Current Sem', 'Previous Sem', 'Growth', 'Trend'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--reg-muted-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><Loader2 className="animate-spin mx-auto" style={{ color: 'var(--reg-muted)' }} /></td></tr>
              ) : deptComparison.map(d => (
                <tr key={d.name} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30" style={{ borderTop: '1px solid var(--reg-border)' }}>
                  <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{d.name}</td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-text)' }}>{d.current?.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{d.previous?.toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-bold" style={{ color: d.growth >= 0 ? 'var(--reg-green)' : 'var(--reg-red)' }}>
                      {d.growth >= 0 ? '+' : ''}{d.growth}%
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {d.growth >= 0 ? <TrendingUp size={16} style={{ color: 'var(--reg-green)' }} /> : <TrendingDown size={16} style={{ color: 'var(--reg-red)' }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AnalyticsTab;
