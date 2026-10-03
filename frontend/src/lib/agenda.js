// ============================================
// FILE: src/lib/agenda.js
//
// Grouping a month's events for the phone agenda.
//
// The grid and the agenda answer different questions. A GRID cell asks
// "what is happening on this day", so a five-day exam week belongs in all
// five cells. An AGENDA is a list of what is on this month, and repeating
// one event five times pushes everything else off the screen — the first
// version of this listed Midterm Examinations five times and School
// Foundation Day four, which is nine rows for two events.
//
// So each event appears once, on the first day of the month it touches.
// An event that began last month is listed on day 1, carrying its real
// range, because "this started before you got here and is still running"
// is the thing a reader needs to know.
// ============================================

const pad = (n) => String(n).padStart(2, '0');

/** The yyyy-mm-dd bounds of a month, as the date columns store them. */
export function monthBounds(year, monthIndex) {
  const start = `${year}-${pad(monthIndex + 1)}-01`;
  const end = `${year}-${pad(monthIndex + 1)}-${pad(new Date(year, monthIndex + 1, 0).getDate())}`;
  return { start, end };
}

/**
 * One entry per event, grouped under the day it should be listed on.
 *
 * @param {Array<{event_date: string, end_date?: string, event_type?: string}>} events
 * @param {number} year
 * @param {number} monthIndex  0-11, as Date gives it
 * @param {string} [typeFilter] only this event_type, when set
 * @returns {Array<{ds: string, day: number, events: Array}>} ascending by day
 */
export function agendaGroups(events, year, monthIndex, typeFilter = '') {
  const { start: monthStart, end: monthEnd } = monthBounds(year, monthIndex);
  const byDay = new Map();

  for (const e of events) {
    if (!e?.event_date) continue;
    if (typeFilter && e.event_type !== typeFilter) continue;

    const from = e.event_date;
    const to = e.end_date || e.event_date;
    // A range stored backwards still covers the days between its ends.
    const [first, last] = from <= to ? [from, to] : [to, from];
    if (last < monthStart || first > monthEnd) continue;

    // Clamped, so something that began last month lands on day 1 rather
    // than vanishing out of the list entirely.
    const ds = first < monthStart ? monthStart : first;
    if (!byDay.has(ds)) byDay.set(ds, []);
    byDay.get(ds).push(e);
  }

  return [...byDay.keys()].sort()
    .map((ds) => ({ ds, day: Number(ds.slice(8, 10)), events: byDay.get(ds) }));
}
