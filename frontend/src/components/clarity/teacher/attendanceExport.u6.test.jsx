// @vitest-environment jsdom
// U-T6: Attendance "Export to Excel". The generated file is opened and its
// cells checked: title block, one row per student (name, LRN), one column per
// recorded date with P / L / A / E, the four totals, recorded days, the rate
// (Present ÷ recorded days) and the legend. Only real rows; a failed read
// makes no file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readCells } from '../../../lib/xlsxTestReader';

const h = vi.hoisted(() => ({ rows: [], error: null, ops: [], downloads: [] }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../config/supabase', () => ({ supabase: { from(table) {
  h.ops.push(['from', table]);
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
    ? (ok, bad) => Promise.resolve({ data: h.error ? null : h.rows, error: h.error }).then(ok, bad)
    : (...args) => { h.ops.push([prop, ...args]); return q; }) });
  return q;
} } }));
vi.mock('../../../lib/calendarRules', async (orig) => ({ ...(await orig()), philippineDateKey: () => '2026-11-25' }));
vi.mock('../../../lib/xlsx', async (orig) => {
  const real = await orig();
  return { ...real, downloadXlsx: (bytes, name) => h.downloads.push({ bytes, name }) };
});

import { attendanceFileName, attendanceSheet, attendanceWorkbook, monthRange, rangeProblem } from './attendanceExport';
import AttendanceExportPanel from './AttendanceExportPanel';

const SECTION = { id: 'sec-1', name: 'Rizal', grade_level: 'Grade 8', school_year: '2026-2027' };
const STUDENTS = [{ id: 's2', name: 'Santos, Maria', lrn: '136482100124' }, { id: 's1', name: 'Dela Cruz, Juan', lrn: '136482100123' },
  { id: 's3', name: 'Ramos, Ken', lrn: null }];
const R = (student_id, date, status) => ({ student_id, date, status });
const RECORDS = [R('s1', '2026-11-16', 'Present'), R('s1', '2026-11-17', 'Late'), R('s1', '2026-11-18', 'Present'), R('s1', '2026-11-19', 'Excused'),
  R('s2', '2026-11-16', 'Absent'), R('s2', '2026-11-17', 'Present'), R('s2', '2026-11-19', 'present')];
const input = { section: 'Rizal', grade: 'Grade 8', schoolYear: '2026-2027', from: '2026-11-01', to: '2026-11-30', students: STUDENTS, records: RECORDS };

beforeEach(() => { Object.assign(h, { rows: RECORDS, error: null, ops: [], downloads: [] }); });
afterEach(() => cleanup());

describe('U-T6 the sheet', () => {
  it('title block, header with one column per recorded date, frozen under the header', () => {
    const { cells } = readCells(attendanceWorkbook(input));
    expect(cells.A1.v).toBe('Dela Paz National High School');
    expect(cells.A2.v).toBe('Daily attendance');
    expect(cells.A3.v).toBe('Section: Rizal   Grade: Grade 8   School year: 2026-2027');
    expect(cells.A4.v).toBe('Dates: November 1, 2026 to November 30, 2026');
    const header = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].map(c => cells[`${c}6`]?.v);
    expect(header).toEqual(['No.', 'Name', 'LRN', 'Nov 16', 'Nov 17', 'Nov 18', 'Nov 19', 'Present', 'Late', 'Absent', 'Excused', 'Recorded days', 'Rate']);
    expect(attendanceSheet(input).freezeRows).toBe(6);
  });

  it('one row per student, A-Z; P / L / A / E per day, blanks where nothing was recorded; totals and rate', () => {
    const { cells } = readCells(attendanceWorkbook(input));
    const row = r => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].map(c => cells[`${c}${r}`]?.v);
    expect(row(7)).toEqual([1, 'Dela Cruz, Juan', '136482100123', 'P', 'L', 'P', 'E', 2, 1, 0, 1, 4, '50%']);
    expect(row(8)).toEqual([2, 'Ramos, Ken', undefined, undefined, undefined, undefined, undefined, 0, 0, 0, 0, 0, undefined]);
    expect(row(9)).toEqual([3, 'Santos, Maria', '136482100124', 'A', 'P', undefined, 'P', 2, 0, 1, 0, 3, '67%']);
  });

  it('the legend explains every code and the rate', () => {
    const { cells } = readCells(attendanceWorkbook(input));
    const texts = Object.values(cells).map(c => c.v);
    for (const line of ['Legend', 'P = Present', 'L = Late', 'A = Absent', 'E = Excused', 'Blank = not recorded that day',
      'Rate = days Present ÷ recorded days (Late and Excused count as not present)']) expect(texts).toContain(line);
  });

  it('no records: no date columns, every count 0, and a line saying so (nothing invented)', () => {
    const sheet = attendanceSheet({ ...input, records: [] });
    expect(sheet.dates).toEqual([]);
    expect(sheet.rows.flat().map(c => (c && typeof c === 'object' ? c.v : c))).toContain('No attendance was recorded in this date range.');
  });

  it('range rules and file name', () => {
    expect(monthRange('2026-11-25')).toEqual(['2026-11-01', '2026-11-30']);
    expect(monthRange('2028-02-10')).toEqual(['2028-02-01', '2028-02-29']);
    expect(rangeProblem('2026-11-30', '2026-11-01')).toBe('The start date must be on or before the end date.');
    expect(rangeProblem('2025-01-01', '2026-11-30')).toBe('Choose a range of one year or less.');
    expect(rangeProblem('', '2026-11-30')).toBe('Choose both dates.');
    expect(rangeProblem('2026-11-01', '2026-11-30')).toBe('');
    expect(attendanceFileName({ grade: 'Grade 8', section: 'Rizal', from: '2026-11-01', to: '2026-11-30' })).toBe('Attendance Grade 8 Rizal 2026-11-01 to 2026-11-30.xlsx');
  });
});

describe('U-T6 the panel', () => {
  it('defaults to the current month, reads only the daily rows of this section in range, and downloads the file', async () => {
    render(<AttendanceExportPanel section={SECTION} students={STUDENTS} />);
    expect(screen.getByLabelText('From').value).toBe('2026-11-01');
    expect(screen.getByLabelText('To').value).toBe('2026-11-30');
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(h.downloads).toHaveLength(1));
    expect(h.ops).toEqual(expect.arrayContaining([['from', 'attendance'], ['eq', 'section_id', 'sec-1'], ['is', 'subject', null],
      ['gte', 'date', '2026-11-01'], ['lte', 'date', '2026-11-30']]));
    expect(h.downloads[0].name).toBe('Attendance Grade 8 Rizal 2026-11-01 to 2026-11-30.xlsx');
    expect(readCells(h.downloads[0].bytes).cells.B7.v).toBe('Dela Cruz, Juan');
    expect(screen.getByRole('status').textContent).toBe('The Excel file was downloaded.');
  });

  it('a failed read makes no file and says so', async () => {
    h.error = { message: 'permission denied' };
    render(<AttendanceExportPanel section={SECTION} students={STUDENTS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The attendance could not be loaded, so no file was made. Check your connection and try again.');
    expect(h.downloads).toHaveLength(0);
    expect(document.body.textContent).not.toContain('permission denied');
  });

  it('a backwards range is refused before any read', () => {
    render(<AttendanceExportPanel section={SECTION} students={STUDENTS} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    expect(screen.getByRole('alert').textContent).toBe('The start date must be on or before the end date.');
    expect(h.ops).toHaveLength(0);
  });
});
