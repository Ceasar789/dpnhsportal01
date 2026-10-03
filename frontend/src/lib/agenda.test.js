import { describe, expect, it } from 'vitest';
import { agendaGroups, monthBounds } from './agenda';

const ev = (event_date, end_date, event_type = 'Event') => ({ event_date, end_date, event_type, title: event_date });
const OCT = [2026, 9]; // October 2026

describe('monthBounds', () => {
  it('knows how long a month is', () => {
    expect(monthBounds(2026, 9)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthBounds(2026, 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds(2028, 1).end, 'a leap year is four weeks and a day').toBe('2028-02-29');
  });
});

describe('agendaGroups', () => {
  it('lists a multi-day event once, on its first day', () => {
    const out = agendaGroups([ev('2026-10-19', '2026-10-23')], ...OCT);
    expect(out).toHaveLength(1);
    expect(out[0].ds).toBe('2026-10-19');
    expect(out[0].day).toBe(19);
  });

  it('lists an event that began earlier on day one, not on its own start', () => {
    const out = agendaGroups([ev('2026-09-28', '2026-10-02')], ...OCT);
    expect(out).toHaveLength(1);
    expect(out[0].ds, 'it should be clamped into the visible month').toBe('2026-10-01');
    // The entry still carries the real event, so the range it renders is
    // the full one and not the clamped one.
    expect(out[0].events[0].event_date).toBe('2026-09-28');
  });

  it('drops events from other months entirely', () => {
    const out = agendaGroups([ev('2026-09-01', '2026-09-30'), ev('2026-11-02')], ...OCT);
    expect(out).toEqual([]);
  });

  it('keeps an event that runs past the end of the month', () => {
    const out = agendaGroups([ev('2026-10-30', '2026-11-04')], ...OCT);
    expect(out).toHaveLength(1);
    expect(out[0].day).toBe(30);
  });

  it('groups several events that start the same day', () => {
    const out = agendaGroups([ev('2026-10-05'), ev('2026-10-05', '2026-10-07')], ...OCT);
    expect(out).toHaveLength(1);
    expect(out[0].events).toHaveLength(2);
  });

  it('is in day order', () => {
    const out = agendaGroups([ev('2026-10-28'), ev('2026-10-03'), ev('2026-10-19')], ...OCT);
    expect(out.map((g) => g.day)).toEqual([3, 19, 28]);
  });

  it('honours a type filter', () => {
    const rows = [ev('2026-10-03', null, 'Event'), ev('2026-10-04', null, 'Holiday')];
    expect(agendaGroups(rows, ...OCT, 'Holiday').map((g) => g.day)).toEqual([4]);
    expect(agendaGroups(rows, ...OCT, '').map((g) => g.day)).toEqual([3, 4]);
  });

  it('survives a row with no date and a range stored backwards', () => {
    const out = agendaGroups([{ title: 'junk' }, ev('2026-10-23', '2026-10-19')], ...OCT);
    expect(out).toHaveLength(1);
    expect(out[0].day, 'a backwards range still starts at its earlier end').toBe(19);
  });

  it('counts rows, not days: nine rows for two events was the bug', () => {
    const out = agendaGroups([ev('2026-10-19', '2026-10-23'), ev('2026-10-28', '2026-10-31')], ...OCT);
    expect(out.reduce((n, g) => n + g.events.length, 0)).toBe(2);
  });
});
