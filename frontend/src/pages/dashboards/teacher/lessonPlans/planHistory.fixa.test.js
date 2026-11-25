// U-PDF-T-FIX-A: History and dates of the lesson plan view come only from stored timestamps.
import { describe, expect, it } from 'vitest';
import { planHistory, planViewDate } from './planHistory';

const plan = { id: 'p1', created_at: '2026-11-18T06:14:00Z', updated_at: '2026-11-20T02:05:00Z' };

describe('planHistory', () => {
  it('lists Created, Edited and each Worksheet generated, newest first', () => {
    const events = planHistory(plan, [{ id: 'w1', title: 'Quiz 1', created_at: '2026-11-19T01:00:00Z' }]);
    expect(events.map(e => e.label)).toEqual(['Edited', 'Worksheet generated', 'Created']);
    expect(events[1].detail).toBe('Quiz 1');
  });

  it('no Edited when the plan was not changed after it was created (one minute of slack)', () => {
    expect(planHistory({ ...plan, updated_at: '2026-11-18T06:14:30Z' }).map(e => e.label)).toEqual(['Created']);
  });

  it('skips missing or broken dates and returns nothing without a plan', () => {
    expect(planHistory({ id: 'p', created_at: null, updated_at: 'not a date' }, [{ id: 'w', created_at: '' }])).toEqual([]);
    expect(planHistory(null)).toEqual([]);
  });

  it('dates read in Manila time; a broken date is empty, never "Invalid Date"', () => {
    expect(planViewDate('2026-11-20T02:05:00Z')).toBe('Nov 20, 2026, 10:05 AM');
    expect(planViewDate('')).toBe('');
    expect(planViewDate('nope')).toBe('');
  });
});
