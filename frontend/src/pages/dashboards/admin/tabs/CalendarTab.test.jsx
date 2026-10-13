// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const CalendarTab = (await import('./CalendarTab')).default;

const customEvent = {
  id: 'event-custom',
  title: 'Foundation Day',
  event_date: '2026-10-09',
  end_date: null,
  event_type: 'Other',
  custom_event_type: 'Foundation Day',
  description: '',
};

const baseCtx = (overrides = {}) => ({
  calError: false,
  calEvents: [],
  calFilter: '',
  calGrid: [{ d: 9, cur: true }],
  calLoading: false,
  calMonth: 9,
  calYear: 2026,
  closeModal: vi.fn(),
  deleteEvent: vi.fn(),
  editEvent: null,
  evDate: '',
  evDesc: '',
  evEnd: '',
  evSaving: false,
  evTitle: '',
  evCustomType: '',
  evType: 'Event',
  fetchCalEvents: vi.fn(),
  modal: null,
  nextMonth: vi.fn(),
  openCreateEvent: vi.fn(),
  openEditEvent: vi.fn(),
  prevMonth: vi.fn(),
  saveEvent: vi.fn(),
  setCalFilter: vi.fn(),
  setEvCustomType: vi.fn(),
  setEvDate: vi.fn(),
  setCalYear: vi.fn(),
  setEvDesc: vi.fn(),
  setEvEnd: vi.fn(),
  setEvTitle: vi.fn(),
  setEvType: vi.fn(),
  today: new Date(2026, 9, 9),
  typeClass: () => 'ev-teal',
  typeColor: () => '#2dd4bf',
  upcomingEvents: [],
  ...overrides,
});

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(cleanup);

describe('CalendarTab QA fixes', () => {
  it('blocks an invalid range, describes End Date, and moves focus there', () => {
    h.ctx = baseCtx({
      modal: 'event',
      evTitle: 'Exam week',
      evDate: '2026-10-10',
      evEnd: '2026-10-09',
    });
    render(<CalendarTab />);

    const dialog = screen.getByRole('dialog', { name: 'Add Calendar Event' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Event' }));

    const endDate = within(dialog).getByLabelText('End Date (optional)');
    const error = within(dialog).getByText('End Date cannot be earlier than Start Date.');
    expect(h.ctx.saveEvent).not.toHaveBeenCalled();
    expect(endDate.getAttribute('aria-invalid')).toBe('true');
    expect(endDate.getAttribute('aria-describedby')).toBe(error.id);
    expect(document.activeElement).toBe(endDate);
  });

  it('renders stored custom events when Custom Type is active', () => {
    h.ctx = baseCtx({ calEvents: [customEvent], calFilter: 'Custom Type' });
    render(<CalendarTab />);

    expect(screen.getAllByRole('button', { name: 'Edit Foundation Day' })).toHaveLength(2);
  });

  it('puts Delete in every edit dialog and uses the existing delete handler', () => {
    h.ctx = baseCtx({
      modal: 'event',
      editEvent: customEvent,
      evTitle: customEvent.title,
      evDate: customEvent.event_date,
      evType: 'Custom Type',
      evCustomType: customEvent.custom_event_type,
    });
    render(<CalendarTab />);

    const dialog = screen.getByRole('dialog', { name: 'Edit Event' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(h.ctx.deleteEvent).toHaveBeenCalledWith(customEvent.id);
  });

  it('keeps a persistent fetch error with the existing retry handler', () => {
    h.ctx = baseCtx({ calError: true });
    render(<CalendarTab />);

    expect(screen.getByRole('alert').textContent).toContain('Unable to load Calendar.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchCalEvents).toHaveBeenCalledTimes(1);
  });
});
