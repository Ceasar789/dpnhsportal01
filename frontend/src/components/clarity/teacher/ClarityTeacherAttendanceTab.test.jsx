// @vitest-environment jsdom
// Clarity T3: the Teacher Attendance tab. Every data source is mocked (the
// same table fake and save RPC as the classic AttendanceTab test, auth, the
// toast hook, withRetry); each behaviour is compared with the classic tab.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const db = vi.hoisted(() => ({
  sections: [], year: '2030-2031', links: [], students: [], profiles: [], attendance: [],
  schedules: [], events: [], fail: {}, pending: {}, reads: [], rpc: null,
}));
const toast = vi.hoisted(() => ({ fn: null }));
const auth = vi.hoisted(() => ({ uid: 'teacher-1' }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: auth.uid } }) }));
vi.mock('../../../pages/dashboards/teacher/hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: toast.fn }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../config/supabase', () => ({
  supabase: {
    rpc: (...args) => db.rpc(...args),
    from: table => {
      const filters = {};
      const answer = () => {
        db.reads.push({ table, filters: { ...filters } });
        const run = () => {
          if (db.fail[table] === 'throw') throw new Error('Failed to fetch');
          if (db.fail[table] === 'error') return { data: null, error: { message: 'permission denied' } };
          const rows = {
            sections: () => db.sections.filter(s => s.adviser_id === filters.adviser_id),
            section_students: () => db.links.filter(l => filters.section_id.includes(l.section_id) && l.status === 'active'),
            students: () => db.students,
            profiles: () => db.profiles,
            attendance: () => db.attendance.filter(a => filters.section_id.includes(a.section_id) && a.date === filters.date && a.subject === null),
            schedules: () => db.schedules.filter(s => s.section_id === filters.section_id),
            calendar_events: () => db.events.filter(e => e.event_type === 'Holiday' && e.event_date <= filters.event_date),
          }[table];
          return { data: rows ? rows() : [], error: null };
        };
        return Promise.resolve().then(run);
      };
      const query = {
        select: () => query,
        eq: (column, value) => { filters[column] = value; return query; },
        in: (column, values) => { filters[column] = values; return query; },
        is: (column, value) => { filters[`is_${column}`] = value; return query; },
        lte: (column, value) => { filters[column] = value; return query; },
        single: () => Promise.resolve(table === 'school_settings'
          ? (db.fail.school_settings ? { data: null, error: { message: 'x' } } : { data: { school_year: db.year }, error: null })
          : { data: null, error: null }),
        then: (resolve, reject) => answer().then(resolve, reject),
      };
      return query;
    },
  },
}));

import AttendanceTab from '../../../pages/dashboards/teacher/tabs/AttendanceTab';
import ClarityTeacherAttendanceTab from './ClarityTeacherAttendanceTab';

const RIZAL = { id: 'sec-1', name: 'Rizal', grade_level: 'Grade 7', school_year: '2030-2031', adviser_id: 'teacher-1' };
const OLD = { id: 'sec-old', name: 'Luna', grade_level: 'Grade 6', school_year: '2029-2030', adviser_id: 'teacher-1' };
const people = [['s1', 'Ana Cruz', '1001'], ['s2', 'Ben Reyes', '1002'], ['s3', 'Cara Lim', '1003']];
const TODAY = '2030-03-13'; // a Wednesday in Manila
const row = (student, status, date = TODAY, section = 'sec-1') => ({ student_id: student, section_id: section, date, status, subject: null });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-03-13T02:00:00Z'));
  auth.uid = 'teacher-1';
  Object.assign(db, {
    sections: [RIZAL], year: '2030-2031',
    links: people.map(([id]) => ({ student_id: id, section_id: 'sec-1', status: 'active' })),
    students: people.map(([id, , lrn]) => ({ id, lrn })),
    profiles: people.map(([id, name]) => ({ id, name })),
    attendance: [row('s1', 'Present')], schedules: [], events: [], fail: {}, pending: {}, reads: [],
    rpc: vi.fn(async () => ({ data: { ok: true, sectionId: 'sec-1', date: TODAY, saved: 1, cleared: 0 }, error: null })),
  });
  toast.fn = vi.fn();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const show = async (Tab) => { render(<MemoryRouter><Tab /></MemoryRouter>); await screen.findByRole('table'); };
const btn = (name, status) => screen.getAllByRole('button', { name: `Mark ${name} ${status}` })[0];
const pressed = (name, status) => btn(name, status).getAttribute('aria-pressed') === 'true';
const total = label => within(screen.getByLabelText('Attendance totals')).getByText(label).nextElementSibling.textContent;
const totals = () => ['Present', 'Absent', 'Late', 'Excused', 'Not marked'].map(total);
const save = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save attendance' })); }); };
const rosterNames = () => [...screen.getByRole('table').querySelectorAll('tbody tr')].map(tr => tr.textContent.match(/Ana Cruz|Ben Reyes|Cara Lim/)[0]);

describe('same data and behaviour as the classic tab', () => {
  it('the same reads, roster, statuses, totals and heading', async () => {
    const run = async (Tab) => {
      db.reads = [];
      await show(Tab);
      const out = { reads: db.reads.map(r => r.table), names: rosterNames(), totals: totals(),
        pressed: people.map(([, n]) => ['Present', 'Absent', 'Late', 'Excused'].filter(s => pressed(n, s))),
        heading: screen.getByRole('heading', { name: /^Daily attendance/ }).textContent,
        // From the table only: the classic also renders a hidden phone list.
        saved: [...screen.getByRole('table').querySelectorAll('tbody tr')].map(tr => tr.textContent.match(/Saved: Present|Not marked/)[0]) };
      cleanup();
      return out;
    };
    const clarity = await run(ClarityTeacherAttendanceTab);
    expect(clarity).toEqual(await run(AttendanceTab));
    expect(clarity.totals).toEqual(['1', '0', '0', '0', '2']);
  });

  it('marking, Mark all present and Save send the same marks to the same trusted function', async () => {
    const run = async (Tab) => {
      db.rpc.mockClear();
      await show(Tab);
      fireEvent.click(btn('Ben Reyes', 'Absent'));
      fireEvent.click(btn('Cara Lim', 'Late'));
      fireEvent.click(btn('Cara Lim', 'Late'));
      fireEvent.click(screen.getByRole('button', { name: 'Mark all present' }));
      const unsaved = screen.getByText(/unsaved change/).textContent;
      await save();
      const out = { calls: db.rpc.mock.calls, unsaved, toasts: toast.fn.mock.calls };
      toast.fn.mockClear();
      cleanup();
      return out;
    };
    const clarity = await run(ClarityTeacherAttendanceTab);
    expect(clarity).toEqual(await run(AttendanceTab));
    expect(clarity.calls[0][0]).toBe('eduscribe_attendance_save_v1');
    expect(clarity.unsaved).toBe('2 unsaved changes');
  });

  it('search, Not marked only and Clear filter the same rows; totals stay whole-roster', async () => {
    const run = async (Tab) => {
      await show(Tab);
      const out = [];
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '1002' } });
      out.push(rosterNames());
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Not marked only' }));
      out.push(rosterNames(), totals());
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'zzz' } });
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      out.push(rosterNames());
      cleanup();
      return out;
    };
    expect(await run(ClarityTeacherAttendanceTab)).toEqual(await run(AttendanceTab));
  });

  it('a date change while dirty asks first (the same dialog); Discard switches and drops the draft', async () => {
    await show(ClarityTeacherAttendanceTab);
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    expect(within(dialog).getAllByText('Discard unsaved changes?').length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Date').value).toBe(TODAY);
    expect(pressed('Ben Reyes', 'Absent')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Discard changes' }));
    await screen.findByText(/· 2030-03-12/);
    expect(pressed('Ben Reyes', 'Absent')).toBe(false);
    expect(screen.getByText('0 unsaved changes')).toBeTruthy();
  });

  it('Previous / Today / Next and the date limit match the classic', async () => {
    await show(ClarityTeacherAttendanceTab);
    expect(screen.getByLabelText('Date').getAttribute('max')).toBe(TODAY);
    expect(screen.getByRole('button', { name: 'Next day' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Today' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText(/· 2030-03-12/);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await screen.findByText(/· 2030-03-13/);
  });
});

describe('summary card (real counts only)', () => {
  it('the date, the share marked Present of the roster, and the totals', async () => {
    db.attendance = [row('s1', 'Present'), row('s2', 'Absent')];
    await show(ClarityTeacherAttendanceTab);
    const card = screen.getByLabelText('Attendance totals');
    expect(within(card).getByRole('heading', { level: 2 }).textContent).toBe('Today · Mar 13');
    expect(within(card).getByRole('img', { name: 'Marked present: 33 percent, 1 of 3 students' })).toBeTruthy();
    expect(totals()).toEqual(['1', '1', '0', '0', '1']);
  });
});

describe('states (same texts as classic)', () => {
  it('no advisory section points to Students; no save bar', async () => {
    db.sections = [];
    render(<MemoryRouter><ClarityTeacherAttendanceTab /></MemoryRouter>);
    expect(await screen.findByText('You have no advisory section assigned yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Students' }).getAttribute('href')).toBe('/teacher-dashboard/students');
    expect(screen.queryByRole('region', { name: 'Attendance save bar' })).toBeNull();
  });

  it('a past school year is view-only, with the classic note', async () => {
    db.sections = [OLD];
    db.links = people.map(([id]) => ({ student_id: id, section_id: 'sec-old', status: 'active' }));
    await show(ClarityTeacherAttendanceTab);
    expect(screen.getByText('This is a past school year. Attendance is view-only.')).toBeTruthy();
    expect(btn('Ana Cruz', 'Present').disabled).toBe(true);
    expect(screen.queryByRole('region', { name: 'Attendance save bar' })).toBeNull();
  });

  it('a failed load shows the classic message and Retry reads again', async () => {
    db.fail.sections = 'error';
    render(<MemoryRouter><ClarityTeacherAttendanceTab /></MemoryRouter>);
    expect(await screen.findByText('Could not load attendance for this date.')).toBeTruthy();
    expect(toast.fn).toHaveBeenCalledWith('Could not load attendance. Check your connection and retry.', 'error');
    db.fail = {};
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('an empty roster says so; the export note stays; no "preview"', async () => {
    db.links = [];
    const { container } = render(<MemoryRouter><ClarityTeacherAttendanceTab /></MemoryRouter>);
    expect(await screen.findByText('No students are enrolled in this advisory section.')).toBeTruthy();
    expect(screen.getByText('Export is unavailable. Attendance can be reviewed by date here.')).toBeTruthy();
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});
