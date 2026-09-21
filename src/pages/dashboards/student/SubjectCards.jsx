// ============================================
// FILE: src/pages/dashboards/student/SubjectCards.jsx
// One card per subject scheduled for the student's section(s): a pending
// count and a live countdown to that subject's nearest deadline. Clicking a
// card opens the Tasks tab filtered to that subject.
//
// The interval that drives every card's countdown lives here, once, exactly
// as it does for the list of rows in TasksTab.jsx — a class with a dozen
// subjects would otherwise spin up a dozen timers.
// ============================================

import React, { useState, useEffect } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { useTheme, Card, Badge } from './hooks';
import { formatCountdown } from '../../../lib/taskFormatting';

// Kept identical to TasksTab.jsx's COUNTDOWN_COLORS so a tone means the same
// thing — visually — on both screens.
const COUNTDOWN_COLORS = {
  late: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  urgent: { color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  soon: { color: '#ca8a04', bg: 'rgba(202,138,4,0.12)' },
  normal: { color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  none: { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

// subjects: [{ id, name }] scheduled for the student's section(s).
// tasksBySubject: { [subjectId | 'other']: { total, pendingCount, nearestDue } }
// loading / loadError: the subjects+tasks read's own state (distinct from the
// stat cards above it, which can succeed or fail independently).
// onRetry: refetch. onOpen(subjectId | 'other'): navigate to Tasks filtered.
const SubjectCards = ({ subjects, tasksBySubject, loading, loadError, onRetry, onOpen }) => {
  const { dark } = useTheme();
  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  // One interval for the whole card list, cleared on unmount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin" style={muted} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-8">
        <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          Could not load your subjects.
        </p>
        <p className="mb-3" style={muted}>Check your connection and try again.</p>
        <button onClick={onRetry} className="h-9 px-4 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
      </div>
    );
  }

  const other = tasksBySubject.other;
  const showOther = other && other.total > 0;

  if (subjects.length === 0 && !showOther) {
    return (
      <div className="text-center py-8">
        <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          No subjects scheduled yet.
        </p>
        <p style={muted}>Your section has no class schedule yet — check back once one is set up.</p>
      </div>
    );
  }

  const cards = [...subjects];
  if (showOther) cards.push({ id: 'other', name: 'Other' });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(subject => {
        const bucket = tasksBySubject[subject.id] || { total: 0, pendingCount: 0, nearestDue: null };
        const countdown = formatCountdown(bucket.pendingCount > 0 ? bucket.nearestDue : null, now);
        const countdownColors = COUNTDOWN_COLORS[countdown.tone] || COUNTDOWN_COLORS.none;
        return (
          <button
            key={subject.id}
            onClick={() => onOpen(subject.id)}
            className="text-left rounded-xl"
          >
            <Card className="p-4 h-full hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: dark ? '#1e3a5f' : '#eff6ff' }}>
                  <BookOpen size={16} style={{ color: '#3b82f6' }} />
                </div>
                <p className="text-sm font-semibold truncate" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                  {subject.name}
                </p>
              </div>
              {bucket.total === 0 ? (
                <p className="text-xs" style={muted}>No tasks</p>
              ) : (
                <>
                  <p className="text-xs mb-2" style={muted}>
                    {bucket.pendingCount} pending
                  </p>
                  <Badge color={countdownColors.color} bg={countdownColors.bg}>{countdown.text}</Badge>
                </>
              )}
            </Card>
          </button>
        );
      })}
    </div>
  );
};

export default SubjectCards;
