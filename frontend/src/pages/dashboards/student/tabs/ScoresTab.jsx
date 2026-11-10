// ============================================
// FILE: src/pages/dashboards/student/tabs/ScoresTab.jsx
// SCORES TAB — a summary of the student's RELEASED scores, per subject.
// Not an official grade. Reads only the shared student graph (no queries of
// its own); unreleased work shows as an "awaiting results" count, never a score.
// ============================================

import { useMemo, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { Card, Badge, StatCard } from '../hooks';
import { INFO } from '../badgeTones';
import { Btn } from '../../teacher/shared/ui';
import { formatManila } from '../../../../lib/taskFormatting';
import { useStudentData } from '../StudentDataContext';
import PageHeader from '../PageHeader';
import { overallScores, scoresBySubject } from '../scoresView';

const SubjectScores = ({ subject }) => {
  const [open, setOpen] = useState(false);
  const listId = `scores-${subject.key}`;
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--text)' }}>{subject.name}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Average</dt>
          <dd className="mt-1 text-2xl font-bold leading-none" style={{ color: 'var(--text)' }}>
            {subject.percent === null ? '—' : `${subject.percent}%`}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Released</dt>
          <dd className="mt-1 text-2xl font-bold leading-none" style={{ color: 'var(--text)' }}>
            {subject.items.length} / {subject.assigned}
          </dd>
        </div>
      </dl>
      {subject.awaiting > 0 && (
        <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>{subject.awaiting} awaiting results</p>
      )}
      {subject.items.length > 0 && (
        <>
          <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(value => !value)}
            className="mt-3 min-h-11 px-4 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {open ? 'Hide released scores' : `Show released scores (${subject.items.length})`}
          </button>
          {open && (
            <ul id={listId} className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
              {subject.items.map(item => (
                <li key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold min-w-0 [overflow-wrap:anywhere]" style={{ color: 'var(--text)' }}>{item.title}</span>
                      <Badge color={INFO.color} bg={INFO.bg}>{item.type}</Badge>
                    </span>
                    {item.submittedAt && (
                      <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        Submitted {formatManila(item.submittedAt, { time: false })}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                    {item.score}/{item.total} · {item.percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
};

const ScoresTab = () => {
  const { graph, loading, refresh } = useStudentData();
  const loadError = !!graph && !!graph.fatalError;
  const ready = !!graph && !loadError;
  const overall = useMemo(() => (ready ? overallScores(graph) : null), [graph, ready]);
  const subjects = useMemo(() => (ready ? scoresBySubject(graph) : []), [graph, ready]);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Scores" subtitle="Your released scores by subject."
        onRefresh={refresh} refreshLabel="Refresh scores" />
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Based on your released scores only. This is not an official grade.
      </p>

      {loading && !graph ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={{ color: 'var(--text-muted)' }} /></div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <p role="alert" className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Could not load your scores.</p>
          <p className="mb-3" style={{ color: 'var(--text-muted)' }}>This is a loading problem, not an empty list. Check your connection and try again.</p>
          <div className="flex justify-center"><Btn className="min-h-11" onClick={refresh}>Retry</Btn></div>
        </Card>
      ) : ready ? (
        <>
          <section aria-label="Overall" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Overall average" icon={BarChart3}
              value={overall.percent === null ? '—' : `${overall.percent}%`}
              sub={`${overall.count} released ${overall.count === 1 ? 'score' : 'scores'}`} />
          </section>
          {overall.count === 0 && (
            <Card className="p-8 mb-6 text-center">
              <p style={{ color: 'var(--text-muted)' }}>No released scores yet.</p>
            </Card>
          )}
          {subjects.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {subjects.map(subject => <SubjectScores key={subject.key} subject={subject} />)}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};

export default ScoresTab;
