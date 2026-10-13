import { describe, expect, it } from 'vitest';
import {
  isInvalidCalendarRange,
  matchesCalendarFilter,
  philippineDateKey,
  upcomingCalendarEvents,
} from './calendarRules';

const event = (overrides = {}) => ({
  id: overrides.id || 'event-1',
  title: overrides.title || 'School event',
  event_date: '2026-10-09',
  end_date: null,
  event_type: 'Event',
  custom_event_type: null,
  ...overrides,
});

describe('calendar date-range validation', () => {
  it('rejects only an end date earlier than the start date', () => {
    expect(isInvalidCalendarRange('2026-10-10', '2026-10-09')).toBe(true);
    expect(isInvalidCalendarRange('2026-10-10', '2026-10-10')).toBe(false);
    expect(isInvalidCalendarRange('2026-10-10', '2026-10-11')).toBe(false);
    expect(isInvalidCalendarRange('2026-10-10', '')).toBe(false);
  });
});

describe('matchesCalendarFilter', () => {
  it('recognizes custom events by their stored Other type and custom value', () => {
    const custom = event({ event_type: 'Other', custom_event_type: 'Foundation Day' });
    const plainOther = event({ event_type: 'Other' });

    expect(matchesCalendarFilter(custom, 'Custom Type')).toBe(true);
    expect(matchesCalendarFilter(plainOther, 'Custom Type')).toBe(false);
    expect(matchesCalendarFilter(custom, 'Other')).toBe(true);
  });
});

describe('upcomingCalendarEvents', () => {
  it('uses the same filter and retains events that are still ongoing', () => {
    const events = [
      event({ id: 'ended', event_date: '2026-10-01', end_date: '2026-10-08' }),
      event({ id: 'ongoing', event_date: '2026-10-01', end_date: '2026-10-10' }),
      event({ id: 'future-custom', event_date: '2026-10-12', event_type: 'Other', custom_event_type: 'Assembly' }),
    ];

    expect(upcomingCalendarEvents(events, '', '2026-10-09').map(({ id }) => id))
      .toEqual(['ongoing', 'future-custom']);
    expect(upcomingCalendarEvents(events, 'Custom Type', '2026-10-09').map(({ id }) => id))
      .toEqual(['future-custom']);
  });

  it('derives the day from Philippine local time rather than UTC', () => {
    expect(philippineDateKey(new Date('2026-10-08T18:30:00.000Z'))).toBe('2026-10-09');
  });
});
