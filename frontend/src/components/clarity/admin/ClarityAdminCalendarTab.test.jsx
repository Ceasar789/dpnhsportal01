// @vitest-environment jsdom
// Clarity A3: the Admin Calendar tab (final design). Week view by default,
// built from the real event dates only (no invented times, no hour grid);
// the classic month view, the filter and the event dialog are kept, through
// the same handlers (parity checked here).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import CalendarTab from '../../../pages/dashboards/admin/tabs/CalendarTab';
import ClarityAdminCalendarTab from './ClarityAdminCalendarTab';
import { formatDateRange } from '../../../lib/formatDate';

// Wednesday 11 November 2026 (local).
const TODAY = new Date(2026, 10, 11, 10, 0, 0);
const EVENTS = [
  { id: 'e1', title: 'Science Fair', event_type: 'Event', event_date: '2026-11-10', end_date: null },
  { id: 'e2', title: 'Grades due', event_type: 'Deadline', event_date: '2026-11-12', end_date: '2026-11-13' },
  { id: 'e3', title: 'Bonifacio Day', event_type: 'Holiday', event_date: '2026-11-14', end_date: null },
  { id: 'e4', title: 'Next week thing', event_type: 'Other', event_date: '2026-11-18', end_date: null, custom_event_type: 'Foundation Day' },
];
const GRID = Array.from({ length: 30 }, (_, i) => ({ d: i + 1, cur: true }));
const baseCtx = (extra = {}) => ({
  calError: false, calEvents: EVENTS, calFilter: '', calGrid: GRID, calLoading: false, calMonth: 10, calYear: 2026,
  closeModal: vi.fn(), deleteEvent: vi.fn(), editEvent: null, evDate: '', evDesc: '', evEnd: '', evSaving: false, evTitle: '',
  evCustomType: '', evType: 'Event', modal: null, nextMonth: vi.fn(), openCreateEvent: vi.fn(),
  openEditEvent: vi.fn(), prevMonth: vi.fn(), saveEvent: vi.fn(), setCalFilter: vi.fn(), setEvCustomType: vi.fn(), setEvDate: vi.fn(),
  setCalYear: vi.fn(), setEvDesc: vi.fn(), setEvEnd: vi.fn(), setEvTitle: vi.fn(), setEvType: vi.fn(), today: TODAY,
  typeClass: t => ({ Event: 'ev-blue', Deadline: 'ev-yellow', Holiday: 'ev-red', Other: 'ev-teal' }[t] || 'ev-blue'),
  typeColor: t => ({ Event: '#60a5fa', Deadline: '#fbbf24', Holiday: '#f87171', Other: '#2dd4bf' }[t] || '#60a5fa'),
  upcomingEvents: EVENTS.slice(1), fetchCalEvents: vi.fn(),
  ...extra,
});
const show = (Tab = ClarityAdminCalendarTab) => render(<Tab />);
const day = name => screen.getByRole('region', { name: new RegExp(`^${name}`) });
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');
// The page text is matched with whitespace collapsed (formatRange uses thin spaces).
const weekOf = (from, to) => `Week of ${formatDateRange(from, to)}`.replace(/\s+/g, ' ');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  h.ctx = baseCtx();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('week view (default)', () => {
  it('title, the real visible week, Week selected, prev / This week / next and Add event', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Calendar' })).toBeTruthy();
    expect(screen.getByText(weekOf('2026-11-09', '2026-11-13'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Week' }).getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Previous week', 'This week', 'Next week', 'Add event']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('Mon-Fri columns, plus Saturday only because an event is on it; Today marked in words and aria-current', () => {
    show();
    const heads = screen.getAllByRole('heading', { level: 2 }).map(h2 => h2.textContent);
    expect(heads).toEqual(['Mon 9', 'Tue 10', 'Wed 11 · Today', 'Thu 12', 'Fri 13', 'Sat 14']);
    expect(day('Wed 11').getAttribute('aria-current')).toBe('date');
    expect(day('Tue 10').getAttribute('aria-current')).toBeNull();
  });

  it('events sit on their real dates (a range on every day it covers), with no invented times and no hour grid', () => {
    show();
    expect(within(day('Tue 10')).getByRole('button', { name: 'Edit Science Fair' })).toBeTruthy();
    expect(within(day('Thu 12')).getByRole('button', { name: 'Edit Grades due' })).toBeTruthy();
    expect(within(day('Fri 13')).getByRole('button', { name: 'Edit Grades due' })).toBeTruthy();
    expect(within(day('Wed 11')).queryAllByRole('button')).toHaveLength(0);
    const text = document.querySelector('.x-cal-card').textContent;
    expect(text).not.toMatch(/\d{1,2}:\d{2}|\bAM\b|\bPM\b/);
    expect(within(day('Thu 12')).getByRole('button', { name: 'Edit Grades due' }).textContent)
      .toContain(formatDateRange('2026-11-12', '2026-11-13'));
  });

  it('a time is shown only when a row really has one', () => {
    h.ctx = baseCtx({ calEvents: [{ ...EVENTS[0], start_time: '08:00:00', end_time: '10:00:00' }] });
    show();
    expect(within(day('Tue 10')).getByRole('button', { name: 'Edit Science Fair' }).textContent).toContain('08:00–10:00');
  });

  it('the type is written on each block (colour is not the only carrier)', () => {
    show();
    expect(within(day('Tue 10')).getByRole('button', { name: 'Edit Science Fair' }).textContent).toBe('Science FairEvent');
  });

  it('next week, previous week and This week move the visible week', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText(weekOf('2026-11-16', '2026-11-20'))).toBeTruthy();
    expect(within(day('Wed 18')).getByRole('button', { name: 'Edit Next week thing' }).textContent).toContain('Foundation Day');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText(weekOf('2026-11-02', '2026-11-06'))).toBeTruthy();
    expect(screen.getByText('No events this week.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(screen.getByText(weekOf('2026-11-09', '2026-11-13'))).toBeTruthy();
  });

  it('the type filter uses the same setter, and the shared "events on a day" rule applies it', () => {
    show();
    fireEvent.change(screen.getByLabelText('Filter events by type'), { target: { value: 'Deadline' } });
    expect(h.ctx.setCalFilter).toHaveBeenCalledWith('Deadline');
    cleanup();
    h.ctx = baseCtx({ calFilter: 'Deadline' });
    show();
    expect(screen.queryByRole('button', { name: 'Edit Science Fair' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Edit Grades due' })).toHaveLength(2);
  });

  it('clicking an event and Add event call the same handlers as classic', () => {
    show();
    fireEvent.click(within(day('Tue 10')).getByRole('button', { name: 'Edit Science Fair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(h.ctx.openEditEvent).toHaveBeenCalledWith(EVENTS[0]);
    expect(h.ctx.openCreateEvent).toHaveBeenCalledTimes(1);
  });

  it('loading and load-failure states (Retry calls fetchCalEvents)', () => {
    h.ctx = baseCtx({ calError: true });
    show();
    expect(screen.getByRole('alert').textContent).toContain('Unable to load Calendar.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchCalEvents).toHaveBeenCalled();
  });
});

describe('month view keeps every classic function', () => {
  it('Week | Month switches to the classic month view, identical to the classic tab', () => {
    show(CalendarTab);
    const classic = document.querySelector('.cal-layout').outerHTML;
    cleanup();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.cal-layout').outerHTML).toBe(classic);
  });

  it('month navigation, the year picker, the filter and edit go through the same handlers', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.change(screen.getByLabelText('Calendar year'), { target: { value: '2027' } });
    fireEvent.change(screen.getByLabelText('Filter events by type'), { target: { value: 'Holiday' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Bonifacio Day' })[0]);
    expect(h.ctx.prevMonth).toHaveBeenCalledTimes(1);
    expect(h.ctx.nextMonth).toHaveBeenCalledTimes(1);
    expect(h.ctx.setCalYear).toHaveBeenCalledWith(2027);
    expect(h.ctx.setCalFilter).toHaveBeenCalledWith('Holiday');
    expect(h.ctx.openEditEvent).toHaveBeenCalledWith(EVENTS[2]);
  });
});

describe('the event dialog is the classic one', () => {
  it.each([
    ['add', { modal: 'event' }],
    ['edit (with Delete)', { modal: 'event', editEvent: EVENTS[0], evTitle: 'Science Fair', evDate: '2026-11-10' }],
    ['custom type', { modal: 'event', evType: 'Custom Type', evCustomType: 'Foundation Day' }],
  ])('%s: identical markup', (_, extra) => {
    h.ctx = baseCtx(extra);
    show(CalendarTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    h.ctx = baseCtx(extra);
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('an end date before the start: the same message, focus on End Date, nothing saved', () => {
    h.ctx = baseCtx({ modal: 'event', evDate: '2026-11-12', evEnd: '2026-11-10', evTitle: 'X' });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add Event' }));
    expect(screen.getByText('End Date cannot be earlier than Start Date.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('End Date (optional)'));
    expect(h.ctx.saveEvent).not.toHaveBeenCalled();
  });

  it('a valid form saves; Delete in edit calls deleteEvent(id)', () => {
    h.ctx = baseCtx({ modal: 'event', editEvent: EVENTS[0], evTitle: 'Science Fair', evDate: '2026-11-10' });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(h.ctx.saveEvent).toHaveBeenCalledTimes(1);
    expect(h.ctx.deleteEvent).toHaveBeenCalledWith('e1');
  });
});

describe('nothing invented', () => {
  it('no "preview", no sample week label', () => {
    show();
    expect(document.body.textContent).not.toMatch(/preview|7 AM|8 AM/i);
  });
});
