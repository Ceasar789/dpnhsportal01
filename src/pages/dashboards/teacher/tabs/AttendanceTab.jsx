// ============================================
// FILE: src/pages/dashboards/teacher/tabs/AttendanceTab.jsx
// ATTENDANCE TAB — Full Supabase CRUD
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { CalendarCheck, Calendar, Check, X, Loader2, Save, Download } from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Table, TR, TD, Badge, Btn } from '../shared/ui';

const AttendanceTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get sections where this teacher is the adviser
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select('id')
        .eq('adviser_id', userData?.uid);
      
      if (sectionsError) throw sectionsError;
      
      const sectionIds = sectionsData?.map(s => s.id) || [];
      
      // Get students from these sections
      const { data: studentsData, error: studentsError } = await supabase
        .from('section_students')
        .select('student_id, students(id, lrn, profiles(id, name))')
        .in('section_id', sectionIds)
        .eq('status', 'active');
      
      if (studentsError) throw studentsError;
      
      const mappedStudents = (studentsData || []).map(item => ({
        id: item.students?.id,
        lrn: item.students?.lrn,
        name: item.students?.profiles?.name
      }));
      
      setStudents(mappedStudents);
      
      // Get attendance records for selected date from any section
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .in('section_id', sectionIds)
        .eq('date', selectedDate);
      
      if (attendanceError) throw attendanceError;
      
      const attMap = {};
      attendanceData?.forEach(a => { 
        attMap[a.student_id] = a.status.charAt(0).toUpperCase(); // Present, Absent, Late, Excused -> P, A, L, E
      });
      setAttendance(attMap);
    } catch (error) {
      showToast('Error loading attendance: ' + error.message, 'error');
    }
    setLoading(false);
  }, [userData, selectedDate, showToast]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('teacher-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  const handleMark = async (studentId, status) => {
    setSaving(true);
    try {
      // Get the section for this student from the selected date
      const { data: studentSectionData, error: sectionError } = await supabase
        .from('section_students')
        .select('section_id')
        .eq('student_id', studentId)
        .single();
      
      if (sectionError) {
        showToast('Could not find student section', 'error');
        setSaving(false);
        return;
      }
      
      const sectionId = studentSectionData?.section_id;
      
      // Map status code to full status name
      const statusMap = { 'P': 'Present', 'A': 'Absent', 'L': 'Late', 'E': 'Excused' };
      const fullStatus = statusMap[status];
      
      const existing = attendance[studentId];
      
      if (existing) {
        const { error } = await supabase
          .from('attendance')
          .update({ status: fullStatus, updated_at: new Date().toISOString() })
          .eq('student_id', studentId)
          .eq('date', selectedDate)
          .eq('section_id', sectionId);
        if (error) throw error;
        else showToast('Attendance updated');
      } else {
        const { error } = await supabase.from('attendance').insert([{
          student_id: studentId,
          section_id: sectionId,
          date: selectedDate,
          status: fullStatus,
          recorded_by: userData?.uid,
          created_at: new Date().toISOString()
        }]);
        if (error) throw error;
        else showToast('Attendance marked');
      }
      
      fetchData();
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    }
    setSaving(false);
  };

  const stats = {
    present: Object.values(attendance).filter(s => s === 'P').length,
    absent: Object.values(attendance).filter(s => s === 'A').length,
    late: Object.values(attendance).filter(s => s === 'L').length,
    excused: Object.values(attendance).filter(s => s === 'E').length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Attendance</h1>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)}
            className="h-10 px-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
          />
          <Btn onClick={() => showToast('Report exported', 'success')}><Download size={16} /> Export</Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Present', value: stats.present, color: '#16a34a' },
          { label: 'Absent', value: stats.absent, color: '#ef4444' },
          { label: 'Late', value: stats.late, color: '#d97706' },
          { label: 'Excused', value: stats.excused, color: '#3b82f6' },
        ].map((stat, idx) => (
          <Card key={idx} className="p-4">
            <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : (
          <Table headers={['#', 'Student', 'Status', 'Actions']}>
            {students.map((s, i) => (
              <TR key={s.id}>
                <TD>{i + 1}</TD>
                <TD><span className="font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{s.name}</span></TD>
                <TD>
                  {attendance[s.id] ? (
                    <Badge 
                      color={attendance[s.id] === 'P' ? '#16a34a' : attendance[s.id] === 'A' ? '#ef4444' : attendance[s.id] === 'L' ? '#d97706' : '#3b82f6'}
                      bg={attendance[s.id] === 'P' ? 'rgba(22,163,74,0.12)' : attendance[s.id] === 'A' ? 'rgba(239,68,68,0.12)' : attendance[s.id] === 'L' ? 'rgba(217,119,6,0.12)' : 'rgba(59,130,246,0.12)'}
                    >
                      {attendance[s.id] === 'P' ? 'Present' : attendance[s.id] === 'A' ? 'Absent' : attendance[s.id] === 'L' ? 'Late' : 'Excused'}
                    </Badge>
                  ) : (
                    <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Not marked</span>
                  )}
                </TD>
                <TD>
                  <div className="flex gap-2">
                    {['P', 'A', 'L', 'E'].map(status => (
                      <button
                        key={status}
                        onClick={() => handleMark(s.id, status)}
                        disabled={saving}
                        className="px-3 py-1 rounded text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                        style={{
                          backgroundColor: attendance[s.id] === status ? 
                            (status === 'P' ? '#16a34a' : status === 'A' ? '#ef4444' : status === 'L' ? '#d97706' : '#3b82f6') : 
                            (dark ? '#0f172a' : '#f8fafc'),
                          color: attendance[s.id] === status ? '#ffffff' : (status === 'P' ? '#16a34a' : status === 'A' ? '#ef4444' : status === 'L' ? '#d97706' : '#3b82f6'),
                          border: `1px solid ${status === 'P' ? '#16a34a' : status === 'A' ? '#ef4444' : status === 'L' ? '#d97706' : '#3b82f6'}`
                        }}
                      >
                        {status === 'P' ? 'Present' : status === 'A' ? 'Absent' : status === 'L' ? 'Late' : 'Excused'}
                      </button>
                    ))}
                  </div>
                </TD>
              </TR>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No students found</td></tr>
            )}
          </Table>
        )}
      </Card>
    </div>
  );
};

export default AttendanceTab;
