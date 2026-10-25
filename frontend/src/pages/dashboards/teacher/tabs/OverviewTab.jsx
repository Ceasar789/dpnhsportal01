// ============================================
// FILE: src/pages/dashboards/teacher/tabs/OverviewTab.jsx
// TEACHER OVERVIEW TAB
// All panels read real data only — no sample/fallback rows. Panels with no
// data yet show an honest empty state instead of invented content.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import {
  BookOpen, FileText, Megaphone, Plus, Upload,
  Calendar, Sparkles
} from 'lucide-react';
import { Card, Badge, Btn } from '../shared/ui';
import { savedPlanType } from '../lessonPlans/savedPlanType';

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
  draft:     { label: 'Draft',     color: 'var(--badge-yellow-fg)', bg: 'var(--badge-yellow-bg)' },
  published: { label: 'Published', color: 'var(--badge-green-fg)', bg: 'var(--badge-green-bg)' },
  archived:  { label: 'Archived',  color: 'var(--text-muted)', bg: 'var(--card2)' },
};
const getStatusStyle = (status) => STATUS_STYLES[(status || 'draft').toLowerCase()] || STATUS_STYLES.draft;

const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString();
};

const MetricCard = ({ label, value, sub, icon: Icon, primary, loading, onClick }) => (
  <button type="button" onClick={onClick}
    className={`w-full min-w-0 rounded-xl p-5 text-left transition-shadow hover:shadow-sm ${primary ? 'sm:col-span-2 xl:col-span-1' : ''}`}
    style={{ background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
    <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: primary ? 'var(--banner-accent)' : 'var(--text-muted)' }}>
      <Icon size={18} aria-hidden="true" />{label}
    </span>
    <span className={`block mt-4 font-bold leading-none ${primary ? 'text-4xl' : 'text-3xl'}`} style={{ color: 'var(--text)' }}>
      {loading ? '—' : value}
    </span>
    <span className="block mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{loading ? 'Loading…' : sub}</span>
  </button>
);

const OverviewTab = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalLessonPlans: 0,
    totalResources: 0,
    aiGeneratedPlans: 0,
    manualPlans: 0,
    otherPlans: 0,
    classesToday: 0,
    classesThisWeek: 0,
  });
  const [recentLessonPlans, setRecentLessonPlans] = useState([]);
  const [lastAILesson, setLastAILesson] = useState(null);
  const [academicYear, setAcademicYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(false);

  const fetchOverviewData = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);
    setOverviewError(false);
    try {
      // Settings is the source for the official year shown in Overview
      // banners; teaching-load queries retain their clock-derived year.
      const { data: schoolSettings, error: settingsErr } = await withRetry(
        () => supabase.from('school_settings').select('school_year').eq('id', 1).single(),
        { label: 'Academic year fetch' }
      );
      if (settingsErr || !schoolSettings?.school_year) throw settingsErr || new Error('Academic year unavailable');
      setAcademicYear(schoolSettings.school_year);

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

      // Only validated structured documents count as Manual ILAW. Read the
      // non-AI candidates in pages so legacy HTML and damaged records stay
      // separate without downloading every AI-generated document.
      let manualPlans = 0;
      const pageSize = 100;
      for (let start = 0; ; start += pageSize) {
        const { data: candidates, error: typesErr } = await withRetry(
          () => supabase.from('lesson_plans')
            .select('id, teacher_id, ai_generated, objectives')
            .eq('teacher_id', userData.uid)
            .or('ai_generated.eq.false,ai_generated.is.null')
            .order('id', { ascending: true })
            .range(start, start + pageSize - 1),
          { label: 'Saved lesson plan types fetch' }
        );
        if (typesErr) throw typesErr;
        const rows = candidates || [];
        manualPlans += rows.filter(plan => savedPlanType(plan) === 'manual').length;
        if (rows.length < pageSize) break;
      }

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

      setStats({
        totalLessonPlans: lessonCount || 0,
        totalResources: resourceCount || 0,
        aiGeneratedPlans: aiCount || 0,
        manualPlans,
        otherPlans: Math.max(0, (lessonCount || 0) - (aiCount || 0) - manualPlans),
        classesToday: todays.filter(c => c.status !== 'finished').length,
        classesThisWeek: allSchedules.length,
      });
    } catch (error) {
      console.error('Error fetching overview data:', error);
      setOverviewError(true);
    } finally {
      setLoading(false);
    }
  }, [userData?.uid]);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Dashboard Overview</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Your lesson plans, resources, and classes for today.</p>
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          Academic Year {loading ? 'Loading…' : overviewError ? 'Unavailable' : academicYear}
        </p>
      </header>

      {overviewError && (
        <Card className="p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
          <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm" style={{ color: 'var(--text)' }}>Dashboard data could not be loaded. Check your connection and try again.</p>
            <Btn variant="outline" onClick={fetchOverviewData}>Retry dashboard</Btn>
          </div>
        </Card>
      )}
      {!overviewError && (
        <>
          {loading && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading dashboard data…</p>}

          <section aria-label="Teaching metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard label="Total Lesson Plans" value={stats.totalLessonPlans} sub="Created and updated"
              icon={BookOpen} primary loading={loading} onClick={() => navigate('/teacher-dashboard/lesson-plans')} />
            <MetricCard label="Total Worksheets" value={stats.totalResources} sub="Created or uploaded"
              icon={Upload} loading={loading} onClick={() => navigate('/teacher-dashboard/worksheets')} />
            <MetricCard label="AI-Generated Plans" value={stats.aiGeneratedPlans} sub={`${stats.manualPlans} Manual ILAW · ${stats.otherPlans} other saved`}
              icon={Sparkles} loading={loading} onClick={() => navigate('/teacher-dashboard/lesson-plans')} />
            <MetricCard label="Classes Remaining Today" value={stats.classesToday} sub={`${stats.classesThisWeek} scheduled in total`}
              icon={Calendar} loading={loading} onClick={() => navigate('/teacher-dashboard/attendance')} />
          </section>
        </>
      )}

      <Card className="p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Btn onClick={() => navigate('/teacher-dashboard/lesson-plans')} className="w-full justify-center" variant="pastel"><Plus size={16} aria-hidden="true" />Create Lesson Plan</Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/worksheets')} className="w-full justify-center" variant="pastel"><Upload size={16} aria-hidden="true" />Upload Resource</Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/grades')} className="w-full justify-center" variant="pastel"><FileText size={16} aria-hidden="true" />Worksheet Scores</Btn>
          <Btn onClick={() => navigate('/teacher-dashboard/announcements')} className="w-full justify-center" variant="pastel"><Megaphone size={16} aria-hidden="true" />Announcements</Btn>
        </div>
      </Card>

      {!overviewError && (
        <>
          <Card className="p-5 min-w-0" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Recent Lesson Plans</h2>
              <button type="button" onClick={() => navigate('/teacher-dashboard/lesson-plans')}
                className="text-sm font-semibold hover:underline" style={{ color: 'var(--banner-accent)' }}>View all lesson plans →</button>
            </div>
            {loading ? (
              <p className="py-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading lesson plans…</p>
            ) : recentLessonPlans.length === 0 ? (
              <p className="py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No lesson plans yet.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {recentLessonPlans.map(plan => {
                  const status = getStatusStyle(plan.status);
                  return (
                    <li key={plan.id} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <p className="font-semibold break-words" style={{ color: 'var(--text)' }}>{plan.title || 'Untitled lesson plan'}</p>
                        <p className="text-sm mt-1 break-words" style={{ color: 'var(--text-muted)' }}>
                          {plan.subject || 'Subject unavailable'}{plan.grade_level ? ` · ${plan.grade_level}` : ''}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          Created {formatDate(plan.created_at)}{plan.updated_at && plan.updated_at !== plan.created_at ? ` · Updated ${formatDate(plan.updated_at)}` : ''}
                        </p>
                      </div>
                      {plan.status?.toLowerCase() !== 'draft' && plan.status && (
                        <div className="shrink-0"><Badge color={status.color} bg={status.bg}>{status.label}</Badge></div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Lesson Planning Activity</h2>
            {loading ? <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading AI activity…</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>AI-generated plans</p><p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{stats.aiGeneratedPlans}</p></div>
                <div className="min-w-0"><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Last AI-generated lesson</p><p className="text-sm font-medium break-words" style={{ color: 'var(--text)' }}>{lastAILesson?.title || 'None yet'}</p>{lastAILesson && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(lastAILesson.created_at)}</p>}</div>
                <div><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plan types</p><p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{stats.aiGeneratedPlans} AI · {stats.manualPlans} Manual ILAW · {stats.otherPlans} other</p></div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default OverviewTab;
