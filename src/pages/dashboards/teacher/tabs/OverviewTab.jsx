// ============================================
// FILE: src/pages/dashboards/teacher/tabs/OverviewTab.jsx
// TEACHER OVERVIEW TAB
// All panels read real data only — no sample/fallback rows. Panels with no
// data yet show an honest empty state instead of invented content.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import {
  BookOpen, FileText, Megaphone, Plus, Upload,
  Calendar, Loader2, CalendarOff, Sparkles
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, TR, TD, StatCard, Badge, Btn } from '../shared/ui';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Postgres TIME comes back as 'HH:MM:SS' — render it as a readable 12-hour time.
const formatTime = (time) => {
  if (!time) return '—';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m || '00'} ${suffix}`;
};

// lesson_plans.status CHECK is ('draft','published','archived') — all lowercase.
const STATUS_STYLES = {
  draft:     { label: 'Draft',     color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  published: { label: 'Published', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  archived:  { label: 'Archived',  color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};
const getStatusStyle = (status) => STATUS_STYLES[(status || 'draft').toLowerCase()] || STATUS_STYLES.draft;

const OverviewTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalLessonPlans: 0,
    totalResources: 0,
    aiGeneratedPlans: 0,
    manualPlans: 0,
    classesToday: 0,
    classesThisWeek: 0,
  });
  const [recentLessonPlans, setRecentLessonPlans] = useState([]);
  const [todayClasses, setTodayClasses] = useState([]);
  const [lastAILesson, setLastAILesson] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverviewData = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);
    try {
      // ── Lesson plans (total + recent list) ──────────────────────────
      const { data: lessonPlans, count: lessonCount, error: lessonErr } = await withRetry(
        () => supabase
          .from('lesson_plans')
          .select('*', { count: 'exact' })
          .eq('teacher_id', userData.uid)
          .order('created_at', { ascending: false })
          .limit(5),
        { label: 'Recent lesson plans fetch' }
      );
      if (lessonErr) throw lessonErr;
      setRecentLessonPlans(lessonPlans || []);

      // ── Worksheets / resources ──────────────────────────────────────
      const { count: resourceCount, error: resourceErr } = await withRetry(
        () => supabase
          .from('worksheets')
          .select('*', { count: 'exact', head: true })
          .eq('teacher_id', userData.uid),
        { label: 'Worksheets count fetch' }
      );
      if (resourceErr) throw resourceErr;

      // ── AI activity, derived from real lesson plan records ──────────
      const { data: aiPlans, count: aiCount, error: aiErr } = await withRetry(
        () => supabase
          .from('lesson_plans')
          .select('*', { count: 'exact' })
          .eq('teacher_id', userData.uid)
          .eq('ai_generated', true)
          .order('created_at', { ascending: false })
          .limit(1),
        { label: 'AI lesson plans fetch' }
      );
      if (aiErr) throw aiErr;
      setLastAILesson(aiPlans?.[0] || null);

      // ── Class schedule ──────────────────────────────────────────────
      const { data: schedules, error: schedErr } = await withRetry(
        () => supabase
          .from('schedules')
          .select('*, sections(name, grade_level)')
          .eq('teacher_id', userData.uid)
          .order('start_time', { ascending: true }),
        { label: 'Class schedule fetch' }
      );
      if (schedErr) throw schedErr;

      const allSchedules = schedules || [];
      const todayName = DAY_NAMES[new Date().getDay()].toLowerCase();
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const toMinutes = (t) => {
        if (!t) return null;
        const [h, m] = t.split(':');
        return parseInt(h, 10) * 60 + parseInt(m || '0', 10);
      };

      // day_of_week is an unconstrained VARCHAR — compare case-insensitively.
      const todays = allSchedules
        .filter(s => (s.day_of_week || '').trim().toLowerCase() === todayName)
        .map(s => {
          const start = toMinutes(s.start_time);
          const end = toMinutes(s.end_time);
          let status = 'upcoming';
          if (start !== null && end !== null && nowMinutes >= start && nowMinutes < end) status = 'current';
          else if (start !== null && nowMinutes >= (end ?? start)) status = 'finished';

          const sectionLabel = [s.sections?.grade_level, s.sections?.name].filter(Boolean).join(' — ');
          return {
            id: s.id,
            subject: s.subject || 'Untitled subject',
            gradeSection: sectionLabel || 'No section',
            time: `${formatTime(s.start_time)}${s.end_time ? ` – ${formatTime(s.end_time)}` : ''}`,
            room: s.room_number || 'No room set',
            status,
          };
        });
      setTodayClasses(todays);

      setStats({
        totalLessonPlans: lessonCount || 0,
        totalResources: resourceCount || 0,
        aiGeneratedPlans: aiCount || 0,
        manualPlans: Math.max(0, (lessonCount || 0) - (aiCount || 0)),
        classesToday: todays.filter(c => c.status !== 'finished').length,
        classesThisWeek: allSchedules.length,
      });
    } catch (error) {
      console.error('Error fetching overview data:', error);
      showToast('Error loading dashboard data: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [userData?.uid, showToast]);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  // One channel, scoped to this teacher, instead of separate unfiltered ones.
  // (Requires the tables to be added to the supabase_realtime publication
  // before any event actually fires.)
  useEffect(() => {
    if (!userData?.uid) return undefined;
    const channel = supabase
      .channel(`teacher-overview-${userData.uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_plans', filter: `teacher_id=eq.${userData.uid}` }, fetchOverviewData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'worksheets', filter: `teacher_id=eq.${userData.uid}` }, fetchOverviewData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `teacher_id=eq.${userData.uid}` }, fetchOverviewData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userData?.uid, fetchOverviewData]);

  const classDot = (status) => (status === 'current' ? '🟢' : status === 'upcoming' ? '🔵' : '⚪');
  const mutedColor = dark ? '#64748b' : '#94a3b8';
  const textColor = dark ? '#f1f5f9' : '#1a2b4a';

  return (
    <div className="p-6">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* WELCOME BANNER */}
      <div
        className="rounded-2xl px-6 py-5 mb-6 flex items-center gap-4 relative overflow-hidden"
        style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)', boxShadow: '0 4px 16px rgba(25,8,223,.10)' }}
      >
        <img
          src="/capstonelogo.png"
          alt="School Logo"
          className="w-14 h-14 object-contain rounded-full flex-shrink-0"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--banner-text)' }}>
            Welcome to <span style={{ color: '#FEB300' }}>Edu</span><span style={{ color: '#00D4FF' }}>Scribe</span>
          </h2>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--banner-subtext)' }}>Dela Paz National High School</p>
        </div>
        <div className="hidden sm:flex items-center rounded-xl px-6 py-3 flex-shrink-0" style={{ backgroundColor: 'var(--banner-pill-bg)', border: '1px solid var(--banner-pill-border)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'var(--banner-subtext)' }}>Academic Year</p>
            <p className="text-lg font-extrabold" style={{ color: 'var(--banner-text)' }}>2025–2026</p>
          </div>
        </div>
      </div>

      {/* QUICK STATISTICS — each card opens the tab it summarises */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Lesson Plans" value={stats.totalLessonPlans} sub="Created & updated"
          icon={BookOpen} loading={loading} color="#2563eb"
          onClick={() => navigate('/teacher-dashboard/lesson-plans')}
        />
        <StatCard
          label="Resources Uploaded" value={stats.totalResources} sub="Instructional materials"
          icon={Upload} loading={loading} color="#d97706"
          onClick={() => navigate('/teacher-dashboard/worksheets')}
        />
        <StatCard
          label="AI-Generated Plans" value={stats.aiGeneratedPlans} sub={`${stats.manualPlans} created manually`}
          icon={Sparkles} subColor="#16a34a" loading={loading} color="#16a34a"
          onClick={() => navigate('/teacher-dashboard/lesson-plans')}
        />
        <StatCard
          label="Classes Today" value={stats.classesToday} sub={`${stats.classesThisWeek} scheduled in total`}
          icon={Calendar} subColor="#16a34a" loading={loading} color="#dc2626"
          onClick={() => navigate('/teacher-dashboard/attendance')}
        />
      </div>

      {/* QUICK ACTIONS */}
      <Card className="p-5 mb-8">
        <div className="rounded-lg px-4 py-2.5 mb-4" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--banner-text)' }}>Quick Actions</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Btn onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="w-full justify-center" variant="pastel">
            <Plus size={16} /> Create Lesson Plan
          </Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/worksheets')} className="w-full justify-center" variant="pastel">
            <Upload size={16} /> Upload Resource
          </Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/grades')} className="w-full justify-center" variant="pastel">
            <FileText size={16} /> Grades
          </Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/announcements')} className="w-full justify-center" variant="pastel">
            <Megaphone size={16} /> Announcements
          </Btn>
        </div>
      </Card>

      {/* AI ACTIVITY — derived from real lesson_plans records */}
      <Card className="p-5 mb-8">
        <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 mb-4" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
          <Sparkles size={16} style={{ color: 'var(--banner-accent)' }} />
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--banner-text)' }}>AI Activity</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: mutedColor }}>AI-Generated Lesson Plans</p>
            <p className="text-3xl font-bold" style={{ color: '#3b82f6' }}>{loading ? '—' : stats.aiGeneratedPlans}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>Last AI Generated Lesson</p>
            <p className="text-sm font-medium" style={{ color: textColor }}>
              {lastAILesson ? lastAILesson.title : 'None yet'}
            </p>
            {lastAILesson && (
              <p className="text-xs mt-1" style={{ color: mutedColor }}>
                {new Date(lastAILesson.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>AI vs Manual</p>
            <p className="text-sm font-semibold" style={{ color: textColor }}>
              {loading ? '—' : `${stats.aiGeneratedPlans} AI · ${stats.manualPlans} manual`}
            </p>
          </div>
        </div>
      </Card>

      {/* RECENT LESSON PLANS */}
      <Card className="p-5 mb-8">
        <div className="flex items-center justify-between rounded-lg px-4 py-2.5 mb-4" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--banner-text)' }}>Recent Lesson Plans</h3>
          <button onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="text-xs font-semibold hover:underline" style={{ color: 'var(--banner-accent)' }}>View All →</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                {['Title', 'Subject', 'Grade Level', 'Date Created', 'Last Updated', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase" style={{ color: mutedColor }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8"><Loader2 className="animate-spin text-blue-500 mx-auto" size={20} /></td></tr>
              ) : recentLessonPlans.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: mutedColor }}>No lesson plans yet</td></tr>
              ) : recentLessonPlans.map((plan) => {
                const style = getStatusStyle(plan.status);
                return (
                  <TR key={plan.id}>
                    <TD><span className="font-medium" style={{ color: textColor }}>{plan.title || '—'}</span></TD>
                    <TD>{plan.subject || '—'}</TD>
                    <TD>{plan.grade_level || '—'}</TD>
                    <TD>{new Date(plan.created_at).toLocaleDateString()}</TD>
                    <TD>{new Date(plan.updated_at || plan.created_at).toLocaleDateString()}</TD>
                    <TD><Badge color={style.color} bg={style.bg}>{style.label}</Badge></TD>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* TODAY'S CLASSES */}
      <Card className="p-5">
        <div className="flex items-center justify-between rounded-lg px-4 py-2.5 mb-4" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--banner-text)' }}>
            Today's Classes — {DAY_NAMES[new Date().getDay()]}
          </h3>
          <button onClick={() => navigate('/teacher-dashboard/attendance')} className="text-xs font-semibold hover:underline" style={{ color: 'var(--banner-accent)' }}>Go to Attendance →</button>
        </div>
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={20} /></div>
          ) : todayClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8">
              <CalendarOff size={28} style={{ color: mutedColor }} className="mb-3" />
              <p className="text-sm font-medium" style={{ color: textColor }}>No classes scheduled for today</p>
              <p className="text-xs mt-1" style={{ color: mutedColor }}>
                Class schedules are set up by the registrar. Once your schedule is added, your classes appear here.
              </p>
            </div>
          ) : todayClasses.map((cls) => (
            <div key={cls.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
              <div className="text-2xl mt-1">{classDot(cls.status)}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold" style={{ color: textColor }}>{cls.subject}</p>
                  <p className="text-sm font-medium" style={{ color: '#3b82f6' }}>{cls.time}</p>
                </div>
                <div className="flex gap-3 text-xs" style={{ color: mutedColor }}>
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
