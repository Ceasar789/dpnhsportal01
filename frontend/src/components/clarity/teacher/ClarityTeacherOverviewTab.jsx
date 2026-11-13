// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherOverviewTab.jsx
// The Teacher Overview in Clarity (final design, real data only). The same
// reads as the classic OverviewTab, word for word, so the same numbers:
// lesson plans, worksheets, AI-generated plans (with Manual ILAW and other
// saved), classes remaining today, recent lesson plans, the last AI lesson.
// Today's classes are the classic's own list of today's schedule rows (the
// classic computes it to count them); here it is also shown. There is no
// per-month data, so "Lesson planning activity" keeps the classic figures
// instead of a chart. Every classic action goes to the same page.
//
// TEMPORARY word-for-word copies from pages/dashboards/teacher/tabs/OverviewTab.jsx
// (source-parity tested in ClarityTeacherT2Sources.test.js); after the defense
// the classic tab and this one should share them:
//   - the helpers, :20-45
//   - the state, the reads and the effect, :62-213, with one added line
//     (marked "Clarity:") that keeps today's list for display
// ============================================
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization -- the TEMPORARY copies below are the classic tab's own code, word for word, which the linter flags the same way in the classic file (OverviewTab.jsx:80 and :212). */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, FileText, Megaphone, Plus, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { savedPlanType, SAVED_PLAN_TYPE_LABEL } from '../../../pages/dashboards/teacher/lessonPlans/savedPlanType';
import ProgressRing from '../charts/ProgressRing';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

// ---- TEMPORARY copy (OverviewTab.jsx:20-45) ----
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
// ---- end of the copy ----

const STATE_LABEL = { current: 'In progress', finished: 'Finished', upcoming: 'Upcoming' };
const TODAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

const Kpi = ({ label, value, sub, icon: Icon, ring, onClick }) => (
  <button type="button" className="x-card x-kpi x-tov-kpi" onClick={onClick}>
    <span className="x-ov-kpi">
      <span style={{ minWidth: 0 }}>
        <span className="x-kl">{label}</span>
        <span className="x-kv" style={{ display: 'block' }}>{value}</span>
        <span className="x-kd">{sub}</span>
      </span>
      {ring || <span className="x-ico" aria-hidden="true"><Icon size={16} /></span>}
    </span>
  </button>
);

// L2: the four metric tiles while they load: the same tiles, bars for the words.
const KPI_SKELETON = (
  <SkeletonGroup as="section" className="x-kpis">
    {[0, 1, 2, 3].map(i => (
      <span key={i} className="x-card x-kpi x-tov-kpi">
        <span className="x-ov-kpi">
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="x-kl" style={{ display: 'block' }}><Skeleton inline h="0.8em" w="60%" /></span>
            <span className="x-kv" style={{ display: 'block' }}><Skeleton inline h="0.8em" w="3ch" /></span>
            {/* Two words-long bars, so the caption wraps where the real one does. */}
            <span className="x-kd" style={{ display: 'block' }}><Skeleton inline h="0.8em" w={i === 2 ? 110 : 90} /> <Skeleton inline h="0.8em" w={i === 2 ? 60 : 30} /></span>
          </span>
          {/* The last two tiles carry a progress ring once there is data. */}
          {i < 2 ? <Skeleton w={32} h={32} r={9} style={{ flex: 'none' }} /> : <span className="x-tov-ring"><Skeleton w={64} h={64} r={9999} /></span>}
        </span>
      </span>
    ))}
  </SkeletonGroup>
);

// L2: a list card's rows while they load.
const rowsSkeleton = (count, trailing = false) => (
  <SkeletonGroup>
    <ul className="x-rows">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <Skeleton w={32} h={32} r={9} style={{ flex: 'none' }} />
          <span className="x-tov-plan">
            <b style={{ display: 'block' }}><Skeleton inline h="0.8em" w="55%" /></b>
            <span className="x-cs" style={{ display: 'block' }}><Skeleton inline h="0.8em" w="80%" /></span>
          </span>
          {trailing && <span className="x-news-pills"><Skeleton inline h={22} w={56} className="sk-round" /></span>}
        </li>
      ))}
    </ul>
  </SkeletonGroup>
);

const ClarityTeacherOverviewTab = () => {
  const [todaysClasses, setTodaysClasses] = useState([]);
  // ---- TEMPORARY copy (OverviewTab.jsx:62-213) ----
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

      setTodaysClasses(todays); // Clarity: keep today's list for display
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
  // ---- end of the copy ----

  const doneToday = todaysClasses.filter(c => c.status === 'finished').length;
  const go = path => () => navigate(path);
  const yearText = loading ? 'Loading…' : overviewError ? 'Unavailable' : academicYear;

  return (
    <div className="x-tov">
      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Dashboard Overview</h1>
          <p className="x-sub">Your lesson plans, resources, and classes for today · Academic Year {yearText}</p>
        </div>
        <div className="x-act">
          <button type="button" className="x-btn pri" onClick={go('/teacher-dashboard/lesson-plans')}>
            <Plus size={16} aria-hidden="true" /> Create lesson plan
          </button>
        </div>
      </div>

      {overviewError && (
        <div className="x-card x-pad x-rail" role="alert" style={{ marginBottom: 16 }}>
          <span>Dashboard data could not be loaded. Check your connection and try again.</span>
          <button type="button" className="x-btn" onClick={fetchOverviewData}>Retry dashboard</button>
        </div>
      )}
      {!overviewError && loading && <p role="status" className="x-sr">Loading dashboard data…</p>}
      {!overviewError && loading && KPI_SKELETON}

      {!overviewError && !loading && (
        <section className="x-kpis" aria-label="Teaching metrics">
          <Kpi label="Lesson plans" value={stats.totalLessonPlans} sub="Created and updated" icon={BookOpen}
            onClick={go('/teacher-dashboard/lesson-plans')} />
          <Kpi label="Worksheets" value={stats.totalResources} sub="Created or uploaded" icon={Upload}
            onClick={go('/teacher-dashboard/worksheets')} />
          <Kpi label="AI-generated plans" value={stats.aiGeneratedPlans} sub={`${stats.manualPlans} Manual ILAW · ${stats.otherPlans} other saved`} icon={Sparkles}
            ring={stats.totalLessonPlans > 0 ? (
              <span className="x-tov-ring"><ProgressRing value={(stats.aiGeneratedPlans / stats.totalLessonPlans) * 100}
                label="AI-generated share of lesson plans" detail={`${stats.aiGeneratedPlans} of ${stats.totalLessonPlans} lesson plans`} /></span>
            ) : null}
            onClick={go('/teacher-dashboard/lesson-plans')} />
          <Kpi label="Classes left today" value={stats.classesToday} sub={`${stats.classesThisWeek} scheduled in total`} icon={Calendar}
            ring={todaysClasses.length > 0 ? (
              <span className="x-tov-ring"><ProgressRing value={(doneToday / todaysClasses.length) * 100}
                label="Classes finished today" detail={`${doneToday} of ${todaysClasses.length} done`} /></span>
            ) : null}
            onClick={go('/teacher-dashboard/attendance')} />
        </section>
      )}

      <div className="x-cols">
        {!overviewError && (
          <section className="x-card x-pad" aria-labelledby="x-tov-today">
            <div className="x-krow">
              <div style={{ minWidth: 0 }}>
                <h2 className="x-ct" id="x-tov-today">Today's classes</h2>
                <p className="x-cs">{TODAY.format(new Date())}</p>
              </div>
              {!loading && stats.classesToday > 0 && <span className="x-badge in">{stats.classesToday} remaining</span>}
            </div>
            {loading ? (
              <>
                <p className="x-sr">Loading classes…</p>
                <SkeletonGroup>
                  <ol className="x-tov-day">
                    {[0, 1, 2].map(i => (
                      <li key={i}>
                        <b style={{ display: 'block' }}><Skeleton inline h="0.8em" w="70%" /></b>
                        <span className="x-cs" style={{ display: 'block' }}><Skeleton inline h="0.8em" w="45%" /></span>
                      </li>
                    ))}
                  </ol>
                </SkeletonGroup>
              </>
            )
              : todaysClasses.length === 0 ? <p className="x-empty">No classes scheduled today.</p> : (
                <ol className="x-tov-day">
                  {todaysClasses.map(c => (
                    <li key={c.id} className={`x-tov-${c.status}`}>
                      <b>{c.time} · {c.subject} · {c.gradeSection}</b>
                      <span className="x-cs">{STATE_LABEL[c.status]} · {c.room}</span>
                    </li>
                  ))}
                </ol>
              )}
          </section>
        )}

        {!overviewError && (
          <section className="x-card x-pad" aria-labelledby="x-tov-activity">
            <h2 className="x-ct" id="x-tov-activity">Lesson planning activity</h2>
            {loading ? (
              <>
                <p className="x-sr">Loading AI activity…</p>
                <SkeletonGroup>
                  <dl className="x-tov-facts">
                    {[0, 1, 2].map(i => <div key={i}><dt><Skeleton inline h="0.8em" w={120} /></dt><dd><Skeleton inline h="0.8em" w="50%" /></dd></div>)}
                  </dl>
                </SkeletonGroup>
              </>
            ) : (
              <dl className="x-tov-facts">
                <div><dt>AI-generated plans</dt><dd>{stats.aiGeneratedPlans}</dd></div>
                <div><dt>Last AI-generated lesson</dt><dd>{lastAILesson?.title || 'None yet'}{lastAILesson && <span className="x-cs"> · {formatDate(lastAILesson.created_at)}</span>}</dd></div>
                <div><dt>Plan types</dt><dd>{stats.aiGeneratedPlans} AI · {stats.manualPlans} Manual ILAW · {stats.otherPlans} other</dd></div>
              </dl>
            )}
          </section>
        )}
      </div>

      <div className="x-cols">
        {!overviewError && (
          <section className="x-card x-pad" aria-labelledby="x-tov-recent">
            <div className="x-krow">
              <h2 className="x-ct" id="x-tov-recent">Recent lesson plans</h2>
              <button type="button" className="x-link" onClick={go('/teacher-dashboard/lesson-plans')}>View all lesson plans →</button>
            </div>
            {loading ? <><p className="x-sr">Loading lesson plans…</p>{rowsSkeleton(4, true)}</>
              : recentLessonPlans.length === 0 ? <p className="x-empty">No lesson plans yet.</p> : (
                <ul className="x-rows">
                  {recentLessonPlans.map(plan => {
                    const status = getStatusStyle(plan.status);
                    const type = savedPlanType(plan);
                    return (
                      <li key={plan.id}>
                        <span className="x-ico" aria-hidden="true"><FileText size={16} /></span>
                        <span className="x-tov-plan">
                          <b>{plan.title || 'Untitled lesson plan'}</b>
                          <span className="x-cs">
                            {plan.subject || 'Subject unavailable'}{plan.grade_level ? ` · ${plan.grade_level}` : ''} · Created {formatDate(plan.created_at)}{plan.updated_at && plan.updated_at !== plan.created_at ? ` · Updated ${formatDate(plan.updated_at)}` : ''}
                          </span>
                        </span>
                        <span className="x-news-pills">
                          <span className={`x-badge${type === 'ai' ? ' in' : ''}`}>{SAVED_PLAN_TYPE_LABEL[type]}</span>
                          {plan.status?.toLowerCase() !== 'draft' && plan.status && <span className="x-badge">{status.label}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
          </section>
        )}

        <section className="x-card x-pad" aria-labelledby="x-tov-quick">
          <h2 className="x-ct" id="x-tov-quick">Quick actions</h2>
          <div className="x-tov-quick">
            <button type="button" className="x-btn gh" onClick={go('/teacher-dashboard/lesson-plans')}><Plus size={16} aria-hidden="true" /> Create lesson plan</button>
            <button type="button" className="x-btn gh" onClick={go('/teacher-dashboard/worksheets')}><Upload size={16} aria-hidden="true" /> Upload resource</button>
            <button type="button" className="x-btn gh" onClick={go('/teacher-dashboard/grades')}><FileText size={16} aria-hidden="true" /> Grading</button>
            <button type="button" className="x-btn gh" onClick={go('/teacher-dashboard/announcements')}><Megaphone size={16} aria-hidden="true" /> Announcements</button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ClarityTeacherOverviewTab;
