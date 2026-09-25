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

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import {
  BookOpen, CalendarCheck, ClipboardList, Loader2, RefreshCw
} from 'lucide-react';
import { useTheme, useToast, Card, StatCard } from '../hooks';
import { isOtherTask } from '../../../../lib/otherTask';
import { useStudentData } from '../StudentDataContext';
import SubjectCards from '../SubjectCards';

const OverviewTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { Toast } = useToast();
  const navigate = useNavigate();

  // Every read this tab needs now comes from the one shared graph fetched by
  // StudentDataProvider — the same rows TasksTab reads, so the two screens
  // cannot disagree about a deadline, a submission or what counts as Other,
  // and moving between them costs no queries at all.
  const { graph, loading, refresh } = useStudentData();
  const fetchOverview = refresh;

  // A schedule failure is fatal HERE and not in TasksTab, and both are
  // right: this tab's subject cards ARE the schedule, while TasksTab only
  // needs it to widen its ?subject=other filter and has a safe fallback.
  const loadError = !!graph && !!(graph.fatalError || graph.scheduleError);

  const {
    info, performance, attendance, subjects, tasksBySubject, pendingCount,
  } = useMemo(() => {
    const blank = {
      info: { name: userData?.name || 'Student', studentId: null, gradeLevel: null, section: null },
      performance: null, attendance: null, subjects: [], tasksBySubject: {}, pendingCount: 0,
    };
    if (!graph || graph.fatalError || graph.scheduleError) return blank;

    const enrolled = graph.enrolments[0] || null;
    const info = {
      name: userData?.name || 'Student',
      studentId: graph.studentRecord?.student_number || graph.studentRecord?.lrn || null,
      gradeLevel: enrolled?.sections?.grade_level || null,
      section: enrolled?.sections?.name || null,
    };

    // Already released-only by the query; the remaining filter just skips a
    // worksheet worth zero points, which would divide by zero. A released
    // row with a NULL score would read as 0% and drag the mean down — a
    // teacher who released before entering a score should not cost the
    // student a number they never earned.
    const released = graph.releasedScores
      .filter(s => s.score !== null && s.score !== undefined && Number(s.total_points) > 0);
    const performance = released.length === 0 ? null : {
      percent: Math.round(
        released.reduce((sum, s) => sum + (Number(s.score) / Number(s.total_points)) * 100, 0) / released.length
      ),
      count: released.length,
    };

    // attendance.status is stored capitalised ('Present', 'Absent', 'Late',
    // 'Excused') — that is what the teacher's tab writes and what the CHECK
    // constraint allows. Compared case-insensitively anyway, and identically
    // to the student's own Attendance tab: if the two ever disagreed about a
    // row, the same dashboard would show two different percentages.
    const attRows = graph.attendance;
    const presentCount = attRows.filter(r => String(r.status || '').toLowerCase() === 'present').length;
    const attendance = attRows.length === 0 ? null : {
      percent: Math.round((presentCount / attRows.length) * 100),
      present: presentCount,
      total: attRows.length,
    };

    // Pending: assigned, and no submission whose status is anything other
    // than 'in_progress' — a submitted or checked one is no longer pending,
    // an in-progress one still is, and having none at all is pending too.
    const notPendingIds = new Set(
      graph.submissionStates.filter(s => s.status !== 'in_progress').map(s => s.worksheet_id)
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
    let pendingCount = 0;
    graph.assignees.forEach(a => {
      const sheet = graph.sheetById.get(a.task_id);
      if (!sheet) return; // task deleted out from under the assignment
      const pending = !notPendingIds.has(a.task_id);
      if (pending) pendingCount += 1;
      // Null subject, or a subject not in this student's schedule, both land
      // on Other — nothing assigned may fail to appear somewhere. The exact
      // same rule TasksTab.jsx applies to its ?subject=other filter.
      const key = isOtherTask(sheet.subject_id, graph.cardSubjectIds) ? 'other' : sheet.subject_id;
      bump(key, a.due_at, pending);
    });

    return { info, performance, attendance, subjects: graph.subjects, tasksBySubject: buckets, pendingCount };
  }, [graph, userData?.name]);


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
