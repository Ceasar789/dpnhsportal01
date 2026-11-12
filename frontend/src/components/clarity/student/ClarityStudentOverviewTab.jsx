// ============================================
// FILE: src/components/clarity/student/ClarityStudentOverviewTab.jsx
// The Student Overview in Clarity, final design (real data only). The same
// data as before, with no new read: the shared graph via useStudentData,
// overviewSummary (performance, attendance, pending, enrolment), the
// existing taskGroups helpers for the due-soon list (real due dates and
// states), and the existing scoresView helper for the per-subject averages
// the Scores tab already shows. Every link and action of the previous
// Clarity Overview is kept: Refresh, each due task's link, See scores by
// subject, and each subject's Tasks link (in "Tasks by subject").
// ============================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileText, RefreshCw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { dueSoon, groupOf, rowsFromGraph } from '../../../pages/dashboards/student/taskGroups';
import { scoresBySubject } from '../../../pages/dashboards/student/scoresView';
import { formatManila, manilaInstant } from '../../../lib/taskFormatting';
import ProgressRing from '../charts/ProgressRing';
import RankedBars from '../charts/RankedBars';
import { Subjects } from './ClarityOverviewTab';
import { overviewSummary } from './overviewSummary';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// A ring can only draw 0-100; any other recorded value shows as the number only.
const drawable = p => (p !== null && p >= 0 && p <= 100 ? p : null);
const MANILA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
const dayKey = date => MANILA_DAY.format(date);

// The same link as before: the task's view, plus its subject.
const linkFor = (row, now) => {
  const params = new URLSearchParams({ view: groupOf(row, now) });
  if (row.sheet.subject_id) params.set('subject', row.sheet.subject_id);
  return `/student-dashboard/tasks?${params}`;
};

const Kpi = ({ label, value, sub, ring, icon: Icon }) => (
  <div className="x-card x-kpi">
    <div className="x-ov-kpi">
      <div style={{ minWidth: 0 }}>
        <p className="x-kl">{label}</p>
        <p className="x-kv">{value}</p>
        <p className="x-kd">{sub}</p>
      </div>
      {ring || (Icon && <span className="x-ico" aria-hidden="true"><Icon size={16} /></span>)}
    </div>
  </div>
);

const ClarityStudentOverviewTab = () => {
  const { userData } = useAuth();
  const { graph, loading, refresh } = useStudentData();
  const loadError = !!graph && !!(graph.fatalError || graph.scheduleError);
  const { info, performance, attendance, subjects, tasksBySubject, pendingCount } = useMemo(
    () => overviewSummary(graph, userData?.name), [graph, userData?.name]);
  const [now] = useState(() => new Date());
  const [view, setView] = useState('ranked');
  const settled = !loading && !loadError;
  const rows = useMemo(() => (graph && !loadError ? rowsFromGraph(graph) : []), [graph, loadError]);
  const soon = settled ? dueSoon(rows, now) : null;
  const averages = useMemo(() => (settled ? scoresBySubject(graph) : []), [graph, settled]);
  const withScores = averages.filter(s => s.percent !== null);
  const today = dayKey(now);

  // Loading, failed, or the real value.
  const shown = (value) => (loading ? 'Loading…' : loadError ? 'Could not load' : value);
  const enrolment = settled
    ? [info.gradeLevel && info.section ? `${info.gradeLevel} · ${info.section}` : 'Not yet enrolled in a section',
      info.studentId && `ID: ${info.studentId}`, info.schoolYear && `School Year ${info.schoolYear}`].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="x-sov">
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Overview</h1>
          <p className="x-sub">Your subjects, tasks and attendance at a glance.</p>
          {enrolment && <p className="x-cs x-sov-who">{enrolment}</p>}
          {loadError && <p className="x-cs x-sov-who">Could not load your enrolment</p>}
        </div>
        {refresh && (
          <div className="x-act">
            <button type="button" className="x-iconbtn" onClick={refresh} aria-label="Refresh overview">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <section aria-label="Your progress" className="x-kpis">
        <Kpi label="Worksheet performance"
          value={shown(performance ? `${performance.percent}%` : 'No released scores')}
          sub={settled ? (performance ? `Average of ${plural(performance.count, 'released score')}` : 'No scores yet') : ''}
          ring={settled && performance && drawable(performance.percent) !== null ? (
            <span className="x-sov-ring"><ProgressRing value={performance.percent} label="Worksheet performance" detail={`average of ${plural(performance.count, 'released score')}`} /></span>
          ) : null} />
        <Kpi label="Attendance"
          value={shown(attendance ? `${attendance.percent}%` : 'No data yet')}
          sub={settled ? (attendance ? `${attendance.present} of ${attendance.total} recorded days` : 'Not yet recorded') : ''}
          ring={settled && attendance && drawable(attendance.percent) !== null ? (
            <span className="x-sov-ring"><ProgressRing value={attendance.percent} label="Attendance" detail={`${attendance.present} of ${attendance.total} recorded days present`} /></span>
          ) : null} />
        <Kpi label="Pending tasks" icon={ClipboardList}
          value={shown(String(pendingCount))}
          sub={settled ? (soon.todayCount > 0 ? `${soon.todayCount} due today` : pendingCount === 0 ? 'Nothing due' : `task${pendingCount === 1 ? '' : 's'} due`) : ''} />
      </section>

      <div className="x-cols">
        <section className="x-card x-pad" aria-labelledby="x-sov-due">
          <h2 className="x-ct" id="x-sov-due">Due today and this week</h2>
          <p className="x-cs">
            {loading ? 'Loading your tasks…' : loadError ? 'Could not load your tasks.'
              : `${soon.todayCount} due today · ${soon.weekCount} this week`}
          </p>
          {settled && (soon.items.length === 0 ? (
            <p className="x-empty">Nothing due this week. Nice work!</p>
          ) : (
            <ul className="x-rows x-sov-due">
              {soon.items.map(row => {
                const due = manilaInstant(row.assignee.due_at);
                const isToday = due && dayKey(due) === today;
                return (
                  <li key={row.assignee.task_id}>
                    <Link to={linkFor(row, now)} className="x-sov-task">
                      <span className="x-ico" aria-hidden="true"><FileText size={16} /></span>
                      <span className="x-sov-tcopy">
                        <b>{row.sheet.title}</b>
                        <span className="x-cs">{[row.subjectName || row.sheet.subject, `Due ${formatManila(row.assignee.due_at)}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`x-badge${isToday ? ' wa' : ''}`}>{isToday ? 'Due today' : formatManila(row.assignee.due_at, { time: false })}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </section>

        <section className="x-card x-pad" aria-labelledby="x-sov-subjects">
          <div className="x-krow">
            <div style={{ minWidth: 0 }}>
              <h2 className="x-ct" id="x-sov-subjects">Your subjects</h2>
              <p className="x-cs">Average of released scores</p>
            </div>
            {withScores.length > 1 && (
              <div className="x-seg" role="group" aria-label="Order subjects">
                <button type="button" className={view === 'ranked' ? 'on' : undefined} aria-pressed={view === 'ranked'} onClick={() => setView('ranked')}>Ranked</button>
                <button type="button" className={view === 'bars' ? 'on' : undefined} aria-pressed={view === 'bars'} onClick={() => setView('bars')}>Bars</button>
              </div>
            )}
          </div>
          {loading ? <p className="x-empty" role="status">Loading your scores…</p>
            : loadError ? <p className="x-empty">Could not load your scores.</p>
              : withScores.length === 0 ? <p className="x-empty">No released scores yet.</p> : (
                <div className="x-sov-bars">
                  <RankedBars label="Average of released scores by subject" sorted={view === 'ranked'}
                    rows={withScores.map(s => ({ label: s.name, value: s.percent }))} />
                </div>
              )}
          <p className="x-sov-more"><Link to="/student-dashboard/scores" className="x-link">See scores by subject →</Link></p>
        </section>
      </div>

      <section className="x-card x-pad" aria-labelledby="x-sov-tasks">
        <h2 id="x-sov-tasks" className="x-ct" style={{ marginBottom: 16 }}>Tasks by subject</h2>
        <Subjects subjects={subjects} tasksBySubject={tasksBySubject} loading={loading} loadError={loadError} onRetry={refresh} />
      </section>
    </div>
  );
};

export default ClarityStudentOverviewTab;
