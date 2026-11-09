// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ result: null, reads: 0 }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from() {
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      then(resolve, reject) { state.reads += 1; return Promise.resolve(state.result).then(resolve, reject); },
    };
    return query;
  } },
}));

import AttendanceTab from './AttendanceTab';
import StudentDataContext from '../StudentDataContext';

const graph = { enrolments: [
  { section_id: 'sec-a', sections: { name: 'Rizal', grade_level: '7' } },
  { section_id: 'sec-b', sections: { name: 'Mabini', grade_level: '7' } },
] };
const show = () => render(
  <StudentDataContext.Provider value={{ graph, loading: false, refresh: vi.fn() }}><AttendanceTab /></StudentDataContext.Provider>
);
const row = (date, status, extra = {}) => ({ id: `${date}-${status}-${extra.section_id || 'sec-a'}`, date, status, section_id: 'sec-a', subject: null, remarks: null, ...extra });
const total = label => within(screen.getByRole('region', { name: 'Attendance totals' })).getByText(label).parentElement.textContent;
const bodyRows = () => screen.getByRole('table').querySelectorAll('tbody tr');

let tz;
beforeEach(() => {
  tz = globalThis.process.env.TZ;
  globalThis.process.env.TZ = 'America/New_York';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-03-13T02:00:00Z')); // Mar 13, 2030 in Manila
  state.reads = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (tz === undefined) delete globalThis.process.env.TZ; else globalThis.process.env.TZ = tz;
});

describe('student attendance', () => {
  it('shows four totals, the unchanged rate with its rule, and Other for unknown statuses', async () => {
    state.result = { data: [row('2030-03-02', 'Present'), row('2030-03-03', 'Late'), row('2030-03-04', 'Absent'),
      row('2030-03-05', 'Excused'), row('2030-03-06', 'Illness')], error: null };
    show();
    await screen.findByRole('table');
    expect(total('Present')).toContain('1');
    expect(total('Late')).toContain('1');
    expect(total('Absent')).toContain('1');
    expect(total('Excused')).toContain('1');
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('Rate = days Present ÷ all recorded days. Late and Excused count as not present.')).toBeTruthy();
    expect(screen.getByText('Attendance is recorded once a day by your adviser.')).toBeTruthy();
    const illness = [...bodyRows()].find(tr => tr.textContent.includes('Illness'));
    const other = within(illness).getByText('Other');
    expect(other.getAttribute('style')).toContain('var(--card2)');
    const excused = within([...bodyRows()].find(tr => tr.textContent.includes('Excused'))).getByText('Excused');
    expect(excused.getAttribute('style')).toContain('var(--card2)');
    expect(excused.getAttribute('style')).not.toContain('red');
  });

  it('shows the same calendar day in New York time, with Section and Subject columns', async () => {
    state.result = { data: [row('2030-03-01', 'Present', { subject: 'Math' })], error: null };
    show();
    await screen.findByRole('table');
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['Date', 'Status', 'Section', 'Subject', 'Notes']);
    expect(bodyRows()[0].textContent).toContain('Mar 1, 2030');
    expect(bodyRows()[0].textContent).toContain('Rizal');
    expect(bodyRows()[0].textContent).toContain('Math');
  });

  it('defaults to the current Manila month, offers All, and pages 20 at a time', async () => {
    const march = Array.from({ length: 25 }, (_, i) => row(`2030-03-${String(i + 1).padStart(2, '0')}`, 'Present'));
    state.result = { data: [...march, row('2030-02-10', 'Absent')], error: null };
    show();
    await screen.findByRole('table');
    const monthSelect = screen.getByLabelText('Month');
    expect(monthSelect.value).toBe('2030-03');
    expect([...monthSelect.options].map(o => o.textContent)).toEqual(['March 2030', 'February 2030', 'All']);
    expect(bodyRows()).toHaveLength(20);
    expect(bodyRows()[0].textContent).toContain('Mar 25, 2030');
    expect(screen.getByText('Showing 20 of 25')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(bodyRows()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    fireEvent.change(monthSelect, { target: { value: 'all' } });
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByText('Showing 20 of 26')).toBeTruthy();
    fireEvent.change(monthSelect, { target: { value: '2030-02' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent).toContain('Feb 10, 2030');
  });

  it('a month with no rows says so', async () => {
    state.result = { data: [row('2030-02-10', 'Absent')], error: null };
    show();
    expect(await screen.findByText('No attendance recorded in March 2030.')).toBeTruthy();
  });

  it('shows the Section filter only when rows span two or more sections', async () => {
    state.result = { data: [row('2030-03-02', 'Present'), row('2030-03-03', 'Absent')], error: null };
    show();
    await screen.findByRole('table');
    expect(screen.queryByLabelText('Section')).toBeNull();
    cleanup();
    state.result = { data: [row('2030-03-02', 'Present'), row('2030-03-03', 'Absent', { section_id: 'sec-b' })], error: null };
    show();
    await screen.findByRole('table');
    const sectionSelect = screen.getByLabelText('Section');
    expect(sectionSelect.value).toBe('all');
    expect(bodyRows()).toHaveLength(2);
    fireEvent.change(sectionSelect, { target: { value: 'sec-b' } });
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0].textContent).toContain('Mabini');
  });

  it('empty and failed reads look different, and Retry reloads', async () => {
    state.result = { data: [], error: null };
    show();
    expect(await screen.findByText('No attendance recorded yet.')).toBeTruthy();
    expect(screen.queryByText('Could not load your attendance.')).toBeNull();
    cleanup();
    state.result = { data: null, error: { message: 'offline' } };
    show();
    expect((await screen.findAllByText('Could not load your attendance.')).length).toBeGreaterThan(0);
    expect(screen.queryByText('No attendance recorded yet.')).toBeNull();
    expect(total('Present')).toContain('—');
    state.result = { data: [], error: null };
    const reads = state.reads;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No attendance recorded yet.')).toBeTruthy();
    expect(state.reads).toBe(reads + 1);
  });

  it('never claims per-subject attendance', async () => {
    state.result = { data: [row('2030-03-02', 'Present')], error: null };
    const { container } = show();
    await screen.findByRole('table');
    expect(container.textContent).not.toMatch(/per[- ]subject|by subject|subject attendance/i);
  });
});
