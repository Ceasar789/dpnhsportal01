// ============================================
// FILE: src/pages/dashboards/faculty/tabs/OverviewTab.jsx
// FACULTY OVERVIEW TAB — Live stats from Supabase
// Split from the original monolithic FacultyDashboard.jsx (496 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import {
  CheckSquare, Check, FileCheck, AlertCircle, Plus, Filter, Loader2
} from 'lucide-react';

const OverviewTab = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    pendingChecklists: 0,
    completedToday: 0,
    totalProcessed: 0,
    documentsMissing: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data: pending } = await withRetry(
      () => supabase
        .from('pre_enrollment')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      { label: 'Faculty overview pending checklists fetch' }
    );

    const { data: completed } = await withRetry(
      () => supabase
        .from('pre_enrollment')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('updated_at', today),
      { label: 'Faculty overview completed today fetch' }
    );

    const { data: total } = await withRetry(
      () => supabase
        .from('pre_enrollment')
        .select('*', { count: 'exact', head: true }),
      { label: 'Faculty overview total processed fetch' }
    );

    const { data: missing } = await withRetry(
      () => supabase
        .from('pre_enrollment')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'incomplete'),
      { label: 'Faculty overview missing documents fetch' }
    );

    setStats({
      pendingChecklists: pending?.length || 0,
      completedToday: completed?.length || 0,
      totalProcessed: total?.length || 0,
      documentsMissing: missing?.length || 0
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();

    // Real-time updates
    const channel = supabase
      .channel('faculty-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pre_enrollment' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="p-6">
      <div
        className="rounded-2xl px-6 py-5 mb-6 flex items-center gap-4 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#D7DEFA 0%,#C9D3F6 55%,#DCEBFF 100%)', border: '1px solid rgba(25,8,223,0.14)', boxShadow: '0 4px 16px rgba(25,8,223,.10)' }}
      >
        <img
          src="/capstonelogo.png"
          alt="School Logo"
          className="w-14 h-14 object-contain rounded-full flex-shrink-0"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>
            Welcome to <span style={{ color: '#FEB300' }}>Edu</span><span style={{ color: '#00D4FF' }}>Scribe</span>
          </h2>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: '#4d5b8a' }}>Dela Paz National High School</p>
        </div>
        <div className="hidden sm:flex items-center rounded-xl px-6 py-3 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,.75)', border: '1px solid rgba(25,8,223,.16)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: '#4d5b8a' }}>Academic Year</p>
            <p className="text-lg font-extrabold" style={{ color: '#1a2b4a' }}>2025–2026</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Pending Checklists" value={stats.pendingChecklists} icon={CheckSquare} color="#dc2626" loading={loading} />
        <StatCard title="Completed Today" value={stats.completedToday} icon={Check} color="#16a34a" loading={loading} />
        <StatCard title="Total Processed" value={stats.totalProcessed} icon={FileCheck} color="#2563eb" loading={loading} />
        <StatCard title="Missing Documents" value={stats.documentsMissing} icon={AlertCircle} color="#d97706" loading={loading} />
      </div>

      <div className="bg-white rounded-lg border p-6" style={{ borderColor: '#E2E8F0' }}>
        <h2 className="font-work font-bold text-lg text-[#1a2b4a] mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickActionButton
            icon={Plus}
            label="Check Pre-Enrollment"
            onClick={() => navigate('/faculty-dashboard/pre-enrollment')}
            color="#0d2b5c"
          />
          <QuickActionButton
            icon={Filter}
            label="Filter by Status"
            onClick={() => navigate('/faculty-dashboard/pre-enrollment')}
            color="#2563EB"
          />
        </div>
      </div>
    </div>
  );
};

// Reusable components (used only within this tab)
const StatCard = ({ title, value, icon: Icon, color, loading }) => (
  <div className="rounded-xl overflow-hidden border flex flex-col h-[184px]" style={{ borderColor: '#E2E8F0' }}>
    <div className="h-1/2 flex-shrink-0 flex items-center justify-center"
      style={{ background: `linear-gradient(180deg, ${color} 0%, ${color} 55%, #ffffff 100%)` }}>
      {loading ? <Loader2 className="animate-spin text-white" size={22} /> : <Icon size={38} color="#ffffff" strokeWidth={2.1} />}
    </div>
    <div className="flex-1 flex flex-col justify-center px-4 py-2 bg-white">
      <p className="text-2xl font-bold text-[#1a2b4a] leading-tight">{loading ? '—' : value}</p>
      <p className="text-xs font-bold text-[#1a2b4a] mt-1">{title}</p>
    </div>
  </div>
);

const QuickActionButton = ({ icon: Icon, label, onClick, color }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 px-5 py-4 rounded-lg border hover:shadow-md transition-all text-left"
    style={{ borderColor: '#E2E8F0', backgroundColor: 'white' }}
  >
    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
      <Icon size={20} style={{ color }} />
    </div>
    <span className="font-work font-semibold text-sm text-[#1a2b4a]">{label}</span>
  </button>
);

export default OverviewTab;
