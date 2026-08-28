// ============================================
// FILE: src/pages/dashboards/student/tabs/AssignmentsTab.jsx
// ASSIGNMENTS TAB — Supabase CRUD + Real-time
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Award, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';

const AssignmentsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('assignments').select('*').eq('student_id', userData?.uid).order('due_date', { ascending: true });
      if (filterStatus !== 'all') query = query.eq('status', filterStatus);

      const { data, error } = await query;
      if (error) throw error;
      setAssignments(data || []);
    } catch (err) {
      showToast('Error fetching assignments', 'error');
    }
    setLoading(false);
  }, [userData?.uid, filterStatus]);

  useEffect(() => {
    if (userData?.uid) fetchAssignments();

    const channel = supabase
      .channel('student-assignments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `student_id=eq.${userData?.uid}` }, fetchAssignments)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userData?.uid, filterStatus, fetchAssignments]);

  const handleSubmit = async (id) => {
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      showToast('Assignment submitted successfully!');
      fetchAssignments();
    } catch (err) {
      showToast('Error submitting assignment', 'error');
    }
  };

  const statuses = ['all', 'pending', 'submitted', 'graded'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Toast />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>My Assignments</h1>
        <div className="flex gap-2">
          {statuses.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: filterStatus === s ? '#3b82f6' : dark ? '#334155' : '#f1f5f9',
                color: filterStatus === s ? '#fff' : dark ? '#94a3b8' : '#64748b'
              }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
      ) : assignments.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>No assignments have been posted yet.</p>
          <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>If you’re expecting work, ask your teacher to publish the latest academic assignments.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment, i) => (
            <Card key={assignment.id || i} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{assignment.title}</h3>
                  <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{assignment.subject}</p>
                </div>
                <Badge 
                  color={assignment.status === 'submitted' ? '#16a34a' : assignment.status === 'graded' ? '#2563eb' : '#d97706'}
                  bg={assignment.status === 'submitted' ? 'rgba(22,163,74,0.12)' : assignment.status === 'graded' ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.12)'}
                >
                  {assignment.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: dark ? '#334155' : '#e2e8f0' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${assignment.progress || 0}%`, backgroundColor: assignment.status === 'submitted' ? '#16a34a' : assignment.status === 'graded' ? '#2563eb' : '#FEB300' }} />
                </div>
                <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{assignment.progress || 0}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  <Clock size={14} />
                  Due {new Date(assignment.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                {assignment.status === 'pending' && (
                  <button onClick={() => handleSubmit(assignment.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
                    style={{ backgroundColor: '#3b82f6' }}>
                    Submit
                  </button>
                )}
                {assignment.status === 'graded' && assignment.score !== null && (
                  <div className="flex items-center gap-1">
                    <Award size={14} style={{ color: '#FEB300' }} />
                    <span className="text-sm font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{assignment.score}/{assignment.total_score}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// QUIZZES TAB — Supabase + Real-time
// ORIGINAL DESIGN PRESERVED
// ============================================

export default AssignmentsTab;
