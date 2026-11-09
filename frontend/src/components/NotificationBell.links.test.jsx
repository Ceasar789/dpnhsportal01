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
      then(resolve, reject) {
        return Promise.resolve(update ? { error: null } : { data: state.rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  } },
}));

import NotificationBell from './NotificationBell';

const row = (id, action_url, extra = {}) => ({ id, title: `Title ${id}`, message: `Message ${id}`, notification_type: 'task',
  created_at: '2026-11-09T01:00:00Z', is_read: false, action_url, ...extra });

const renderBell = (props) => render(
  <MemoryRouter initialEntries={['/student-dashboard']}>
    <NotificationBell {...props} />
    <Routes>
      <Route path="/student-dashboard" element={<h1>Overview page</h1>} />
      <Route path="/student-dashboard/tasks" element={<h1>Tasks page</h1>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => { state.updates = []; });
afterEach(() => cleanup());

describe('notification links', () => {
  it('with followLinks, an in-app action_url opens that page, marks it read and closes the panel', async () => {
    state.rows = [row('n1', '/student-dashboard/tasks')];
    renderBell({ followLinks: true });
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: /Title n1/ }));
    expect(await screen.findByRole('heading', { name: 'Tasks page' })).toBeTruthy();
    expect(screen.queryByText('Message n1')).toBeNull();
    expect(state.updates.some(u => u.filters.some(([c, v]) => c === 'id' && v === 'n1'))).toBe(true);
  });

  it('ignores another site and leaves the row as plain text', async () => {
    state.rows = [row('n2', 'https://evil.example/x')];
    renderBell({ followLinks: true });
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByText('Message n2');
    expect(screen.queryByRole('button', { name: /Title n2/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Overview page' })).toBeTruthy();
  });

  it('without followLinks (teacher and admin) nothing becomes a link', async () => {
    state.rows = [row('n3', '/student-dashboard/tasks')];
    renderBell({});
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByText('Message n3');
    expect(screen.queryByRole('button', { name: /Title n3/ })).toBeNull();
  });
});
