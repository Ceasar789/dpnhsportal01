import { describe, it, expect } from 'vitest';
import {
  TASK_TYPES, TASK_TYPE_LABELS, DEFAULT_DUE_TIME,
  formatCountdown, combineDateAndTime,
} from './taskFormatting';

const NOW = new Date('2026-09-21T10:00:00');

describe('TASK_TYPES', () => {
  it('is the four types the database allows, in display order', () => {
    expect(TASK_TYPES).toEqual(['worksheet', 'assignment', 'quiz', 'project']);
  });

  it('has a label for every type', () => {
    TASK_TYPES.forEach(t => expect(typeof TASK_TYPE_LABELS[t]).toBe('string'));
  });
});

describe('combineDateAndTime', () => {
  it('joins a date and a time into a local timestamp string', () => {
    expect(combineDateAndTime('2026-09-25', '17:00')).toBe('2026-09-25T17:00:00');
  });

  it('falls back to the default time when none is given', () => {
    expect(combineDateAndTime('2026-09-25', '')).toBe(`2026-09-25T${DEFAULT_DUE_TIME}:00`);
  });

  it('returns null without a date, because a deadline needs a day', () => {
    expect(combineDateAndTime('', '17:00')).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('says so when there is no deadline at all', () => {
    const r = formatCountdown(null, NOW);
    expect(r.tone).toBe('none');
    expect(r.isLate).toBe(false);
    expect(r.text).toBe('No deadline');
  });

  it('counts days and hours when the deadline is far off', () => {
    const r = formatCountdown('2026-09-25T00:00:00', NOW);
    expect(r.text).toBe('3d 14h left');
    expect(r.tone).toBe('normal');
    expect(r.isLate).toBe(false);
  });

  it('is urgent inside twenty-four hours', () => {
    const r = formatCountdown('2026-09-21T15:22:00', NOW);
    expect(r.text).toBe('5h 22m left');
    expect(r.tone).toBe('urgent');
  });

  it('is soon between one and three days', () => {
    expect(formatCountdown('2026-09-23T10:00:00', NOW).tone).toBe('soon');
  });

  it('counts minutes only in the last hour', () => {
    expect(formatCountdown('2026-09-21T10:45:00', NOW).text).toBe('45m left');
  });

  it('reports seconds in the last minute, so the clock keeps moving', () => {
    expect(formatCountdown('2026-09-21T10:00:30', NOW).text).toBe('30s left');
  });

  it('flips to late once the deadline passes', () => {
    const r = formatCountdown('2026-09-21T07:45:00', NOW);
    expect(r.isLate).toBe(true);
    expect(r.tone).toBe('late');
    expect(r.text).toBe('Late by 2h 15m');
  });

  it('counts late in days once it has been that long', () => {
    expect(formatCountdown('2026-09-18T10:00:00', NOW).text).toBe('Late by 3d 0h');
  });

  it('treats the exact deadline instant as not yet late', () => {
    const r = formatCountdown('2026-09-21T10:00:00', NOW);
    expect(r.isLate).toBe(false);
  });
});
