// ============================================
// FILE: src/components/clarity/student/ClarityScoresTab.jsx
// The Student Scores tab in Clarity (shown only with the Clarity flag on).
// Same data as the classic ScoresTab: the shared student graph through
// useStudentData and the pure helpers in scoresView.js. Nothing is fetched,
// computed differently or invented here; every text and state of the
// classic tab is kept.
// ============================================

import { useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useStudentData } from '../../../pages/dashboards/student/StudentDataContext';
import { overallScores, scoresBySubject } from '../../../pages/dashboards/student/scoresView';
import { formatManila } from '../../../lib/taskFormatting';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const WRAP = { minWidth: 0, overflowWrap: 'anywhere' };
const NO_RELEASED = 'No released scores';
// A bar can only fill 0-100%, so a recorded value outside that (120, -20)
// is printed as the classic prints it, with no bar. A value that is not a
// number at all (NaN) is treated as no data, never printed.
const drawable = p => (p !== null && p >= 0 && p <= 100 ? p : null);
const usable = p => typeof p === 'number' && Number.isFinite(p);
const percentText = p => (usable(p) ? `${p}%` : '—');
const releasedCount = n => `${n} released ${n === 1 ? 'score' : 'scores'}`;

// U-PDF-S (design p10): one row per subject: icon, name, "N released scores"
// (and "N awaiting results"), a bar and the percent. The row keeps its list of
// released scores behind "Show released scores (n)" (your Q2 answer; the classic wording).
const SubjectRow = ({ subject }) => {
  const [open, setOpen] = useState(false);
  const listId = `scores-${subject.key}`;
  const width = drawable(subject.percent);
  return (
    <li className="x-sc-row">
      <article aria-labelledby={`${listId}-name`}>
      <div className="x-sc-line">
        <span className="x-sc-ico" aria-hidden="true"><BarChart3 size={16} /></span>
        <div className="x-sc-copy">
          <h3 id={`${listId}-name`} className="x-sc-name" style={WRAP}>{subject.name}</h3>
          <p className="x-cs x-sc-sub">{[releasedCount(subject.items.length), subject.awaiting > 0 && `${subject.awaiting} awaiting results`].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="x-sc-bar" aria-hidden="true">{width !== null && <i style={{ width: `${width}%` }} />}</span>
        <b className="x-sc-pct">{usable(subject.percent) ? percentText(subject.percent) : '—'}<span className="x-sr">{usable(subject.percent) ? ' average' : ` ${NO_RELEASED}`}</span></b>
      </div>
      {subject.items.length > 0 && (
        <div className="x-sc-more">
          <button type="button" className="x-btn x-sc-btn" aria-expanded={open} aria-controls={listId}
            onClick={() => setOpen(value => !value)}>
            {open ? 'Hide released scores' : `Show released scores (${subject.items.length})`}
          </button>
          {open && (
            <ul id={listId} className="x-rows" style={{ marginTop: 8 }}>
              {subject.items.map(item => (
                <li key={item.id}>
                  <div className="g">
                    <div className="x-rail" style={{ justifyContent: 'flex-start', gap: 8 }}>
                      <span className="t" style={WRAP}>{item.title}</span>
                      <span className="x-badge in">{item.type}</span>
                    </div>
                    {item.submittedAt && <span className="m">Submitted {formatManila(item.submittedAt, { time: false })}</span>}
                  </div>
                  <span className="t" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.score}/{item.total} · {percentText(item.percent)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </article>
    </li>
  );
};

// The single highest released score and its subject (real rows only).
const highestOf = subjects => subjects.flatMap(subject => subject.items.map(item => ({ ...item, subject: subject.name })))
  .filter(item => usable(item.percent))
  .reduce((best, item) => (!best || item.percent > best.percent ? item : best), null);

const Stat = ({ label, value, caption }) => (
  <div className="x-card x-sc-stat">
    <p className="x-kl">{label}</p>
    <p className="x-kv">{value}</p>
    <p className="x-cs">{caption}</p>
  </div>
);

const STAT_SKELETON = (
  <>
    <p className="x-kl"><Skeleton inline h="0.8em" w="50%" /></p>
    <p className="x-kv"><Skeleton inline h="0.8em" w="40%" /></p>
    <p className="x-cs"><Skeleton inline h="0.8em" w="60%" /></p>
  </>
);

const ClarityScoresTab = () => {
  const { graph, loading, refresh } = useStudentData();
  const loadError = !!graph && !!graph.fatalError;
  const ready = !!graph && !loadError;
  const overall = useMemo(() => (ready ? overallScores(graph) : null), [graph, ready]);
  const subjects = useMemo(() => (ready ? scoresBySubject(graph) : []), [graph, ready]);
  const highest = useMemo(() => highestOf(subjects), [subjects]);

  return (
    <div>
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Scores</h1>
          <p className="x-sub">Your released worksheet scores</p>
        </div>
        {refresh && (
          <div className="x-act">
            <button type="button" className="x-iconbtn" onClick={refresh} aria-label="Refresh scores">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {loading && !graph ? (
        <>
          <p className="x-sr" role="status">Loading your scores…</p>
          <SkeletonGroup className="x-sc-stats">
            {[0, 1, 2].map(i => <div key={i} className="x-card x-sc-stat">{STAT_SKELETON}</div>)}
          </SkeletonGroup>
        </>
      ) : loadError ? (
        <div className="x-card x-pad x-empty">
          <p role="alert" className="x-ct">Could not load your scores.</p>
          <p className="x-cs" style={{ margin: '4px 0 12px' }}>This is a loading problem, not an empty list. Check your connection and try again.</p>
          <button type="button" className="x-btn" onClick={refresh}>Retry</button>
        </div>
      ) : ready ? (
        <>
          <section aria-label="Overall" className="x-sc-stats">
            <Stat label="Overall average" value={usable(overall.percent) ? percentText(overall.percent) : '—'}
              caption="Released scores only. Not an official grade." />
            <Stat label="Released" value={String(overall.count)} caption={overall.count === 1 ? 'score' : 'scores'} />
            <Stat label="Highest" value={highest ? percentText(highest.percent) : '—'} caption={highest ? highest.subject : NO_RELEASED} />
          </section>
          {subjects.length > 0 && (
            <section className="x-card x-pad x-sc-list" aria-labelledby="x-sc-by">
              <h2 id="x-sc-by" className="x-ct">By subject</h2>
              <ul>{subjects.map(subject => <SubjectRow key={subject.key} subject={subject} />)}</ul>
            </section>
          )}
          {overall.count === 0 && (
            <div className="x-card x-empty" style={{ marginTop: 16 }}>
              <p>No released scores yet.</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default ClarityScoresTab;
