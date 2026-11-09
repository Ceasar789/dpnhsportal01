import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatManila, manilaInstant } from './taskFormatting';

// The test runner usually sits in Manila time, where a wrong "parse as local
// time" fallback looks right. Switch the process timezone so it cannot hide.
let tz;
beforeEach(() => { tz = globalThis.process.env.TZ; globalThis.process.env.TZ = 'America/New_York'; });
afterEach(() => { if (tz === undefined) delete globalThis.process.env.TZ; else globalThis.process.env.TZ = tz; });

describe('Manila time with the browser in another timezone', () => {
  it('a naive due_at is still Manila wall-clock time', () => {
    expect(manilaInstant('2030-03-12T23:59:00').toISOString()).toBe('2030-03-12T15:59:00.000Z');
    expect(manilaInstant('2030-03-12T23:59:00.123').toISOString()).toBe('2030-03-12T15:59:00.123Z');
    expect(formatManila('2030-03-12T23:59:00')).toBe('Mar 12, 2030, 11:59 PM');
  });
});
