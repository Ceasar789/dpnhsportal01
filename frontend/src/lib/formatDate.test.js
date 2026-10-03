// formatDateRange — the agenda repeats a multi-day event under every day it
// covers, so each entry has to say what span it belongs to.
//
// These assert what the range SAYS, not how the runtime spells it. Day,
// month and year ordering comes from the locale data — this repo's Node
// renders en-PH US-style — and pinning one spelling tests the ICU build.
// It is also exactly the assumption that broke the first version of this
// function, so the tests should not repeat it.
import { describe, expect, it } from 'vitest';
import { LOCALE, formatDate, formatDateRange } from './formatDate';

const count = (haystack, needle) => haystack.split(needle).length - 1;

describe('formatDateRange', () => {
  it('names both ends', () => {
    const out = formatDateRange('2026-10-05', '2026-10-09');
    expect(out).toMatch(/\b5\b/);
    expect(out).toMatch(/\b9\b/);
  });

  it('says a shared month and year once', () => {
    const out = formatDateRange('2026-10-05', '2026-10-09');
    expect(count(out, 'Oct'), out).toBe(1);
    expect(count(out, '2026'), out).toBe(1);
  });

  it('names both months when they differ, and the year once', () => {
    const out = formatDateRange('2026-09-28', '2026-10-02');
    expect(count(out, 'Sep'), out).toBe(1);
    expect(count(out, 'Oct'), out).toBe(1);
    expect(count(out, '2026'), out).toBe(1);
  });

  it('names both years when they differ', () => {
    const out = formatDateRange('2026-12-30', '2027-01-02');
    expect(count(out, '2026'), out).toBe(1);
    expect(count(out, '2027'), out).toBe(1);
  });

  it('is a single date when the span is one day', () => {
    expect(formatDateRange('2026-10-05', '2026-10-05')).toBe(formatDate('2026-10-05'));
    expect(formatDateRange('2026-10-05', null)).toBe(formatDate('2026-10-05'));
  });

  it('reads forwards even when the ends arrive backwards', () => {
    expect(formatDateRange('2026-10-09', '2026-10-05'))
      .toBe(formatDateRange('2026-10-05', '2026-10-09'));
  });

  it('falls back rather than printing Invalid Date', () => {
    expect(formatDateRange(null, '2026-10-09')).toBe('—');
    expect(formatDateRange('nonsense', '2026-10-09', 'n/a')).toBe('n/a');
  });
});

// The locale is pinned, not inherited.
//
// A bare toLocaleDateString() follows whatever the viewer's device is set
// to, so the same row reads differently on two phones in the same staff
// room. These assert the helpers go through LOCALE, by comparing against
// an explicit en-PH formatter rather than against a literal string — the
// literal would only be testing this runtime's CLDR data.
describe('the locale is explicit', () => {
  const when = new Date('2026-10-02T13:00:00');

  it('formatDate matches an explicit en-PH short date', () => {
    expect(formatDate(when)).toBe(
      new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(when));
  });

  it('formatDateRange matches an explicit en-PH range', () => {
    const to = new Date('2026-10-06T13:00:00');
    expect(formatDateRange(when, to)).toBe(
      new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
        .formatRange(when, to));
  });

  it('is the Philippines, because the school is', () => {
    expect(LOCALE).toBe('en-PH');
  });
});
