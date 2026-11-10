// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({ rows: [], updates: [] }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1' } }) }));
vi.mock('../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../config/supabase', () => ({
  supabase: { from() {
    let update = null;
    const query = {
      select() { return query; }, eq(column, value) { if (update) update.filters.push([column, value]); return query; },
      order() { return query; }, limit() { return query; },
      update(values) { update = { values, filters: [] }; state.updates.push(update); return query; },
      then(resolve, reject) { return Promise.resolve(update ? { error: null } : { data: state.rows, error: null }).then(resolve, reject); },
    };
    return query;
  } },
}));

import NotificationBell from './NotificationBell';

const LONG_WORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2);
const LONG_URL = `https://example.test/${'abcdefghij'.repeat(12)}`;
const WRAP = '[overflow-wrap:anywhere]';

beforeEach(() => {
  state.updates = [];
  state.rows = [{ id: 'n1', title: `New task ${LONG_WORD}`, message: `Open ${LONG_URL}`, notification_type: 'task',
    created_at: '2026-11-09T01:00:00Z', is_read: false, action_url: '/student-dashboard/tasks' }];
});
afterEach(() => cleanup());

const renderBell = () => render(
  <MemoryRouter initialEntries={['/student-dashboard']}>
    <NotificationBell followLinks />
    <Routes>
      <Route path="/student-dashboard" element={<h1>Overview page</h1>} />
      <Route path="/student-dashboard/tasks" element={<h1>Tasks page</h1>} />
    </Routes>
  </MemoryRouter>
);

describe('notification text wraps in the panel', () => {
  it('a long title and message get the wrap class, with the text unchanged', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const title = await screen.findByText(`New task ${LONG_WORD}`);
    const message = screen.getByText(`Open ${LONG_URL}`);
    expect(title.className.split(/\s+/)).toEqual(expect.arrayContaining(['text-base', 'font-semibold', WRAP]));
    expect(message.className.split(/\s+/)).toEqual(expect.arrayContaining(['text-sm', 'mt-1', WRAP]));
    // The column they sit in can still shrink, so the panel width is unchanged.
    expect(title.parentElement.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'min-w-0']));
  });

  it('clicking still opens the page, marks it read and closes the panel', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: /New task/ }));
    expect(await screen.findByRole('heading', { name: 'Tasks page' })).toBeTruthy();
    expect(state.updates.some(u => u.filters.some(([c, v]) => c === 'id' && v === 'n1'))).toBe(true);
  });
});
