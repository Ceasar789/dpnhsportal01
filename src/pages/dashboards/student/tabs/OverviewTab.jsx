// ============================================
// FILE: src/pages/dashboards/student/tabs/OverviewTab.jsx
// STUDENT OVERVIEW TAB — Supabase
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
//
// Grade level, section and student ID come from the enrolment record and
// the students table — profiles has never had year/section/avg_grade/
// attendance_rate/student_no columns, which is why this tab used to show
// dashes and zeros forever.
//
// "Worksheet Performance" (never "Average Grade" or a subject grade): the
// mean of score/total_points across this student's RELEASED worksheet
// submissions, each worksheet weighted equally. The capstone's approved
// scope excludes a gradebook, so this is deliberately not an aggregate of
// anything else and nothing aggregates it further.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  BookOpen, CalendarCheck, CheckCircle, ClipboardList, Clock, FileText, Loader2, RefreshCw
} from 'lucide-react';
import { useTheme, useToast, Card, StatCard } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';

const OverviewTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { Toast } = useToast();

  const [info, setInfo] = useState({
    name: userData?.name || 'Student',
    studentId: null, gradeLevel: null, section: null,
  });
  const [performance, setPerformance] = useState(null);   // { percent, count }
  const [attendance, setAttendance] = useState(null);     // { percent, present, total }
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchOverview = useCallback(async () => {
    // The banner reads `loading` now, so bailing without clearing it would
    // leave "Loading your enrolment…" on screen forever rather than falling
    // back to a static line.
    if (!userData?.uid) { setLoading(false); return; }
    setLoading(true);

    // Grade level and section come from the enrolment record — profiles has
    // never had year/section/avg_grade/attendance_rate columns, which is why
    // this tab showed dashes and zeros.
    // No .limit(1): section_students is UNIQUE on (section_id, student_id),
    // so a re-sectioned student can hold two rows both marked active. Taking
    // an arbitrary one made the banner's section vary between loads and hid
    // the other section's worksheets — while the Worksheets tab, which lets
    // RLS decide, listed both. Ordered so the banner at least picks the same
    // one every time.
    const { data: enrolment, error: enrolError } = await withRetry(
      () => supabase.from('section_students')
        .select('section_id, sections(name, grade_level)')
        .eq('student_id', userData.uid).eq('status', 'active')
        .order('section_id'),
      { label: 'Student enrolment fetch' }
    );
    if (enrolError) {
      console.warn('Student enrolment fetch failed —', enrolError.message);
      setLoadError(true); setLoading(false); return;
    }

    const enrolments = enrolment || [];
    const enrolled = enrolments[0] || null;
    const sectionIds = enrolments.map(e => e.section_id).filter(Boolean);

    const [idResult, attResult, scoreResult, subResult, postResult] = await Promise.all([
      withRetry(() => supabase.from('students').select('student_number, lrn').eq('id', userData.uid).maybeSingle(),
        { label: 'Student number fetch' }),
      withRetry(() => supabase.from('attendance').select('status').eq('student_id', userData.uid),
        { label: 'Student attendance fetch' }),
      // Two reads rather than one, deliberately. The scores are fetched with
      // released = true IN THE QUERY, so an unreleased score never crosses
      // the wire at all — RLS returns the whole row, so filtering in JS would
      // still put a number the student is not meant to see in their devtools.
      // The second read is status only, which the pending count needs for
      // every submission regardless of release.
      withRetry(() => supabase.from('worksheet_submissions')
        .select('worksheet_id, score, total_points')
        .eq('student_id', userData.uid).eq('released', true),
        { label: 'Student released scores fetch' }),
      withRetry(() => supabase.from('worksheet_submissions')
        .select('worksheet_id, status')
        .eq('student_id', userData.uid),
        { label: 'Student submission statuses fetch' }),
      sectionIds.length > 0
        ? withRetry(() => supabase.from('worksheet_sections')
            .select('id, worksheet_id, due_at').in('section_id', sectionIds),
            { label: 'Student worksheet postings fetch' })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (idResult.error || attResult.error || scoreResult.error || subResult.error || postResult.error) {
      const first = idResult.error || attResult.error || scoreResult.error || subResult.error || postResult.error;
      console.warn('Student overview load failed —', first.message);
      setLoadError(true); setLoading(false); return;
    }

    setLoadError(false);
    setInfo({
      name: userData?.name || 'Student',
      studentId: idResult.data?.student_number || idResult.data?.lrn || null,
      gradeLevel: enrolled?.sections?.grade_level || null,
      section: enrolled?.sections?.name || null,
    });

    // Already released-only by the query above; the remaining filter just
    // skips a worksheet worth zero points, which would divide by zero.
    // A released row with a NULL score would read as 0% and drag the mean
    // down — a teacher who released before entering a score should not cost
    // the student a number they never earned.
    const released = (scoreResult.data || [])
      .filter(s => s.score !== null && s.score !== undefined && Number(s.total_points) > 0);
    setPerformance(released.length === 0 ? null : {
      percent: Math.round(
        released.reduce((sum, s) => sum + (Number(s.score) / Number(s.total_points)) * 100, 0) / released.length
      ),
      count: released.length,
    });

    // attendance.status is stored capitalised ('Present', 'Absent', 'Late',
    // 'Excused') — that is what the teacher's tab writes and what the CHECK
    // constraint allows. Compared case-insensitively anyway, and identically
    // to the student's own Attendance tab: if the two ever disagreed about a
    // row, the same dashboard would show two different percentages.
    const attRows = attResult.data || [];
    const presentCount = attRows.filter(r => String(r.status || '').toLowerCase() === 'present').length;
    setAttendance(attRows.length === 0 ? null : {
      percent: Math.round((presentCount / attRows.length) * 100),
      present: presentCount,
      total: attRows.length,
    });

    // Pending: posted to my section, not yet past due, and I have not
    // submitted it.
    const submittedIds = new Set(
      (subResult.data || []).filter(s => s.status !== 'in_progress').map(s => s.worksheet_id)
    );
    // A worksheet is due FOR the whole of its due date. due_at is a TIMESTAMP
    // and the teacher picks a plain date, so "due Sep 25" is stored as
    // 2026-09-25 00:00:00 — comparing against that directly dropped the
    // worksheet from this list at midnight entering the day it was due, while
    // the Worksheets tab still listed it and still accepted an answer.
    const endOfDueDay = (value) => {
      const d = new Date(value);
      d.setHours(23, 59, 59, 999);
      return d;
    };
    const now = new Date();
    const open = (postResult.data || [])
      .filter(p => !submittedIds.has(p.worksheet_id))
      .filter(p => !p.due_at || endOfDueDay(p.due_at) >= now)
      // Undated worksheets sort last, not first: mapping null to the epoch
      // put "No due date" above something due tomorrow.
      .sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at) - new Date(b.due_at);
      });

    const openIds = open.map(p => p.worksheet_id);
    let sheets = [];
    if (openIds.length > 0) {
      const { data, error } = await withRetry(
        () => supabase.from('worksheets').select('id, title, subject').in('id', openIds),
        { label: 'Upcoming worksheets fetch' }
      );
      if (error) {
        console.warn('Upcoming worksheets fetch failed —', error.message);
        setLoadError(true); setLoading(false); return;
      }
      sheets = data || [];
    }

    setUpcoming(open.map(p => ({
      id: p.id,
      title: sheets.find(w => w.id === p.worksheet_id)?.title || 'Worksheet',
      subject: sheets.find(w => w.id === p.worksheet_id)?.subject || '',
      due: p.due_at ? new Date(p.due_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date',
    })));

    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  return (
    <div className="p-6">
      <Toast />

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
            Welcome back, <span style={{ color: 'var(--banner-accent)' }}>{info.name}</span>!
          </h2>
          {/* Three distinct states, never collapsed into one: the read
              failed, the student is genuinely not enrolled, and the student
              is enrolled. Falling back to "Not yet enrolled" on a failed read
              would tell them something false about their own enrolment, and
              silently dropping the ID would look identical to not having
              one. */}
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--banner-subtext)' }}>
            {loading
              ? 'Loading your enrolment…'
              : loadError
                ? 'Could not load your enrolment'
                : (
                  <>
                    {info.gradeLevel && info.section
                      ? `${info.gradeLevel} · ${info.section}`
                      : 'Not yet enrolled in a section'}
                    {info.studentId ? ` · ID: ${info.studentId}` : ''}
                  </>
                )}
          </p>
        </div>
        <div className="hidden sm:flex items-center rounded-xl px-6 py-3 flex-shrink-0" style={{ backgroundColor: 'var(--banner-pill-bg)', border: '1px solid var(--banner-pill-border)' }}>
          <div>
            <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'var(--banner-subtext)' }}>School Year</p>
            <p className="text-lg font-extrabold" style={{ color: 'var(--banner-text)' }}>2025–2026</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Worksheet Performance"
          value={loading ? <Loader2 className="animate-spin" size={20} />
            : loadError ? '—'
            : performance ? `${performance.percent}%` : '—'}
          sub={loadError ? 'Could not load'
            : performance ? `${performance.count} worksheet${performance.count === 1 ? '' : 's'}`
            : 'No scores yet'}
          icon={BookOpen}
          color="#2563eb"
        />
        <StatCard
          label="Attendance"
          value={loading ? <Loader2 className="animate-spin" size={20} />
            : loadError ? '—'
            : attendance ? `${attendance.percent}%` : '—'}
          sub={loadError ? 'Could not load'
            : attendance ? `${attendance.present} of ${attendance.total} days`
            : 'Not yet recorded'}
          icon={CalendarCheck}
          color="#16a34a"
        />
        <StatCard
          label="Pending Tasks"
          value={loading ? <Loader2 className="animate-spin" size={20} />
            : loadError ? '—' : upcoming.length.toString()}
          sub={loadError ? 'Could not load'
            : upcoming.length === 0 ? 'Nothing due'
            : `worksheet${upcoming.length === 1 ? '' : 's'} due`}
          icon={ClipboardList}
          subColor="#d97706"
          color="#d97706"
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            Upcoming Tasks
          </h2>
          <button onClick={fetchOverview} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        {/* loading is checked before loadError so pressing Retry visibly does
            something — the other cards spin, and this one used to sit frozen
            on its error message until the refetch finished. */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
          ) : loadError ? (
            <div className="text-center py-8">
              <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Could not load your tasks.</p>
              <p className="mb-3" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Check your connection and try again.</p>
              <button onClick={fetchOverview} className="h-9 px-4 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
            </div>
          ) : upcoming.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={32} className="mx-auto mb-2" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
              <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>No upcoming tasks yet.</p>
              <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>You’re caught up for now. Check Announcements for academic updates, reminders, and upcoming schedules.</p>
            </div>
          ) : (
            upcoming.map(task => (
              <div key={task.id} className="flex items-center gap-4 p-4 rounded-lg"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: dark ? '#1e3a5f' : '#eff6ff' }}>
                  <FileText size={20} style={{ color: '#3b82f6' }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{task.title}</p>
                  <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{task.subject}</p>
                </div>
                <div className="flex items-center gap-1 text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  <Clock size={14} /> Due {task.due}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};

export default OverviewTab;
