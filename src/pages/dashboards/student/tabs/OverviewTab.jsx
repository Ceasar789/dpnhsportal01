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
  const { showToast, Toast } = useToast();

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
    if (!userData?.uid) return;
    setLoading(true);

    // Grade level and section come from the enrolment record — profiles has
    // never had year/section/avg_grade/attendance_rate columns, which is why
    // this tab showed dashes and zeros.
    const { data: enrolment, error: enrolError } = await withRetry(
      () => supabase.from('section_students')
        .select('section_id, sections(name, grade_level)')
        .eq('student_id', userData.uid).eq('status', 'active').limit(1),
      { label: 'Student enrolment fetch' }
    );
    if (enrolError) {
      console.warn('Student enrolment fetch failed —', enrolError.message);
      setLoadError(true); setLoading(false); return;
    }

    const enrolled = (enrolment || [])[0] || null;
    const sectionId = enrolled?.section_id || null;

    const [idResult, attResult, subResult, postResult] = await Promise.all([
      withRetry(() => supabase.from('students').select('student_number, lrn').eq('id', userData.uid).maybeSingle(),
        { label: 'Student number fetch' }),
      withRetry(() => supabase.from('attendance').select('status').eq('student_id', userData.uid),
        { label: 'Student attendance fetch' }),
      withRetry(() => supabase.from('worksheet_submissions')
        .select('worksheet_id, score, total_points, released, status')
        .eq('student_id', userData.uid),
        { label: 'Student worksheet submissions fetch' }),
      sectionId
        ? withRetry(() => supabase.from('worksheet_sections')
            .select('id, worksheet_id, due_at').eq('section_id', sectionId),
            { label: 'Student worksheet postings fetch' })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (idResult.error || attResult.error || subResult.error || postResult.error) {
      const first = idResult.error || attResult.error || subResult.error || postResult.error;
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

    // Released submissions only — a score the teacher has not released yet is
    // not the student's to see.
    const released = (subResult.data || []).filter(s => s.released && Number(s.total_points) > 0);
    setPerformance(released.length === 0 ? null : {
      percent: Math.round(
        released.reduce((sum, s) => sum + (Number(s.score) / Number(s.total_points)) * 100, 0) / released.length
      ),
      count: released.length,
    });

    // attendance.status is stored capitalized ('Present','Absent','Late',
    // 'Excused') per the CHECK constraint in archives/database-schema.sql
    // and what the teacher's Attendance tab actually writes — NOT the
    // lowercase 'present' the student's own AttendanceTab.jsx compares
    // against (a pre-existing bug there, out of scope for this tab).
    const attRows = attResult.data || [];
    setAttendance(attRows.length === 0 ? null : {
      percent: Math.round((attRows.filter(r => r.status === 'Present').length / attRows.length) * 100),
      present: attRows.filter(r => r.status === 'Present').length,
      total: attRows.length,
    });

    // Pending: posted to my section, not yet past due, and I have not
    // submitted it.
    const submittedIds = new Set(
      (subResult.data || []).filter(s => s.status !== 'in_progress').map(s => s.worksheet_id)
    );
    const now = new Date();
    const open = (postResult.data || [])
      .filter(p => !submittedIds.has(p.worksheet_id))
      .filter(p => !p.due_at || new Date(p.due_at) >= now)
      .sort((a, b) => new Date(a.due_at || 0) - new Date(b.due_at || 0));

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
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--banner-subtext)' }}>
            {info.gradeLevel && info.section
              ? `${info.gradeLevel} · ${info.section}`
              : 'Not yet enrolled in a section'}
            {info.studentId ? ` · ID: ${info.studentId}` : ''}
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
          sub={loadError ? 'Could not load' : upcoming.length === 0 ? 'Nothing due' : 'worksheets due'}
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
        <div className="space-y-3">
          {loadError ? (
            <div className="text-center py-8">
              <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Could not load your tasks.</p>
              <p className="mb-3" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Check your connection and try again.</p>
              <button onClick={fetchOverview} className="h-9 px-4 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
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
