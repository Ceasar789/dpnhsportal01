// formatDateRange — the agenda repeats a multi-day event under every day it
// covers, so each entry has to say what span it belongs to.
//
// These assert the SHAPE of the range rather than literal strings. The day,
// month and year ordering comes from the runtime's locale data — this
// repo's Node renders en-PH US-style, a browser does not — and pinning one
// of those spellings would test the ICU build, not this function.
import { describe, expect, it } from 'vitest';
import { formatDate, formatDateRange } from './formatDate';

describe('formatDateRange', () => {
  it('ends with the full closing date', () => {
    expect(formatDateRange('2026-10-05', '2026-10-09'))
      .toBe(`5–${formatDate('2026-10-09')}`);
  });

  it('says a shared month once', () => {
    // Only the day number survives on the left when both ends share a month.
    const [head] = formatDateRange('2026-10-05', '2026-10-09').split('–');
    expect(head).toBe('5');
  });

  it('keeps both months when they differ', () => {
    const [head] = formatDateRange('2026-09-28', '2026-10-02').split('–');
    expect(head).toMatch(/Sep/);
    expect(head, 'the year is repeated inside one year').not.toMatch(/2026/);
  });

  it('keeps both years when they differ', () => {
    const [head] = formatDateRange('2026-12-30', '2027-01-02').split('–');
    expect(head).toMatch(/Dec/);
    expect(head).toMatch(/2026/);
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
