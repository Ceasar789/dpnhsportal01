// ============================================
// FILE: src/lib/formatDate.js
//
// UX-107: every screen formatted its own dates. CalendarTab pinned a long
// en-US format — `toLocaleDateString('en-US', { month:'long', ... })` — while
// NewsTab and MemosTab used the bare `toLocaleDateString()`, which follows
// whatever locale the viewer's browser is set to. The same day read three
// ways depending on which tab you were on.
//
// One helper per shape, called from every site. The raw value stays raw in
// the data and is formatted here at the boundary, so no screen is formatting
// something another screen already formatted.
// ============================================

// en-PH, because this is a Philippine school and the viewer's browser locale
// is not a reason for two admins to read the same date differently.
const LOCALE = 'en-PH';

const parse = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 2 Oct 2026 — the default for table cells and card metadata. */
export function formatDate(value, fallback = '—') {
  const d = parse(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 2 October 2026 — for a heading or a detail view, where there is room. */
export function formatDateLong(value, fallback = '—') {
  const d = parse(value);
  if (!d) return fallback;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 2 Oct 2026, 1:00 PM — when the time of day is part of the fact. */
export function formatDateTime(value, fallback = '—') {
  const d = parse(value);
  if (!d) return fallback;
  return `${formatDate(d)}, ${d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * 5–9 Oct 2026 — a span of days, with the parts both ends share said once.
 *
 * The agenda repeats a multi-day event under every day it covers, so each
 * entry has to say what it is part of; without it a five-day exam week
 * reads as five unrelated events with the same name.
 */
export function formatDateRange(start, end, fallback = '—') {
  const a = parse(start);
  const b = parse(end);
  if (!a) return fallback;
  if (!b || a.getTime() === b.getTime()) return formatDate(a, fallback);
  // Hand them back in order, so a row entered end-first still reads forwards.
  const [from, to] = a <= b ? [a, b] : [b, a];

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  const head = sameMonth
    ? from.toLocaleDateString(LOCALE, { day: 'numeric' })
    : from.toLocaleDateString(LOCALE, sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
  return `${head}–${formatDate(to)}`;
}
