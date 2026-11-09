import { describe, expect, it } from 'vitest';
import { formatCountdown, formatManila, manilaInstant } from './taskFormatting';

describe('manilaInstant', () => {
  it('reads a naive due_at as Manila wall-clock time (+08:00)', () => {
    expect(manilaInstant('2099-01-15T23:59:00').toISOString()).toBe('2099-01-15T15:59:00.000Z');
    expect(manilaInstant('2099-01-15 23:59').toISOString()).toBe('2099-01-15T15:59:00.000Z');
  });

  it('keeps a value that already has an offset', () => {
    expect(manilaInstant('2099-01-15T23:59:00Z').toISOString()).toBe('2099-01-15T23:59:00.000Z');
    expect(manilaInstant('2099-01-15T23:59:00+00:00').toISOString()).toBe('2099-01-15T23:59:00.000Z');
  });

  it('returns null for nothing or junk', () => {
    expect(manilaInstant(null)).toBeNull();
    expect(manilaInstant('')).toBeNull();
    expect(manilaInstant('not a date')).toBeNull();
  });
});

describe('formatManila', () => {
  it('formats in Manila time whatever the runtime timezone', () => {
    expect(formatManila('2099-01-15T23:59:00')).toBe('Jan 15, 2099, 11:59 PM');
    expect(formatManila('2026-11-09T17:30:00Z')).toBe('Nov 10, 2026, 1:30 AM');
    expect(formatManila('2026-11-09T17:30:00Z', { time: false })).toBe('Nov 10, 2026');
    expect(formatManila(null)).toBe('');
  });
});

describe('countdown from a Manila due time', () => {
  it('counts to the Manila deadline, not the browser-local one', () => {
    const now = new Date('2099-01-15T14:59:00Z'); // 10:59 PM in Manila
    expect(formatCountdown(manilaInstant('2099-01-15T23:59:00'), now).text).toBe('1h 0m left');
    expect(formatCountdown(manilaInstant(null), now).text).toBe('No deadline');
  });
});
