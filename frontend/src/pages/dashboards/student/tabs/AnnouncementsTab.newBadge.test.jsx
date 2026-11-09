// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ result: null }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from() {
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; }, order() { return query; },
      then(resolve, reject) { return Promise.resolve(state.result).then(resolve, reject); },
    };
    return query;
  } },
}));

import AnnouncementsTab from './AnnouncementsTab';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-03-13T02:00:00Z')); // Mar 13, 2030 in Manila
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('student announcements NEW badge', () => {
  it('shows NEW on a 6-day-old announcement and not on an 8-day-old one', async () => {
    state.result = { data: [
      { id: 'a', title: 'Fresh news', content: 'x', created_at: '2030-03-07T02:00:00' },
      { id: 'b', title: 'Older news', content: 'y', created_at: '2030-03-05T02:00:00' },
    ], error: null };
    render(<AnnouncementsTab />);
    const fresh = (await screen.findByText('Fresh news')).parentElement;
    const older = screen.getByText('Older news').parentElement;
    expect(within(fresh).getByText('NEW').getAttribute('style')).toContain('var(--card2)');
    expect(within(older).queryByText('NEW')).toBeNull();
  });
});
