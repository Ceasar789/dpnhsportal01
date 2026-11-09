// Pure helpers for the student Attendance tab: totals, the rate, months and
// dates. No React, no Supabase. Dates are attendance.date values (a DATE
// column, "YYYY-MM-DD"), which are calendar days, not instants.
import { formatManila, manilaDateToday } from '../../../lib/taskFormatting';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Attendance status is stored capitalised ('Present', 'Absent', 'Late',
// 'Excused'). Normalising on read means either casing renders correctly.
export const statusKey = row => String(row?.status || '').toLowerCase();
export const KNOWN_STATUSES = ['present', 'late', 'absent', 'excused'];

// Present / Late / Absent / Excused counts, anything else as `other`.
export const attendanceTotals = rows => {
  const totals = { present: 0, late: 0, absent: 0, excused: 0, other: 0, total: rows.length };
  rows.forEach(row => {
    const key = statusKey(row);
    if (KNOWN_STATUSES.includes(key)) totals[key] += 1;
    else totals.other += 1;
  });
  return totals;
};

// The rate rule, unchanged from before and identical to the Overview card:
// days Present divided by all recorded rows; Late and Excused count as not present.
export const attendanceRate = totals => (totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : 0);
export const RATE_RULE = 'Rate = days Present ÷ all recorded days. Late and Excused count as not present.';

// "Mar 13, 2030" for the same calendar day in any browser timezone. A
// date-only value is read as Manila midnight and formatted in Manila time.
export const formatAttendanceDate = value => {
  const text = String(value || '').trim();
  if (!text) return '—';
  return formatManila(DATE_ONLY.test(text) ? `${text}T00:00:00` : text, { time: false }) || text;
};

// "2030-03" for a row's date, or null.
export const monthOf = value => {
  const text = String(value || '').trim();
  return DATE_ONLY.test(text) ? text.slice(0, 7) : null;
};

export const currentManilaMonth = (now = new Date()) => manilaDateToday(now).slice(0, 7);

// "March 2030" for "2030-03".
export const monthLabel = key => new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' })
  .format(new Date(`${key}-01T00:00:00Z`));

// Months to offer, newest first: every month with a row, plus the current one.
export const monthOptions = (rows, now = new Date()) => {
  const months = new Set(rows.map(row => monthOf(row.date)).filter(Boolean));
  months.add(currentManilaMonth(now));
  return [...months].sort().reverse();
};
