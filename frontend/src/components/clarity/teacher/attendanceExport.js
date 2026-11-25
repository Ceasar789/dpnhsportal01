// ============================================
// U-T6: Attendance "Export to Excel". The read is the same table and filter as
// the tab's daily read (attendance, the section, subject IS NULL = the daily
// homeroom mark), over a date range. The sheet holds only real data: one row
// per student on the class list (name, LRN), one column per date that has at
// least one record, P / L / A / E per cell, the four totals, recorded days and
// the rate (Present ÷ recorded days, the student page's rule), then a legend.
// ============================================
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { STYLE, buildXlsx, cellRef, xlsxFileName } from '../../../lib/xlsx';
import { SCHOOL_NAME } from '../../../lib/schoolInfo';

export const STATUS_CODE = { present: 'P', late: 'L', absent: 'A', excused: 'E' };
export const MAX_RANGE_DAYS = 366;
const SHORT = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
const asDate = key => new Date(`${key}T00:00:00Z`);

// "2026-11-25" -> ["2026-11-01", "2026-11-30"].
export function monthRange(todayKey) {
  const [y, m] = todayKey.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, '0')}`];
}

export function rangeProblem(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return 'Choose both dates.';
  if (from > to) return 'The start date must be on or before the end date.';
  if ((asDate(to) - asDate(from)) / 86400000 + 1 > MAX_RANGE_DAYS) return 'Choose a range of one year or less.';
  return '';
}

export async function readAttendanceRange(sectionId, from, to, client = supabase) {
  const { data, error } = await withRetry(() => client.from('attendance').select('student_id, date, status')
    .eq('section_id', sectionId).is('subject', null).gte('date', from).lte('date', to).order('date', { ascending: true }),
  { label: 'Attendance export fetch' });
  if (error || !Array.isArray(data)) throw new Error('Attendance could not be loaded.');
  return data;
}

const codeOf = status => STATUS_CODE[String(status || '').trim().toLowerCase()] || null;

// The sheet as rows for lib/xlsx: title block, header, one row per student, legend.
export function attendanceSheet({ school = SCHOOL_NAME, section, grade, schoolYear, from, to, students, records }) {
  const dates = [...new Set(records.map(r => r.date))].sort();
  const byKey = new Map(records.map(r => [`${r.student_id}|${r.date}`, r.status]));
  const ordered = [...students].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const header = ['No.', 'Name', 'LRN', ...dates.map(d => SHORT.format(asDate(d))), 'Present', 'Late', 'Absent', 'Excused', 'Recorded days', 'Rate'];
  const width = header.length;
  const blank = () => Array(width).fill(null);
  const titleRow = (text, bold = false) => { const row = blank(); row[0] = bold ? { v: text, s: STYLE.bold } : text; return row; };
  const rows = [
    titleRow(school, true),
    titleRow('Daily attendance', true),
    titleRow(`Section: ${section || '—'}   Grade: ${grade || '—'}   School year: ${schoolYear || '—'}`),
    titleRow(`Dates: ${LONG.format(asDate(from))} to ${LONG.format(asDate(to))}`),
    blank(),
    header.map(v => ({ v, s: STYLE.header })),
  ];
  const headerRow = rows.length - 1;
  ordered.forEach((student, index) => {
    const totals = { P: 0, L: 0, A: 0, E: 0 };
    let recorded = 0;
    const cells = dates.map(date => {
      const status = byKey.get(`${student.id}|${date}`);
      if (status === undefined) return null;
      recorded += 1;
      const code = codeOf(status);
      if (code) totals[code] += 1;
      return { v: code || String(status), s: STYLE.center };
    });
    const rate = recorded ? `${Math.round((totals.P / recorded) * 100)}%` : '';
    rows.push([index + 1, student.name || '', student.lrn || '', ...cells, totals.P, totals.L, totals.A, totals.E, recorded, rate]);
  });
  rows.push(blank());
  rows.push(titleRow('Legend', true));
  for (const line of ['P = Present', 'L = Late', 'A = Absent', 'E = Excused', 'Blank = not recorded that day',
    'Rate = days Present ÷ recorded days (Late and Excused count as not present)']) rows.push(titleRow(line));
  if (dates.length === 0) rows.push(titleRow('No attendance was recorded in this date range.'));
  const merges = [0, 1, 2, 3].map(r => `${cellRef(r, 0)}:${cellRef(r, Math.max(width - 1, 5))}`);
  const widths = [5, 28, 15, ...dates.map(() => 8), 9, 7, 8, 9, 14, 8];
  return { rows, merges, widths, freezeRows: headerRow + 1, dates };
}

export function attendanceWorkbook(input) {
  const sheet = attendanceSheet(input);
  return buildXlsx({ sheetName: 'Attendance', rows: sheet.rows, merges: sheet.merges, widths: sheet.widths, freezeRows: sheet.freezeRows });
}

export const attendanceFileName = ({ grade, section, from, to }) =>
  xlsxFileName(['Attendance', grade, section, from === to ? from : `${from} to ${to}`].filter(Boolean).join(' '));
