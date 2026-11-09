// ============================================
// FILE: src/pages/dashboards/student/tabs/AttendanceTab.jsx
// ATTENDANCE TAB — Supabase + Real-time
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { AlertTriangle, CalendarCheck, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useToast, Card, Badge, StatCard } from '../hooks';
import { BLUE, GREEN, NEUTRAL, RED, YELLOW } from '../badgeTones';
import { withRetry } from '../../../../lib/supabaseRetry';
import { Btn } from '../../teacher/shared/ui';
import PageHeader from '../PageHeader';

// Attendance status is stored capitalised ('Present', 'Absent', 'Late',
// 'Excused'). Normalising on read means either casing renders correctly.
const statusKey = (row) => String(row?.status || '').toLowerCase();
// Same meanings as the teacher Attendance tab: Present green, Absent red,
// Late yellow, Excused blue; anything else neutral.
const STATUS_TONE = { present: GREEN, absent: RED, late: YELLOW, excused: BLUE };
const statusTone = (row) => STATUS_TONE[statusKey(row)] || NEUTRAL;

const AttendanceTab = () => {
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
  }, [userData?.uid, fetchAttendance]);

  const attendanceRate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;

  return (
    <div className="p-6">
      <Toast />

      <PageHeader title="My Attendance" subtitle="Your attendance as recorded by your adviser."
        onRefresh={fetchAttendance} refreshLabel="Refresh attendance" />

      <section aria-label="Attendance totals" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Present" icon={CheckCircle}
          value={loading ? <Loader2 className="animate-spin" size={20} /> : loadError ? '—' : stats.present} />
        <StatCard label="Late" icon={Clock}
          value={loading ? <Loader2 className="animate-spin" size={20} /> : loadError ? '—' : stats.late} />
        <StatCard label="Absent" icon={AlertTriangle}
          value={loading ? <Loader2 className="animate-spin" size={20} /> : loadError ? '—' : stats.absent} />
      </section>

      {/* Attendance Rate Bar */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Attendance Rate</h2>
          <span className="text-sm font-bold" style={{ color: loadError ? 'var(--badge-red-fg)' : 'var(--text)' }}>
            {loadError ? '—' : `${attendanceRate}%`}
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card2)' }}>
          <div className="h-full rounded-full transition-all" 
            style={{ width: loadError ? '0%' : `${attendanceRate}%`, backgroundColor: 'var(--accent)' }} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {loadError ? 'Could not load your attendance.' : `${stats.total} total days recorded`}
        </p>
      </Card>

      {/* Recent Records */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Recent Records</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
        ) : loadError ? (
          <div className="p-8 text-center">
            <p className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Could not load your attendance.
            </p>
            <p className="mb-3" style={{ color: 'var(--text-muted)' }}>
              This is a loading problem, not an empty record. Check your connection and try again.
            </p>
            <div className="flex justify-center">
              <Btn className="min-h-11" onClick={fetchAttendance}>Retry</Btn>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarCheck size={40} className="mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
            <p style={{ color: 'var(--text-muted)' }}>No attendance has been recorded for you yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--card2)' }}>
                  {['Date', 'Status', 'Subject', 'Notes'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 10).map((r, i) => (
                  <tr key={r.id || i} className="transition-colors" style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text)' }}>
                      {new Date(r.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge 
                        color={statusTone(r).color}
                        bg={statusTone(r).bg}
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{r.subject || '—'}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{r.remarks || '—'}</td>
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
