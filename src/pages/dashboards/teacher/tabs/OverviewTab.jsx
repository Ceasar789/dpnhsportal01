// ============================================
// FILE: src/pages/dashboards/teacher/tabs/OverviewTab.jsx
// TEACHER OVERVIEW TAB — Enhanced Dashboard
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  BookOpen, FileText, Megaphone, Check, AlertCircle, Plus, Upload,
  Calendar, Activity, Bell, Loader2
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, TR, TD, StatCard, Badge, Btn } from '../shared/ui';

const OverviewTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalLessonPlans: 0,
    totalResources: 0,
    aiSuggestionsUsed: 0,
    upcomingClassesToday: 0,
    upcomingClassesWeek: 0
  });
  const [recentLessonPlans, setRecentLessonPlans] = useState([]);
  const [upcomingClasses, setUpcomingClasses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [aiActivity, setAiActivity] = useState({
    totalSuggestions: 0,
    lastAILesson: null,
    mostUsedFeature: 'Lesson Plan Generator'
  });
  const [loading, setLoading] = useState(true);

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch total lesson plans
      const { count: lessonCount, data: lessonPlans } = await supabase
        .from('lesson_plans')
        .select('*', { count: 'exact' })
        .eq('teacher_id', userData?.uid)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentLessonPlans(lessonPlans || []);

      // 2. Fetch total resources/worksheets
      const { count: resourceCount } = await supabase
        .from('worksheets')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', userData?.uid);

      // 3. Fetch AI usage data
      const { count: aiSuggestions, data: aiPlans } = await supabase
        .from('lesson_plans')
        .select('*', { count: 'exact' })
        .eq('teacher_id', userData?.uid)
        .eq('ai_generated', true)
        .order('created_at', { ascending: false })
        .limit(1);

      // Get AI usage log for most used feature
      const { data: aiUsageData } = await supabase
        .from('ai_usage_log')
        .select('feature_type')
        .eq('user_id', userData?.uid)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(10);

      const featureCounts = {};
      aiUsageData?.forEach(log => {
        featureCounts[log.feature_type] = (featureCounts[log.feature_type] || 0) + 1;
      });
      const mostUsedFeature = Object.keys(featureCounts).length > 0 
        ? Object.entries(featureCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0]
        : 'Lesson Plan Generator';

      setAiActivity({
        totalSuggestions: aiSuggestions || 0,
        lastAILesson: aiPlans?.[0] || null,
        mostUsedFeature: mostUsedFeature ? mostUsedFeature.replace(/_/g, ' ') : 'Lesson Plan Generator'
      });

      // 4. Fetch class schedules
      const { data: schedules } = await supabase
        .from('schedules')
        .select('*, sections(name, grade_level)')
        .eq('teacher_id', userData?.uid)
        .order('start_time', { ascending: true })
        .limit(5);

      // 5. Format classes data for display
      const today = new Date();
      const currentHour = today.getHours();
      
      const formattedClasses = (schedules || []).map((schedule, idx) => {
        const [startHour, startMin] = (schedule.start_time || '09:00').split(':');
        const scheduleHour = parseInt(startHour);
        let status = 'upcoming';
        if (scheduleHour <= currentHour && scheduleHour + 1 > currentHour) {
          status = 'current';
        } else if (scheduleHour < currentHour) {
          status = 'finished';
        }

        return {
          id: schedule.id,
          subject: schedule.subject,
          gradeSection: schedule.sections?.grade_level || 'N/A',
          time: `${schedule.start_time || '09:00'} AM`,
          room: schedule.room_number || 'Room —',
          status: status
        };
      });

      // If no schedules, use fallback classes
      const classesToShow = formattedClasses.length > 0 ? formattedClasses : [
        { id: 1, subject: 'English 101', gradeSection: 'Grade 9-A', time: '08:00 AM', room: 'Room 201', status: 'current' },
        { id: 2, subject: 'Mathematics 102', gradeSection: 'Grade 9-B', time: '09:30 AM', room: 'Room 205', status: 'upcoming' },
        { id: 3, subject: 'Science Lab', gradeSection: 'Grade 10-A', time: '11:00 AM', room: 'Lab Room', status: 'upcoming' },
      ];

      setUpcomingClasses(classesToShow);

      // 6. Fetch real notifications
      const { data: notificationsData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userData?.uid)
        .order('created_at', { ascending: false })
        .limit(4);

      // If no notifications, provide sample ones
      const notificationsToShow = notificationsData && notificationsData.length > 0 
        ? notificationsData.map(notif => ({
            ...notif,
            type: notif.notification_type,
            timestamp: notif.created_at
          }))
        : [
            { id: 1, title: 'New AI suggestion available', message: 'AI has generated suggestions for your next lesson', timestamp: new Date(Date.now() - 15 * 60000), type: 'ai' },
            { id: 2, title: 'Lesson Plan due today', message: 'Complete your pending lesson plans', timestamp: new Date(Date.now() - 45 * 60000), type: 'deadline' },
            { id: 3, title: 'Upcoming class starts soon', message: 'Prepare materials for your next class', timestamp: new Date(Date.now() - 90 * 60000), type: 'class' },
            { id: 4, title: 'New resource available', message: 'Your uploaded worksheet is processed and ready', timestamp: new Date(Date.now() - 120 * 60000), type: 'resource' },
          ];

      setNotifications(notificationsToShow);

      // Calculate totals
      const upcomingToday = classesToShow.filter(c => c.status === 'current' || c.status === 'upcoming').length;
      const upcomingWeek = classesToShow.length;

      setStats({
        totalLessonPlans: lessonCount || 0,
        totalResources: resourceCount || 0,
        aiSuggestionsUsed: aiSuggestions || 0,
        upcomingClassesToday: upcomingToday,
        upcomingClassesWeek: upcomingWeek
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching overview data:', error);
      showToast('Error loading dashboard data: ' + error.message, 'error');
      setLoading(false);
    }
  }, [userData, showToast]);

  useEffect(() => {
    fetchOverviewData();
    
    const channels = [
      supabase.channel('teacher-overview-lesson-plans').on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_plans' }, fetchOverviewData).subscribe(),
      supabase.channel('teacher-overview-worksheets').on('postgres_changes', { event: '*', schema: 'public', table: 'worksheets' }, fetchOverviewData).subscribe(),
      supabase.channel('teacher-overview-schedules').on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, fetchOverviewData).subscribe(),
      supabase.channel('teacher-overview-notifications').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, fetchOverviewData).subscribe(),
    ];
    
    return () => channels.forEach(ch => supabase.removeChannel(ch));
  }, [fetchOverviewData]);

  const getStatusColor = (status) => {
    if (status === 'Draft') return { color: '#d97706', bg: 'rgba(217,119,6,0.12)' };
    if (status === 'Completed') return { color: '#16a34a', bg: 'rgba(22,163,74,0.12)' };
    return { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' };
  };

  const getClassStatusIndicator = (status) => {
    if (status === 'current') return '🟢';
    if (status === 'upcoming') return '🔵';
    return '🔴';
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* WELCOME BANNER */}
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
          Welcome to <span style={{ color: '#FFC542' }}>EduScribe</span>
        </h2>
        <p className="text-xs font-bold tracking-widest text-white/75 uppercase mb-5">Dela Paz National High School</p>
        <div className="inline-flex items-center rounded-2xl px-6 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide text-white/70 uppercase">Academic Year</p>
            <p className="text-base font-extrabold text-white">2025–2026</p>
          </div>
        </div>
      </div>

      {/* 1. QUICK STATISTICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Lesson Plans" value={stats.totalLessonPlans} sub="Created & updated" icon={BookOpen} loading={loading} color="#2563eb" />
        <StatCard label="Resources Uploaded" value={stats.totalResources} sub="Instructional materials" icon={Upload} loading={loading} color="#d97706" />
        <StatCard label="AI Suggestions Used" value={stats.aiSuggestionsUsed} sub="AI-generated lessons" icon={Megaphone} subColor="#16a34a" loading={loading} color="#16a34a" />
        <StatCard label="Upcoming Classes" value={stats.upcomingClassesToday} sub={`${stats.upcomingClassesWeek} this week`} icon={Calendar} subColor="#16a34a" loading={loading} color="#dc2626" />
      </div>

      {/* 2. QUICK ACTIONS */}
      <Card className="p-5 mb-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Btn onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="w-full justify-center">
            <Plus size={16} /> Create Lesson Plan
          </Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/worksheets')} className="w-full justify-center" variant="outline">
            <Upload size={16} /> Upload Resource
          </Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="w-full justify-center" variant="outline">
            <Megaphone size={16} /> AI Generator
          </Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="w-full justify-center" variant="outline">
            <FileText size={16} /> View All Plans
          </Btn>
        </div>
      </Card>

      {/* 3. NOTIFICATIONS PANEL & AI ACTIVITY - Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* NOTIFICATIONS */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} style={{ color: '#3b82f6' }} />
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Notifications</h3>
            </div>
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No new notifications</p>
              ) : notifications.map((notif) => (
                <div key={notif.id} className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: notif.type === 'ai' ? 'rgba(59,130,246,0.1)' : notif.type === 'deadline' ? 'rgba(239,68,68,0.1)' : notif.type === 'class' ? 'rgba(16,185,129,0.1)' : 'rgba(34,197,94,0.1)' }}>
                    {notif.type === 'ai' ? <Megaphone size={18} style={{ color: '#3b82f6' }} /> : notif.type === 'deadline' ? <AlertCircle size={18} style={{ color: '#ef4444' }} /> : notif.type === 'class' ? <Calendar size={18} style={{ color: '#10b981' }} /> : <Check size={18} style={{ color: '#22c55e' }} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{notif.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{notif.message}</p>
                    <p className="text-xs mt-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{formatTime(notif.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* AI ACTIVITY SUMMARY */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={16} style={{ color: '#3b82f6' }} />
            <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: dark ? '#64748b' : '#94a3b8' }}>AI Activity</h3>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Total AI Suggestions</p>
              <p className="text-3xl font-bold" style={{ color: '#3b82f6' }}>{stats.aiSuggestionsUsed}</p>
            </div>
            <div className="h-px" style={{ backgroundColor: dark ? '#334155' : '#e2e8f0' }} />
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Last AI Generated Lesson</p>
              <p className="text-sm" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                {aiActivity.lastAILesson ? aiActivity.lastAILesson.title : 'None yet'}
              </p>
              {aiActivity.lastAILesson && (
                <p className="text-xs mt-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  {new Date(aiActivity.lastAILesson.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="h-px" style={{ backgroundColor: dark ? '#334155' : '#e2e8f0' }} />
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Most Used Feature</p>
              <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{aiActivity.mostUsedFeature}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 4. RECENT LESSON PLANS */}
      <Card className="p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Recent Lesson Plans</h3>
          <button onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="text-xs font-semibold text-blue-500 hover:text-blue-700">View All →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                {['Title', 'Subject', 'Grade Level', 'Date Created', 'Last Updated', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8"><Loader2 className="animate-spin text-blue-500 mx-auto" size={20} /></td></tr>
              ) : recentLessonPlans.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No lesson plans yet</td></tr>
              ) : recentLessonPlans.map((plan, idx) => (
                <TR key={plan.id}>
                  <TD><span className="font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{plan.title || '—'}</span></TD>
                  <TD>{plan.subject || '—'}</TD>
                  <TD>{plan.grade_level || '—'}</TD>
                  <TD>{new Date(plan.created_at).toLocaleDateString()}</TD>
                  <TD>{new Date(plan.updated_at || plan.created_at).toLocaleDateString()}</TD>
                  <TD>
                    <Badge color={getStatusColor(plan.status || 'Draft').color} bg={getStatusColor(plan.status || 'Draft').bg}>
                      {plan.status || 'Draft'}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. UPCOMING CLASSES SCHEDULE */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Upcoming Classes Schedule</h3>
          <button onClick={() => navigate('/teacher-dashboard/attendance')} className="text-xs font-semibold text-blue-500 hover:text-blue-700">View Calendar →</button>
        </div>
        <div className="space-y-3">
          {upcomingClasses.map((cls) => (
            <div key={cls.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
              <div className="text-2xl mt-1">{getClassStatusIndicator(cls.status)}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{cls.subject}</p>
                  <p className="text-sm font-medium" style={{ color: '#3b82f6' }}>{cls.time}</p>
                </div>
                <div className="flex gap-3 text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  <span>{cls.gradeSection}</span>
                  <span>•</span>
                  <span>{cls.room}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default OverviewTab;
