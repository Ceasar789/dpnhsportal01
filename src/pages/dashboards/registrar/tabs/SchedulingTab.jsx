// ============================================
// FILE: src/pages/dashboards/registrar/tabs/SchedulingTab.jsx
// Split from the original monolithic RegistrarDashboard.jsx (2,158 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Calendar, Plus, Clock, MapPin, BookOpen, Eye, Loader2, Trash2 } from 'lucide-react';
import { Card, Badge, Btn, SectionTitle, PageHeader } from '../shared/ui';
import { STATUS_MAP, DOCUMENT_TYPES } from '../shared/constants';

const SchedulingTab = () => {
  const [activeView, setActiveView] = useState('classes');
  const [filterDept, setFilterDept] = useState('All');
  const [schedules, setSchedules] = useState([]);
  const [examSchedules, setExamSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    subject: '', section: '', room: '', instructor: '', day: '', time: '', dept: '', students: '', type: 'Written'
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: classes }, { data: exams }] = await Promise.all([
        supabase.from('class_schedules').select('*').order('created_at', { ascending: false }),
        supabase.from('exam_schedules').select('*').order('date', { ascending: true })
      ]);
      setSchedules(classes || []);
      setExamSchedules(exams || []);
    } catch (err) {
      showToast('Error fetching schedules', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules();
    const channels = [
      supabase.channel('registrar-schedules').on('postgres_changes', { event: '*', schema: 'public', table: 'class_schedules' }, fetchSchedules).subscribe(),
      supabase.channel('registrar-exams').on('postgres_changes', { event: '*', schema: 'public', table: 'exam_schedules' }, fetchSchedules).subscribe()
    ];
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, []);

  const handleAddSchedule = async () => {
    setSaving(true);
    const table = activeView === 'classes' ? 'class_schedules' : 'exam_schedules';
    try {
      const { error } = await supabase.from(table).insert([{
        ...newSchedule,
        created_at: new Date().toISOString()
      }]);
      if (error) throw error;

      showToast('Schedule added successfully');
      setShowAddModal(false);
      setNewSchedule({ subject: '', section: '', room: '', instructor: '', day: '', time: '', dept: '', students: '', type: 'Written' });
      fetchSchedules();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setSaving(false);
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Delete this schedule?')) return;
    const table = activeView === 'classes' ? 'class_schedules' : 'exam_schedules';
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      showToast('Schedule deleted');
      fetchSchedules();
    } catch (err) {
      showToast('Error deleting schedule', 'error');
    }
  };

  const depts = ['All', ...new Set(schedules.map(s => s.dept).filter(Boolean))];
  const filtered = activeView === 'classes'
    ? schedules.filter(s => filterDept === 'All' || s.dept === filterDept)
    : examSchedules;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>{toast.msg}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <PageHeader title="Scheduling" subtitle="Manage class schedules and examination timetables" />
        <Btn onClick={() => setShowAddModal(true)}><Plus size={16} /> New Schedule</Btn>
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
                      <button onClick={() => handleDeleteSchedule(item.id)}
                        className="p-1.5 rounded-md transition-colors hover:bg-red-50 dark:hover:bg-red-900/20" style={{ color: 'var(--reg-red)' }} title="Delete">
                        <Trash2 size={14} />
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-lg p-6 w-full max-w-md" style={{ backgroundColor: 'var(--reg-surface)', border: '1px solid var(--reg-border)' }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--reg-text)' }}>
              Add {activeView === 'classes' ? 'Class' : 'Exam'} Schedule
            </h3>
            <div className="space-y-3">
              <input placeholder="Subject *" value={newSchedule.subject} onChange={e => setNewSchedule({...newSchedule, subject: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Section *" value={newSchedule.section} onChange={e => setNewSchedule({...newSchedule, section: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Room" value={newSchedule.room} onChange={e => setNewSchedule({...newSchedule, room: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Instructor" value={newSchedule.instructor} onChange={e => setNewSchedule({...newSchedule, instructor: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Day(s)" value={newSchedule.day} onChange={e => setNewSchedule({...newSchedule, day: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              <input placeholder="Time (e.g. 8:00 AM - 10:00 AM)" value={newSchedule.time} onChange={e => setNewSchedule({...newSchedule, time: e.target.value})}
                className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
              {activeView === 'classes' ? (
                <>
                  <input placeholder="Department" value={newSchedule.dept} onChange={e => setNewSchedule({...newSchedule, dept: e.target.value})}
                    className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
                  <input placeholder="Student Count" value={newSchedule.students} onChange={e => setNewSchedule({...newSchedule, students: e.target.value})}
                    className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
                </>
              ) : (
                <>
                  <input placeholder="Date (YYYY-MM-DD)" value={newSchedule.day} onChange={e => setNewSchedule({...newSchedule, day: e.target.value})}
                    className="w-full p-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }} />
                  <select value={newSchedule.type} onChange={e => setNewSchedule({...newSchedule, type: e.target.value})}
                    className="w-full p-2.5 rounded-lg border text-sm outline-none"
                    style={{ borderColor: 'var(--reg-border)', background: 'var(--reg-input-bg)', color: 'var(--reg-text)' }}>
                    <option value="Written">Written</option>
                    <option value="Practical">Practical</option>
                    <option value="Final">Final</option>
                  </select>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--reg-border)', color: 'var(--reg-muted)' }}>Cancel</button>
              <button onClick={handleAddSchedule} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: 'var(--reg-navy)' }}>
                {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Add Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulingTab;
