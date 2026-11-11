// ============================================
// FILE: src/components/clarity/student/ClarityOverviewTab.jsx
// The Student Overview tab in Clarity (shown only with the Clarity flag on).
// Same data as the classic OverviewTab: the shared graph via useStudentData,
// the user's name via useAuth, overviewSummary (a temporary copy of the
// classic tab's rules) and the existing pure helpers for the due-soon list
// and the countdowns. Every text and state of the classic tab is kept.
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { dueSoon, groupOf, rowsFromGraph } from '../../../pages/dashboards/student/taskGroups';
import { formatCountdown, formatManila, manilaInstant } from '../../../lib/taskFormatting';
import ProgressRing from '../charts/ProgressRing';
import { overviewSummary } from './overviewSummary';

const WRAP = { minWidth: 0, overflowWrap: 'anywhere' };
const TAP = { minHeight: 44 };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// A ring can only draw 0-100; a recorded value outside that is shown as the
// plain number the classic prints, so the visible value never changes.
const drawable = p => (p !== null && p >= 0 && p <= 100 ? p : null);

// Same link as the classic DueSoonCard: the item's view, plus its subject.
const linkFor = (row, now) => {
  const params = new URLSearchParams({ view: groupOf(row, now) });
  if (row.sheet.subject_id) params.set('subject', row.sheet.subject_id);
  return `/student-dashboard/tasks?${params}`;
};

// One KPI tile: a ring when there is a percentage, the no-data text when
// there is none (never 0%), otherwise the plain value (loading, failed, count).
const Kpi = ({ label, value, sub, ring = null, empty = null, unit = '' }) => (
  <div className="x-card x-kpi">
    {/* With a ring, its caption carries the label (no second copy). */}
    {ring === null && <p className="x-kl">{label}</p>}
    {ring !== null
      ? <ProgressRing value={ring} detail={label} unit={unit} />
      : empty
        ? <p className="x-empty" style={{ padding: '12px 0', textAlign: 'left' }}>{empty}</p>
        : <p className="x-kv">{value}</p>}
    <p className="x-kd">{sub}</p>
  </div>
);

const DueSoon = ({ rows, now, loading, loadError }) => {
  const soon = !loading && !loadError ? dueSoon(rows, now) : null;
  const count = (label, value) => (
    <div style={{ minWidth: 0 }}>
      <dt className="x-kl">{label}</dt>
      <dd className="x-kv" style={{ margin: 0 }}>{loading ? 'Loading…' : loadError ? '—' : value}</dd>
    </div>
  );
  return (
    <section aria-label="Due today and this week" className="x-card x-pad" style={{ marginBottom: 16 }}>
      <h2 className="x-ct">Due today / this week</h2>
      <dl className="x-pair" style={{ marginTop: 16 }}>
        {count('Due today', soon?.todayCount)}
        {count('This week', soon?.weekCount)}
      </dl>
      {loadError ? (
        <p className="x-cs" style={{ marginTop: 16 }}>Could not load your tasks.</p>
      ) : soon && (soon.items.length === 0 ? (
        <p className="x-cs" style={{ marginTop: 16 }}>Nothing due this week. Nice work!</p>
      ) : (
        <ul className="x-rows" style={{ marginTop: 12 }}>
          {soon.items.map(row => (
            <li key={row.assignee.task_id}>
              <Link to={linkFor(row, now)} className="x-rail" style={{ ...TAP, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                <span className="g">
                  <span className="t" style={{ display: 'block', ...WRAP }}>{row.sheet.title}</span>
                  <span className="m" style={{ display: 'block' }}>{row.subjectName || row.sheet.subject}</span>
                </span>
                <span className="m">Due {formatManila(row.assignee.due_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
};

const Subjects = ({ subjects, tasksBySubject, loading, loadError, onRetry }) => {
  // One interval for the whole list, as in the classic SubjectCards.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <p className="x-empty" role="status">Loading your subjects…</p>;
  if (loadError) {
    return (
      <div className="x-empty">
        <p className="x-ct">Could not load your subjects.</p>
        <p className="x-cs" style={{ margin: '4px 0 12px' }}>Check your connection and try again.</p>
        <button type="button" className="x-btn" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (subjects.length === 0) {
    return (
      <div className="x-empty">
        <p className="x-ct">No subjects scheduled yet.</p>
        <p className="x-cs">Your section has no class schedule yet — check back once one is set up.</p>
      </div>
    );
  }
  return (
    <div className="x-grid3">
      {subjects.map(subject => {
        const bucket = tasksBySubject[subject.id] || { total: 0, pendingCount: 0, nearestDue: null };
        const countdown = formatCountdown(bucket.pendingCount > 0 ? manilaInstant(bucket.nearestDue) : null, now);
        return (
          <Link key={subject.id} to={`/student-dashboard/tasks?subject=${subject.id}`} className="x-card x-pad"
            style={{ ...TAP, display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <span className="x-ct" style={{ display: 'block', ...WRAP }}>{subject.name}</span>
            {bucket.total === 0 ? (
              <span className="x-cs" style={{ display: 'block' }}>No tasks</span>
            ) : (
              <>
                <span className="x-cs" style={{ display: 'block', marginBottom: 8 }}>{bucket.pendingCount} pending</span>
                <span className={countdown.tone === 'late' ? 'x-badge er' : 'x-badge'}>{countdown.text}</span>
              </>
            )}
          </Link>
        );
      })}
    </div>
  );
};

const ClarityOverviewTab = () => {
  const { userData } = useAuth();
  const { graph, loading, refresh } = useStudentData();
  const loadError = !!graph && !!(graph.fatalError || graph.scheduleError);
  const { info, performance, attendance, subjects, tasksBySubject, pendingCount } = useMemo(
    () => overviewSummary(graph, userData?.name), [graph, userData?.name]);
  const [now] = useState(() => new Date());
  const taskRows = useMemo(() => (graph && !loadError ? rowsFromGraph(graph) : []), [graph, loadError]);

  const settled = !loading && !loadError;
  const wide = useMediaQuery('(min-width: 640px)'); // the classic's sm: breakpoint for School Year
  const busy = loading ? 'Loading…' : '—';
  const fail = text => (loadError ? 'Could not load' : text);

  return (
    <div>
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Overview</h1>
          <p className="x-sub">Your subjects, tasks and attendance at a glance.</p>
        </div>
        {refresh && (
          <div className="x-act">
            <button type="button" className="x-iconbtn" onClick={refresh} aria-label="Refresh overview">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="x-card x-pad x-rail" style={{ marginBottom: 16, justifyContent: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="x-ct" style={WRAP}>Welcome back, <span>{info.name}</span>!</h2>
          <p className="x-cs">
            {loading
              ? 'Loading your enrolment…'
              : loadError
                ? 'Could not load your enrolment'
                : (
                  <>
                    {info.gradeLevel && info.section ? `${info.gradeLevel} · ${info.section}` : 'Not yet enrolled in a section'}
                    {info.studentId ? ` · ID: ${info.studentId}` : ''}
                  </>
                )}
          </p>
        </div>
        {settled && info.schoolYear && wide && (
          <div>
            <p className="x-kl">School Year</p>
            <p className="x-ct">{info.schoolYear}</p>
          </div>
        )}
      </div>

      <section aria-label="Your progress" className="x-kpis">
        <Kpi label="Worksheet Performance"
          value={settled && performance ? `${performance.percent}%` : busy} unit="average"
          ring={settled && performance ? drawable(performance.percent) : null}
          empty={settled && !performance ? 'No released scores' : null}
          sub={fail(performance ? plural(performance.count, 'worksheet') : 'No scores yet')} />
        <Kpi label="Attendance"
          value={settled && attendance ? `${attendance.percent}%` : busy} unit="present"
          ring={settled && attendance ? drawable(attendance.percent) : null}
          empty={settled && !attendance ? 'No data yet' : null}
          sub={fail(attendance ? `${attendance.present} of ${attendance.total} days` : 'Not yet recorded')} />
        <Kpi label="Pending Tasks"
          value={loading ? 'Loading…' : loadError ? '—' : String(pendingCount)}
          sub={fail(pendingCount === 0 ? 'Nothing due' : `task${pendingCount === 1 ? '' : 's'} due`)} />
      </section>
      <p style={{ textAlign: 'right', marginBottom: 16 }}>
        <Link to="/student-dashboard/scores" className="x-link" style={TAP}>See scores by subject →</Link>
      </p>

      <DueSoon rows={taskRows} now={now} loading={loading} loadError={loadError} />

      <section className="x-card x-pad" aria-labelledby="clarity-overview-subjects">
        <h2 id="clarity-overview-subjects" className="x-ct" style={{ marginBottom: 16 }}>Your Subjects</h2>
        <Subjects subjects={subjects} tasksBySubject={tasksBySubject} loading={loading} loadError={loadError} onRetry={refresh} />
      </section>
    </div>
  );
};

export default ClarityOverviewTab;
