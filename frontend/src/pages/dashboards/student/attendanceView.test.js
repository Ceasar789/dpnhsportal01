import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  attendanceRate, attendanceTotals, currentManilaMonth, formatAttendanceDate, monthLabel, monthOf, monthOptions, RATE_RULE,
} from './attendanceView';

// Run in a timezone west of UTC, where new Date('YYYY-MM-DD') shows the day before.
let tz;
beforeEach(() => { tz = globalThis.process.env.TZ; globalThis.process.env.TZ = 'America/New_York'; });
afterEach(() => { if (tz === undefined) delete globalThis.process.env.TZ; else globalThis.process.env.TZ = tz; });

describe('attendance totals and rate', () => {
  it('counts the four statuses in any casing and puts anything else in other', () => {
    const rows = ['Present', 'present', 'Late', 'Absent', 'Excused', 'Illness', null].map(status => ({ status }));
    expect(attendanceTotals(rows)).toEqual({ present: 2, late: 1, absent: 1, excused: 1, other: 2, total: 7 });
  });

  it('keeps the rule: Present over all rows, Late and Excused not present', () => {
    expect(attendanceRate(attendanceTotals([{ status: 'Present' }, { status: 'Late' }, { status: 'Excused' }, { status: 'Present' }]))).toBe(50);
    expect(attendanceRate(attendanceTotals([]))).toBe(0);
    expect(RATE_RULE).toBe('Rate = days Present ÷ all recorded days. Late and Excused count as not present.');
  });
});

describe('attendance dates', () => {
  it('shows a DATE value as the same calendar day in New York time', () => {
    expect(new Date('2030-03-01').getDate()).toBe(28); // the old bug, for the record
    expect(formatAttendanceDate('2030-03-01')).toBe('Mar 1, 2030');
    expect(formatAttendanceDate('2030-12-31')).toBe('Dec 31, 2030');
    expect(formatAttendanceDate('')).toBe('—');
  });

  it('works out months in Manila time', () => {
    expect(monthOf('2030-03-01')).toBe('2030-03');
    expect(monthOf('junk')).toBeNull();
    expect(currentManilaMonth(new Date('2030-03-31T16:30:00Z'))).toBe('2030-04'); // already Apr 1 in Manila
    expect(monthLabel('2030-03')).toBe('March 2030');
    expect(monthOptions([{ date: '2030-01-05' }, { date: '2030-02-10' }, { date: '2030-01-20' }], new Date('2030-03-13T02:00:00Z')))
      .toEqual(['2030-03', '2030-02', '2030-01']);
  });
});
