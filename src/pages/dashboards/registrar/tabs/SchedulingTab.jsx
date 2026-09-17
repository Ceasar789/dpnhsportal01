// ============================================
// FILE: src/pages/dashboards/registrar/tabs/SchedulingTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { Calendar, Clock, MapPin, BookOpen, Eye, Loader2 } from 'lucide-react';
import { Card, Badge, SectionTitle, PageHeader } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const SchedulingTab = () => {
  const [activeView, setActiveView] = useState('classes');
  const [filterDept, setFilterDept] = useState('All');
  const [schedules, setSchedules] = useState([]);
  const [examSchedules, setExamSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: subjectRows, error: subjectsErr }] = await Promise.all([
        withRetry(
          () => supabase
            .from('schedules')
            .select('*, sections(name), profiles!teacher_id(name)')
            .order('created_at', { ascending: false }),
          { label: 'Schedules fetch' }
        ),
        withRetry(
          () => supabase.from('subjects').select('id, name'),
          { label: 'Subjects registry fetch' }
        ),
      ]);
      if (error) throw error;
      if (subjectsErr) throw subjectsErr;

      // subject_id is the registry's source of truth; the legacy free-text
      // `subject` column is only a fallback for pre-registry rows.
      const subjectNameById = new Map((subjectRows || []).map(s => [s.id, s.name]));

      setSchedules((data || []).map(schedule => ({
        ...schedule,
        section: schedule.sections?.name || schedule.section_id,
        subject: (schedule.subject_id ? subjectNameById.get(schedule.subject_id) : null) || schedule.subject || 'Untitled subject',
        instructor: schedule.profiles?.name || schedule.teacher_id,
        day: schedule.day_of_week,
        time: `${schedule.start_time} - ${schedule.end_time}`,
        room: schedule.room_number || '',
        students: '',
        dept: '',
      })));
      setExamSchedules([]);
    } catch (err) {
      showToast('Error fetching class schedules: ' + err.message, 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules();
    const channels = [
      supabase.channel('registrar-schedules').on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, fetchSchedules).subscribe()
    ];
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [fetchSchedules]);

  const depts = ['All', ...new Set(schedules.map(s => s.dept).filter(Boolean))];
  const filtered = activeView === 'classes'
    ? schedules.filter(s => filterDept === 'All' || s.dept === filterDept)
    : examSchedules;

  return (
    <div className="p-6">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>{toast.msg}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <PageHeader title="Scheduling" subtitle="Manage class schedules and examination timetables" />
      </div>

      <div className="page-sub" style={{ marginTop: 4 }}>
        Schedules are managed by the Administrator. This view is read-only.
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--reg-border)' }}>
          <button onClick={() => setActiveView('classes')}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeView === 'classes' ? 'var(--reg-navy)' : 'var(--reg-surface)',
              color: activeView === 'classes' ? '#fff' : 'var(--reg-muted)',
            }}>Class Schedules</button>
          <button onClick={() => setActiveView('exams')}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: activeView === 'exams' ? 'var(--reg-navy)' : 'var(--reg-surface)',
              color: activeView === 'exams' ? '#fff' : 'var(--reg-muted)',
            }}>Examinations</button>
        </div>
        {activeView === 'classes' && (
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="h-10 px-3 rounded-lg text-sm outline-none"
            style={{ backgroundColor: 'var(--reg-input-bg)', border: '1px solid var(--reg-border)', color: 'var(--reg-text)' }}>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Classes', value: schedules.length.toString(), icon: BookOpen },
          { label: 'Active Today', value: '12', icon: Clock },
          { label: 'Rooms Occupied', value: '8/15', icon: MapPin },
          { label: 'Upcoming Exams', value: examSchedules.length.toString(), icon: Calendar },
        ].map(s => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--reg-sidebar-active-bg)' }}>
              <s.icon size={18} style={{ color: 'var(--reg-navy)' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--reg-muted)' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: 'var(--reg-text)' }}>{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'var(--reg-surface-hover)' }}>
                {(activeView === 'classes'
                  ? ['Subject', 'Section', 'Instructor', 'Schedule', 'Room', 'Students', 'Actions']
                  : ['Subject', 'Section', 'Type', 'Date', 'Time', 'Room', 'Actions']
                ).map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--reg-muted-light)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="animate-spin mx-auto" style={{ color: 'var(--reg-muted)' }} /></td></tr>
              ) : filtered.map(item => (
                <tr key={item.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30" style={{ borderTop: '1px solid var(--reg-border)' }}>
                  {activeView === 'classes' ? (
                    <>
                      <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{item.subject}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.section}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.instructor}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.day} · {item.time}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.room}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.students}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--reg-text)' }}>{item.subject}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.section}</td>
                      <td className="px-5 py-3.5">
                        <Badge color={item.type === 'Final' ? '#991B1B' : item.type === 'Practical' ? '#92400E' : '#15803D'}
                          bg={item.type === 'Final' ? '#FEE2E2' : item.type === 'Practical' ? '#FEF3C7' : '#DCFCE7'}>
                          {item.type}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.date}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.time}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--reg-muted)' }}>{item.room}</td>
                    </>
                  )}
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2">
                      <button className="p-1.5 rounded-md transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20" style={{ color: 'var(--reg-blue)' }} title="View">
                        <Eye size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: 'var(--reg-muted)' }}>No schedules found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default SchedulingTab;
