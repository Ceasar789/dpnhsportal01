// @vitest-environment jsdom
// U-PDF-S: My Attendance (p11) and Announcements (p12) layout. Attendance: the
// cards and the rate on top, the records (Date, Status) next, the month
// calendar with its selectors below (your Q1 answer); "N excused" only when
// there is one. Announcements: the All / Unread toggle and the search in the
// header; "date · School" (or the poster's name) under each card.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ tables: {} }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'stu-1' } }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: q => q() }));
vi.mock('../../../pages/dashboards/student/hooks', async (orig) => ({ ...(await orig()), useToast: () => ({ showToast: () => {}, Toast: () => null }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', async () => {
  const { createContext: make } = await import('react');
  return { default: make({ graph: { enrolments: [{ section_id: 'sec-1', sections: { name: 'Rizal' } }] } }) };
});
vi.mock('../../../config/supabase', () => ({ supabase: { from(table) {
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
    ? (ok, bad) => Promise.resolve({ data: h.tables[table] || [], error: null }).then(ok, bad) : () => q) });
  return q;
} } }));

import ClarityStudentAttendanceTab from './ClarityStudentAttendanceTab';
import ClarityStudentAnnouncementsTab from './ClarityStudentAnnouncementsTab';

const row = (id, date, status, extra = {}) => ({ id, student_id: 'stu-1', section_id: 'sec-1', date, status, subject: null, remarks: null, ...extra });
const settle = async () => { await vi.waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull()); };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T02:00:00Z'));
  h.tables = {
    attendance: [row('a1', '2026-11-20', 'Present'), row('a2', '2026-11-19', 'Late', { remarks: 'Traffic' }), row('a3', '2025-11-18', 'Absent')],
    news: [{ id: 'n1', title: 'Exam week', content: 'Exams start Dec 2.', created_at: '2026-11-19T01:00:00Z', priority: 'High', target_roles: 'all', status: 'Published' }],
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('U-PDF-S My Attendance (p11)', () => {
  it('order: cards and rate, then the records, then the calendar with its selectors', async () => {
    const { container } = render(<ClarityStudentAttendanceTab />); await settle();
    const order = [...container.querySelectorAll('.x-sat-stats, .x-sat-records, .x-sat-cal')].map(e => e.className.split(' ').find(c => c.startsWith('x-sat-')));
    expect(order).toEqual(['x-sat-stats', 'x-sat-records', 'x-sat-cal']);
    expect(within(container.querySelector('.x-sat-cal')).getByLabelText('Month')).toBeTruthy();
    expect(screen.getByText('Your attendance records')).toBeTruthy();
  });

  it('the rate card: "N of N days" and no excused line at 0; records Date and Status with "Fri, Nov 20" and a dotted pill', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    const rate = screen.getByRole('region', { name: 'Attendance rate' });
    expect(rate.textContent).toContain('1 of 3 days'); // every record counts, as before (one is from 2025)
    expect(rate.textContent).not.toContain('excused');
    const records = screen.getByRole('region', { name: 'Attendance records' });
    const cells = [...records.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent));
    expect(cells).toEqual([['Fri, Nov 20Rizal', 'Present'], ['Thu, Nov 19Rizal · Traffic', 'Late']]);
    expect(records.querySelector('tbody .x-badge i')).toBeTruthy();
  });

  it('a record from another year keeps its year', async () => {
    render(<ClarityStudentAttendanceTab />); await settle();
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: 'all' } });
    const records = screen.getByRole('region', { name: 'Attendance records' });
    expect(records.textContent).toContain('Tue, Nov 18, 2025');
  });

  it('excused days show as a line in the rate card', async () => {
    h.tables.attendance = [row('a1', '2026-11-20', 'Present'), row('a2', '2026-11-19', 'Excused')];
    render(<ClarityStudentAttendanceTab />); await settle();
    expect(screen.getByRole('region', { name: 'Attendance rate' }).textContent).toContain('1 excused');
  });
});

describe('U-PDF-S Announcements (p12)', () => {
  it('the toggle and the search sit in the header; the card says "date · School"', async () => {
    const { container } = render(<ClarityStudentAnnouncementsTab />); await settle();
    const head = container.querySelector('.x-head');
    expect(within(head).getByRole('group', { name: 'Show announcements' })).toBeTruthy();
    expect(within(head).getByRole('searchbox', { name: 'Search announcements' })).toBeTruthy();
    expect(screen.getByText('News and reminders from the school')).toBeTruthy();
    expect(container.querySelector('.x-san-meta').textContent).toBe('Nov 19, 2026 · School · All Users');
    expect(screen.getByRole('button', { name: 'Mark Exam week as read' }).closest('.x-san-foot')).toBeTruthy();
  });
});
