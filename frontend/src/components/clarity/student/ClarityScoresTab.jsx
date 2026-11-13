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
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const WRAP = { minWidth: 0, overflowWrap: 'anywhere' };
const NO_RELEASED = 'No released scores';
const EMPTY_STYLE = { padding: '12px 0', textAlign: 'left' };
// A ring can only draw 0-100 (its centre would read 100% for 120), so a
// recorded value outside that is shown as the plain number the classic
// prints. Same guard as ClarityOverviewTab. A value that is not a number at
// all (NaN) is treated as no data, never printed.
const drawable = p => (p !== null && p >= 0 && p <= 100 ? p : null);
const usable = p => typeof p === 'number' && Number.isFinite(p);
const percentText = p => (usable(p) ? `${p}%` : '—');
// The rings get no `label`: ProgressRing draws its label as a <b> that
// .o-ring b positions over the ring. The visible headings carry it instead.
// G8: no `unit` either: its caption inside a 64px ring was about 6px and
// unreadable, so the centre shows only the percentage and "Average" sits
// beside the ring.
const releasedCount = n => `${n} released ${n === 1 ? 'score' : 'scores'}`;

const SubjectCard = ({ subject }) => {
  const [open, setOpen] = useState(false);
  const listId = `scores-${subject.key}`;
  return (
    <article className="x-card x-sc-card" aria-labelledby={`${listId}-name`}>
      <div className="x-sc-top">
        <h2 id={`${listId}-name`} className="x-sc-name" style={WRAP}>{subject.name}</h2>
        <div className="x-sc-avg">
          {!usable(subject.percent)
            ? <p className="x-empty" style={EMPTY_STYLE}>{NO_RELEASED}</p>
            : drawable(subject.percent) === null
              ? <p className="x-kv">{percentText(subject.percent)}</p>
              : <span className="x-sc-ring"><ProgressRing value={subject.percent} detail={`${subject.name} average`} /></span>}
        </div>
        <p className="x-cs x-sc-sub">Average</p>
      </div>
      <p className="x-sc-rel"><span className="x-kl">Released</span><b className="x-sc-num">{subject.items.length} / {subject.assigned}</b></p>
      {subject.awaiting > 0 && <p className="x-cs x-sc-await">{subject.awaiting} awaiting results</p>}
      {subject.items.length > 0 && (
        <>
          <button type="button" className="x-btn x-sc-btn" aria-expanded={open} aria-controls={listId}
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
                  <span className="t" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.score}/{item.total} · {percentText(item.percent)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
};

// L2: one score card while it loads: name, ring, caption.
const SCORE_CARD_SKELETON = (
  <div className="x-sc-top">
    <p className="x-sc-name"><Skeleton inline h="0.8em" w="60%" /></p>
    <div className="x-sc-avg"><span className="x-sc-ring"><Skeleton w="100%" h="100%" r={9999} /></span></div>
    <p className="x-cs x-sc-sub"><Skeleton inline h="0.8em" w="45%" /></p>
  </div>
);

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
        <>
          <p className="x-sr" role="status">Loading your scores…</p>
          <SkeletonGroup className="x-sc-grid">
            <div className="x-card x-sc-card x-sc-overall">{SCORE_CARD_SKELETON}</div>
            {[1, 2, 3].map(i => <div key={i} className="x-card x-sc-card">{SCORE_CARD_SKELETON}</div>)}
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
          <div className="x-sc-grid">
            <section aria-label="Overall" className="x-card x-sc-card x-sc-overall">
              <div className="x-sc-top">
                <p className="x-sc-name">Overall average</p>
                <div className="x-sc-avg">
                  {!usable(overall.percent)
                    ? <p className="x-empty" style={EMPTY_STYLE}>{NO_RELEASED}</p>
                    : drawable(overall.percent) === null
                      ? <p className="x-kv">{percentText(overall.percent)}</p>
                      : <span className="x-sc-ring"><ProgressRing value={overall.percent} detail="Overall average" /></span>}
                </div>
                <p className="x-cs x-sc-sub">{releasedCount(overall.count)}</p>
              </div>
            </section>
            {subjects.map(subject => <SubjectCard key={subject.key} subject={subject} />)}
          </div>
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
