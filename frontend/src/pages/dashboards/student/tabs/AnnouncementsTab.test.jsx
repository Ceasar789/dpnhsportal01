// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ result: null, reads: 0 }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from() {
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; }, order() { return query; },
      then(resolve, reject) { state.reads += 1; return Promise.resolve(state.result).then(resolve, reject); },
    };
    return query;
  } },
}));

import AnnouncementsTab from './AnnouncementsTab';

beforeEach(() => { state.reads = 0; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('student announcements', () => {
  it('a failed read shows an error with Retry, never the empty state', async () => {
    state.result = { data: null, error: { message: 'offline' } };
    render(<AnnouncementsTab />);
    expect(await screen.findByText('Could not load announcements.')).toBeTruthy();
    expect(screen.queryByText('No announcements are available right now.')).toBeNull();
    state.result = { data: [], error: null };
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No announcements are available right now.')).toBeTruthy();
    expect(screen.queryByText('Could not load announcements.')).toBeNull();
    expect(state.reads).toBe(2);
  });

  it('a successful empty read keeps the empty state', async () => {
    state.result = { data: [], error: null };
    render(<AnnouncementsTab />);
    expect(await screen.findByText('No announcements are available right now.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Announcements' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh announcements' })).toBeTruthy();
  });
});
