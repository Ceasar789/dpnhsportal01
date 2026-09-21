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
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  BookOpen, CalendarCheck, ClipboardList, Loader2, RefreshCw
} from 'lucide-react';
import { useTheme, useToast, Card, StatCard } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';
import { fetchScheduledSubjectIds, isOtherTask } from '../../../../lib/studentSchedule';
import SubjectCards from '../SubjectCards';

const OverviewTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { Toast } = useToast();
  const navigate = useNavigate();

  const [info, setInfo] = useState({
    name: userData?.name || 'Student',
    studentId: null, gradeLevel: null, section: null,
  });
  const [performance, setPerformance] = useState(null);   // { percent, count }
  const [attendance, setAttendance] = useState(null);     // { percent, present, total }
  // Subjects scheduled for the student's section(s) — the source of the
  // cards, NOT the tasks. A section with no schedule rows yields [].
  const [subjects, setSubjects] = useState([]);
  // { [subjectId | 'other']: { total, pendingCount, nearestDue } }
  const [tasksBySubject, setTasksBySubject] = useState({});
  const [pendingCount, setPendingCount] = useState(0);
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

    const [idResult, attResult, scoreResult, subResult, scheduleResult, assigneeResult] = await Promise.all([
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
      // Subjects on the student's class schedule — the cards' source, NOT
      // the tasks. Shared with TasksTab.jsx via fetchScheduledSubjectIds so
      // the two screens can never derive two different answers for "Other"
      // again (see src/lib/studentSchedule.js for the history of why that
      // matters). Schedules are only populated once an admin has created
      // them, so a student with none yields an empty (not null) set here,
      // which must read as "no subjects scheduled" rather than "no tasks".
      fetchScheduledSubjectIds(userData.uid),
      // What was actually assigned to THIS student — task_assignees, the same
      // source TasksTab.jsx uses, and its due_at, not a posting's — so the
      // two screens never disagree about which deadline applies to them.
      withRetry(() => supabase.from('task_assignees')
        .select('task_id, due_at').eq('student_id', userData.uid),
        { label: 'Student task assignments fetch' }),
    ]);

    if (idResult.error || attResult.error || scoreResult.error || subResult.error
      || scheduleResult.error || assigneeResult.error) {
      const first = idResult.error || attResult.error || scoreResult.error || subResult.error
        || scheduleResult.error || assigneeResult.error;
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

    // scheduleResult already carries both the subject rows (for the cards'
    // names) and the id set (for bucketing) — both computed by the one
    // shared function TasksTab.jsx also calls.
    const { subjects: subjectRows, scheduledSubjectIds: scheduledSubjectIdSet } = scheduleResult;

    // Assigned tasks, joined to their worksheet's subject_id — the same
    // task_assignees source, and the same due_at, that TasksTab.jsx counts
    // down to, so the two screens never quote different deadlines for the
    // same task.
    const assignees = assigneeResult.data || [];
    const taskIds = [...new Set(assignees.map(a => a.task_id))];
    let sheetRows = [];
    if (taskIds.length > 0) {
      const { data, error } = await withRetry(
        () => supabase.from('worksheets').select('id, subject_id').in('id', taskIds),
        { label: 'Student overview tasks fetch' }
      );
      if (error) {
        console.warn('Student overview tasks fetch failed —', error.message);
        setLoadError(true); setLoading(false); return;
      }
      sheetRows = data || [];
    }
    const sheetById = new Map(sheetRows.map(s => [s.id, s]));

    // Pending: assigned, and no submission whose status is anything other
    // than 'in_progress' — a submitted or checked one is no longer pending,
    // an in-progress one still is, and having none at all is pending too.
    const notPendingIds = new Set(
      (subResult.data || []).filter(s => s.status !== 'in_progress').map(s => s.worksheet_id)
    );

    const buckets = {};
    const bump = (key, dueAt, pending) => {
      if (!buckets[key]) buckets[key] = { total: 0, pendingCount: 0, nearestDue: null };
      buckets[key].total += 1;
      if (pending) {
        buckets[key].pendingCount += 1;
        if (dueAt && (!buckets[key].nearestDue || new Date(dueAt) < new Date(buckets[key].nearestDue))) {
          buckets[key].nearestDue = dueAt;
        }
      }
    };
    let totalPending = 0;
    assignees.forEach(a => {
      const sheet = sheetById.get(a.task_id);
      if (!sheet) return; // task deleted out from under the assignment
      const pending = !notPendingIds.has(a.task_id);
      if (pending) totalPending += 1;
      // Null subject, or a subject not in this student's schedule, both land
      // on Other — nothing assigned may fail to appear somewhere. The exact
      // same rule TasksTab.jsx applies to its ?subject=other filter.
      const key = isOtherTask(sheet.subject_id, scheduledSubjectIdSet) ? 'other' : sheet.subject_id;
      bump(key, a.due_at, pending);
    });

    setSubjects(subjectRows.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setTasksBySubject(buckets);
    setPendingCount(totalPending);
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
            : loadError ? '—' : pendingCount.toString()}
          sub={loadError ? 'Could not load'
            : pendingCount === 0 ? 'Nothing due'
            : `task${pendingCount === 1 ? '' : 's'} due`}
          icon={ClipboardList}
          subColor="#d97706"
          color="#d97706"
        />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            Your Subjects
          </h2>
          <button onClick={fetchOverview} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
            <RefreshCw size={14} />
          </button>
        </div>
        <SubjectCards
          subjects={subjects}
          tasksBySubject={tasksBySubject}
          loading={loading}
          loadError={loadError}
          onRetry={fetchOverview}
          onOpen={(subjectId) => navigate(`/student-dashboard/tasks?subject=${subjectId}`)}
        />
      </Card>
    </div>
  );
};

export default OverviewTab;
