// ============================================
// FILE: src/pages/dashboards/student/tabs/AttendanceTab.jsx
// ATTENDANCE TAB — Supabase + Real-time
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { AlertTriangle, CalendarCheck, CheckCircle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';

// Attendance status is stored capitalised ('Present', 'Absent', 'Late',
// 'Excused'). Normalising on read means either casing renders correctly.
const statusKey = (row) => String(row?.status || '').toLowerCase();

const AttendanceTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, total: 0 });
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  // A dropped read used to leave stats at its all-zero initial value, so the
  // student saw "0 Present", "0%" and "No attendance records yet" — identical
  // to genuinely having no attendance. That is the failure this whole phase
  // set out to remove, so it gets its own state here too.
  const [loadError, setLoadError] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withRetry(
        () => supabase
          .from('attendance')
          .select('*')
          .eq('student_id', userData?.uid)
          .order('date', { ascending: false }),
        { label: 'Attendance fetch' }
      );

      if (error) throw error;

      // The teacher writes 'Present' / 'Absent' / 'Late' / 'Excused'
      // capitalised (teacher/tabs/AttendanceTab.jsx maps 'P' -> 'Present'),
      // and the CHECK constraint stores them that way. Comparing lowercase
      // here matched nothing, so this tab read 0 present, 0 late and 0 absent
      // however much attendance had actually been recorded. Compared
      // case-insensitively so either casing counts.
      const present = data?.filter(r => statusKey(r) === 'present').length || 0;
      const late = data?.filter(r => statusKey(r) === 'late').length || 0;
      const absent = data?.filter(r => statusKey(r) === 'absent').length || 0;

      setStats({ present, late, absent, total: data?.length || 0 });
      setRecords(data || []);
      setLoadError(false);
    } catch (err) {
      console.warn('Attendance fetch failed —', err?.message);
      setLoadError(true);
      showToast('Could not load your attendance. Check your connection.', 'error');
    }
    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => {
    if (userData?.uid) fetchAttendance();

    const channel = supabase
      .channel('student-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${userData?.uid}` }, fetchAttendance)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userData?.uid, fetchAttendance]);

  const attendanceRate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;

  return (
    <div className="p-6">
      <Toast />

      <div className="flex items-center justify-between mb-6 rounded-lg px-4 py-3"
        style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--banner-text)' }}>My Attendance</h1>
        <button onClick={fetchAttendance} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-6 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: dark ? '#064e3b' : '#dcfce7' }}>
            <CheckCircle size={24} style={{ color: '#16a34a' }} />
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : loadError ? '—' : stats.present}
          </p>
          <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Present</p>
        </Card>
        <Card className="p-6 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: dark ? '#713f12' : '#fef3c7' }}>
            <Clock size={24} style={{ color: '#d97706' }} />
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : loadError ? '—' : stats.late}
          </p>
          <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Late</p>
        </Card>
        <Card className="p-6 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: dark ? '#450a0a' : '#fee2e2' }}>
            <AlertTriangle size={24} style={{ color: '#dc2626' }} />
          </div>
          <p className="text-3xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : loadError ? '—' : stats.absent}
          </p>
          <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Absent</p>
        </Card>
      </div>

      {/* Attendance Rate Bar */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Attendance Rate</h2>
          <span className="text-sm font-bold" style={{ color: loadError ? '#dc2626' : attendanceRate >= 90 ? '#16a34a' : attendanceRate >= 75 ? '#d97706' : '#dc2626' }}>
            {loadError ? '—' : `${attendanceRate}%`}
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: dark ? '#334155' : '#e2e8f0' }}>
          <div className="h-full rounded-full transition-all" 
            style={{ width: loadError ? '0%' : `${attendanceRate}%`, backgroundColor: attendanceRate >= 90 ? '#16a34a' : attendanceRate >= 75 ? '#FEB300' : '#dc2626' }} />
        </div>
        <p className="text-xs mt-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
          {loadError ? 'Could not load your attendance.' : `${stats.total} total days recorded`}
        </p>
      </Card>

      {/* Recent Records */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: dark ? '#334155' : '#e2e8f0' }}>
          <h2 className="text-sm font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Recent Records</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
        ) : loadError ? (
          <div className="p-8 text-center">
            <p className="text-base font-semibold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
              Could not load your attendance.
            </p>
            <p className="mb-3" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              This is a loading problem, not an empty record. Check your connection and try again.
            </p>
            <button onClick={fetchAttendance} className="h-9 px-4 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarCheck size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
            <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>No attendance has been recorded for you yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                  {['Date', 'Status', 'Subject', 'Notes'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#94a3b8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 10).map((r, i) => (
                  <tr key={r.id || i} className="transition-colors" style={{ borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                    <td className="px-5 py-3.5 text-sm" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                      {new Date(r.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge 
                        color={statusKey(r) === 'present' ? '#16a34a' : statusKey(r) === 'late' ? '#d97706' : '#dc2626'}
                        bg={statusKey(r) === 'present' ? 'rgba(22,163,74,0.12)' : statusKey(r) === 'late' ? 'rgba(217,119,6,0.12)' : 'rgba(220,38,38,0.12)'}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: dark ? '#94a3b8' : '#64748b' }}>{r.subject || '—'}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: dark ? '#94a3b8' : '#64748b' }}>{r.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ============================================
// ANNOUNCEMENTS TAB — Supabase + Real-time
// ORIGINAL DESIGN PRESERVED
// ============================================

export default AttendanceTab;
