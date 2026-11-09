// ============================================
// FILE: src/pages/dashboards/student/tabs/AttendanceTab.jsx
// ATTENDANCE TAB — the student's own daily attendance rows.
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { AlertTriangle, CalendarCheck, CheckCircle, Clock, FileCheck, Loader2 } from 'lucide-react';
import { useToast, Card, Badge, StatCard } from '../hooks';
import { GREEN, NEUTRAL, RED, YELLOW } from '../badgeTones';
import { withRetry } from '../../../../lib/supabaseRetry';
import { Btn } from '../../teacher/shared/ui';
import PageHeader from '../PageHeader';
import StudentDataContext from '../StudentDataContext';
import {
  attendanceRate, attendanceTotals, currentManilaMonth, formatAttendanceDate, KNOWN_STATUSES,
  monthLabel, monthOf, monthOptions, RATE_RULE, statusKey,
} from '../attendanceView';

// Present green and Absent red, as on the teacher Attendance tab; Late yellow
// like the teacher's; Excused and anything else neutral.
const STATUS_TONE = { present: GREEN, absent: RED, late: YELLOW };
const statusTone = (row) => STATUS_TONE[statusKey(row)] || NEUTRAL;
const PAGE_SIZE = 20;
const FIELD_STYLE = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };

const AttendanceTab = () => {
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();
  // Section names come from the shared graph (the student's own enrolments).
  // Read without the hook so the tab still renders outside the provider.
  const studentData = useContext(StudentDataContext);
  const enrolments = studentData?.graph?.enrolments;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  // A dropped read used to leave stats at its all-zero initial value, so the
  // student saw "0 Present", "0%" and "No attendance records yet" — identical
  // to genuinely having no attendance. That is the failure this whole phase
  // set out to remove, so it gets its own state here too.
  const [loadError, setLoadError] = useState(false);
  const [month, setMonth] = useState(() => currentManilaMonth());
  const [section, setSection] = useState('all');
  const [paging, setPaging] = useState({ key: '', count: PAGE_SIZE });

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

  // Totals and the rate cover every row (the same rows and rule as the
  // Overview card); the month and section filters narrow the list only.
  const totals = useMemo(() => attendanceTotals(records), [records]);
  const rate = attendanceRate(totals);

  const sectionNames = useMemo(() => new Map((enrolments || [])
    .filter(e => e?.section_id && e.sections?.name).map(e => [e.section_id, e.sections.name])), [enrolments]);
  const sectionIds = useMemo(() => [...new Set(records.map(r => r.section_id).filter(Boolean))], [records]);
  const sectionName = id => sectionNames.get(id) || (id ? 'Other section' : '—');
  const months = useMemo(() => monthOptions(records), [records]);

  // Newest first, whatever order the rows arrived in.
  const filtered = useMemo(() => records
    .filter(r => month === 'all' || monthOf(r.date) === month)
    .filter(r => section === 'all' || r.section_id === section)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [records, month, section]);
  const filterKey = `${month}|${section}`;
  const shownCount = paging.key === filterKey ? paging.count : PAGE_SIZE;
  const shown = filtered.slice(0, shownCount);
  const statValue = value => (loading ? <Loader2 className="animate-spin" size={20} /> : loadError ? '—' : value);

  return (
    <div className="p-4 sm:p-6">
      <Toast />

      <PageHeader title="My Attendance" subtitle="Your attendance as recorded by your adviser."
        onRefresh={fetchAttendance} refreshLabel="Refresh attendance" />

      <section aria-label="Attendance totals" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <StatCard label="Present" icon={CheckCircle} value={statValue(totals.present)} />
        <StatCard label="Late" icon={Clock} value={statValue(totals.late)} />
        <StatCard label="Absent" icon={AlertTriangle} value={statValue(totals.absent)} />
        <StatCard label="Excused" icon={FileCheck} value={statValue(totals.excused)} />
      </section>
      {!loading && !loadError && totals.other > 0 && (
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          {totals.other} other {totals.other === 1 ? 'record' : 'records'} (not Present, Late, Absent or Excused).
        </p>
      )}
      <p className="text-xs mt-2 mb-6" style={{ color: 'var(--text-muted)' }}>Attendance is recorded once a day by your adviser.</p>

      {/* Attendance Rate Bar */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Attendance Rate</h2>
          <span className="text-sm font-bold" style={{ color: loadError ? 'var(--badge-red-fg)' : 'var(--text)' }}>
            {loadError ? '—' : `${rate}%`}
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--card2)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: loadError ? '0%' : `${rate}%`, backgroundColor: 'var(--accent)' }} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {loadError ? 'Could not load your attendance.' : `${totals.total} total days recorded`}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{RATE_RULE}</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-end justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Attendance Records</h2>
          {!loading && !loadError && records.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Month
                <select value={month} onChange={e => setMonth(e.target.value)} className="min-h-11 px-3 rounded-lg text-sm" style={FIELD_STYLE}>
                  {months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
                  <option value="all">All</option>
                </select>
              </label>
              {sectionIds.length > 1 && (
                <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Section
                  <select value={section} onChange={e => setSection(e.target.value)} className="min-h-11 px-3 rounded-lg text-sm" style={FIELD_STYLE}>
                    <option value="all">All</option>
                    {sectionIds.map(id => <option key={id} value={id}>{sectionName(id)}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
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
            <p style={{ color: 'var(--text-muted)' }}>No attendance recorded yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            No attendance recorded {month === 'all' ? 'for this section' : `in ${monthLabel(month)}`}.
          </p>
        ) : (
          <>
            {/* The existing scrolling table: every column stays visible at 360px. */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: 'var(--card2)' }}>
                    {['Date', 'Status', 'Section', 'Subject', 'Notes'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.id || i} className="transition-colors" style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-5 py-3.5 text-sm whitespace-nowrap" style={{ color: 'var(--text)' }}>
                        {formatAttendanceDate(r.date)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {KNOWN_STATUSES.includes(statusKey(r)) ? (
                          <Badge color={statusTone(r).color} bg={statusTone(r).bg}>{r.status}</Badge>
                        ) : (
                          <>
                            <Badge color={NEUTRAL.color} bg={NEUTRAL.bg}>Other</Badge>
                            {r.status && <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>({r.status})</span>}
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{sectionName(r.section_id)}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{r.subject || '—'}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--text-muted)' }}>{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Showing {shown.length} of {filtered.length}</p>
              {shown.length < filtered.length && (
                <Btn variant="outline" className="min-h-11"
                  onClick={() => setPaging({ key: filterKey, count: shownCount + PAGE_SIZE })}>Show more</Btn>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default AttendanceTab;
