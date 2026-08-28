// ============================================
// FILE: src/pages/dashboards/student/tabs/OverviewTab.jsx
// STUDENT OVERVIEW TAB — Supabase + Real-time
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  BookOpen, CalendarCheck, CheckCircle, ClipboardList, Clock, FileText, Loader2, RefreshCw
} from 'lucide-react';
import { useTheme, useToast, Card, Badge, StatCard } from '../hooks';

const OverviewTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [studentInfo, setStudentInfo] = useState({
    name: userData?.name || 'Loading...',
    studentId: userData?.student_no || '—',
    grade: '—',
    section: '—',
    avgGrade: 0,
    attendanceRate: 0
  });
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      // Get student profile with error handling
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userData?.uid)
          .single();

        if (profile && !profileError) {
          setStudentInfo({
            name: profile.name || userData?.name || 'Student',
            studentId: profile.student_no || '—',
            grade: profile.year || '—',
            section: profile.section || '—',
            avgGrade: profile.avg_grade || 0,
            attendanceRate: profile.attendance_rate || 0
          });
        }
      } catch (e) {
        console.warn('Profile fetch error:', e);
      }

      // Get upcoming assignments & quizzes with separate error handling
      try {
        const [assignments, quizzes] = await Promise.all([
          (async () => {
            try {
              const { data, error } = await supabase
                .from('assignments')
                .select('*')
                .eq('student_id', userData?.uid)
                .eq('status', 'pending')
                .order('due_date', { ascending: true })
                .limit(3);
              return error ? [] : (data || []);
            } catch (e) {
              console.warn('Assignments fetch error:', e);
              return [];
            }
          })(),
          (async () => {
            try {
              const { data, error } = await supabase
                .from('quizzes')
                .select('*')
                .eq('student_id', userData?.uid)
                .eq('status', 'upcoming')
                .order('date', { ascending: true })
                .limit(2);
              return error ? [] : (data || []);
            } catch (e) {
              console.warn('Quizzes fetch error:', e);
              return [];
            }
          })()
        ]);

        const combined = [
          ...(assignments || []).map(a => ({ type: 'assignment', title: a.title, subject: a.subject, due: new Date(a.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }), status: a.status, id: a.id })),
          ...(quizzes || []).map(q => ({ type: 'quiz', title: q.title, subject: q.subject, due: new Date(q.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }), status: q.status, id: q.id }))
        ].slice(0, 5);

        setUpcoming(combined);
      } catch (err) {
        console.warn('Upcoming items fetch error:', err);
      }
    } catch (err) {
      console.error('Overview fetch error:', err);
    }
    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => {
    if (userData?.uid) fetchOverview();

    const channels = [];
    
    // Only subscribe to tables if user ID is available
    if (userData?.uid) {
      try {
        const assignmentChannel = supabase.channel('student-overview-assignments')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `student_id=eq.${userData?.uid}` }, fetchOverview)
          .subscribe((status) => {
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              console.warn('Assignments subscription failed - table may not exist');
            }
          });
        channels.push(assignmentChannel);
      } catch (e) {
        console.warn('Could not subscribe to assignments:', e);
      }

      try {
        const quizChannel = supabase.channel('student-overview-quizzes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'quizzes', filter: `student_id=eq.${userData?.uid}` }, fetchOverview)
          .subscribe((status) => {
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              console.warn('Quizzes subscription failed - table may not exist');
            }
          });
        channels.push(quizChannel);
      } catch (e) {
        console.warn('Could not subscribe to quizzes:', e);
      }
    }

    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [userData?.uid, fetchOverview]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Toast />

      <div
        className="rounded-3xl px-6 py-9 mb-6 text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#12069f 0%,#1908DF 55%,#3a2bf0 100%)', boxShadow: '0 10px 30px rgba(25,8,223,.22)' }}
      >
        <img
          src="/capstonelogo.png"
          alt="School Logo"
          className="w-24 h-24 object-contain rounded-full mx-auto mb-4"
          style={{ filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.3))' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <h2 className="text-2xl font-extrabold text-white mb-1">
          Welcome back, <span style={{ color: '#FFC542' }}>{studentInfo.name}</span>!
        </h2>
        <p className="text-xs font-bold tracking-widest text-white/75 uppercase mb-5">
          Grade {studentInfo.grade}-{studentInfo.section} · ID: {studentInfo.studentId}
        </p>
        <div className="inline-flex items-center rounded-2xl px-6 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide text-white/70 uppercase">School Year</p>
            <p className="text-base font-extrabold text-white">2025–2026</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard 
          label="Average Grade" 
          value={loading ? <Loader2 className="animate-spin" size={20} /> : `${studentInfo.avgGrade}%`} 
          icon={BookOpen} 
          color="#2563eb"
        />
        <StatCard 
          label="Attendance" 
          value={loading ? <Loader2 className="animate-spin" size={20} /> : `${studentInfo.attendanceRate}%`} 
          icon={CalendarCheck} 
          color="#16a34a"
        />
        <StatCard 
          label="Pending Tasks" 
          value={loading ? <Loader2 className="animate-spin" size={20} /> : upcoming.length.toString()} 
          icon={ClipboardList} 
          subColor="#d97706" 
          color="#d97706"
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
            Upcoming Tasks
          </h2>
          <button onClick={fetchOverview} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={32} className="mx-auto mb-2" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
              <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>No upcoming tasks yet.</p>
              <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>You’re caught up for now. Check Announcements for academic updates, reminders, and upcoming schedules.</p>
            </div>
          ) : (
            upcoming.map((task, index) => (
              <div key={task.id || index} className="flex items-center gap-4 p-4 rounded-lg transition-colors"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: task.type === 'assignment' ? (dark ? '#1e3a5f' : '#eff6ff') : (dark ? '#312e81' : '#f5f3ff') }}>
                  {task.type === 'assignment' ? (
                    <ClipboardList size={20} style={{ color: '#3b82f6' }} />
                  ) : (
                    <FileText size={20} style={{ color: '#7c3aed' }} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{task.title}</p>
                  <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{task.subject}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                    <Clock size={14} />
                    Due {task.due}
                  </div>
                  <Badge 
                    color={task.status === 'pending' ? '#d97706' : '#2563eb'}
                    bg={task.status === 'pending' ? 'rgba(217,119,6,0.12)' : 'rgba(37,99,235,0.12)'}
                  >
                    {task.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

// ============================================
// ASSIGNMENTS TAB — Supabase CRUD + Real-time
// ORIGINAL DESIGN PRESERVED
// ============================================

export default OverviewTab;
