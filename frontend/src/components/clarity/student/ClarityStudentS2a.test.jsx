// @vitest-environment jsdom
// Clarity S2a: Student My Attendance and Announcements (Student PDF p4, p5).
// The logic is a word-for-word copy of the classic tabs (source parity, no
// substitutions); the same reads; only real rows and stored fields are drawn.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ tables: {}, fail: {}, reads: [] }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'stu-1' } }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: q => q() }));
vi.mock('../../../pages/dashboards/student/hooks', async (orig) => ({ ...(await orig()), useToast: () => ({ showToast: () => {}, Toast: () => null }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => {
  const { createContext: make } = await import('react');
  return { default: make({ graph: { enrolments: [{ section_id: 'sec-1', sections: { name: 'Mabini' } }] } }) };
});
vi.mock('../../../config/supabase', () => ({ supabase: { from(table) {
  const call = { table, ops: [] };
  h.reads.push(call);
  const q = new Proxy({}, { get: (_, prop) => prop === 'then'
    ? (ok, bad) => Promise.resolve(h.fail[table] ? { data: null, error: { message: 'x' } } : { data: h.tables[table] || [], error: null }).then(ok, bad)
    : (...args) => { call.ops.push([prop, ...args]); return q; } });
  return q;
} } }));

import ClarityStudentAttendanceTab from './ClarityStudentAttendanceTab';
import ClarityStudentAnnouncementsTab from './ClarityStudentAnnouncementsTab';
import AttendanceTab from '../../../pages/dashboards/student/tabs/AttendanceTab';
import AnnouncementsTab from '../../../pages/dashboards/student/tabs/AnnouncementsTab';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const row = (id, date, status, extra = {}) => ({ id, student_id: 'stu-1', section_id: 'sec-1', date, status, subject: null, remarks: null, ...extra });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T02:00:00Z')); // Wednesday 11 November 2026 in Manila
  h.fail = {};
  h.reads = [];
  h.tables = {
    attendance: [
      row('a1', '2026-11-02', 'Present'), row('a2', '2026-11-05', 'Absent', { remarks: 'Sick' }),
      row('a3', '2026-11-09', 'Late'), row('a4', '2026-11-11', 'Present'), row('a5', '2026-10-30', 'Excused', { subject: 'Science' }),
    ],
    news: [
      { id: 'n1', title: 'Exam schedule released', content: 'Exams run Nov 18-19.', created_at: '2026-11-09T01:00:00', priority: 'High', from: 'Registrar', target_roles: 'all', status: 'Published' },
      { id: 'n2', title: 'Library hours', content: 'Open until 5 PM.', created_at: '2026-10-01T01:00:00', priority: 'Normal', target_roles: 'student', status: 'Published' },
      { id: 'n3', title: 'No extras', content: '', created_at: '2026-10-02T01:00:00', status: 'Published' },
    ],
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('source parity (temporary copies, no substitutions)', () => {
  it('Attendance: PAGE_SIZE (:26) and the state, read, totals, filters and paging (:30-93)', () => {
    const classic = read('pages/dashboards/student/tabs/AttendanceTab.jsx').split('\n');
    const copy = read('components/clarity/student/ClarityStudentAttendanceTab.jsx');
    expect(copy).toContain(`// ---- TEMPORARY copy (AttendanceTab.jsx:26) ----\n${classic[25]}\n`);
    expect(copy).toContain(classic.slice(29, 93).join('\n'));
  });
  it('Announcements: the state, read and search filter (:20-62)', () => {
    const classic = read('pages/dashboards/student/tabs/AnnouncementsTab.jsx').split('\n');
    expect(read('components/clarity/student/ClarityStudentAnnouncementsTab.jsx')).toContain(classic.slice(19, 62).join('\n'));
  });
});

const settle = async () => { await vi.waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull()); };

describe('My Attendance (p4)', () => {
  it('the same read as the classic tab', async () => {
    render(<AttendanceTab />); await vi.waitFor(() => expect(h.reads.length).toBe(1));
    const classic = JSON.stringify(h.reads);
    cleanup(); h.reads = [];
    render(<ClarityStudentAttendanceTab />); await settle();
    expect(JSON.stringify(h.reads)).toBe(classic);
  });

  it('the month calendar shows each real record on its date, with its label; other days only their number', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'My Attendance' })).toBeTruthy();
    const grid = screen.getByRole('table', { name: 'Attendance in November 2026' });
    expect([...grid.querySelectorAll('th')].map(th => th.textContent)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    const cell = day => [...grid.querySelectorAll('td:not(.out)')].find(td => td.querySelector('.x-sat-d').textContent === String(day));
    expect(cell(2).querySelector('.x-badge').textContent).toBe('Present');
    expect(cell(2).querySelector('.x-badge').className).toBe('x-badge ok');
    expect(cell(5).querySelector('.x-badge').className).toBe('x-badge er');
    expect(cell(9).querySelector('.x-badge').className).toBe('x-badge wa');
    expect(cell(3).querySelector('.x-badge')).toBeNull();
    expect(cell(11).querySelector('.x-sat-d').className).toBe('x-sat-d today');
    // 1 December fills the last week but belongs to December: dimmed, hidden, no record drawn.
    const dec1 = [...grid.querySelectorAll('td.out')].find(td => td.textContent === '1');
    expect(dec1.getAttribute('aria-hidden')).toBe('true');
    expect(grid.querySelectorAll('td.out .x-badge')).toHaveLength(0);
  });

  it('the month select moves the calendar; "All" lists every record and shows no calendar', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-10' } });
    const oct = screen.getByRole('table', { name: 'Attendance in October 2026' });
    expect(within(oct).getByText('Excused').className).toBe('x-badge');
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: 'all' } });
    expect(screen.queryByRole('table', { name: /^Attendance in/ })).toBeNull();
    expect(screen.getByText('Choose a month to see it on the calendar. Every record is listed below.')).toBeTruthy();
    expect(screen.getByText('Showing 5 of 5')).toBeTruthy();
  });

  it('rate (with its rule) and the four counts from the real rows; same numbers as the classic tab', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    const rate = screen.getByRole('region', { name: 'Attendance rate' });
    expect(within(rate).getByRole('img').getAttribute('aria-label')).toBe('Attendance rate: 40 percent, 5 total days recorded');
    expect(rate.textContent).toContain('Rate = days Present ÷ all recorded days. Late and Excused count as not present.');
    const tiles = [...screen.getByRole('region', { name: 'Attendance totals' }).children].map(t => t.textContent);
    expect(tiles).toEqual(['Present2', 'Late1', 'Absent1', 'Excused1']);
  });

  it('the records list leaves a missing subject or note empty (no dash)', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    const records = screen.getByRole('region', { name: 'Attendance records' });
    expect(records.textContent).not.toContain('—');
    const rows = [...within(records).getByRole('table').querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent));
    expect(rows[1]).toEqual(['Nov 9, 2026', 'Late', 'Mabini', '', '']);
  });

  it('no records: clean empty state, no rate and no counts; a failed read is its own state with Retry', async () => {
    h.tables.attendance = [];
    render(<ClarityStudentAttendanceTab />); await settle();
    expect(screen.getByText('No attendance recorded yet.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Attendance totals' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/0%/);
    cleanup();
    h.fail.attendance = true; h.reads = [];
    render(<ClarityStudentAttendanceTab />); await settle();
    expect(screen.getByRole('alert').textContent).toBe('Could not load your attendance.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.reads.length).toBe(2);
  });
});

describe('Announcements (p5)', () => {
  it('the same read as the classic tab', async () => {
    render(<AnnouncementsTab />); await vi.waitFor(() => expect(h.reads.length).toBe(1));
    const classic = JSON.stringify(h.reads);
    cleanup(); h.reads = [];
    render(<ClarityStudentAnnouncementsTab />); await settle();
    expect(JSON.stringify(h.reads)).toBe(classic);
  });

  it('cards: title, text, date, NEW and Important as before; sender and audience only when stored', async () => {
    render(<ClarityStudentAnnouncementsTab />); await settle();
    const items = within(screen.getByRole('list', { name: 'Announcements' })).getAllByRole('listitem');
    expect(within(items[0]).getByRole('heading', { level: 2 }).textContent).toBe('Exam schedule released');
    expect(within(items[0]).getByText('NEW')).toBeTruthy();
    expect(within(items[0]).getByText('Important')).toBeTruthy();
    expect(items[0].querySelector('.x-san-meta').textContent).toBe('Nov 9, 2026 · By Registrar · All Users');
    expect(items[1].querySelector('.x-san-meta').textContent).toBe('Oct 1, 2026 · Students Only');
    expect(within(items[1]).queryByText('NEW')).toBeNull();
    expect(items[2].querySelector('.x-san-meta').textContent).toBe('Oct 2, 2026');
    expect(items[2].querySelector('.x-san-text')).toBeNull();
    expect(document.body.textContent).not.toMatch(/School Admin/);
  });

  it('search filters the same rows as the classic tab', async () => {
    const titles = async (Tab) => {
      render(<Tab />); await screen.findByText('Exam schedule released');
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search announcements' }), { target: { value: 'library' } });
      const out = screen.getAllByText(/Library hours|Exam schedule|No extras/).map(e => e.textContent);
      cleanup();
      return out;
    };
    expect(await titles(ClarityStudentAnnouncementsTab)).toEqual(await titles(AnnouncementsTab));
  });

  it('empty and failed states keep the classic wording; Retry reads again', async () => {
    h.tables.news = [];
    render(<ClarityStudentAnnouncementsTab />); await settle();
    expect(screen.getByText('No announcements are available right now.')).toBeTruthy();
    cleanup();
    h.fail.news = true; h.reads = [];
    render(<ClarityStudentAnnouncementsTab />); await settle();
    expect(screen.getByRole('alert').textContent).toBe('Could not load announcements.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.reads.length).toBe(2);
  });
});

describe('layout rules', () => {
  const css = read('styles/clarity-components.css');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('calendar | 340px side column, stacking under 1024px; announcement cards with the round icon', () => {
    expect(css).toContain(`${P}.x-sat-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px;`);
    expect(css).toContain(`@media (max-width: 1023px) {\n  ${P}.x-sat-layout { grid-template-columns: minmax(0, 1fr); }\n}`);
    expect(css).toContain(`${P}.x-sat-d.today { background: var(--cl-ac); color: var(--cl-ac-t); }`);
    expect(css).toContain(`${P}.x-san-ico { flex: none; width: 40px; height: 40px; border-radius: 9999px;`);
  });
});
