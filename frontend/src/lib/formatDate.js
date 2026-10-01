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
