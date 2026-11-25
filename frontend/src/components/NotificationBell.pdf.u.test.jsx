// @vitest-environment jsdom
// U-PDF-S (design p23): with designPanel (the student shell only) the panel shows
// "N new", "Mark all as read", a type icon per row and relative times. Without
// it (teacher, admin) the panel is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ rows: [], updates: [] }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1' } }) }));
vi.mock('../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../config/supabase', () => ({
  supabase: { from() {
    let update = null;
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
      update(values) { update = { values }; state.updates.push(update); return query; },
      then(resolve, reject) { return Promise.resolve(update ? { error: null } : { data: state.rows, error: null }).then(resolve, reject); },
    };
    return query;
  } },
}));

import NotificationBell from './NotificationBell';

// 10:00 AM Wed 25 Nov 2026 in Manila.
const NOW = new Date('2026-11-25T02:00:00Z');
const row = (id, type, created_at, is_read = false) => ({ id, title: `Title ${id}`, message: `Message ${id}`, notification_type: type, created_at, is_read, action_url: null });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.updates = [];
  state.rows = [
    row('a', 'worksheet', '2026-11-25T01:50:00Z'),
    row('b', 'score', '2026-11-25T00:00:00Z'),
    row('c', 'announcement', '2026-11-24T03:00:00Z'),
    row('d', 'task', '2026-11-17T03:00:00Z', true),
  ];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const open = async (props) => {
  render(<MemoryRouter><NotificationBell {...props} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' }).textContent).toContain('3'));
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
};

describe('U-PDF-S student notification panel', () => {
  it('"3 new", Mark all as read, relative times and an icon per row', async () => {
    await open({ designPanel: true });
    expect(screen.getByText('3 new')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeTruthy();
    const times = ['Title a', 'Title b', 'Title c', 'Title d'].map(t => screen.getByText(t).parentElement.querySelector('p.text-xs').textContent);
    expect(times).toEqual(['10 min ago', '2 hours ago', 'Yesterday', 'Nov 17']);
    expect(document.querySelectorAll('.notification-panel svg.lucide-file-text, .notification-panel svg.lucide-check, .notification-panel svg.lucide-megaphone').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Unread:')).toHaveLength(3);
  });

  it('Mark all as read writes is_read for every row', async () => {
    await open({ designPanel: true });
    const before = state.updates.length;
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(state.updates.length).toBeGreaterThan(before));
    expect(state.updates.at(-1).values.is_read).toBe(true);
  });

  it('without designPanel (teacher, admin) the panel is as before', async () => {
    await open({});
    expect(screen.queryByText('3 new')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
    expect(screen.queryByText('10 min ago')).toBeNull();
  });
});
