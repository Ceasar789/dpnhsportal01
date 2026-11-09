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
import { Card, Badge } from './hooks';
import { countdownTone } from './badgeTones';
import { formatCountdown, manilaInstant } from '../../../lib/taskFormatting';
import { Btn } from '../teacher/shared/ui';

// The countdown tone comes from badgeTones.js, shared with TasksTab.jsx, so a
// tone looks the same on both screens.

// subjects: [{ id, name }] — the student's schedule, plus any subject they
// have been given work in, so every task has a card named after its subject.
// tasksBySubject: { [subjectId]: { total, pendingCount, nearestDue } }
// loading / loadError: the subjects+tasks read's own state (distinct from the
// stat cards above it, which can succeed or fail independently).
// onRetry: refetch. onOpen(subjectId): navigate to Tasks filtered.
const SubjectCards = ({ subjects, tasksBySubject, loading, loadError, onRetry, onOpen }) => {
  const muted = { color: 'var(--text-muted)' };

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
        <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>
          Could not load your subjects.
        </p>
        <p className="mb-3" style={muted}>Check your connection and try again.</p>
        <div className="flex justify-center">
          <Btn className="min-h-11" onClick={onRetry}>Retry</Btn>
        </div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>
          No subjects scheduled yet.
        </p>
        <p style={muted}>Your section has no class schedule yet — check back once one is set up.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subjects.map(subject => {
          const bucket = tasksBySubject[subject.id] || { total: 0, pendingCount: 0, nearestDue: null };
          const countdown = formatCountdown(bucket.pendingCount > 0 ? manilaInstant(bucket.nearestDue) : null, now);
          const countdownColors = countdownTone(countdown.tone);
          return (
            <button
              key={subject.id}
              onClick={() => onOpen(subject.id)}
              className="text-left rounded-xl"
            >
              <Card className="p-4 h-full hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'var(--card2)' }}>
                    <BookOpen size={16} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
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
    </div>
  );
};

export default SubjectCards;
