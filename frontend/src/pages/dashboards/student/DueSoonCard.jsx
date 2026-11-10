// Overview card: unfinished tasks due today and this week (Manila time), with
// the soonest few linking to the Tasks tab. Definitions are in taskGroups.js.
import { Link } from 'react-router-dom';
import { CalendarClock, Loader2 } from 'lucide-react';
import { formatManila } from '../../../lib/taskFormatting';
import { Card } from './hooks';
import { dueSoon, groupOf } from './taskGroups';

// The Tasks tab cannot open one task from a link, so an item goes to its
// view (To do or Upcoming), narrowed to its subject when it has one.
const linkFor = (row, now) => {
  const params = new URLSearchParams({ view: groupOf(row, now) });
  if (row.sheet.subject_id) params.set('subject', row.sheet.subject_id);
  return `/student-dashboard/tasks?${params}`;
};

const DueSoonCard = ({ rows, now, loading, loadError }) => {
  const soon = !loading && !loadError ? dueSoon(rows, now) : null;
  const count = (label, value) => (
    <div className="min-w-0">
      <dt className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="mt-1 text-2xl font-bold leading-none" style={{ color: 'var(--text)' }}>
        {loading ? <Loader2 className="animate-spin" size={20} aria-label="Loading" /> : loadError ? '—' : value}
      </dd>
    </div>
  );
  return (
    <Card className="p-5 mb-6">
      <section aria-label="Due today and this week">
        <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: 'var(--text)' }}>
          <CalendarClock size={18} aria-hidden="true" style={{ color: 'var(--text-muted)' }} /> Due today / this week
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          {count('Due today', soon?.todayCount)}
          {count('This week', soon?.weekCount)}
        </dl>
        {loadError ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>Could not load your tasks.</p>
        ) : soon && (soon.items.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>Nothing due this week. Nice work!</p>
        ) : (
          <ul className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
            {soon.items.map(row => (
              <li key={row.assignee.task_id} style={{ borderColor: 'var(--border)' }}>
                <Link to={linkFor(row, now)} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 min-h-11 py-2 rounded-lg">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold [overflow-wrap:anywhere]" style={{ color: 'var(--text)' }}>{row.sheet.title}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{row.subjectName || row.sheet.subject}</span>
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Due {formatManila(row.assignee.due_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
      </section>
    </Card>
  );
};

export default DueSoonCard;
