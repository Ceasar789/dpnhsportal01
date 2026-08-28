// ============================================
// FILE: src/pages/dashboards/teacher/tabs/GradesTab.jsx
// GRADES TAB — Full Supabase CRUD
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { GraduationCap, Search, Save, Loader2, Check, Download } from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Table, TR, TD, Badge, Btn } from '../shared/ui';

const GradesTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [grades, setGrades] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchGrades = useCallback(async () => {
    setLoading(true);
    try {
      // Get sections where this teacher is the adviser
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select('id')
        .eq('adviser_id', userData?.uid);
      
      if (sectionsError) throw sectionsError;
      
      const sectionIds = sectionsData?.map(s => s.id) || [];
      
      // Get grades for these sections
      let gradesQuery = supabase
        .from('grades')
        .select('*')
        .eq('teacher_id', userData?.uid);
      
      if (sectionIds.length > 0) {
        gradesQuery = gradesQuery.in('section_id', sectionIds);
      }
      
      const { data: gradesData, error: gradesError } = await gradesQuery;
      if (gradesError) throw gradesError;
      
      setGrades(gradesData || []);
      
      // Get students from sections
      const { data: studentsData, error: studentsError } = await supabase
        .from('section_students')
        .select('student_id, students(id, lrn, profiles(id, name, email))')
        .in('section_id', sectionIds)
        .eq('status', 'active');
      
      if (studentsError) throw studentsError;
      
      // Map student data
      const mappedStudents = (studentsData || []).map(item => ({
        id: item.students?.id,
        lrn: item.students?.lrn,
        name: item.students?.profiles?.name,
        email: item.students?.profiles?.email
      }));
      
      setStudents(mappedStudents);
    } catch (error) {
      showToast('Error loading grades: ' + error.message, 'error');
    }
    setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchGrades();
    const channels = [
      supabase.channel('teacher-grades').on('postgres_changes', { event: '*', schema: 'public', table: 'grades' }, fetchGrades).subscribe(),
      supabase.channel('teacher-grade-students').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchGrades).subscribe()
    ];
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [fetchGrades]);

  const handleSaveGrade = async (studentId, subject, value) => {
    setSaving(true);
    const existing = grades.find(g => g.student_id === studentId && g.subject === subject);

    if (existing) {
      const { error } = await supabase.from('grades').update({ grade: value, updated_at: new Date().toISOString() }).eq('id', existing.id);
      if (error) showToast('Error: ' + error.message, 'error');
      else showToast('Grade updated');
    } else {
      const { error } = await supabase.from('grades').insert([{
        student_id: studentId,
        teacher_id: userData?.uid,
        subject,
        grade: value,
        created_at: new Date().toISOString()
      }]);
      if (error) showToast('Error: ' + error.message, 'error');
      else showToast('Grade added');
    }
    
    setEditing(null);
    fetchGrades();
    setSaving(false);
  };

  const getGrade = (studentId, subject) => {
    const g = grades.find(g => g.student_id === studentId && g.subject === subject);
    return g?.grade?.toString() || '—';
  };

  const calculateGWA = (studentId) => {
    const studentGrades = grades.filter(g => g.student_id === studentId);
    if (!studentGrades.length) return 0;
    return (studentGrades.reduce((a, b) => a + b.grade, 0) / studentGrades.length).toFixed(1);
  };

  const handleExportGrades = async () => {
    try {
      const subjects = ['English', 'Math', 'Science', 'Filipino'];
      let csvContent = 'data:text/csv;charset=utf-8,';
      csvContent += 'Student ID,Student Name,' + subjects.join(',') + ',GWA,Remarks,Export Date\n';

      students.forEach(s => {
        const gwa = calculateGWA(s.id);
        const remarks = gwa >= 75 ? 'Passed' : 'Failed';
        const row = [s.id, s.name, ...subjects.map(sub => getGrade(s.id, sub)), gwa, remarks, new Date().toLocaleDateString()];
        csvContent += row.map(val => `"${val}"`).join(',') + '\n';
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      const fileName = `grades-${userData?.uid}-${new Date().toISOString().split('T')[0]}.csv`;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`Grades exported as ${fileName}!`);
    } catch (error) {
      showToast('Error exporting grades: ' + error.message, 'error');
    }
  };

  const subjects = ['English', 'Math', 'Science', 'Filipino'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}
      
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Grades — Q3 Report</h1>
        <Btn onClick={handleExportGrades}><Download size={16} /> Export</Btn>
      </div>
      
      <Card>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : (
          <Table headers={['Student', ...subjects, 'GWA', 'Remarks']}>
            {students.map((s) => {
              const gwa = calculateGWA(s.id);
              return (
                <TR key={s.id}>
                  <TD><span className="font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{s.name}</span></TD>
                  {subjects.map(sub => {
                    const gradeKey = `${s.id}-${sub}`;
                    const currentGrade = getGrade(s.id, sub);
                    const isEditing = editing === gradeKey;
                    return (
                      <TD key={sub}>
                        {isEditing ? (
                          <input 
                            type="number" 
                            min="0" 
                            max="100" 
                            autoFocus
                            defaultValue={currentGrade === '—' ? '' : currentGrade}
                            onBlur={e => handleSaveGrade(s.id, sub, parseFloat(e.target.value) || 0)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveGrade(s.id, sub, parseFloat(e.target.value) || 0)}
                            className="w-16 h-8 px-2 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            style={{ 
                              backgroundColor: dark ? '#0f172a' : '#f8fafc', 
                              border: '1px solid ' + (dark ? '#334155' : '#cbd5e1'), 
                              color: dark ? '#f1f5f9' : '#1a2b4a' 
                            }}
                          />
                        ) : (
                          <button 
                            onClick={() => setEditing(gradeKey)}
                            className="w-16 h-8 rounded text-sm font-medium hover:bg-blue-50 transition-colors"
                            style={{ 
                              color: currentGrade === '—' ? '#94a3b8' : '#1e3a5f', 
                              backgroundColor: dark ? '#1e293b' : '#f8fafc', 
                              border: '1px solid ' + (dark ? '#334155' : '#e2e8f0') 
                            }}
                          >
                            {currentGrade}
                          </button>
                        )}
                      </TD>
                    );
                  })}
                  <TD><span className="font-bold" style={{ color: gwa >= 75 ? '#16a34a' : '#ef4444' }}>{gwa}</span></TD>
                  <TD>
                    <Badge color={gwa >= 75 ? '#16a34a' : '#ef4444'} bg={gwa >= 75 ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)'}>
                      {gwa >= 75 ? 'Passed' : 'Failed'}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  No students found
                </td>
              </tr>
            )}
          </Table>
        )}
      </Card>
    </div>
  );
};

export default GradesTab;
