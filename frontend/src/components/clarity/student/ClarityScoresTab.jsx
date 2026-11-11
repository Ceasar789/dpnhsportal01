// ============================================
// FILE: src/components/clarity/student/ClarityScoresTab.jsx
// The Student Scores tab in Clarity (shown only with the Clarity flag on).
// Same data as the classic ScoresTab: the shared student graph through
// useStudentData and the pure helpers in scoresView.js. Nothing is fetched,
// computed differently or invented here; every text and state of the
// classic tab is kept.
// ============================================

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { overallScores, scoresBySubject } from '../../../pages/dashboards/student/scoresView';
import { formatManila } from '../../../lib/taskFormatting';
import ProgressRing from '../charts/ProgressRing';

const WRAP = { minWidth: 0, overflowWrap: 'anywhere' };
const NO_RELEASED = 'No released scores';
// The rings get no `label`: ProgressRing draws its label as a <b> that
// .o-ring b positions over the ring. The visible headings carry it instead.
const releasedCount = n => `${n} released ${n === 1 ? 'score' : 'scores'}`;

const SubjectCard = ({ subject }) => {
  const [open, setOpen] = useState(false);
  const listId = `scores-${subject.key}`;
  return (
    <article className="x-card x-pad" aria-labelledby={`${listId}-name`}>
      <h2 id={`${listId}-name`} className="x-ct" style={WRAP}>{subject.name}</h2>
      <dl className="x-pair" style={{ marginTop: 16 }}>
        <div>
          <dt className="x-kl">Average</dt>
          <dd style={{ margin: 0 }}>
            {subject.percent === null
              ? <p className="x-empty" style={{ padding: '12px 0', textAlign: 'left' }}>{NO_RELEASED}</p>
              : <ProgressRing value={subject.percent} detail={`${subject.name} average`} unit="average" />}
          </dd>
        </div>
        <div>
          <dt className="x-kl">Released</dt>
          <dd className="x-kv" style={{ margin: 0 }}>{subject.items.length} / {subject.assigned}</dd>
        </div>
      </dl>
      {subject.awaiting > 0 && <p className="x-cs" style={{ marginTop: 12 }}>{subject.awaiting} awaiting results</p>}
      {subject.items.length > 0 && (
        <>
          <button type="button" className="x-btn" style={{ marginTop: 12 }} aria-expanded={open} aria-controls={listId}
            onClick={() => setOpen(value => !value)}>
            {open ? 'Hide released scores' : `Show released scores (${subject.items.length})`}
          </button>
          {open && (
            <ul id={listId} className="x-rows" style={{ marginTop: 12 }}>
              {subject.items.map(item => (
                <li key={item.id}>
                  <div className="g">
                    <div className="x-rail" style={{ justifyContent: 'flex-start', gap: 8 }}>
                      <span className="t" style={WRAP}>{item.title}</span>
                      <span className="x-badge in">{item.type}</span>
                    </div>
                    {item.submittedAt && <span className="m">Submitted {formatManila(item.submittedAt, { time: false })}</span>}
                  </div>
                  <span className="t" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.score}/{item.total} · {item.percent}%</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
};

const ClarityScoresTab = () => {
  const { graph, loading, refresh } = useStudentData();
  const loadError = !!graph && !!graph.fatalError;
  const ready = !!graph && !loadError;
  const overall = useMemo(() => (ready ? overallScores(graph) : null), [graph, ready]);
  const subjects = useMemo(() => (ready ? scoresBySubject(graph) : []), [graph, ready]);

  return (
    <div>
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Scores</h1>
          <p className="x-sub">Your released scores by subject.</p>
        </div>
        {refresh && (
          <div className="x-act">
            <button type="button" className="x-iconbtn" onClick={refresh} aria-label="Refresh scores">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <p className="x-banner">Based on your released scores only. This is not an official grade.</p>

      {loading && !graph ? (
        <p className="x-empty" role="status">Loading your scores…</p>
      ) : loadError ? (
        <div className="x-card x-pad x-empty">
          <p role="alert" className="x-ct">Could not load your scores.</p>
          <p className="x-cs" style={{ margin: '4px 0 12px' }}>This is a loading problem, not an empty list. Check your connection and try again.</p>
          <button type="button" className="x-btn" onClick={refresh}>Retry</button>
        </div>
      ) : ready ? (
        <>
          <section aria-label="Overall" className="x-card x-pad" style={{ marginBottom: 16 }}>
            {overall.percent === null
              ? <><p className="x-kl">Overall average</p><p className="x-empty" style={{ padding: '12px 0', textAlign: 'left' }}>{NO_RELEASED}</p></>
              : <ProgressRing value={overall.percent} detail="Overall average" unit="average" />}
            <p className="x-kd">{releasedCount(overall.count)}</p>
          </section>
          {overall.count === 0 && (
            <div className="x-card x-empty" style={{ marginBottom: 16 }}>
              <p>No released scores yet.</p>
            </div>
          )}
          {subjects.length > 0 && (
            <div className="x-grid2">
              {subjects.map(subject => <SubjectCard key={subject.key} subject={subject} />)}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default ClarityScoresTab;
