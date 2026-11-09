// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// db: the rows each table returns. fail: table -> 'error' | 'throw'. pending:
// table -> a promise the next read of that table waits on.
const db = vi.hoisted(() => ({
  sections: [], year: '2030-2031', links: [], students: [], profiles: [], attendance: [],
  schedules: [], events: [], fail: {}, pending: {}, reads: [], rpc: null,
}));
const toast = vi.hoisted(() => vi.fn());
// shown: the toast the mocked useToast reports as on screen (null = none).
const shown = vi.hoisted(() => ({ toast: null }));
const auth = vi.hoisted(() => ({ uid: 'teacher-1' }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: auth.uid } }) }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: shown.toast, showToast: toast }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
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
        const wait = db.pending[table];
        delete db.pending[table];
        return (wait || Promise.resolve()).then(run);
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

import AttendanceTab from './AttendanceTab';

const RIZAL = { id: 'sec-1', name: 'Rizal', grade_level: 'Grade 7', school_year: '2030-2031', adviser_id: 'teacher-1' };
const MABINI = { id: 'sec-2', name: 'Mabini', grade_level: 'Grade 8', school_year: '2030-2031', adviser_id: 'teacher-1' };
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
  toast.mockReset();
  shown.toast = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const renderTab = () => render(<MemoryRouter><AttendanceTab /></MemoryRouter>);
const ready = async () => { renderTab(); await screen.findByRole('table'); };
const btn = (name, status) => screen.getAllByRole('button', { name: `Mark ${name} ${status}` })[0];
const pressed = (name, status) => btn(name, status).getAttribute('aria-pressed') === 'true';
const rowOf = name => screen.getByRole('table').querySelector('tbody').querySelectorAll('tr')
  .values().find(tr => tr.textContent.includes(name));
const total = label => within(screen.getByLabelText('Attendance totals')).getByText(label).nextElementSibling.textContent;
const saveButton = () => screen.getByRole('button', { name: 'Save attendance' });
const save = async () => { await act(async () => { fireEvent.click(saveButton()); }); };
const attendanceReads = () => db.reads.filter(r => r.table === 'attendance');
// The shared Toast keeps an empty live region with role alert; only alerts with text count.
const alerts = () => screen.queryAllByRole('alert').filter(el => el.textContent.trim());
const alertText = () => alerts().map(el => el.textContent).join(' | ');

describe('loading', () => {
  it('shows the advisory roster with saved statuses and the daily heading', async () => {
    await ready();
    expect(screen.getByText('Take daily attendance for your advisory sections.')).toBeTruthy();
    expect(screen.getByLabelText('Advisory section (daily attendance)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Daily attendance – Grade 7 Rizal – Advisory' })).toBeTruthy();
    expect(rowOf('Ana Cruz').textContent).toContain('Saved: Present');
    expect(pressed('Ana Cruz', 'Present')).toBe(true);
    expect(rowOf('Ben Reyes').textContent).toContain('Not marked');
    expect(rowOf('Ana Cruz').textContent).toContain('LRN 1001');
    expect(screen.queryByRole('columnheader', { name: 'Saved status' })).toBeNull();
    expect(attendanceReads()[0].filters).toMatchObject({ date: TODAY, is_subject: null });
    expect(btn('Ana Cruz', 'Present').className).toContain('min-h-11');
  });

  it('a teacher with no advisory section is told who takes attendance and pointed to Students', async () => {
    db.sections = [];
    renderTab();
    expect(await screen.findByText('You have no advisory section assigned yet.')).toBeTruthy();
    expect(screen.getByText(/Only a section's adviser takes its daily attendance/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Students' }).getAttribute('href')).toBe('/teacher-dashboard/students');
    expect(screen.queryByRole('button', { name: 'Save attendance' })).toBeNull();
  });

  it('an empty roster says so and shows no save bar', async () => {
    db.links = [];
    renderTab();
    expect(await screen.findByText('No students are enrolled in this advisory section.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save attendance' })).toBeNull();
  });
});

describe('the draft', () => {
  it('a click marks a draft, a second click clears it, and clearing a saved mark is a change', async () => {
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Late'));
    expect(pressed('Ben Reyes', 'Late')).toBe(true);
    expect(within(rowOf('Ben Reyes')).getByText('Unsaved')).toBeTruthy();
    expect(screen.getByText('1 unsaved change')).toBeTruthy();
    fireEvent.click(btn('Ben Reyes', 'Late'));
    expect(pressed('Ben Reyes', 'Late')).toBe(false);
    expect(within(rowOf('Ben Reyes')).queryByText('Unsaved')).toBeNull();
    expect(screen.getByText('0 unsaved changes')).toBeTruthy();
    fireEvent.click(btn('Ana Cruz', 'Present'));
    expect(pressed('Ana Cruz', 'Present')).toBe(false);
    expect(within(rowOf('Ana Cruz')).getByText('Unsaved')).toBeTruthy();
    expect(rowOf('Ana Cruz').textContent).toContain('Saved: Present');
  });

  it('counters, including Not marked, follow the effective statuses at once', async () => {
    await ready();
    expect([total('Present'), total('Absent'), total('Not marked')]).toEqual(['1', '0', '2']);
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    fireEvent.click(btn('Ana Cruz', 'Present'));
    expect([total('Present'), total('Absent'), total('Not marked')]).toEqual(['0', '1', '2']);
  });

  it('Mark all present only touches students who are not marked', async () => {
    db.attendance = [row('s1', 'Absent')];
    await ready();
    fireEvent.click(btn('Cara Lim', 'Late'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all present' }));
    expect(pressed('Ana Cruz', 'Absent')).toBe(true);
    expect(pressed('Ben Reyes', 'Present')).toBe(true);
    expect(pressed('Cara Lim', 'Late')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Mark all present' })).toBeNull();
    await save();
    expect(db.rpc.mock.calls[0][1].p_marks).toEqual([
      { student_id: 's2', status: 'Present' }, { student_id: 's3', status: 'Late' }]);
  });
});

describe('saving', () => {
  it('sends only the changed students to the trusted function', async () => {
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    fireEvent.click(btn('Ana Cruz', 'Present'));
    fireEvent.click(btn('Cara Lim', 'Late'));
    fireEvent.click(btn('Cara Lim', 'Late'));
    await save();
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][0]).toBe('eduscribe_attendance_save_v1');
    expect(db.rpc.mock.calls[0][1]).toEqual({ p_section_id: 'sec-1', p_date: TODAY,
      p_marks: [{ student_id: 's1', status: null }, { student_id: 's2', status: 'Absent' }] });
  });

  it('makes no call when nothing changed', async () => {
    await ready();
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Discard' }).disabled).toBe(true);
    await save();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('a success toasts, re-reads the date and clears the draft', async () => {
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    db.attendance = [row('s1', 'Present'), row('s2', 'Absent')];
    const readsBefore = attendanceReads().length;
    await save();
    expect(toast).toHaveBeenCalledWith('Attendance saved.');
    expect(attendanceReads().length).toBe(readsBefore + 1);
    expect(rowOf('Ben Reyes').textContent).toContain('Saved: Absent');
    expect(within(rowOf('Ben Reyes')).queryByText('Unsaved')).toBeNull();
    expect(screen.getByText('0 unsaved changes')).toBeTruthy();
    expect(screen.getByText('Attendance saved.').getAttribute('aria-live') ?? screen.getByText('Attendance saved.').closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('a failed refresh after a save keeps the saved marks and asks for a retry', async () => {
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    db.fail.attendance = 'error';
    await save();
    expect(alertText()).toContain('Saved, but the list could not be refreshed. Retry.');
    expect(rowOf('Ben Reyes').textContent).toContain('Saved: Absent');
    expect(screen.getByRole('table')).toBeTruthy();
    delete db.fail.attendance;
    db.attendance = [row('s1', 'Present'), row('s2', 'Absent')];
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(screen.queryByText('Saved, but the list could not be refreshed. Retry.')).toBeNull();
  });

  it.each([
    ['future_date', "You can't take attendance for a future date."],
    ['not_found', "This section isn't available for attendance."],
    ['invalid_students', 'A student on this list is no longer enrolled in this section. Refresh the page and try again.'],
    ['inactive_teacher', 'You are not allowed to save attendance.'],
    ['not_authenticated', 'You are not allowed to save attendance.'],
    ['invalid_marks', 'Attendance could not be saved. Nothing was changed.'],
    ['invalid_date', 'Attendance could not be saved. Nothing was changed.'],
    ['permission denied for table attendance', 'Attendance could not be saved. Nothing was changed.'],
  ])('%s keeps the draft and shows its message', async (code, message) => {
    db.rpc = vi.fn(async () => ({ data: null, error: { message: code } }));
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    await save();
    expect(alertText()).toBe(message);
    expect(toast).toHaveBeenCalledWith(message, 'error');
    expect(within(rowOf('Ben Reyes')).getByText('Unsaved')).toBeTruthy();
    expect(pressed('Ben Reyes', 'Absent')).toBe(true);
    expect(document.body.textContent).not.toMatch(/permission denied/);
  });

  it.each([
    ['a thrown call', () => Promise.reject(new Error('Failed to fetch'))],
    ['no data', async () => ({ data: null, error: null })],
    ['ok not true', async () => ({ data: { ok: false }, error: null })],
  ])('%s gives the generic message', async (_name, rpc) => {
    db.rpc = vi.fn(rpc);
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    await save();
    expect(alertText()).toBe('Attendance could not be saved. Nothing was changed.');
    expect(within(rowOf('Ben Reyes')).getByText('Unsaved')).toBeTruthy();
  });

  it('a save answer arriving after the tab is gone is ignored', async () => {
    let finish;
    db.rpc = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const view = renderTab();
    await screen.findByRole('table');
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    fireEvent.click(saveButton());
    await waitFor(() => expect(db.rpc).toHaveBeenCalled());
    const reads = attendanceReads().length;
    view.unmount();
    await act(async () => { finish({ data: { ok: true }, error: null }); });
    expect(toast).not.toHaveBeenCalledWith('Attendance saved.');
    expect(attendanceReads().length).toBe(reads);
  });
});

describe('finding students', () => {
  it('search and Not marked only filter the list; counters stay whole-roster', async () => {
    await ready();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '  BEN ' } });
    expect(screen.getByText(/^1 of 3 students/)).toBeTruthy();
    expect(total('Not marked')).toBe('2');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '1003' } });
    expect(rowOf('Cara Lim')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Not marked only' }));
    expect(screen.getByRole('button', { name: 'Not marked only' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/^2 of 3 students/)).toBeTruthy();
    expect(total('Present')).toBe('1');
  });

  it('no match shows a message with Clear', async () => {
    await ready();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No students match.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/^3 of 3 students/)).toBeTruthy();
  });
});

describe('dates', () => {
  it('limits the date to Manila today and moves with Previous, Today and Next', async () => {
    await ready();
    const input = screen.getByLabelText('Date');
    expect(input.getAttribute('max')).toBe(TODAY);
    expect(screen.getByRole('button', { name: 'Next day' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Today' }).disabled).toBe(true);
    expect(screen.getByText(/· 2030-03-13 \(Wednesday\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText(/· 2030-03-12 \(Tuesday\)/);
    expect(input.value).toBe('2030-03-12');
    expect(screen.getByRole('button', { name: 'Next day' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await screen.findByText(/· 2030-03-13 \(Wednesday\)/);
  });

  it('crossing a month uses the date string, not the browser time zone', async () => {
    vi.setSystemTime(new Date('2030-03-01T01:00:00Z'));
    renderTab();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText(/· 2030-02-28 \(Thursday\)/);
  });

  it('a slow read for an earlier date never replaces the date on screen', async () => {
    let releaseOld;
    db.attendance = [row('s1', 'Present'), row('s1', 'Absent', '2030-03-12')];
    renderTab();
    await screen.findByRole('table');
    db.pending.attendance = new Promise(resolve => { releaseOld = resolve; });
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(attendanceReads().length).toBe(2));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: TODAY } });
    await waitFor(() => expect(screen.getByLabelText('Date').value).toBe(TODAY));
    await waitFor(() => expect(rowOf('Ana Cruz').textContent).toContain('Saved: Present'));
    await act(async () => { releaseOld(); });
    expect(rowOf('Ana Cruz').textContent).toContain('Saved: Present');
  });
});

describe('unsaved changes', () => {
  it('a date change asks first: Cancel keeps the draft, Discard switches and drops it', async () => {
    await ready();
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

  it('a section change asks first too', async () => {
    db.sections = [RIZAL, MABINI];
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    fireEvent.change(screen.getByLabelText('Advisory section (daily attendance)'), { target: { value: 'sec-2' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Advisory section (daily attendance)').value).toBe('sec-1');
    fireEvent.change(screen.getByLabelText('Advisory section (daily attendance)'), { target: { value: 'sec-2' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Advisory section (daily attendance)').value).toBe('sec-2');
    expect(screen.getByRole('heading', { name: 'Daily attendance – Grade 8 Mabini – Advisory' })).toBeTruthy();
  });
});

describe('a past school year', () => {
  it('stays viewable but read-only', async () => {
    db.sections = [RIZAL, OLD];
    db.links.push({ student_id: 's1', section_id: 'sec-old', status: 'active' });
    db.attendance.push(row('s1', 'Late', TODAY, 'sec-old'));
    await ready();
    fireEvent.change(screen.getByLabelText('Advisory section (daily attendance)'), { target: { value: 'sec-old' } });
    expect(screen.getByText('This is a past school year. Attendance is view-only.')).toBeTruthy();
    expect(rowOf('Ana Cruz').textContent).toContain('Saved: Late');
    expect(btn('Ana Cruz', 'Present').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Mark all present' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save attendance' })).toBeNull();
  });
});

describe('the class-today note', () => {
  it('a section with classes on other weekdays says so for the selected day', async () => {
    db.schedules = [{ section_id: 'sec-1', day_of_week: 'Monday' }, { section_id: 'sec-1', day_of_week: 'Tuesday' }];
    await ready();
    expect(await screen.findByText('No classes are scheduled for this section on Wednesday.')).toBeTruthy();
    expect(btn('Ben Reyes', 'Present').disabled).toBe(false);
  });

  it('with no schedule at all, only a weekend is mentioned', async () => {
    vi.setSystemTime(new Date('2030-03-16T02:00:00Z'));
    await ready();
    expect(await screen.findByText('Saturday: no regular classes.')).toBeTruthy();
    cleanup();
    vi.setSystemTime(new Date('2030-03-13T02:00:00Z'));
    await ready();
    await act(async () => {});
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('a holiday covering the date adds its title', async () => {
    db.schedules = [{ section_id: 'sec-1', day_of_week: 'Wednesday' }];
    db.events = [{ title: 'Founding Day', event_type: 'Holiday', event_date: '2030-03-12', end_date: '2030-03-13' },
      { title: 'Old holiday', event_type: 'Holiday', event_date: '2030-03-01', end_date: null }];
    await ready();
    expect(await screen.findByText('Founding Day (holiday)')).toBeTruthy();
    expect(screen.queryByText(/Old holiday/)).toBeNull();
  });

  it('failed reads show no note and no error', async () => {
    db.fail.schedules = 'error';
    db.fail.calendar_events = 'throw';
    vi.setSystemTime(new Date('2030-03-16T02:00:00Z'));
    await ready();
    await act(async () => {});
    expect(screen.queryByRole('note')).toBeNull();
    expect(alerts()).toEqual([]);
  });
});

describe('toast placement', () => {
  const toastEl = () => document.body.querySelector('.fixed.rounded-lg');

  it.each([
    ['error', 'Attendance could not be saved. Nothing was changed.'],
    ['success', 'Attendance saved.'],
  ])('a %s toast never covers the save bar; Save and Discard stay usable', async (type, msg) => {
    shown.toast = { msg, type };
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    const bar = screen.getByRole('region', { name: 'Attendance save bar' });
    const shownToast = toastEl();
    expect(shownToast.textContent).toBe(msg);
    expect(bar.contains(shownToast)).toBe(false);
    expect(shownToast.className).toContain('top-4');
    expect(shownToast.className).not.toContain('bottom-4');
    for (const name of ['Save attendance', 'Discard']) {
      const control = within(bar).getByRole('button', { name });
      expect(control.disabled).toBe(false);
    }
    fireEvent.click(within(bar).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Unsaved')).toBeNull();
  });

  it('the inline save error still shows in the bar while the toast is up', async () => {
    db.rpc = vi.fn(async () => ({ data: null, error: { message: 'future_date' } }));
    shown.toast = { msg: "You can't take attendance for a future date.", type: 'error' };
    await ready();
    fireEvent.click(btn('Ben Reyes', 'Absent'));
    await save();
    const bar = screen.getByRole('region', { name: 'Attendance save bar' });
    expect(within(bar).getByRole('alert').textContent).toBe("You can't take attendance for a future date.");
    expect(within(bar).getByRole('button', { name: 'Save attendance' }).disabled).toBe(false);
  });

  it('without a save bar the shared bottom toast is used', async () => {
    db.links = [];
    shown.toast = { msg: 'Could not load attendance. Check your connection and retry.', type: 'error' };
    renderTab();
    await screen.findByText('No students are enrolled in this advisory section.');
    expect(toastEl().className).toContain('bottom-4');
  });
});
