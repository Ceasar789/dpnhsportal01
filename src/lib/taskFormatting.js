// ============================================
// FILE: src/lib/taskFormatting.js
// How a deadline is described to a student, and how the builder's date and
// time inputs become one timestamp. Pure — no React, no Supabase — because
// the countdown is the most visible thing on the dashboard and getting it
// wrong is the kind of error a reader trusts rather than questions.
// ============================================

export const TASK_TYPES = ['worksheet', 'assignment', 'quiz', 'project'];

export const TASK_TYPE_LABELS = {
  worksheet: 'Worksheet',
  assignment: 'Assignment',
  quiz: 'Quiz',
  project: 'Project',
};

// What "due Sep 25" means when the teacher sets a date and leaves the time.
export const DEFAULT_DUE_TIME = '23:59';

// A plain local timestamp string, deliberately without a timezone offset:
// due_at is a TIMESTAMP WITHOUT TIME ZONE, and the whole school is in one
// timezone. Sending an offset would store a shifted wall-clock time.
export function combineDateAndTime(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  if (!date) return null;
  const time = String(timeStr || '').trim() || DEFAULT_DUE_TIME;
  return `${date}T${time}:00`;
}

// "Now", expressed the same way combineDateAndTime expresses a deadline: a
// plain local wall-clock string with no timezone offset. Needed wherever a
// naive TIMESTAMP WITHOUT TIME ZONE column (due_at, expires_at) is compared
// against "now" in a PostgREST filter — new Date().toISOString() would send
// UTC, which is offset from the school's local time and would make rows
// expire early or late by that offset.
export function localNowTimestamp(now = new Date()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatCountdown(dueAt, now = new Date()) {
  if (!dueAt) return { text: 'No deadline', tone: 'none', isLate: false };

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return { text: 'No deadline', tone: 'none', isLate: false };
  }

  const ms = due.getTime() - new Date(now).getTime();

  // Exactly on the deadline is not yet late — the student had that instant.
  if (ms < 0) {
    const late = Math.abs(ms);
    const text = late >= DAY
      ? `Late by ${Math.floor(late / DAY)}d ${Math.floor((late % DAY) / HOUR)}h`
      : late >= HOUR
        ? `Late by ${Math.floor(late / HOUR)}h ${Math.floor((late % HOUR) / MINUTE)}m`
        : `Late by ${Math.max(1, Math.floor(late / MINUTE))}m`;
    return { text, tone: 'late', isLate: true };
  }

  const text = ms >= DAY
    ? `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h left`
    : ms >= HOUR
      ? `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m left`
      : ms >= MINUTE
        ? `${Math.floor(ms / MINUTE)}m left`
        : `${Math.floor(ms / 1000)}s left`;

  const tone = ms < DAY ? 'urgent' : ms < 3 * DAY ? 'soon' : 'normal';
  return { text, tone, isLate: false };
}
