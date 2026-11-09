import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isNewAnnouncement, newsInstant } from './announcementAge';

let tz;
beforeEach(() => { tz = globalThis.process.env.TZ; globalThis.process.env.TZ = 'America/New_York'; });
afterEach(() => { if (tz === undefined) delete globalThis.process.env.TZ; else globalThis.process.env.TZ = tz; });

// 10:00 AM, Wed 13 Mar 2030 in Manila.
const NOW = new Date('2030-03-13T02:00:00Z');

describe('NEW announcement badge', () => {
  it('reads a created_at without an offset as UTC', () => {
    expect(newsInstant('2030-03-07T02:00:00').toISOString()).toBe('2030-03-07T02:00:00.000Z');
    expect(newsInstant('2030-03-07T02:00:00+08:00').toISOString()).toBe('2030-03-06T18:00:00.000Z');
    expect(newsInstant(null)).toBeNull();
  });

  it('6 days old shows it, 7 and 8 days old do not', () => {
    expect(isNewAnnouncement('2030-03-13T01:00:00', NOW)).toBe(true); // today
    expect(isNewAnnouncement('2030-03-07T02:00:00', NOW)).toBe(true); // 6 days
    expect(isNewAnnouncement('2030-03-06T02:00:00', NOW)).toBe(false); // 7 days
    expect(isNewAnnouncement('2030-03-05T02:00:00', NOW)).toBe(false); // 8 days
    expect(isNewAnnouncement(null, NOW)).toBe(false);
  });

  it('counts Manila calendar days, not the browser day', () => {
    // 15:59 UTC Mar 6 is 11:59 PM Mar 6 in Manila: 7 days before Mar 13.
    expect(isNewAnnouncement('2030-03-06T15:59:00', NOW)).toBe(false);
    // 16:00 UTC Mar 6 is 12:00 AM Mar 7 in Manila: 6 days. Still Mar 6 in New York.
    expect(isNewAnnouncement('2030-03-06T16:00:00', NOW)).toBe(true);
  });
});
